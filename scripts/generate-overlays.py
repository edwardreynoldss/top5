#!/usr/bin/env python3
"""Generate transparent PNG overlays for ranking Shorts (title + rank list)."""
from __future__ import annotations

import argparse
import json
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
            tw, th = measure(draw, text, font)
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
            draw_text_outline(draw, (x, y), text, font, color, width=max(3, font_size // 14))
            tw, _ = measure(draw, text, font)
            x += tw
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
        draw_text_outline(
            draw,
            (start_x + tw + 18, y + font_size * 0.28),
            label.upper(),
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
