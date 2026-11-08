import type { TickMarkType, Time } from "lightweight-charts";

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function chartDate(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(`${time}T00:00:00Z`);
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

/** Format labels only: timestamps, candle boundaries and drawing anchors stay in UTC. */
export function chartTimeFormatters(timeZone: string, seconds = false) {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("ru-RU", { timeZone, ...options });
  // Lightweight Charts TickMarkType: year, month, day, time, time with seconds.
  const ticks: Record<TickMarkType, Intl.DateTimeFormat> = {
    0: format({ year: "numeric" }),
    1: format({ month: "short" }),
    2: format({ day: "numeric" }),
    3: format({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    4: format({ hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }),
  };
  const crosshair = format({
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    ...(seconds ? { second: "2-digit" } : {}),
  });
  return {
    tickMarkFormatter: (time: Time, type: TickMarkType) => ticks[type].format(chartDate(time)),
    timeFormatter: (time: Time) => crosshair.format(chartDate(time)),
  };
}
