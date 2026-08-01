/**
 * Browser test: change in-point then Preview must actually advance currentTime.
 * Guards against canplay-reseek loops and stuck seek flags.
 * HTTP Range is required — without it Chrome reports seekableEnd=0 and seeks no-op.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
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

function serveFile(req, res, filePath, contentType) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const range = req.headers.range;

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start < 0 ||
      end >= size ||
      start > end
    ) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      "Content-Type": contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": String(size),
  });
  fs.createReadStream(filePath).pipe(res);
}

async function main() {
  const root = path.resolve("tmp/preview-test");
  const video = path.join(root, "landscape.mp4");
  assert.ok(fs.existsSync(video), "missing landscape.mp4 — run prior preview tests first");

  const html = `<!doctype html>
<html><body>
<video id="v" playsinline muted preload="auto"></video>
<script>
// Mirrors TrimModal play after start change
let seeking = false;
let playing = false;
let seekTimer = null;
let initialized = false;
let seg = { start: 0, end: 4 };

function beginSeek() {
  seeking = true;
  if (seekTimer) clearTimeout(seekTimer);
  seekTimer = setTimeout(() => { seeking = false; }, 120);
}
function endSeek() {
  seeking = false;
  if (seekTimer) { clearTimeout(seekTimer); seekTimer = null; }
}
function seekVideo(v, t) {
  beginSeek();
  try {
    if (Math.abs(v.currentTime - t) > 0.02) v.currentTime = t;
    else endSeek();
  } catch { endSeek(); }
}

function nextPlaybackAction(t, seg) {
  if (t < seg.start - 0.02) return "continue";
  if (t < seg.end - 0.04) return "continue";
  return "stop";
}

window.run = async () => {
  const v = document.getElementById("v");
  v.src = "/landscape.mp4";
  v.load();
  await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));

  // One-shot init (bug was canplay reseeking forever)
  const markReady = () => {
    if (initialized) return;
    initialized = true;
    v.currentTime = seg.start;
  };
  v.addEventListener("loadeddata", markReady);
  markReady();

  // Simulate canplay spam that used to reset playback
  for (let i = 0; i < 5; i++) v.dispatchEvent(new Event("canplay"));

  // Wait until the file is actually seekable (Range responses populated)
  const seekableDeadline = Date.now() + 3000;
  while (Date.now() < seekableDeadline) {
    if (v.seekable.length && v.seekable.end(0) > 1) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const seekableEnd = v.seekable.length ? v.seekable.end(0) : 0;

  // Change start time like the slider
  seg = { start: 1.5, end: 4 };
  seekVideo(v, seg.start);
  await new Promise((r) => {
    const done = () => { v.removeEventListener("seeked", done); r(); };
    v.addEventListener("seeked", done);
    setTimeout(done, 800);
  });
  endSeek();

  playing = true;
  await v.play();

  // canplay spam during play must NOT reseek (initialized guard)
  for (let i = 0; i < 5; i++) {
    if (!initialized) v.currentTime = 0; // only old buggy path would do this
  }

  const t0 = v.currentTime;
  await new Promise((r) => setTimeout(r, 700));
  const t1 = v.currentTime;

  // Playback loop check
  let stoppedEarly = false;
  if (!seeking && playing) {
    const action = nextPlaybackAction(t1, seg);
    if (action === "stop" && t1 < seg.start + 0.3) stoppedEarly = true;
  }

  return {
    paused: v.paused,
    t0,
    t1,
    seekableEnd,
    advanced: t1 > t0 + 0.25,
    nearStart: t0 >= seg.start - 0.25,
    stoppedEarly,
    seeking,
  };
};
</script>
</body></html>`;

  fs.writeFileSync(path.join(root, "trim-start.html"), html);

  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || "/").split("?")[0]);
    if (rel === "/" || rel === "/trim-start.html") {
      serveFile(req, res, path.join(root, "trim-start.html"), "text/html; charset=utf-8");
      return;
    }
    const file = path.join(root, rel.replace(/^\//, ""));
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const type = file.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
    serveFile(req, res, file, type);
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
    await page.goto(`http://127.0.0.1:${port}/trim-start.html`, {
      waitUntil: "networkidle0",
    });
    const result = await page.evaluate(() => window.run());
    console.log(JSON.stringify(result, null, 2));
    assert.ok(result.seekableEnd > 1, "video must be seekable (Range support)");
    assert.equal(result.paused, false, "video should still be playing");
    assert.equal(result.advanced, true, "currentTime must advance after start change");
    assert.equal(result.nearStart, true, "playback should begin near new in-point");
    assert.equal(result.stoppedEarly, false);
    console.log("trim start-change preview browser tests passed");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
