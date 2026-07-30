/**
 * Browser playback smoke test — mirrors PreviewPhone load/play/advance rules
 * against real MP4 files in headless Chrome.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function loadPuppeteer() {
  try {
    return require("puppeteer-core");
  } catch {
    const { execSync } = require("node:child_process");
    execSync("npm install puppeteer-core@24 --no-save --no-package-lock", {
      stdio: "inherit",
      cwd: path.resolve("."),
    });
    return require("puppeteer-core");
  }
}

function contentType(file) {
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

async function main() {
  const root = path.resolve("tmp/preview-test");
  const landscape = path.join(root, "landscape.mp4");
  const portrait = path.join(root, "portrait.mp4");
  assert.ok(fs.existsSync(landscape), "missing landscape test mp4");
  assert.ok(fs.existsSync(portrait), "missing portrait test mp4");

  const html = `<!doctype html>
<html><body>
<video id="v1" playsinline muted preload="auto"></video>
<video id="v2" playsinline muted preload="auto"></video>
<script>
window.__log = [];
function log(m){ window.__log.push(m); console.log(m); }

async function playClip(video, url, start, end) {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const done = (ok, info) => {
      if (settled) return;
      settled = true;
      resolve({ ok, ...info });
    };
    video.src = url;
    video.load();
    await new Promise((r) => video.addEventListener("loadeddata", r, { once: true }));
    video.currentTime = start;
    await new Promise((r) => {
      const t = setTimeout(r, 300);
      video.addEventListener("seeked", () => { clearTimeout(t); r(); }, { once: true });
    });
    const t0 = video.currentTime;
    try {
      await video.play();
    } catch (e) {
      done(false, { error: String(e), t0 });
      return;
    }
    const started = Date.now();
    const onTime = () => {
      const naturalEnd = Number.isFinite(video.duration) ? video.duration : end;
      const endAt = Math.min(end, naturalEnd);
      if (video.currentTime >= endAt - 0.05) {
        video.removeEventListener("timeupdate", onTime);
        done(true, {
          t0,
          t1: video.currentTime,
          elapsedMs: Date.now() - started,
          advanced: video.currentTime > t0 + 0.2,
        });
      }
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", () => {
      video.removeEventListener("timeupdate", onTime);
      done(true, {
        t0,
        t1: video.currentTime,
        elapsedMs: Date.now() - started,
        advanced: video.currentTime > t0 + 0.15,
        ended: true,
      });
    }, { once: true });
    setTimeout(() => done(false, { error: "timeout", t0, t1: video.currentTime }), 8000);
  });
}

window.runSequence = async () => {
  const v = document.getElementById("v1");
  const results = [];
  // Clip A: landscape, trim 0-2
  results.push(await playClip(v, "/landscape.mp4", 0, 2));
  // Clip B: portrait, trim 0.5-2.5 (also shorter-than-file)
  results.push(await playClip(v, "/portrait.mp4", 0.5, 2.5));
  // Clip C: segment end past file duration (3s file / end 4) — must still complete via ended
  results.push(await playClip(v, "/landscape.mp4", 0, 4));
  return results;
};
</script>
</body></html>`;

  fs.writeFileSync(path.join(root, "index.html"), html);

  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = rel === "/" ? path.join(root, "index.html") : path.join(root, rel.replace(/^\//, ""));
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(file) });
    fs.createReadStream(file).pipe(res);
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });

  try {
    const page = await browser.newPage();
    page.on("console", (msg) => console.log("browser:", msg.text()));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
    const results = await page.evaluate(() => window.runSequence());
    console.log(JSON.stringify(results, null, 2));
    assert.equal(results.length, 3);
    for (const [i, r] of results.entries()) {
      assert.equal(r.ok, true, `clip ${i} failed: ${JSON.stringify(r)}`);
      assert.equal(r.advanced, true, `clip ${i} did not advance playback`);
    }
    console.log("preview playback browser tests passed");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
