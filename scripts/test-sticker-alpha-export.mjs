/**
 * Regression: VP9 WebM with gray RGB under transparent pixels must not become
 * an opaque gray slab in export overlays (Chrome preview is fine; ffmpeg needs
 * libvpx-vp9 + yuva420p + overlay format=rgb).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function grayRatio(pngPath) {
  const { createRequire: cr } = require("node:module");
  // use python/pillow already available
  const out = execFileSync(
    "python3",
    [
      "-c",
      `
from PIL import Image
im=Image.open(${JSON.stringify(pngPath)}).convert('RGB')
gray=0; total=0
for y in range(im.height//2, im.height, 6):
  for x in range(0, im.width, 6):
    r,g,b=im.getpixel((x,y)); total+=1
    if abs(r-g)<15 and abs(g-b)<15 and 50<=r<=140: gray+=1
bot=im.getpixel((im.width//2, im.height-80))
mid=im.getpixel((im.width//2, im.height//2))
print(gray/total)
print(bot[0], bot[1], bot[2])
print(mid[0], mid[1], mid[2])
`,
    ],
    { encoding: "utf8" }
  );
  const lines = out.trim().split("\n");
  return {
    gray: parseFloat(lines[0]),
    bot: lines[1].split(" ").map(Number),
    mid: lines[2].split(" ").map(Number),
  };
}

const root = path.resolve("tmp/sticker-fix");
fs.mkdirSync(root, { recursive: true });
const webm = path.join(root, "gray-under-alpha.webm");
const outMp4 = path.join(root, "regression-fixed.mp4");
const frame = path.join(root, "regression-fixed.png");

// Build gray-under-alpha sticker if missing
if (!fs.existsSync(webm)) {
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
      "color=c=gray:s=1080x1920:d=2:r=30,format=rgba,geq=r='if(gt(Y,1650),255,80)':g='if(gt(Y,1650),40,80)':b='if(gt(Y,1650),40,80)':a='if(gt(Y,1650),255,0)'",
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      "-metadata:s:v:0",
      "alpha_mode=1",
      "-b:v",
      "1M",
      webm,
    ],
    { stdio: "inherit" }
  );
}

// Mirror the fixed export filter chain
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
    "testsrc2=s=1080x1920:d=1.2:r=30",
    "-c:v",
    "libvpx-vp9",
    "-an",
    "-i",
    webm,
    "-filter_complex",
    "[1:v]format=yuva420p,fps=30,scale=iw*0.55:-1,setpts=PTS/1+0.2/TB[stk];[0:v][stk]overlay=x=(W-w)/2:y=H-h:enable='between(t\\,0.2\\,1.2)':eof_action=pass:format=rgb,format=yuv420p",
    "-t",
    "1.2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outMp4,
  ],
  { stdio: "inherit" }
);

execFileSync(
  "ffmpeg",
  ["-y", "-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", outMp4, "-frames:v", "1", frame],
  { stdio: "inherit" }
);

const stats = grayRatio(frame);
console.log(JSON.stringify(stats, null, 2));
assert.ok(stats.gray < 0.05, `gray slab still present (${stats.gray})`);
assert.ok(stats.bot[0] > 200, "bottom toast/red should be visible");
// Mid frame should NOT be gray (80,80,80)
assert.ok(!(Math.abs(stats.mid[0] - stats.mid[1]) < 15 && stats.mid[0] > 50 && stats.mid[0] < 140), "mid should not be gray slab");
console.log("sticker alpha export regression passed");
