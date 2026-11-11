import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import matter from "gray-matter";

const root = path.join(process.cwd(), "content");
const sections = ["help", "learn", "developers", "blog"];

function files() {
  return sections.flatMap((section) => fs.readdirSync(path.join(root, section))
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => ({ section, slug: file.slice(0, -4), file: path.join(root, section, file) })));
}

test("published knowledge articles have unique valid metadata and resolvable internal links", () => {
  const articles = files();
  assert.ok(articles.length >= 10);
  const urls = new Set(articles.map(({ section, slug }) => `/${section}/${slug}`));
  const titles = new Set<string>();

  for (const article of articles) {
    const parsed = matter(fs.readFileSync(article.file, "utf8"));
    assert.equal(parsed.data.draft, undefined, `${article.file}: drafts should be explicit only when needed`);
    assert.equal(typeof parsed.data.title, "string", `${article.file}: title`);
    assert.ok(parsed.data.title.length > 10, `${article.file}: title is too short`);
    assert.ok(!titles.has(parsed.data.title), `${article.file}: duplicate title`);
    titles.add(parsed.data.title);
    assert.equal(typeof parsed.data.description, "string", `${article.file}: description`);
    assert.ok(parsed.data.description.length >= 50 && parsed.data.description.length <= 180, `${article.file}: description length`);
    assert.ok(!Number.isNaN(Date.parse(String(parsed.data.date))), `${article.file}: date`);
    assert.ok(!Number.isNaN(Date.parse(String(parsed.data.updated))), `${article.file}: updated`);

    for (const match of parsed.content.matchAll(/\[[^\]]+\]\((\/[^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      assert.ok(target === "/" || target === "/help" || target === "/learn" || target === "/developers" || target === "/blog" || urls.has(target), `${article.file}: missing link ${target}`);
    }
  }
});
