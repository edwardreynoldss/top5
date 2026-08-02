/**
 * Delayed sticker must be PTS-shifted or it won't appear (transparent eof).
 * Also must keep yuva so gray-under-alpha doesn't become an opaque slab.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve("tmp/sticker-miss");
fs.mkdirSync(root, { recursive: true });
const webm = path.resolve("public/stickers/gray-under-alpha.webm");
assert.ok(fs.existsSync(webm));

function frameAt(mp4, t, out) {
  execFileSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", mp4, "-frames:v", "1", out],
    { stdio: "inherit" }
  );
}

function analyze(png) {
  const out = execFileSync(
    "python3",
    [
      "-c",
      `
from PIL import Image
im=Image.open(${JSON.stringify(png)}).convert('RGB')
bot=im.getpixel((im.width//2, im.height-80))
mid=im.getpixel((im.width//2, im.height//2))
gray=0; total=0
for y in range(im.height//2, im.height, 6):
  for x in range(0, im.width, 6):
    r,g,b=im.getpixel((x,y)); total+=1
    if abs(r-g)<15 and abs(g-b)<15 and 50<=r<=140: gray+=1
print(bot[0], bot[1], bot[2])
print(mid[0], mid[1], mid[2])
print(gray/total)
`,
    ],
    { encoding: "utf8" }
  );
  const [bot, mid, gray] = out.trim().split("\n");
  return {
    bot: bot.split(" ").map(Number),
    mid: mid.split(" ").map(Number),
    gray: parseFloat(gray),
  };
}

const delay = 1.2;
const outMp4 = path.join(root, "delayed-fixed.mp4");
const filter =
  `[1:v]format=yuva420p,fps=30,scale=iw*0.55:-1,setpts=PTS/1+${delay}/TB[stk];` +
  `[0:v][stk]overlay=x=(W-w)/2:y=H-h:enable='between(t\\,${delay}\\,${delay + 1.5})':eof_action=pass:format=rgb,format=yuv420p`;

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
    "testsrc2=s=1080x1920:d=3:r=30",
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
    outMp4,
  ],
  { stdio: "inherit" }
);

const before = path.join(root, "before.png");
const during = path.join(root, "during.png");
frameAt(outMp4, 0.5, before);
frameAt(outMp4, delay + 0.3, during);

const b = analyze(before);
const d = analyze(during);
console.log({ before: b, during: d });

assert.ok(b.bot[0] < 200, "before delay: no red toast");
assert.ok(d.bot[0] > 200, "during window: toast visible");
assert.ok(d.gray < 0.08, "during window: no gray slab");
console.log("delayed sticker visibility regression passed");
