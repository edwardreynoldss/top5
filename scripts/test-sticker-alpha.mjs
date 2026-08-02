/**
 * Verify transparent WebM sticker upload preserves alpha and export overlay works.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function loadProbe() {
  // Use project ffmpeg helpers via a tiny node spawn of ffprobe
  const { execFileSync } = require("node:child_process");
  return {
    hasAlpha(file) {
      const out = execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream_tags=alpha_mode,ALPHA_MODE",
          "-of",
          "json",
          file,
        ],
        { encoding: "utf8" }
      );
      const parsed = JSON.parse(out);
      const tags = parsed.streams?.[0]?.tags || {};
      return tags.alpha_mode === "1" || tags.ALPHA_MODE === "1";
    },
  };
}

const PORT = 3027;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForHealth(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server health timeout");
}

async function main() {
  const sticker = path.resolve("public/stickers/gray-under-alpha.webm");
  const landscape = path.resolve("tmp/preview-test/landscape.mp4");
  assert.ok(fs.existsSync(sticker), "missing gray-under-alpha.webm");
  assert.ok(fs.existsSync(landscape), "missing landscape.mp4");

  const probe = await loadProbe();
  assert.equal(probe.hasAlpha(sticker), true, "demo sticker must have alpha_mode");

  const server = spawn("npm", ["run", "start", "--", "--port", String(PORT)], {
    cwd: path.resolve("."),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => {
    serverLog += d.toString();
  });
  server.stderr.on("data", (d) => {
    serverLog += d.toString();
  });

  try {
    await waitForHealth();

    // Upload sticker with purpose=sticker (must keep WebM + alpha)
    const stickerBuf = fs.readFileSync(sticker);
    const sfd = new FormData();
    sfd.append("file", new Blob([stickerBuf], { type: "video/webm" }), "gray-under-alpha.webm");
    sfd.append("purpose", "sticker");
    const sRes = await fetch(`${BASE}/api/upload`, { method: "POST", body: sfd });
    const sJson = await sRes.json();
    assert.equal(sRes.ok, true, JSON.stringify(sJson));
    assert.equal(sJson.hasAlpha, true, "upload must report hasAlpha");
    assert.ok(String(sJson.mediaId).endsWith(".webm"), "must remain .webm not .mp4");

    // Upload clip
    const clipBuf = fs.readFileSync(landscape);
    const cfd = new FormData();
    cfd.append("file", new Blob([clipBuf], { type: "video/mp4" }), "landscape.mp4");
    const cRes = await fetch(`${BASE}/api/upload`, { method: "POST", body: cfd });
    const cJson = await cRes.json();
    assert.equal(cRes.ok, true, JSON.stringify(cJson));

    // Export one clip with sticker
    const exportBody = {
      clips: [
        {
          mediaId: cJson.mediaId,
          rank: 5,
          label: "Test",
          trimStart: 0,
          trimEnd: 3.0,
          segments: [{ start: 0, end: 3.0 }],
          crop: { zoom: 1, panX: 50, panY: 50 },
          volume: 1,
        },
      ],
      title: {
        enabled: false,
        showBar: false,
        lines: [],
        fontId: "display",
        fontSize: 54,
        lineGap: 8,
        barOpacity: 0,
        barHeight: 0,
        x: 50,
        y: 2,
        align: "center",
        uppercase: true,
      },
      ranksLayout: { x: 3.5, y: 11, fontSize: 92, gap: 120, fontId: "display", labelSize: 42 },
      playOrder: "countdown",
      transition: "cut",
      transitionDuration: 0.2,
      aspectMode: "crop-fill",
      blurAmount: 28,
      titleOverlap: true,
      showRankList: false,
      showActiveLabel: false,
      rankColors: { 5: "#fff" },
      clipVolume: 1,
      width: 1080,
      height: 1920,
      fps: 30,
      sticker: {
        enabled: true,
        mediaId: sJson.mediaId,
        scale: 0.55,
        speed: 1,
        // Delay inside the clip — catches PTS-shift regressions
        startAt: 1.0,
        duration: sJson.duration || 2,
      },
      sfx: [],
    };

    const eRes = await fetch(`${BASE}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exportBody),
    });
    const eJson = await eRes.json();
    assert.equal(eRes.ok, true, JSON.stringify(eJson).slice(0, 500));
    assert.ok(eJson.fileName, "export fileName");

    const outPath = path.resolve("exports", eJson.fileName);
    assert.ok(fs.existsSync(outPath), `missing ${outPath}`);

    // Frame check: bottom should differ from top (sticker present)
    const frame = path.resolve("tmp/preview-test/sticker-export-frame.png");
    const { execFileSync } = require("node:child_process");
    execFileSync(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-ss", "1.3", "-i", outPath, "-frames:v", "1", frame],
      { stdio: "inherit" }
    );
    const { createRequire: cr } = await import("node:module");
    // use sharp-less pixel read via ffmpeg + identify or python
    const py = `
from PIL import Image
im=Image.open(${JSON.stringify(frame)}).convert('RGB')
top=im.getpixel((im.width//2, 40))
bot=im.getpixel((im.width//2, im.height-80))
mid=im.getpixel((im.width//2, im.height//2))
gray=0; total=0
for y in range(im.height//2, im.height, 6):
  for x in range(0, im.width, 6):
    r,g,b=im.getpixel((x,y)); total+=1
    if abs(r-g)<15 and abs(g-b)<15 and 50<=r<=140: gray+=1
print(top, bot, mid)
print('gray', gray/total)
print('diff', abs(top[0]-bot[0])+abs(top[1]-bot[1])+abs(top[2]-bot[2]))
`;
    const out = execFileSync("python3", ["-c", py], { encoding: "utf8" });
    console.log(out.trim());
    const lines = out.trim().split("\n");
    const gray = parseFloat(lines[1].replace(/[^\d.]/g, "") || "1");
    assert.ok(gray < 0.08, `export must not show gray alpha slab (got ${gray})`);
    const diffLine = lines[2];
    const diff = parseInt(String(diffLine).replace(/\D+/g, "") || "0", 10);
    assert.ok(diff > 30, "exported frame should show sticker at bottom");

    console.log("sticker alpha upload+export tests passed");
  } catch (err) {
    console.error(serverLog.slice(-4000));
    throw err;
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
