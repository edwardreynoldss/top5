/**
 * End-to-end: upload real MP4s, seed editor project, click Preview, assert playback.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const PORT = 3017;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForHealth(timeoutMs = 60000) {
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

async function upload(filePath) {
  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: "video/mp4" });
  const fd = new FormData();
  fd.append("file", blob, path.basename(filePath));
  const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(`upload failed: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const landscape = path.resolve("tmp/preview-test/landscape.mp4");
  const portrait = path.resolve("tmp/preview-test/portrait.mp4");
  assert.ok(fs.existsSync(landscape));
  assert.ok(fs.existsSync(portrait));

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
    const a = await upload(landscape);
    const b = await upload(portrait);
    console.log("uploaded", a.mediaId, b.mediaId);

    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
      headless: true,
      args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
    });

    try {
      const page = await browser.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.text().includes("preview")) {
          console.log("browser:", msg.text());
        }
      });

      // Seed project before app hydrates
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ({ a, b }) => {
          const project = {
            clips: [
              {
                id: "c5",
                rank: 5,
                label: "Five",
                mediaId: a.mediaId,
                mediaUrl: a.mediaUrl,
                fileName: "landscape.mp4",
                sourceUrl: null,
                duration: a.duration || 5,
                trimStart: 0,
                trimEnd: 2,
                segments: [{ id: "s5", start: 0, end: 2 }],
                crop: { zoom: 1, panX: 50, panY: 50 },
                status: "ready",
              },
              {
                id: "c4",
                rank: 4,
                label: "Four",
                mediaId: b.mediaId,
                mediaUrl: b.mediaUrl,
                fileName: "portrait.mp4",
                sourceUrl: null,
                duration: b.duration || 4,
                trimStart: 0,
                trimEnd: 2,
                segments: [{ id: "s4", start: 0, end: 2 }],
                crop: { zoom: 0.95, panX: 50, panY: 50 },
                status: "ready",
              },
              {
                id: "c3",
                rank: 3,
                label: "",
                mediaId: null,
                mediaUrl: null,
                fileName: null,
                sourceUrl: null,
                duration: 0,
                trimStart: 0,
                trimEnd: 4,
                segments: [{ id: "s3", start: 0, end: 4 }],
                crop: { zoom: 1, panX: 50, panY: 50 },
                status: "empty",
              },
              {
                id: "c2",
                rank: 2,
                label: "",
                mediaId: null,
                mediaUrl: null,
                fileName: null,
                sourceUrl: null,
                duration: 0,
                trimStart: 0,
                trimEnd: 4,
                segments: [{ id: "s2", start: 0, end: 4 }],
                crop: { zoom: 1, panX: 50, panY: 50 },
                status: "empty",
              },
              {
                id: "c1",
                rank: 1,
                label: "",
                mediaId: null,
                mediaUrl: null,
                fileName: null,
                sourceUrl: null,
                duration: 0,
                trimStart: 0,
                trimEnd: 4,
                segments: [{ id: "s1", start: 0, end: 4 }],
                crop: { zoom: 1, panX: 50, panY: 50 },
                status: "empty",
              },
            ],
            settings: {
              title: {
                enabled: false,
                lines: [],
                fontId: "bebas",
                fontSize: 72,
                uppercase: true,
                align: "center",
                x: 50,
                y: 6,
                lineGap: 8,
                showBar: false,
                barOpacity: 0.45,
                barHeight: 150,
              },
              ranksLayout: {
                x: 6,
                y: 22,
                gap: 64,
                fontId: "bebas",
                fontSize: 42,
                labelSize: 28,
              },
              rankColors: { 1: "#fff", 2: "#fff", 3: "#fff", 4: "#fff", 5: "#fff" },
              showRankList: true,
              showActiveLabel: true,
              transition: "cut",
              transitionDuration: 0.15,
              playOrder: "countdown",
              aspectMode: "blur-pad",
              blurAmount: 24,
              clipVolume: 1,
              titleOverlap: true,
            },
            sfxAssets: [],
            sfxPlacements: [],
          };
          localStorage.setItem("rankshorts-project-v1", JSON.stringify(project));
        },
        { a, b }
      );
      await page.reload({ waitUntil: "networkidle0" });

      // Wait for preview video element to show media
      await page.waitForFunction(() => {
        const v = document.querySelector(".preview-fg");
        return v && v.getAttribute("src");
      }, { timeout: 15000 });

      // Click Play all in transport (more reliable than topbar label)
      const playBtn = await page.waitForSelector("button::-p-text(Play all), .preview-transport button", {
        timeout: 10000,
      });
      // Find the Play all button specifically
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("button")];
        const play = buttons.find((b) => /Play all|Preview/i.test(b.textContent || ""));
        if (!play) throw new Error("Play button not found");
        play.click();
      });

      // currentTime should advance within ~2s
      await page.waitForFunction(() => {
        const v = document.querySelector(".preview-fg");
        return v && !v.paused && v.currentTime > 0.25;
      }, { timeout: 8000 });

      const mid = await page.evaluate(() => {
        const v = document.querySelector(".preview-fg");
        const clock = document.querySelector(".preview-clock");
        return {
          paused: v.paused,
          t: v.currentTime,
          src: v.getAttribute("src"),
          clock: clock?.textContent || "",
        };
      });
      console.log("mid playback", mid);
      assert.equal(mid.paused, false);
      assert.ok(mid.t > 0.25, `expected currentTime>0.25, got ${mid.t}`);

      // Wait for advance into second clip (trim is 2s)
      await page.waitForFunction(
        (firstSrc) => {
          const v = document.querySelector(".preview-fg");
          const clock = document.querySelector(".preview-clock");
          const text = clock?.textContent || "";
          return (
            v &&
            ((v.getAttribute("src") && v.getAttribute("src") !== firstSrc) ||
              /clip 2\/2/.test(text))
          );
        },
        { timeout: 12000 },
        mid.src
      );

      const after = await page.evaluate(() => {
        const v = document.querySelector(".preview-fg");
        const clock = document.querySelector(".preview-clock");
        return {
          paused: v.paused,
          t: v.currentTime,
          src: v.getAttribute("src"),
          clock: clock?.textContent || "",
        };
      });
      console.log("after advance", after);
      assert.notEqual(after.src, mid.src, "expected second clip media src");
      assert.equal(after.paused, false, "second clip should be playing");
      assert.match(after.clock, /clip 2\/2/);

      console.log("e2e preview ranking playback passed");
    } finally {
      await browser.close();
    }
  } finally {
    server.kill("SIGTERM");
    // give it a moment; force kill if needed
    await new Promise((r) => setTimeout(r, 500));
    try {
      server.kill("SIGKILL");
    } catch {
      // ignore
    }
    if (serverLog.includes("Error")) console.log(serverLog.slice(-2000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
