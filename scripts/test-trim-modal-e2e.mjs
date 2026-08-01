/**
 * E2E: open Trim modal, change start time, Preview part must play from new in-point.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const PORT = 3019;
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
  assert.ok(fs.existsSync(landscape), "missing landscape.mp4");

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
    console.log("uploaded", a.mediaId);

    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
      headless: true,
      args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
    });

    try {
      const page = await browser.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") console.log("browser:", msg.text());
      });

      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate((clip) => {
        const project = {
          clips: [
            {
              id: "c5",
              rank: 5,
              label: "Five",
              mediaId: clip.mediaId,
              mediaUrl: clip.mediaUrl,
              fileName: "landscape.mp4",
              sourceUrl: null,
              duration: clip.duration || 5,
              trimStart: 0,
              trimEnd: 4,
              segments: [{ id: "s5", start: 0, end: 4 }],
              crop: { zoom: 1, panX: 50, panY: 50 },
              status: "ready",
            },
            {
              id: "c4",
              rank: 4,
              label: "",
              mediaId: null,
              mediaUrl: null,
              fileName: null,
              sourceUrl: null,
              duration: 0,
              trimStart: 0,
              trimEnd: 4,
              segments: [{ id: "s4", start: 0, end: 4 }],
              crop: { zoom: 1, panX: 50, panY: 50 },
              status: "empty",
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
      }, a);

      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector('button[title="Edit trim & crop"]', { timeout: 15000 });
      await page.click('button[title="Edit trim & crop"]');
      await page.waitForSelector(".trim-modal video.trim-video", { timeout: 15000 });

      // Wait for preview ready (Preview part enabled)
      await page.waitForFunction(
        () => {
          const btns = [...document.querySelectorAll(".trim-modal button")];
          const preview = btns.find((b) => (b.textContent || "").includes("Preview part"));
          return preview && !preview.disabled;
        },
        { timeout: 20000 }
      );

      // Move Start slider to 1.5s via React onChange
      await page.evaluate(() => {
        const labels = [...document.querySelectorAll(".trim-modal label")];
        const startLabel = labels.find((el) => (el.textContent || "").startsWith("Start"));
        const row = startLabel?.closest(".trim-row");
        const input = row?.querySelector('input[type="range"]');
        if (!input) throw new Error("start range not found");
        const propsKey = Object.keys(input).find((k) => k.startsWith("__reactProps$"));
        if (!propsKey) throw new Error("no react props on start range");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
          input,
          "1.5"
        );
        input[propsKey].onChange({ target: input, currentTarget: input });
      });

      await new Promise((r) => setTimeout(r, 400));

      // Click Preview part
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll(".trim-modal button")];
        const preview = btns.find((b) => (b.textContent || "").includes("Preview part"));
        if (!preview) throw new Error("Preview part missing");
        preview.click();
      });

      await new Promise((r) => setTimeout(r, 350));

      const before = await page.$eval(".trim-modal video.trim-video", (v) => ({
        t: v.currentTime,
        paused: v.paused,
        seeking: v.seeking,
      }));

      await new Promise((r) => setTimeout(r, 800));

      const after = await page.$eval(".trim-modal video.trim-video", (v) => ({
        t: v.currentTime,
        paused: v.paused,
        seeking: v.seeking,
      }));

      const result = {
        before,
        after,
        advanced: after.t > before.t + 0.15,
        nearStart: before.t >= 1.1 && before.t <= 2.2,
        stuckSeeking: before.seeking && after.seeking,
      };
      console.log(JSON.stringify(result, null, 2));

      assert.equal(result.stuckSeeking, false, "must not stick seeking");
      assert.equal(before.paused, false, "preview should be playing");
      assert.equal(result.nearStart, true, "should start near new in-point");
      assert.equal(result.advanced, true, "currentTime must advance during preview");
      console.log("trim modal start→preview e2e passed");
    } finally {
      await browser.close();
    }
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
