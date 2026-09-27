#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const directories = process.argv.slice(2).map((value) => resolve(value));
if (directories.length === 0) {
  throw new Error("Usage: render-brand-assets.mjs PUBLIC_DIRECTORY [...PUBLIC_DIRECTORY]");
}

function pngIcon(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const directory of directories) {
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.goto(pathToFileURL(resolve(directory, "social-card.svg")).href);
    await page.screenshot({ path: resolve(directory, "social-card.png") });

    for (const [fileName, size] of [
      ["apple-touch-icon.png", 180],
      ["favicon-192.png", 192],
      ["favicon-512.png", 512],
      ["favicon-64.png", 64],
    ]) {
      await page.setViewportSize({ width: size, height: size });
      await page.goto(pathToFileURL(resolve(directory, "favicon.svg")).href);
      await page.screenshot({ path: resolve(directory, fileName) });
    }
    const favicon = await readFile(resolve(directory, "favicon-64.png"));
    await writeFile(resolve(directory, "favicon.ico"), pngIcon(favicon, 64));
  }
} finally {
  await browser.close();
}
