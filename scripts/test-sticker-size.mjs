/**
 * Export sticker size must match preview: contain into (frameW × 45% frameH), then × scale.
 * Old path (iw*scale) made full-frame WebMs much larger than preview.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve("tmp/sticker-size");
fs.mkdirSync(root, { recursive: true });
const webm = path.resolve("public/stickers/gray-under-alpha.webm");
assert.ok(fs.existsSync(webm));

const W = 1080;
const H = 1920;
const scale = 0.55;
const fitH = Math.round(H * 0.45);
const delay = 0.2;

// Expected: fit 1080x1920 into 1080x864 → 486x864, then ×0.55 → ~267×475
const expectedW = Math.round(486 * scale);
const expectedH = Math.round(864 * scale);

const out = path.join(root, "sized.mp4");
const filter =
  `[1:v]format=yuva420p,fps=30,` +
  `scale=${W}:${fitH}:force_original_aspect_ratio=decrease,` +
  `scale=iw*${scale}:ih*${scale},` +
  `setpts=PTS/1+${delay}/TB[stk];` +
  `[0:v][stk]overlay=x=(W-w)/2:y=H-h:enable='gte(t\\,${delay})':eof_action=pass:format=rgb,format=yuv420p`;

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=blue:s=${W}x${H}:d=2:r=30`,
    "-c:v",
    "libvpx-vp9",
    "-an",
    "-i",
    webm,
    "-filter_complex",
    filter,
    "-t",
    "2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    out,
  ],
  { stdio: "inherit" }
);

const frame = path.join(root, "frame.png");
execFileSync(
  "ffmpeg",
  ["-y", "-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", out, "-frames:v", "1", frame],
  { stdio: "inherit" }
);

const py = execFileSync(
  "python3",
  [
    "-c",
    `
from PIL import Image
im=Image.open(${JSON.stringify(frame)}).convert('RGB')
# find red toast bbox near bottom
ys=[]; xs=[]
for y in range(im.height//2, im.height):
  for x in range(0, im.width, 2):
    r,g,b=im.getpixel((x,y))
    if r>200 and g<80 and b<80:
      ys.append(y); xs.append(x)
assert xs and ys, 'toast not found'
w=max(xs)-min(xs)+1
h=max(ys)-min(ys)+1
print(w, h, min(xs), max(xs), min(ys), max(ys))
`,
  ],
  { encoding: "utf8" }
);
const [w, h] = py.trim().split(/\s+/).map(Number);
console.log({ measured: { w, h }, expected: { w: expectedW, h: expectedH }, py: py.trim() });

// Allow some encode/edge tolerance
assert.ok(Math.abs(w - expectedW) < expectedW * 0.2, `width ${w} vs expected ~${expectedW}`);
assert.ok(h < H * 0.4, `height ${h} should be well under old iw*scale height (~1056)`);
// Old broken size would be ~594 wide
assert.ok(w < 400, `sticker still too wide (${w}) — looks like old iw*scale path`);
console.log("sticker size match regression passed");
