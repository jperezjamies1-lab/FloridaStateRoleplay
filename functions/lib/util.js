export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    },
  });
}

export function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-admin-token",
      "access-control-max-age": "86400",
    },
  });
}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")
    || "unknown";
}

export function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  let mismatch = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    mismatch |= (left[i % Math.max(1, left.length)] || 0)
      ^ (right[i % Math.max(1, right.length)] || 0);
  }
  return mismatch === 0;
}

export async function checkRateLimit(kv, key, { limit, windowSeconds }) {
  const now = Date.now();
  let entry = { count: 0, resetAt: now + windowSeconds * 1000 };
  try {
    const raw = await kv.get(key, { type: "json" });
    if (raw && raw.resetAt > now) entry = raw;
  } catch {}

  if (entry.count >= limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  await kv.put(key, JSON.stringify(entry), { expirationTtl: windowSeconds });
  return { allowed: true, retryAfterMs: 0 };
}

export async function clearRateLimit(kv, key) {
  try { await kv.delete(key); } catch {}
}
