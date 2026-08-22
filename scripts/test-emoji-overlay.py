#!/usr/bin/env python3
"""Emoji handling in the export overlay renderer.

Skips (exit 0) when Pillow isn't installed, so it can run anywhere.
"""
import importlib.util
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image  # noqa: F401
except ModuleNotFoundError:
    print("emoji overlay tests skipped (Pillow not installed)")
    sys.exit(0)

spec = importlib.util.spec_from_file_location("go", "scripts/generate-overlays.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def runs(text):
    return m.split_emoji_runs(text)


# --- plain text is one text run, so the normal draw path is used ---
assert runs("Careless Cat") == [(False, "Careless Cat")]
assert runs("") == []

# --- a trailing emoji splits cleanly ---
assert runs("This Cat does NOT care 😂") == [
    (False, "This Cat does NOT care "),
    (True, "😂"),
]

# --- emoji at the start and in the middle ---
assert runs("😂 hi") == [(True, "😂"), (False, " hi")]
assert runs("a🔥b") == [(False, "a"), (True, "🔥"), (False, "b")]

# --- multi-codepoint emoji stay in one piece ---
assert runs("🇺🇸") == [(True, "🇺🇸")], "flags are regional indicator pairs"
assert runs("👨‍👩‍👧") == [(True, "👨‍👩‍👧")], "ZWJ family must not be split"
assert runs("👍🏽") == [(True, "👍🏽")], "skin tone modifier stays attached"
assert runs("1️⃣") == [(True, "1️⃣")], "keycap stays together"

# --- bare digits are text, not keycaps ---
assert runs("8.12") == [(False, "8.12")]
assert runs("Careless Cat - 8.12") == [(False, "Careless Cat - 8.12")]

# --- round trip: runs always rebuild the original string ---
for sample in [
    "Careless Cat - 8.12",
    "This Cat does NOT care 😂",
    "🔥🔥 back to back 🔥",
    "flags 🇺🇸🇯🇵 end",
    "family 👨‍👩‍👧 and 👍🏽",
]:
    assert "".join(chunk for _, chunk in runs(sample)) == sample, sample

# --- rendering: emoji come out in colour, plain text is untouched ---
td = Path(tempfile.mkdtemp())


def render_label(label, name):
    cfg = {
        "activeRank": 4,
        "rankColors": {"4": "#ffffff"},
        "ranksLayout": {"fontSize": 60, "labelSize": 34, "gap": 110, "x": 4, "y": 10},
        "ranks": [{"rank": 4, "label": label}],
    }
    out = td / name
    m.make_ranks_overlay(cfg, out)
    return Image.open(out).convert("RGBA")


def coloured_pixels(img):
    """Pixels that aren't greyscale — i.e. emoji artwork rather than text."""
    return sum(
        1
        for p in img.get_flattened_data()
        if p[3] > 0 and max(p[:3]) - min(p[:3]) > 60
    )


plain = render_label("Careless Cat", "plain.png")
assert coloured_pixels(plain) == 0, "plain text should stay black/white"

font, _ = m.load_emoji_font(34)
if font is None:
    print("emoji overlay tests passed (no colour emoji font here; splitting verified)")
    sys.exit(0)

with_emoji = render_label("Careless Cat 😂", "emoji.png")
assert coloured_pixels(with_emoji) > 200, "emoji should render as colour artwork"
assert with_emoji.getbbox()[2] > plain.getbbox()[2], "emoji should widen the label"

# a missing glyph must not blow up the render
weird = render_label("edge \U0001FAF0 case", "weird.png")
assert weird.getbbox() is not None

print("emoji overlay tests passed")
