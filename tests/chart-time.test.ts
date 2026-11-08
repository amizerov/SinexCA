import { test } from "node:test";
import assert from "node:assert/strict";
import type { UTCTimestamp } from "lightweight-charts";
import { chartTimeFormatters } from "../lib/market/chart-time";

const time = (iso: string) => (Date.parse(iso) / 1000) as UTCTimestamp;

test("chart labels show Moscow time across a date boundary without changing the timestamp", () => {
  const labels = chartTimeFormatters("Europe/Moscow");
  const timestamp = time("2026-11-08T22:15:30Z");
  assert.equal(labels.tickMarkFormatter(timestamp, 3), "01:15");
  assert.equal(labels.tickMarkFormatter(timestamp, 2), "9");
  assert.match(labels.timeFormatter(timestamp), /09\.11\.2026.*01:15/);
  assert.equal(timestamp, Date.parse("2026-11-08T22:15:30Z") / 1000);
});

test("chart labels use the historical DST offset and retain distinct UTC candle instants", () => {
  const labels = chartTimeFormatters("America/New_York", true);
  const before = time("2026-03-08T06:59:59Z"), after = time("2026-03-08T07:00:00Z");
  assert.equal(labels.tickMarkFormatter(before, 4), "01:59:59");
  assert.equal(labels.tickMarkFormatter(after, 4), "03:00:00");
  assert.match(labels.timeFormatter(after), /03:00:00/);
  assert.equal(after - before, 1);
});

test("calendar labels and UTC fallback support every Lightweight Charts time representation", () => {
  const labels = chartTimeFormatters("UTC");
  assert.equal(labels.tickMarkFormatter("2027-01-01", 0), "2027");
  assert.equal(labels.tickMarkFormatter({ year: 2027, month: 1, day: 1 }, 0), "2027");
  assert.equal(labels.tickMarkFormatter(time("2027-01-01T00:00:00Z"), 3), "00:00");
});
