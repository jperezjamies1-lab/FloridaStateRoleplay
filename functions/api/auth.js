// POST /api/auth  { passcode }
// Verifies the passcode against server-held secrets (never against code that
// ships to the browser) and tells the client which role it unlocked.
//
// Required Cloudflare secrets:
//   ADMIN_TOKEN        - full Admin access (website studio + operations)
//   OPERATIONS_TOKEN    - Session Operations access only
// Required KV binding:
//   SITE_SETTINGS       - used here only for the login-attempt rate limiter
//
// The passcode itself doubles as the bearer credential ("x-admin-token")
// sent with later PUT requests to /api/settings, so there is nothing extra
// to manage or leak: whatever unlocks the panel is also what authorizes
// saves.

import { json, preflight, checkRateLimit, clearRateLimit, clientIp, timingSafeEqual } from "../lib/util.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.SITE_SETTINGS) return json({ error: "SITE_SETTINGS KV binding is missing" }, 500);
  if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN secret is not configured" }, 500);

  const rateKey = `authlock:${clientIp(request)}`;
  const rate = await checkRateLimit(env.SITE_SETTINGS, rateKey, { limit: 5, windowSeconds: 1800 });
  if (!rate.allowed) {
    const minutes = Math.ceil(rate.retryAfterMs / 60000);
    return json({ error: `Too many failed attempts. Try again in ${minutes} minute(s).` }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const passcode = String(body?.passcode || "");
  if (!passcode) return json({ error: "Passcode required" }, 400);

  let role = null;
  if (timingSafeEqual(passcode, env.ADMIN_TOKEN)) role = "admin";
  else if (env.OPERATIONS_TOKEN && timingSafeEqual(passcode, env.OPERATIONS_TOKEN)) role = "operations";

  if (!role) {
    return json({ error: "Access denied." }, 401);
  }

  await clearRateLimit(env.SITE_SETTINGS, rateKey);
  return json({ ok: true, role });
}
