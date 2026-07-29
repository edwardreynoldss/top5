#!/usr/bin/env python3
"""Generate transparent PNG overlays for ranking Shorts (title + rank list)."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FONT_BOLD = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
FONT_BLACK = "/usr/share/fonts/truetype/noto/NotoSansDisplay-Bold.ttf"


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size=size)
    except OSError:
        return ImageFont.truetype(FONT_BOLD, size=size)


def hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    c = hex_color.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
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


def make_title_overlay(cfg: dict, out: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    opacity = float(cfg.get("barOpacity", 0.72))
    bar_h = 150
    draw.rectangle((0, 0, W, bar_h), fill=(0, 0, 0, int(255 * opacity)))

    font = load_font(FONT_BLACK, 54)
    prefix = (cfg.get("prefix") or "").upper()
    highlight = (cfg.get("highlight") or "").upper()
    suffix = (cfg.get("suffix") or "").upper()
    parts = [
        (prefix, (255, 255, 255, 255)),
        (highlight, hex_to_rgba(cfg.get("highlightColor") or "#39FF14")),
        (suffix, (255, 255, 255, 255)),
    ]
    gap = 18
    widths = []
    for text, _ in parts:
        if not text:
            widths.append(0)
            continue
        bbox = draw.textbbox((0, 0), text, font=font)
        widths.append(bbox[2] - bbox[0])
    total = sum(widths) + gap * (len([w for w in widths if w]) - 1 if sum(1 for w in widths if w) else 0)
    x = (W - total) / 2
    y = (bar_h - 54) / 2 - 4
    first = True
    for (text, color), tw in zip(parts, widths):
        if not text:
            continue
        if not first:
            x += gap
        draw_text_outline(draw, (x, y), text, font, color, width=4)
        x += tw
        first = False

    img.save(out)


def make_ranks_overlay(cfg: dict, out: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ranks = cfg.get("ranks") or []
    active = int(cfg.get("activeRank", 0))
    colors = cfg.get("rankColors") or {}
    font = load_font(FONT_BLACK, 92)
    label_font = load_font(FONT_BOLD, 42)
    start_y = 210
    line_h = 120
    for i, item in enumerate(ranks):
        rank = int(item.get("rank", i + 1))
        label = item.get("label") or ""
        color = hex_to_rgba(colors.get(str(rank)) or colors.get(rank) or "#FFFFFF")
        text = f"{rank}."
        # Dim non-active slightly for export clarity? Keep all bright like CapCut templates.
        draw_text_outline(draw, (36, start_y + i * line_h), text, font, color, width=7)
        if label and (cfg.get("showActiveLabel", True) and rank == active or label):
            # Show label next to this rank when provided
            lx = 160
            draw_text_outline(
                draw,
                (lx, start_y + i * line_h + 28),
                label.upper(),
                label_font,
                (255, 255, 255, 255),
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
