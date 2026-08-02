#!/usr/bin/env node
/**
 * Install a transparent WebM as a bundled per-channel subscribe sticker.
 *
 * Usage:
 *   node scripts/install-channel-sticker.mjs animals /path/to/file.webm
 *
 * Writes:
 *   public/stickers/channels/{slug}.webm
 *   tmp/uploads/channel-{slug}-sticker.webm
 */
import { copyFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const slug = (process.argv[2] || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
const src = process.argv[3];

if (!slug || !src) {
  console.error("Usage: node scripts/install-channel-sticker.mjs <channel-slug> <webm-path>");
  process.exit(1);
}
if (!existsSync(src)) {
  console.error(`File not found: ${src}`);
  process.exit(1);
}

const root = process.cwd();
const publicDir = path.join(root, "public", "stickers", "channels");
const uploadDir = path.join(root, "tmp", "uploads");
mkdirSync(publicDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });

const publicPath = path.join(publicDir, `${slug}.webm`);
const uploadPath = path.join(uploadDir, `channel-${slug}-sticker.webm`);
copyFileSync(src, publicPath);
copyFileSync(src, uploadPath);
console.log(`Installed channel sticker for "${slug}"`);
console.log(`  ${publicPath}`);
console.log(`  ${uploadPath}`);
