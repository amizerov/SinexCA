"use client";
import { useCallback, useEffect, useState } from "react";
import { getMarket, isPermanentError } from "@/lib/market/client";

interface Resource<T> { url: string; data?: T; error?: string; loading: boolean }
export function useMarketResource<T>(url: string | null, pollMs?: number) {
  const [resource, setResource] = useState<Resource<T>>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(r => r + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fetching = false, failures = 0, stopped = false;
    async function load() {
      if (controller.signal.aborted || fetching || stopped || (pollMs && document.hidden)) return;
      clearTimeout(timer); fetching = true;
      setResource(old => ({ url: url!, data: old?.url === url ? old.data : undefined, error: old?.url === url ? old.error : undefined, loading: true }));
      let retry = true;
      try {
        const data = await getMarket<T>(url!, controller.signal);
        failures = 0;
        if (!controller.signal.aborted) setResource({ url: url!, data, loading: false });
      } catch (error) {
        retry = !isPermanentError(error);
        stopped = !retry; failures += 1;
        if (!controller.signal.aborted) setResource(old => ({ url: url!, data: old?.url === url ? old.data : undefined, error: error instanceof Error ? error.message : "Ошибка загрузки", loading: false }));
      }
      fetching = false;
      if (retry && !controller.signal.aborted) {
        if (pollMs) timer = setTimeout(tick, pollMs);
        else if (failures > 0 && failures <= 3) timer = setTimeout(tick, 1000 * 2 ** failures);
      }
    }
    function tick() {
      if (document.hidden) timer = setTimeout(tick, pollMs || 5000);
      else void load();
    }
    void Promise.resolve().then(load);
    function online() { if (!stopped) { failures = 0; void load(); } }
    function visibility() { if(!pollMs)return;clearTimeout(timer);if(!document.hidden)void load(); }
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange",visibility);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener("online", online);document.removeEventListener("visibilitychange",visibility); };
  }, [url, pollMs, revision]);
  const current = resource?.url === url ? resource : undefined;
  return { data: current?.data, error: current?.error, loading: !!url && (!current || current.loading), refresh };
}
