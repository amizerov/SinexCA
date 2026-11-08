"use client";

import { useSyncExternalStore } from "react";
import { browserTimeZone } from "@/lib/market/chart-time";

function subscribe(onChange: () => void) {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const serverTimeZone = () => "UTC";

export function useBrowserTimeZone() {
  return useSyncExternalStore(subscribe, browserTimeZone, serverTimeZone);
}
