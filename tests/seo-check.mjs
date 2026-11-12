// Run against next start: node tests/seo-check.mjs http://127.0.0.1:3002
// Read-only production inventory: node tests/seo-check.mjs https://sinex.argoai.ru --audit
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { chromium, request } from "playwright-core";

const baseURL = process.argv[2] || "http://127.0.0.1:3002";
const audit = process.argv.includes("--audit");
const origin = "https://sinex.argoai.ru";
const sections = ["help", "learn", "developers", "blog"];
const articles = [];
for (const section of sections) {
  for (const file of await fs.readdir(`content/${section}`)) {
    if (!file.endsWith(".mdx")) continue;
    const { data, content } = matter(await fs.readFile(`content/${section}/${file}`, "utf8"));
    if (data.draft) continue;
    // Verify real MDX headings in the response, not an RSC payload or client rendering.
    const heading = content.match(/^## (.+)$/m)?.[1];
    articles.push({ path: `/${section}/${file.slice(0, -4)}`, ...data, heading });
  }
}
const paths = ["/", ...sections.map(s => `/${s}`), "/about", ...articles.map(a => a.path)];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ javaScriptEnabled: false });
const page = await context.newPage();
const http = await request.newContext({ baseURL, timeout: 30000 });
const report = { baseURL, checkedAt: new Date().toISOString(), pages: [], assets: [], errors: [] };
function check(condition, message) {
  if (!condition) report.errors.push(message);
}
async function inspect(path, userAgent) {
  const response = await http.get(path, { headers: { "User-Agent": userAgent } });
  const html = await response.text();
  // Parse fetched HTML with scripting disabled; never request market APIs or mount the app.
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  const data = await page.evaluate(() => {
    const values = (selector, attr) => [...document.querySelectorAll(selector)].map(el => attr ? el.getAttribute(attr) : el.textContent);
    return {
      titles: values("title"), descriptions: values('meta[name="description"]', "content"),
      canonicals: values('link[rel="canonical"]', "href"), robots: values('meta[name="robots"]', "content"),
      ogTitle: values('meta[property="og:title"]', "content"), ogDescription: values('meta[property="og:description"]', "content"),
      ogUrl: values('meta[property="og:url"]', "content"), twitterTitle: values('meta[name="twitter:title"]', "content"),
      twitterDescription: values('meta[name="twitter:description"]', "content"),
      icons: values('link[rel="icon"],link[rel="apple-touch-icon"]', "href"),
      headings: values("h2"), h1: values("h1"), links: values("a[href]", "href"),
      jsonLd: values('script[type="application/ld+json"]').flatMap(s => JSON.parse(s)),
    };
  });
  return { path, userAgent, status: response.status(), xRobotsTag: response.headers()["x-robots-tag"] || "", ...data };
}
try {
  for (const path of paths) {
    const row = await inspect(path, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
    report.pages.push(row);
    check(row.status === 200, `${path}: HTTP ${row.status}`);
    check(row.titles.length === 1 && row.titles[0], `${path}: expected one title`);
    check((row.titles[0]?.match(/\bSinex\b/gi) || []).length === 1, `${path}: missing or repeated brand in title`);
    check(row.descriptions.length === 1 && row.descriptions[0], `${path}: expected one description`);
    check(row.canonicals.length === 1 && new URL(row.canonicals[0]).href === `${origin}${path}`, `${path}: wrong canonical`);
    check(!/noindex|none/i.test([...row.robots, row.xRobotsTag].join(" ")), `${path}: noindex`);
    check(row.ogTitle[0] === row.titles[0] && row.twitterTitle[0] === row.titles[0], `${path}: social title mismatch`);
    check(row.ogDescription[0] === row.descriptions[0] && row.twitterDescription[0] === row.descriptions[0], `${path}: social description mismatch`);
    check(row.ogUrl[0] && new URL(row.ogUrl[0]).href === `${origin}${path}`, `${path}: wrong og:url`);
    check(row.jsonLd.some(j => j["@type"] === "WebSite"), `${path}: missing WebSite`);
    if (path !== "/") check(row.jsonLd.some(j => j["@type"] === "BreadcrumbList"), `${path}: missing breadcrumbs`);
    const article = articles.find(a => a.path === path);
    if (article) {
      check(row.h1.includes(article.title) && row.headings.includes(article.heading), `${path}: MDX absent in HTML`);
      check(row.titles[0]?.startsWith(article.title) && row.descriptions[0] === article.description, `${path}: frontmatter mismatch`);
      const schema = row.jsonLd.find(j => j["@type"] === (path.startsWith("/developers/") ? "TechArticle" : "Article"));
      check(schema?.headline === article.title && schema?.datePublished === article.date && schema?.dateModified === article.updated, `${path}: article schema mismatch`);
    }
    check(row.icons.some(i => i.startsWith("/favicon.ico")) && row.icons.some(i => i.startsWith("/icon.svg")) && row.icons.some(i => i.startsWith("/icon.png")) && row.icons.some(i => i.startsWith("/apple-icon.png")), `${path}: missing icon format`);
    console.log(`${row.status} ${path} | ${row.titles.join(" / ")}`);
  }
  for (const key of ["titles", "descriptions"]) {
    const values = report.pages.map(p => p[key][0]);
    check(new Set(values).size === values.length, `duplicate ${key}`);
  }
  const root = report.pages[0];
  check(root.titles[0] === "Sinex — криптовалютный терминал и аналитика рынка", "wrong homepage title");
  check(root.descriptions[0] === "Котировки криптовалют в реальном времени, интерактивные графики и анализ рынка. Изучайте торговые пары и инструменты трейдинга в Sinex.", "wrong homepage description");
  for (const path of paths.slice(1)) {
    check(report.pages.some(row => row.path !== path && row.links.includes(path)), `${path}: missing incoming link`);
  }
  const sitemap = await http.get("/sitemap.xml");
  const xml = await sitemap.text();
  check(sitemap.status() === 200 && /xml/.test(sitemap.headers()["content-type"]), "sitemap HTTP/type");
  const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).href);
  check(locations.length === paths.length && paths.every(p => locations.includes(`${origin}${p}`)), "sitemap missing or extra URLs");
  const robots = await http.get("/robots.txt");
  const robotsText = await robots.text();
  check(robots.status() === 200 && robotsText.includes(`Sitemap: ${origin}/sitemap.xml`) && !/^Disallow:\s*\/\s*$/m.test(robotsText), "robots invalid");
  report.robots = { status: robots.status(), text: robotsText };
  report.sitemap = { status: sitemap.status(), locations };
  for (const path of ["/favicon.ico", "/icon.svg", "/icon.png", "/apple-icon.png", "/opengraph-image"]) {
    const res = await http.get(path);
    const bytes = await res.body();
    const type = res.headers()["content-type"] || "";
    report.assets.push({ path, status: res.status(), type, bytes: bytes.length });
    check(res.status() === 200 && /image\//.test(type) && bytes.length > 0, `${path}: invalid image response`);
  }
  for (const path of ["/missing-seo-page", "/help/missing-seo-article", "/terminal", "/markets"]) {
    const res = await http.get(path);
    check(res.status() === 404, `${path}: expected 404`);
  }
  const account = await inspect("/account", "Googlebot");
  check(account.status === 200 && account.robots.some(v => v.includes("noindex")), "account must remain noindex");
  for (const ua of ["Mozilla/5.0", "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"]) {
    for (const path of ["/", "/help", articles[0].path]) {
      const row = await inspect(path, ua);
      const reference = report.pages.find(p => p.path === path);
      check(JSON.stringify(row.titles) === JSON.stringify(reference.titles) && JSON.stringify(row.descriptions) === JSON.stringify(reference.descriptions), `${path}: user agent metadata mismatch`);
    }
  }
} finally {
  await fs.mkdir(".qa", { recursive: true });
  const target = `.qa/seo-${audit ? "production-before" : "build"}.json`;
  await fs.writeFile(target, JSON.stringify(report, null, 2));
  await http.dispose();
  await browser.close();
  console.log(`Report: ${target}; issues: ${report.errors.length}`);
  for (const error of report.errors) console.error(error);
}
if (!audit) assert.equal(report.errors.length, 0, "SEO checks failed");
