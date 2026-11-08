// Optional integration check against a running production server. Uses installed Google Chrome.
// Run: node tests/browser-smoke.mjs
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";
const context = await browser.newContext({ viewport: { width: 1440, height: 1150 }, locale: "ru-RU" });
await context.addInitScript(() => {
  window.__marketSockets = [];
  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    constructor(...args) { super(...args); window.__marketSockets.push(this); }
  };
});
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", e => runtimeErrors.push(e.message));
try {
  await page.goto(baseURL);
  await page.locator(".pair-row").first().waitFor({ timeout: 30000 });
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 });
  console.log("Loaded pairs and 500 real candles");
  assert.ok(await page.locator("button.pair-row").count()>20);
  await page.locator(".stream-pill").filter({ hasText: "Онлайн" }).waitFor({ timeout: 25000 });
  assert.ok((await page.locator(".price-line > strong").textContent()) !== "—");
  const initial = await page.locator(".price-line > strong").textContent();
  await page.locator(".pair-row").filter({ hasText: "ETH/USDT" }).click();
  await page.locator(".asset-name h1").filter({ hasText: "ETH" }).waitFor();
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor();
  await page.getByRole("button", { name: "15m", exact: true }).click();
  await page.locator('.chart-canvas[aria-label*="15m"]').waitFor();
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor();
  // Rapid changes: an old request or stream must not replace the final selected pair.
  for (const asset of ["BTC", "SOL", "ETH"]) await page.locator(".pair-row").filter({ hasText: `${asset}/USDT` }).click();
  await page.getByRole("button", { name: "1h", exact: true }).click();
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor();
  assert.match(await page.locator(".asset-name h1").textContent(), /ETH/);
  await page.getByRole("textbox", { name: "Поиск торговой пары" }).fill("solana");
  assert.equal(await page.locator(".pair-row").count(), 1);
  await page.getByRole("textbox", { name: "Поиск торговой пары" }).fill("no-such-coin");
  await page.getByText("Пары не найдены. Попробуйте другой запрос.").waitFor();
  await page.getByRole("button", { name: "Очистить поиск" }).click();
  await page.getByRole("combobox", { name: "Сортировка пар" }).selectOption("name");
  const names = await page.locator(".pair-name strong").allTextContents();
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  await page.getByRole("button", { name: "Показать или скрыть объём" }).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Показать или скрыть объём"]').getAttribute("aria-pressed")==="false");
  assert.equal(await page.getByRole("button", { name: "Показать или скрыть объём" }).getAttribute("aria-pressed"), "false");
  await page.getByRole("button", { name: "Показать или скрыть объём" }).click();
  await page.getByRole("button", { name: "Увеличить график" }).click();
  await page.getByRole("button", { name: "Свернуть график" }).click();
  const invalid = await page.request.get(`${baseURL}/api/market/candles?symbol=BTCUSDT&limit=1001`);
  assert.equal(invalid.status(), 400);
  assert.equal((await invalid.json()).error.code, "INVALID_PARAMS");
  const candles = await page.request.get(`${baseURL}/api/market/candles?symbol=ETHUSDT&timeframe=1h&limit=500`);
  assert.equal(candles.status(), 200);
  assert.equal((await candles.json()).data.length, 500);
  await page.locator(".stream-pill").filter({ hasText: "Онлайн" }).waitFor({ timeout: 25000 });
  assert.equal(await page.evaluate(() => window.__marketSockets.filter(s => s.readyState < 2 && s.url.startsWith("wss://")).length), 2, "Previous WebSocket subscriptions are closed");
  await mkdir(".qa", { recursive: true });
  await page.screenshot({ path: ".qa/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".qa/mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Mobile horizontal overflow");
  assert.deepEqual(runtimeErrors, [], "Browser runtime errors");
  console.log(`PASS real data, stream, pairs, intervals, rapid switching, search, sorting, chart tools, validation, mobile layout. Initial BTC price: ${initial}`);

  // No fabricated market data when API fails. Block both REST and stream in an isolated context.
  const failure = await browser.newContext();
  await failure.route("**/api/market/**", route => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "NETWORK_ERROR", message: "Тестовая недоступность биржи" } }) }));
  const errorPage = await failure.newPage();
  await errorPage.goto(baseURL);
  await errorPage.locator(".error-banner").waitFor();
  assert.equal(await errorPage.locator(".price-line > strong").textContent(), "—");
  assert.equal(await errorPage.locator(".pair-row").count(), 0);
  await errorPage.locator(".error-banner button").click();
  await errorPage.locator(".error-banner").waitFor();
  console.log("PASS API failure, empty state, no fabricated prices, manual retry");
  await failure.close();

  // Regression: a healthy WebSocket must not prevent recovery of a failed REST history request.
  const recovery = await browser.newContext();
  let candleAttempts = 0;
  await recovery.route("**/api/market/candles?**", route => {
    candleAttempts++;
    return candleAttempts === 1 ? route.abort("failed") : route.continue();
  });
  const recoveryPage = await recovery.newPage();
  await recoveryPage.goto(baseURL);
  await recoveryPage.locator(".error-banner").waitFor();
  assert.match(await recoveryPage.locator(".error-banner").textContent(), /Не удалось загрузить данные с сервера/);
  await recoveryPage.locator(".stream-pill").filter({ hasText: "Онлайн" }).waitFor({ timeout: 12000 });
  await recoveryPage.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 25000 });
  await recoveryPage.locator(".error-banner").waitFor({ state: "detached" });
  assert.ok(candleAttempts >= 2, "Failed history is retried even while the stream is live");
  console.log("PASS transient fetch failure: localized error, automatic history recovery with live stream, cleared banner");
  await recovery.close();

  const fallback = await browser.newContext();
  await fallback.routeWebSocket("wss://data-stream.binance.vision/**", socket => socket.close());
  const fallbackPage = await fallback.newPage();
  let historyRequests = 0;
  fallbackPage.on("request", request => { if (request.url().includes("/api/market/candles")) historyRequests++; });
  await fallbackPage.goto(baseURL);
  await fallbackPage.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 });
  await fallbackPage.locator(".stream-pill").filter({ hasText: "REST" }).waitFor();
  await fallbackPage.waitForTimeout(16000);
  assert.ok(historyRequests >= 2, "REST fallback refreshes candles while stream is unavailable");
  assert.notEqual(await fallbackPage.locator(".price-line > strong").textContent(), "—");
  console.log("PASS WebSocket outage: REST chart remains usable, history polling continues");
  await fallback.close();
} catch (error) {
  await mkdir(".qa", { recursive: true });
  await page.screenshot({ path: ".qa/failure.png", fullPage: true });
  console.error("Browser errors:", runtimeErrors);
  console.error("Page errors:", await page.locator(".error-banner").allTextContents());
  throw error;
} finally { await context.close(); await browser.close(); }
