#!/usr/bin/env python3
"""Generate transparent PNG overlays for ranking Shorts (title + rank list)."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920

FONT_MAP = {
    "display": "assets/fonts/NotoSansDisplay-Bold.ttf",
    "impact": "assets/fonts/LiberationSans-Bold.ttf",
    "bebas": "assets/fonts/NotoSansDisplay-Bold.ttf",
    "montserrat": "assets/fonts/Inter-Bold.ttf",
    "inter": "assets/fonts/Inter-Bold.ttf",
    "oswald": "assets/fonts/JetBrainsMono-Bold.ttf",
}

FALLBACKS = [
    "assets/fonts/Inter-Bold.ttf",
    "assets/fonts/NotoSansDisplay-Bold.ttf",
    "assets/fonts/LiberationSans-Bold.ttf",
    "assets/fonts/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/macos/Inter-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansDisplay-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def resolve_font_path(path: str) -> str:
    p = Path(path)
    if p.is_file():
        return str(p)
    # relative to repo root (cwd when Next runs python)
    root = Path.cwd() / path
    if root.is_file():
        return str(root)
    return path


def load_font(font_id: str, size: int) -> ImageFont.FreeTypeFont:
    candidates = [FONT_MAP.get(font_id, "")] + FALLBACKS
    for path in candidates:
        if not path:
            continue
        try:
            return ImageFont.truetype(resolve_font_path(path), size=size)
        except OSError:
            continue
    return ImageFont.load_default()


# Colour emoji fonts, best first. Apple Color Emoji is what an iPhone shows;
# it is proprietary so it is never bundled — we only use the copy already
# installed on the machine doing the export (any Mac has it). Everything else
# falls back to Noto Color Emoji.
EMOJI_FONTS = [
    "/System/Library/Fonts/Apple Color Emoji.ttc",
    "/System/Library/Fonts/Supplemental/Apple Color Emoji.ttc",
    "/Library/Fonts/Apple Color Emoji.ttc",
    str(Path.home() / "Library/Fonts/Apple Color Emoji.ttc"),
    "assets/fonts/AppleColorEmoji.ttc",
    "assets/fonts/NotoColorEmoji.ttf",
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    "/usr/share/fonts/truetype/noto-color-emoji/NotoColorEmoji.ttf",
    "/usr/local/share/fonts/NotoColorEmoji.ttf",
    "C:/Windows/Fonts/seguiemj.ttf",
]

# Bitmap emoji fonts only ship a few fixed sizes; we render at a real strike and
# scale the result to whatever the layout needs.
EMOJI_STRIKES = [137, 109, 160, 96, 64, 48, 40, 32, 20]

_emoji_font_cache: dict[int, object] = {}


def load_emoji_font(target_px: int):
    """Return (font, strike_px) for a colour emoji font, or (None, 0)."""
    key = max(8, int(target_px))
    if key in _emoji_font_cache:
        return _emoji_font_cache[key]

    result = (None, 0)
    for path in EMOJI_FONTS:
        resolved = resolve_font_path(path)
        if not Path(resolved).is_file():
            continue
        # Scalable colour fonts (COLRv1) accept any size; bitmap ones don't.
        for size in [key] + EMOJI_STRIKES:
            try:
                result = (ImageFont.truetype(resolved, size=size), size)
                break
            except OSError:
                continue
        if result[0] is not None:
            break

    _emoji_font_cache[key] = result
    return result


# Emoji cluster: a pictograph plus any variation selector, skin-tone modifier,
# keycap or ZWJ continuation, so multi-part emoji stay together.
_EMOJI_CORE = (
    "\U0001F000-\U0001FAFF"
    "\u2600-\u27BF"
    "\u2B00-\u2BFF"
    "\uFE0F"
    "\u20E3"
    "\u2190-\u21FF"
    "\u2300-\u23FF"
)
EMOJI_RE = re.compile(
    "(?:"
    "[\U0001F1E6-\U0001F1FF]{2}"  # flags (regional indicator pairs)
    "|"
    "[0-9#*]\uFE0F?\u20E3"  # keycaps
    "|"
    f"[{_EMOJI_CORE}]"
    f"(?:[\U0001F3FB-\U0001F3FF\uFE0E\uFE0F])*"
    f"(?:\u200D[{_EMOJI_CORE}][\U0001F3FB-\U0001F3FF\uFE0E\uFE0F]*)*"
    ")"
)


def is_emoji_cluster(chunk: str) -> bool:
    """Plain ASCII/dingbat-ish matches are better drawn with the text font."""
    if not chunk:
        return False
    if all(ch in "0123456789#*" for ch in chunk.replace("\uFE0F", "").replace("\u20E3", "")):
        return "\u20E3" in chunk
    return any(ord(ch) >= 0x1F000 or 0x2600 <= ord(ch) <= 0x27BF for ch in chunk)


def split_emoji_runs(text: str) -> list[tuple[bool, str]]:
    """Split into (is_emoji, chunk) runs, preserving order."""
    runs: list[tuple[bool, str]] = []
    pos = 0
    for m in EMOJI_RE.finditer(text):
        if not is_emoji_cluster(m.group()):
            continue
        if m.start() > pos:
            runs.append((False, text[pos : m.start()]))
        runs.append((True, m.group()))
        pos = m.end()
    if pos < len(text):
        runs.append((False, text[pos:]))
    return [r for r in runs if r[1]]


_emoji_glyph_cache: dict[tuple[str, int], object] = {}


def emoji_glyph(cluster: str, target_px: int):
    """RGBA image of one emoji scaled to roughly `target_px` tall, or None."""
    key = (cluster, int(target_px))
    if key in _emoji_glyph_cache:
        return _emoji_glyph_cache[key]

    font, strike = load_emoji_font(target_px)
    glyph = None
    if font is not None:
        canvas = Image.new("RGBA", (strike * 3, strike * 3), (0, 0, 0, 0))
        d = ImageDraw.Draw(canvas)
        try:
            d.text((strike // 2, strike // 2), cluster, font=font, embedded_color=True)
            box = canvas.getbbox()
            if box:
                cropped = canvas.crop(box)
                scale = target_px / max(1, cropped.height)
                size = (
                    max(1, int(round(cropped.width * scale))),
                    max(1, int(round(cropped.height * scale))),
                )
                glyph = cropped.resize(size, Image.LANCZOS)
        except (OSError, ValueError):
            glyph = None

    _emoji_glyph_cache[key] = glyph
    return glyph


def hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    c = (hex_color or "#FFFFFF").lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    if len(c) < 6:
        c = "FFFFFF"
    r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    return r, g, b, alpha


def draw_text_outline(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] = (0, 0, 0, 255),
    width: int = 6,
) -> None:
    x, y = xy
    for dx in range(-width, width + 1):
        for dy in range(-width, width + 1):
            if dx * dx + dy * dy <= width * width:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def measure(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def emoji_px_for(font: ImageFont.FreeTypeFont) -> int:
    """Match emoji height to the surrounding capitals."""
    try:
        ascent, _ = font.getmetrics()
        return max(8, int(round(ascent * 0.92)))
    except Exception:
        return max(8, int(round(getattr(font, "size", 32) * 0.9)))


def measure_rich(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont
) -> tuple[int, int]:
    """Width/height of mixed text + emoji, matching what draw_rich_text lays out."""
    runs = split_emoji_runs(text)
    if not any(is_emoji for is_emoji, _ in runs):
        return measure(draw, text, font)
    px = emoji_px_for(font)
    total_w = 0
    max_h = 0
    for is_emoji, chunk in runs:
        if is_emoji:
            glyph = emoji_glyph(chunk, px)
            total_w += glyph.width + max(1, px // 12) if glyph else measure(draw, chunk, font)[0]
            max_h = max(max_h, px)
        else:
            w, h = measure(draw, chunk, font)
            total_w += w
            max_h = max(max_h, h)
    return total_w, max_h


def draw_rich_text(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] = (0, 0, 0, 255),
    width: int = 6,
) -> int:
    """
    Draw text where emoji are pasted as colour bitmaps and everything else uses
    the outlined text font. Returns the advance width.
    """
    runs = split_emoji_runs(text)
    if not any(is_emoji for is_emoji, _ in runs):
        draw_text_outline(draw, xy, text, font, fill, outline, width)
        return measure(draw, text, font)[0]

    x, y = xy
    px = emoji_px_for(font)
    alpha = fill[3] if len(fill) > 3 else 255
    for is_emoji, chunk in runs:
        if not is_emoji:
            draw_text_outline(draw, (x, y), chunk, font, fill, outline, width)
            x += measure(draw, chunk, font)[0]
            continue
        glyph = emoji_glyph(chunk, px)
        if glyph is None:
            # No colour emoji font available — keep the text run readable
            draw_text_outline(draw, (x, y), chunk, font, fill, outline, width)
            x += measure(draw, chunk, font)[0]
            continue
        layer = glyph
        if alpha < 255:
            layer = glyph.copy()
            layer.putalpha(layer.getchannel("A").point(lambda a: int(a * alpha / 255)))
        img.alpha_composite(layer, (int(round(x)), int(round(y))))
        x += layer.width + max(1, px // 12)
    return int(round(x - xy[0]))


def make_title_overlay(cfg: dict, out: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if cfg.get("enabled") is False:
        img.save(out)
        return

    show_bar = bool(cfg.get("showBar", True))
    opacity = float(cfg.get("barOpacity", 0.72))
    bar_h = int(cfg.get("barHeight", 150))
    if show_bar:
        draw.rectangle((0, 0, W, bar_h), fill=(0, 0, 0, int(255 * opacity)))

    font_id = cfg.get("fontId") or "display"
    font_size = int(cfg.get("fontSize") or 54)
    line_gap = int(cfg.get("lineGap") or 8)
    uppercase = bool(cfg.get("uppercase", True))
    align = cfg.get("align") or "center"
    x_pct = float(cfg.get("x", 50))
    y_pct = float(cfg.get("y", 2.2))
    font = load_font(font_id, font_size)

    lines = cfg.get("lines") or []
    # Backward compat for old prefix/highlight/suffix
    if not lines and (cfg.get("prefix") or cfg.get("highlight") or cfg.get("suffix")):
        lines = [
            {
                "words": [
                    {"text": cfg.get("prefix") or "", "color": "#FFFFFF"},
                    {"text": cfg.get("highlight") or "", "color": cfg.get("highlightColor") or "#39FF14"},
                    {"text": cfg.get("suffix") or "", "color": "#FFFFFF"},
                ]
            }
        ]

    prepared = []
    for line in lines[:2]:
        words = []
        for w in line.get("words") or []:
            text = (w.get("text") or "").strip()
            if not text:
                continue
            if uppercase:
                text = text.upper()
            words.append((text, hex_to_rgba(w.get("color") or "#FFFFFF")))
        if words:
            prepared.append(words)

    if not prepared:
        img.save(out)
        return

    line_widths = []
    line_heights = []
    for words in prepared:
        total_w = 0
        max_h = 0
        for i, (text, _) in enumerate(words):
            tw, th = measure_rich(draw, text, font)
            total_w += tw
            if i > 0:
                sw, _ = measure(draw, " ", font)
                total_w += sw
            max_h = max(max_h, th)
        line_widths.append(total_w)
        line_heights.append(max_h)

    block_h = sum(line_heights) + line_gap * (len(prepared) - 1)
    anchor_x = W * (x_pct / 100.0)
    anchor_y = H * (y_pct / 100.0)

    y = anchor_y
    for words, lw, lh in zip(prepared, line_widths, line_heights):
        if align == "left":
            x = anchor_x
        elif align == "right":
            x = anchor_x - lw
        else:
            x = anchor_x - lw / 2

        for i, (text, color) in enumerate(words):
            if i > 0:
                sw, _ = measure(draw, " ", font)
                x += sw
            x += draw_rich_text(
                img, draw, (x, y), text, font, color, width=max(3, font_size // 14)
            )
        y += lh + line_gap

    img.save(out)


def make_ranks_overlay(cfg: dict, out: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ranks = cfg.get("ranks") or []
    active = int(cfg.get("activeRank", 0))
    colors = cfg.get("rankColors") or {}
    layout = cfg.get("ranksLayout") or {}

    font_id = layout.get("fontId") or "display"
    font_size = int(layout.get("fontSize") or 92)
    label_size = int(layout.get("labelSize") or 42)
    gap = int(layout.get("gap") or 120)
    x_pct = float(layout.get("x", 3.5))
    y_pct = float(layout.get("y", 11))
    dim_enabled = layout.get("labelDimEnabled") is not False
    try:
        dim_opacity = float(layout.get("labelDimOpacity", 0.35))
    except (TypeError, ValueError):
        dim_opacity = 0.35
    try:
        active_opacity = float(layout.get("labelActiveOpacity", 1.0))
    except (TypeError, ValueError):
        active_opacity = 1.0
    dim_opacity = max(0.0, min(1.0, dim_opacity))
    active_opacity = max(0.0, min(1.0, active_opacity))

    # In Depth Ranking draws the playing clip's line on its own layer so ffmpeg
    # can fade it over the clip; `only_active` renders just that layer.
    only_active = bool(cfg.get("onlyActiveLabel"))
    raw_active_alpha = cfg.get("activeLabelAlpha")
    active_alpha_override = None
    if raw_active_alpha is not None:
        try:
            active_alpha_override = max(0.0, min(1.0, float(raw_active_alpha)))
        except (TypeError, ValueError):
            active_alpha_override = None

    font = load_font(font_id, font_size)
    label_font = load_font("inter", label_size)

    start_x = W * (x_pct / 100.0)
    start_y = H * (y_pct / 100.0)

    for i, item in enumerate(ranks):
        rank = int(item.get("rank", i + 1))
        label = item.get("label") or ""
        is_active = rank == active
        if only_active and not is_active:
            continue
        # Numbers always fully opaque, and never on the fading layer
        if not only_active:
            color = hex_to_rgba(colors.get(str(rank)) or colors.get(rank) or "#FFFFFF", 255)
            draw_text_outline(
                draw,
                (start_x, start_y + i * gap),
                f"{rank}.",
                font,
                color,
                width=max(4, font_size // 12),
            )
        if not label:
            continue

        if is_active and active_alpha_override is not None:
            alpha = active_alpha_override
        elif not dim_enabled:
            alpha = 1.0
        elif is_active:
            alpha = active_opacity
        else:
            alpha = dim_opacity
        label_a = max(0, min(255, int(round(255 * alpha))))
        if label_a <= 0:
            continue

        y = start_y + i * gap
        tw, _ = measure(draw, f"{rank}.", font)
        draw_rich_text(
            img,
            draw,
            (start_x + tw + 18, y + font_size * 0.28),
            label,
            label_font,
            (255, 255, 255, label_a),
            outline=(0, 0, 0, label_a),
            width=4,
        )
    img.save(out)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--title-out", required=True)
    parser.add_argument("--ranks-out", required=True)
    args = parser.parse_args()
    cfg = json.loads(Path(args.config).read_text())
    make_title_overlay(cfg.get("title") or {}, Path(args.title_out))
    make_ranks_overlay(cfg, Path(args.ranks_out))


if __name__ == "__main__":
    main()
