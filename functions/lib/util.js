// Shared helpers used by every /api/* function.
// Keeping this in one place avoids copy-pasted, drifting logic across endpoints.

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-admin-token,x-presence-token",
  "access-control-allow-methods": "GET,PUT,POST,DELETE,OPTIONS",
};

export function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Very small fixed-window rate limiter backed by KV. Good enough to stop
// brute-forcing the admin passcode without needing a separate service.
export async function checkRateLimit(kv, key, { limit = 5, windowSeconds = 1800 } = {}) {
  const now = Date.now();
  let entry = { count: 0, resetAt: now + windowSeconds * 1000 };
  try {
    const raw = await kv.get(key, { type: "json" });
    if (raw && raw.resetAt > now) entry = raw;
  } catch {
    /* ignore malformed entries */
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  await kv.put(key, JSON.stringify(entry), { expirationTtl: windowSeconds });
  return { allowed: true, retryAfterMs: 0 };
}

export async function clearRateLimit(kv, key) {
  try {
    await kv.delete(key);
  } catch {
    /* no-op */
  }
}

// Cloudflare Pages Functions expose the caller IP via this header.
export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

// Avoids leaking token length/content through response-time differences.
// Used anywhere a request-supplied secret is compared against an env secret.
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const len = Math.max(bufA.length, bufB.length, 1);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < len; i++) {
    diff |= (bufA[i] || 0) ^ (bufB[i] || 0);
  }
  return diff === 0;
}
