/**
 * Sticker outro must not be cut by a short probed-duration enable window.
 * Export uses enable=gte(delay) + eof_action=pass so the full WebM plays out.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve("tmp/sticker-outro");
fs.mkdirSync(root, { recursive: true });

// Build a sticker: red for 1.0s, then fade-ish second half still visible (orange) until 1.8s
// If enable ends at "probed" 1.0s, orange outro would be missing.
const webm = path.join(root, "outro.webm");
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
    "color=c=red:s=640x200:d=1.0:r=30,format=rgba,geq=r=255:g=0:b=0:a=255",
    "-f",
    "lavfi",
    "-i",
    "color=c=orange:s=640x200:d=0.8:r=30,format=rgba,geq=r=255:g=140:b=0:a=255",
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0,format=yuva420p[v]",
    "-map",
    "[v]",
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuva420p",
    "-auto-alt-ref",
    "0",
    "-metadata:s:v:0",
    "alpha_mode=1",
    "-b:v",
    "500k",
    webm,
  ],
  { stdio: "inherit" }
);

const delay = 0.5;
const wrongEnd = delay + 1.0; // would cut the orange outro
const outCut = path.join(root, "cut.mp4");
const outFull = path.join(root, "full.mp4");

function render(out, enableExpr) {
  const filter =
    `[1:v]format=yuva420p,fps=30,scale=400:-1,setpts=PTS/1+${delay}/TB[stk];` +
    `[0:v][stk]overlay=x=(W-w)/2:y=H-h:enable='${enableExpr}':eof_action=pass:format=rgb,format=yuv420p`;
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
      "color=c=blue:s=1080x1920:d=3:r=30",
      "-c:v",
      "libvpx-vp9",
      "-an",
      "-i",
      webm,
      "-filter_complex",
      filter,
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      out,
    ],
    { stdio: "inherit" }
  );
}

render(outCut, `between(t\\,${delay}\\,${wrongEnd})`);
render(outFull, `gte(t\\,${delay})`);

function sample(mp4, t, png) {
  execFileSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", mp4, "-frames:v", "1", png],
    { stdio: "inherit" }
  );
  return execFileSync(
    "python3",
    [
      "-c",
      `from PIL import Image; im=Image.open(${JSON.stringify(png)}).convert('RGB'); print(im.getpixel((540, im.height-40)))`,
    ],
    { encoding: "utf8" }
  ).trim();
}

function parseRgb(s) {
  const m = /\((\d+),\s*(\d+),\s*(\d+)\)/.exec(s);
  assert.ok(m, `bad rgb ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// During orange outro (~ delay+1.3 = 1.8)
const cutPx = sample(outCut, 1.8, path.join(root, "cut.png"));
const fullPx = sample(outFull, 1.8, path.join(root, "full.png"));
console.log({ cutPx, fullPx });

const cut = parseRgb(cutPx);
const full = parseRgb(fullPx);
// cut should be blue (outro missing); full should be orange-ish
assert.ok(cut[2] > 200 && cut[0] < 80, "short enable cuts outro (blue bg)");
assert.ok(full[0] > 200 && full[1] > 80, "gte enable keeps outro visible");
console.log("sticker outro continuity regression passed");
