/** Bounded per-process TTL cache. In-flight requests are shared, failures are never cached. */
export class TtlCache {
  private entries = new Map<string, { value: unknown; expires: number }>();
  private pending = new Map<string, Promise<unknown>>();
  constructor(private maxEntries = 300) {}
  async get<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (entry && entry.expires > Date.now()) {
      this.entries.delete(key); this.entries.set(key, entry);
      return entry.value as T;
    }
    this.entries.delete(key);
    const current = this.pending.get(key);
    if (current) return current as Promise<T>;
    // Bound in-flight work too; callers can retry after the current burst.
    if (this.pending.size >= this.maxEntries) throw new Error("Слишком много одновременных запросов");
    const promise = Promise.resolve().then(loader).then(value => {
      for (const [k, v] of this.entries) if (v.expires <= Date.now()) this.entries.delete(k);
      if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
      this.entries.set(key, { value, expires: Date.now() + ttl });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
export const marketCache = new TtlCache();
