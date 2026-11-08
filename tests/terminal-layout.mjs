import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3004";
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(baseURL);
  await page.locator(".pair-row").first().waitFor({ timeout: 30000 });
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 });
  assert.equal(await page.getByText("Рынок в движении.", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Публичные данные", { exact: true }).count(), 0);
  assert.equal(await page.locator(".overview-card").count(), 0);
  await mkdir(".qa", { recursive: true });
  for (const [width, height] of [[1920,1080],[1440,900],[1024,768],[768,1024],[390,844],[320,568],[844,390],[600,420],[320,480]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const geometry = await page.evaluate(() => {
      const chart = document.querySelector(".chart-canvas").getBoundingClientRect();
      const list = document.querySelector(".pair-list");
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, chart: { x: chart.x, y: chart.y, width: chart.width, height: chart.height, bottom: chart.bottom }, listScrollable: list.scrollHeight > list.clientHeight };
    });
    assert.ok(geometry.scrollWidth <= width && geometry.scrollHeight <= height, `Page overflow at ${width}x${height}: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.chart.width > 100 && geometry.chart.height > Math.min(100, height * .23), `Chart too small: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.chart.y >= 0 && geometry.chart.bottom <= height, "Chart must be fully visible");
    assert.ok(geometry.listScrollable, "Pair list must have independent scroll");
    const before = await page.locator(".chart-canvas").boundingBox();
    await page.locator(".pair-list").evaluate(el => { el.scrollTop = 0; });
    await page.locator(".pair-list").hover();
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(100);
    const after = await page.locator(".chart-canvas").boundingBox();
    assert.deepEqual(after, before, "Scrolling pairs must not move or resize chart");
    assert.ok(await page.locator(".pair-list").evaluate(el => el.scrollTop > 0), "Wheel must scroll the pair list");
    assert.equal(await page.evaluate(() => scrollY), 0);
    if (width === 1440 || width === 390) await page.screenshot({ path: `.qa/terminal-${width}.png` });
    console.log(`PASS ${width}x${height}: chart ${Math.round(after.width)}x${Math.round(after.height)}, list scrolls independently`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.locator(".exchange-tabs").isVisible(), true);
  await page.getByRole("button", { name: "Bybit", exact: true }).click();
  await page.locator(".asset-identity p").filter({ hasText: "Bybit" }).waitFor();
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "15m", exact: true }).click();
  await page.locator('.chart-canvas[aria-label*="15m"]').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.getByRole("combobox", { name: "Биржа", exact: true }).isVisible(), true);
  await page.getByRole("combobox", { name: "Биржа", exact: true }).selectOption("okx");
  await page.locator(".asset-identity p").filter({ hasText: "OKX" }).waitFor();
  await page.locator(".chart-caption").filter({ hasText: "500 свечей" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Увеличить график" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Увеличить график" }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS header tabs, compact exchange combobox, timeframe switching, expanded chart and Escape; no browser errors");
} finally { await browser.close(); }
