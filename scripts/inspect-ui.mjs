import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const messages = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) messages.push(`[${message.type()}] ${message.text()}`);
});
page.on("pageerror", (error) => messages.push(`[pageerror] ${error.stack || error.message}`));
page.on("response", (response) => {
  if (response.status() >= 400) messages.push(`[response ${response.status()}] ${response.url()}`);
});
const startedAt = Date.now();
await page.goto(process.env.INSPECT_URL || "http://127.0.0.1:3000", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8_000);
const screenshotPath = process.env.INSPECT_SCREENSHOT || "test-results/ui-inspection.png";
await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
await page.screenshot({ path: screenshotPath, fullPage: true });
const report = {
  elapsedMs: Date.now() - startedAt,
  title: await page.title(),
  mapCanvas: await page.locator(".maplibregl-canvas").count(),
  selectedPanel: await page.locator(".intelligence-panel").count(),
  bodyTextSample: (await page.locator("body").innerText()).slice(0, 500),
  messages,
};
console.log(JSON.stringify(report, null, 2));
await browser.close();
