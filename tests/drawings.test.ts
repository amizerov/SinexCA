import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DrawingStore, DrawingConflict } from "../lib/server/drawing-store";
import { saveDrawingSchema, type DrawingScope } from "../lib/drawings/types";
import { isSameOrigin } from "../lib/drawings/same-origin";

const scope: DrawingScope = { exchange: "binance", marketType: "spot", symbol: "BTCUSDT" };
test("drawing writes accept the browser host even if Next normalized the URL, but reject external origins", () => {
  const request = (origin: string) => new Request("http://localhost:3004/api/drawings", { headers: { host: "127.0.0.1:3004", origin, "x-forwarded-proto": "http" } });
  assert.equal(isSameOrigin(request("http://127.0.0.1:3004")), true);
  assert.equal(isSameOrigin(request("https://other.test")), false);
  assert.equal(isSameOrigin(request("http://127.0.0.1:3005")), false);
  assert.equal(isSameOrigin(request("null")), false);
});
test("SQLite persists levels on disk, isolates native pair scopes, supports edits, deletes and restoration", () => {
  const directory = mkdtempSync(join(tmpdir(), "sinex-db-"));
  const path = join(directory, "sinex.sqlite");
  let store = new DrawingStore(path);
  try {
    const level = { id: randomUUID(), price: 76000.12345678, color: "#63c8ff" };
    const create = { scope, revision: 0, mutationId: randomUUID(), levels: [level] };
    assert.equal(store.save(create).revision, 1);
    store.close(); store = new DrawingStore(path);
    assert.deepEqual(store.read(scope), { revision: 1, levels: [level] });
    assert.deepEqual(store.read({ ...scope, exchange: "bybit" }), { revision: 0, levels: [] });
    assert.deepEqual(store.read({ ...scope, symbol: "ETHUSDT" }), { revision: 0, levels: [] });
    const edited = { ...level, price: 77000, color: "#b4ed8b" };
    store.save({ scope, revision: 1, mutationId: randomUUID(), levels: [edited] });
    store.save({ scope, revision: 2, mutationId: randomUUID(), levels: [] });
    assert.equal(store.read(scope).levels.length, 0);
    store.save({ scope, revision: 3, mutationId: randomUUID(), levels: [edited] });
    assert.equal(store.read(scope).levels[0].price, 77000);
  } finally { store.close(); assert.ok(directory.startsWith(join(tmpdir(), "sinex-db-"))); rmSync(directory, { recursive: true, force: true }); }
});
test("SQLite rejects stale writes atomically and repeated requests are idempotent", () => {
  const directory = mkdtempSync(join(tmpdir(), "sinex-db-"));
  const path = join(directory, "sinex.sqlite");
  const first = new DrawingStore(path), second = new DrawingStore(path);
  try {
    const request = { scope, revision: 0, mutationId: randomUUID(), levels: [{ id: randomUUID(), price: 123, color: "#b4ed8b" }] };
    assert.equal(first.save(request).revision, 1);
    assert.equal(second.save(request).revision, 1);
    assert.throws(() => second.save({ ...request, mutationId: randomUUID(), levels: [] }), DrawingConflict);
    assert.deepEqual(first.read(scope).levels, request.levels);
  } finally { first.close(); second.close(); assert.ok(directory.startsWith(join(tmpdir(), "sinex-db-"))); rmSync(directory, { recursive: true, force: true }); }
});
test("drawing validation rejects invalid prices, colours, duplicate IDs and excessive level counts", () => {
  const level = { id: randomUUID(), price: 100, color: "#b4ed8b" };
  const base = { scope, revision: 0, mutationId: randomUUID(), levels: [level] };
  for (const value of [-1, 0, Infinity, NaN]) assert.equal(saveDrawingSchema.safeParse({ ...base, levels: [{ ...level, price: value }] }).success, false);
  assert.equal(saveDrawingSchema.safeParse({ ...base, levels: [{ ...level, color: "url(evil)" }] }).success, false);
  assert.equal(saveDrawingSchema.safeParse({ ...base, levels: [level, level] }).success, false);
  assert.equal(saveDrawingSchema.safeParse({ ...base, levels: Array.from({ length: 101 }, () => ({ ...level, id: randomUUID() })) }).success, false);
  assert.equal(saveDrawingSchema.safeParse({ ...base, scope: { ...scope, symbol: "../../database" } }).success, false);
});
