import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3004";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const scope = { exchange: "binance", marketType: "spot", symbol: "BTCUSDT" };
const endpoint = `/api/drawings?${new URLSearchParams(scope)}`;
let original;
let testLevelId;
let ownerId;
async function loadDocument() {
  const response = await page.request.get(baseURL + endpoint);
  assert.equal(response.status(), 200);
  const result=await response.json();ownerId=result.ownerId;return result.data;
}
async function saved() { await page.locator('[data-save-status="saved"]').waitFor({ timeout: 20000 }); }
async function switchExchange(id) {
  await page.locator(".exchange-tabs button").nth(["binance","bybit","okx","bitget","gate","kraken","coinbase"].indexOf(id)).click();
  await page.locator(".pair-row").first().waitFor({ timeout: 30000 });
}
try {
  original = await loadDocument();
  await page.goto(baseURL);
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 });
  await saved();
  await page.getByRole("button", { name: "Горизонтальный уровень", exact: true }).click();
  const canvas = await page.locator(".chart-canvas").boundingBox();
  await page.mouse.click(canvas.x + canvas.width * .56, canvas.y + canvas.height * .35);
  await page.locator(".level-editor").waitFor(); await saved();
  let document = await loadDocument();
  const id = await page.locator(".level-hit.selected").getAttribute("data-level-id");
  testLevelId = id;
  let added = document.levels.find(level => level.id === id);
  assert.ok(added);
  const input = page.getByRole("spinbutton", { name: "Цена уровня" });
  await input.fill(String(added.price * 1.001));
  await page.getByRole("button", { name: "Применить цену" }).click();
  await page.getByRole("button", { name: "Цвет #63c8ff", exact: true }).click();
  await saved();
  document = await loadDocument(); added = document.levels.find(level => level.id === id);
  assert.equal(added.color, "#63c8ff");
  const editedPrice = added.price;
  await page.reload(); await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 }); await saved();
  const level = page.locator(`[data-level-id="${id}"]`);
  await level.waitFor({ state: "visible" });
  const box = await level.boundingBox();
  await page.mouse.move(box.x + box.width * .65, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .65, box.y + box.height / 2 + 30, { steps: 6 }); await page.mouse.up();
  await saved(); document = await loadDocument();
  assert.notEqual(document.levels.find(level => level.id === id).price, editedPrice, "Drag persists a new price");
  await page.getByRole("button", { name: "Отменить разметку" }).click(); await saved();
  assert.equal((await loadDocument()).levels.find(level => level.id === id).price, editedPrice);
  await page.getByRole("button", { name: "15m", exact: true }).click(); await saved();
  assert.equal(await page.locator(`[data-level-id="${id}"]`).count(), 1, "Timeframes share instrument levels");
  await switchExchange("bybit"); await saved();
  assert.equal(await page.locator(`[data-level-id="${id}"]`).count(), 0, "Exchange scope is isolated");
  await switchExchange("binance"); await saved();
  assert.equal(await page.locator(`[data-level-id="${id}"]`).count(), 1);
  await page.locator(".pair-row").filter({ hasText: "ETH/USDT" }).click(); await saved();
  assert.equal(await page.locator(`[data-level-id="${id}"]`).count(), 0, "Pair scope is isolated");
  await page.locator(".pair-row").filter({ hasText: "BTC/USDT" }).click(); await saved();
  await page.getByRole("button", { name: "1h", exact: true }).click();
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 });
  await page.locator(`[data-level-id="${id}"]`).click({ position: { x: 150, y: 7 } });
  await page.getByRole("button", { name: "Удалить уровень" }).click(); await saved();
  assert.equal((await loadDocument()).levels.some(level => level.id === id), false);
  await page.getByRole("button", { name: "Отменить разметку" }).click(); await saved();
  assert.equal((await loadDocument()).levels.some(level => level.id === id), true);
  await mkdir(".qa", { recursive: true });
  await page.screenshot({ path: ".qa/drawing-levels.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: ".qa/drawing-levels-mobile.png" });
  assert.deepEqual(errors, []);
  console.log("PASS create, edit price/color, SQLite persistence after reload, drag, undo, timeframe sharing, exchange/pair isolation, delete/restore, mobile viewport");
} catch (error) {
  await mkdir(".qa", { recursive: true }); await page.screenshot({ path: ".qa/drawing-failure.png" });
  console.error("Browser errors:", errors); throw error;
} finally {
  try {
    if (original && testLevelId) {
      const current = await loadDocument();
      const response = await page.request.put(baseURL + "/api/drawings", { headers:{"X-Workspace-Id":ownerId},data: { scope, revision: current.revision, mutationId: crypto.randomUUID(), levels: current.levels.filter(level => level.id !== testLevelId) } });
      assert.equal(response.status(), 200, "Remove only the test level, preserving other users' changes");
    }
  } finally { await browser.close(); }
}
