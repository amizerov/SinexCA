import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const baseURL = process.env.BASE_URL || "http://localhost:3002";
const candles = Array.from({ length: 48 }, (_, i) => ({
  time: Date.parse("2026-11-07T00:00:00Z") / 1000 + i * 3600,
  open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 20,
}));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const timezoneId of ["Europe/Moscow", "America/New_York", "UTC"]) {
    const context = await browser.newContext({ timezoneId, viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      window.chartLabels = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        if (window.chartLabels.length < 20000) window.chartLabels.push(String(text));
        return original.call(this, text, ...args);
      };
    });
    await context.routeWebSocket(/wss:\/\//, socket => socket.close());
    await context.route("**/api/market/**", route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ json: { data: path.endsWith("/pairs")
        ? [{ exchange: "binance", marketType: "spot", symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" }]
        : path.endsWith("/candles") ? candles : [] } });
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(baseURL);
    await page.locator(".chart-caption").filter({ hasText: timezoneId }).filter({ hasText: "48 свечей" }).waitFor();
    const canvas = page.locator(".chart-canvas");
    assert.ok((await canvas.getAttribute("aria-label")).includes(timezoneId));
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.waitForFunction(() => window.chartLabels.some(text => /\d{2}\.\d{2}\.2026.*\d{2}:\d{2}/.test(text)));
    const formatter = new Intl.DateTimeFormat("ru-RU", { timeZone: timezoneId, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const expected = new Set(candles.map(c => formatter.format(new Date(c.time * 1000))));
    const labels = await page.evaluate(() => window.chartLabels);
    assert.ok(labels.some(label => expected.has(label)), `${timezoneId}: crosshair uses local time for the original UTC candle`);
    assert.deepEqual(errors, []);
    console.log(`PASS chart caption and rendered crosshair: ${timezoneId}`);
    await context.close();
  }
} finally { await browser.close(); }
