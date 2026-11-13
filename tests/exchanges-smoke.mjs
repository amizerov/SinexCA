import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3004";
const ids = ["binance", "bybit", "okx", "bitget", "gate", "kraken", "coinbase", "kucoin", "bitfinex", "htx", "mexc", "whitebit", "cryptocom", "bingx"];
const targets = process.argv.length > 2 ? process.argv.slice(2) : ids;
const report = [];
async function chooseExchange(page, id) {
  if (await page.locator(".exchange-select").isVisible()) await page.locator(".exchange-select").selectOption(id);
  else await page.locator(".exchange-tabs button").nth(ids.indexOf(id)).click();
}
async function get(path) {
  const response = await fetch(baseURL + path, { signal: AbortSignal.timeout(60000) });
  const json = await response.json();
  assert.equal(response.status, 200, `${path}: ${JSON.stringify(json)}`);
  return json;
}
const results = await Promise.allSettled(targets.map(async exchange => {
  const pairs = await get(`/api/market/pairs?exchange=${exchange}`);
  assert.equal(pairs.meta.exchange, exchange);
  assert.ok(pairs.data.length > 20);
  assert.ok(pairs.data.every(p => p.exchange === exchange));
  const first = pairs.data.find(p => p.baseAsset === "BTC") || pairs.data[0];
  const tickers = await get(`/api/market/overview?exchange=${exchange}`);
  assert.equal(tickers.meta.exchange, exchange);
  assert.ok(tickers.data.length>0&&tickers.data.length<=pairs.data.length);
  assert.ok(tickers.data.every(t => t.exchange === exchange && Number.isFinite(t.lastPrice) && t.lastPrice > 0));
  const candles = {};
  for (const timeframe of ["1m", "15m", "1h", "4h", "1d"]) {
    const history = await get(`/api/market/candles?exchange=${exchange}&symbol=${first.symbol}&timeframe=${timeframe}&limit=500`);
    assert.equal(history.meta.exchange, exchange);
    assert.ok(history.data.length > 0 && history.data.length <= 500);
    assert.ok(history.data.every((c, i, all) => c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close) && c.volume >= 0 && (!i || c.time > all[i-1].time)));
    if (timeframe === "1d") assert.ok(history.data.every(c => c.time % 86400 === (exchange === "htx" ? 57600 : 0)), `${exchange} daily candle alignment`);
    candles[timeframe] = history.data.length;
  }
  const item = { exchange, pairs: pairs.data.length, tickers: tickers.data.length, symbol: first.symbol, candles };
  report.push(item); console.log("API PASS", JSON.stringify(item));
}));
for (let i = 0; i < results.length; i++) if (results[i].status === "rejected") {
  report.push({ exchange: targets[i], error: String(results[i].reason) });
  console.error("API FAIL", targets[i], String(results[i].reason));
}
await mkdir(".qa", { recursive: true });
await writeFile(targets.length === ids.length ? ".qa/exchange-integration.json" : ".qa/extra-exchange-integration.json", JSON.stringify({ checkedAt: new Date().toISOString(), report }, null, 2));
assert.ok(results.every(r => r.status === "fulfilled"), "Some exchange APIs failed; see .qa/exchange-integration.json");

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__sockets = [];
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket { constructor(...args) { super(...args); window.__sockets.push(this); } };
  });
  await page.goto(baseURL);
  for (const id of targets) {
    await chooseExchange(page, id);
    await page.locator(".pair-row").first().waitFor({ timeout: 30000 });
    await page.locator(".chart-caption").filter({ hasText: /\d+ свечей/ }).waitFor({ timeout: 30000 });
    await page.locator(".stream-pill").filter({ hasText: "Онлайн" }).waitFor({ timeout: 65000 });
    assert.notEqual(await page.locator(".price-line > strong").textContent(), "—");
    assert.equal(await page.locator(".error-banner").count(), 0, `Error banner for ${id}`);
    assert.equal(await page.evaluate(() => window.__sockets.filter(s => s.readyState < 2 && s.url.startsWith("wss://")).length), 2, `Old streams must close when selecting ${id}`);
    assert.match(await page.locator(".asset-name h1").textContent(), id === "coinbase" ? /\/USD$/ : /\/USDT$/);
    console.log("BROWSER PASS", id, await page.locator(".stream-pill").textContent());
  }
  // Rapid source changes must not leave the old exchange's symbol, price, or subscription.
  for (const id of ["gate", "okx", "bybit", "binance"]) await chooseExchange(page, id);
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor();
  await page.locator(".stream-pill").filter({ hasText: "Онлайн" }).waitFor({ timeout: 30000 });
  assert.match(await page.locator(".asset-identity p").textContent(), /Binance/);
  assert.equal(await page.evaluate(() => window.__sockets.filter(s => s.readyState < 2 && s.url.startsWith("wss://")).length), 2);
  await chooseExchange(page, "okx");
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: ".qa/exchanges-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".qa/exchanges-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS exchange switching, stream cleanup, native symbols, mobile layout");
} finally { await browser.close(); }
