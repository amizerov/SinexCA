/** Next may normalize Request.url to localhost even when the browser used 127.0.0.1. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const host = request.headers.get("host") || new URL(request.url).host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(request.url).protocol.slice(0, -1);
    return source.host === host && source.protocol === `${protocol}:` && ["http:", "https:"].includes(source.protocol);
  } catch { return false; }
}
