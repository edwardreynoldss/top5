import { OUTPUT_HEIGHT, OUTPUT_WIDTH, type OverlayPlacement } from "@/lib/types";

/** Public Sans — OFL substitute for proprietary Snapchat Sans (Kapwing et al.). */
export const SNAP_FONT_STACK =
  '"Public Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Classic Snapchat caption bar: ~55% black, full bleed. */
export const SNAP_BAR_BG = "rgba(0, 0, 0, 0.55)";

/**
 * Render a Snapchat-style caption to a transparent 1080×1920 PNG (data URL).
 * Uses the same Public Sans + bar look as the live preview so export matches
 * emoji and layout WYSIWYG.
 */
export async function renderSnapCaptionPng(
  placement: Pick<
    OverlayPlacement,
    "text" | "textStyle" | "color" | "showBackground" | "y" | "scale"
  >
): Promise<string> {
  await document.fonts.load(`700 48px "Public Sans"`).catch(() => undefined);
  await document.fonts.load(`500 48px "Public Sans"`).catch(() => undefined);

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const text = (placement.text || "").trim() || " ";
  const style = placement.textStyle || "classic";
  const showBg = placement.showBackground !== false && style !== "plain";
  const scale = Math.max(0.35, Math.min(3, placement.scale || 1));
  const fontPx = Math.round(42 * scale);
  const color = placement.color || "#FFFFFF";
  const yPct = Math.max(0, Math.min(100, placement.y ?? 50));

  ctx.font = `700 ${fontPx}px ${SNAP_FONT_STACK}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const lines = wrapCanvasText(ctx, text, OUTPUT_WIDTH - 80);
  const lineH = fontPx * 1.25;
  const blockH = Math.max(lineH, lines.length * lineH);
  const padY = Math.round(10 * scale + 6);
  const barH = Math.ceil(blockH + padY * 2);
  const centerY = (OUTPUT_HEIGHT * yPct) / 100;
  const barTop = Math.max(0, Math.min(OUTPUT_HEIGHT - barH, centerY - barH / 2));

  if (showBg && style === "classic") {
    ctx.fillStyle = SNAP_BAR_BG;
    ctx.fillRect(0, barTop, OUTPUT_WIDTH, barH);
  }

  if (showBg && style === "box") {
    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 40);
    const padX = Math.round(18 * scale);
    const boxW = Math.min(OUTPUT_WIDTH - 24, maxLineW + padX * 2);
    const boxH = barH;
    const boxX = (OUTPUT_WIDTH - boxW) / 2;
    const boxY = barTop;
    const r = Math.round(10 * Math.min(scale, 1.4));
    ctx.fillStyle = SNAP_BAR_BG;
    roundRect(ctx, boxX, boxY, boxW, boxH, r);
    ctx.fill();
  }

  ctx.fillStyle = color;
  let ty = barTop + padY + lineH / 2;
  for (const line of lines) {
    ctx.fillText(line, OUTPUT_WIDTH / 2, ty);
    ty += lineH;
  }

  return canvas.toDataURL("image/png");
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = text.split(/\n/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
  }
  return lines.slice(0, 6);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Expected PNG data URL");
  return Buffer.from(m[1], "base64");
}
