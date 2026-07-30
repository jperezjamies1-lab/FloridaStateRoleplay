import {
  json, preflight, checkRateLimit, clientIp, timingSafeEqual
} from "../lib/util.js";

const MAX_BODY_BYTES = 750000;
const MAX_KEYS = 200;
const OPERATIONS_ALLOWED_KEYS = new Set(["fsrp_website_manual_status_v1"]);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return preflight();
  if (!env.SITE_SETTINGS) return json({ error: "SITE_SETTINGS KV binding is missing" }, 500);

  if (request.method === "GET") {
    const settings = await env.SITE_SETTINGS.get("live", { type: "json" }) || {};
    return json({ ok: true, settings });
  }

  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN secret is not configured" }, 500);

  const supplied = request.headers.get("x-admin-token") || "";
  let role = null;
  if (supplied && timingSafeEqual(supplied, env.ADMIN_TOKEN)) role = "admin";
  else if (supplied && env.OPERATIONS_TOKEN
      && timingSafeEqual(supplied, env.OPERATIONS_TOKEN)) role = "operations";
  if (!role) return json({ error: "Unauthorized" }, 401);

  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);

  const rate = await checkRateLimit(
    env.SITE_SETTINGS,
    `writelock:${clientIp(request)}`,
    { limit: 20, windowSeconds: 600 }
  );
  if (!rate.allowed) return json({ error: "Too many attempts. Try again later." }, 429);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body || typeof body.settings !== "object"
      || body.settings === null || Array.isArray(body.settings)) {
    return json({ error: "Invalid settings payload" }, 400);
  }

  const incoming = body.settings;
  const keys = Object.keys(incoming);
  if (keys.length > MAX_KEYS) return json({ error: "Too many settings keys" }, 400);

  const badKey = keys.find(
    key => !key.startsWith("fsrp_") || typeof incoming[key] !== "string"
  );
  if (badKey) return json({ error: `Invalid setting: ${badKey}` }, 400);

  if (role === "operations"
      && keys.some(key => !OPERATIONS_ALLOWED_KEYS.has(key))) {
    return json({ error: "Operations access may update server status only" }, 403);
  }

  const current = await env.SITE_SETTINGS.get("live", { type: "json" }) || {};
  const next = { ...current, ...incoming };
  await env.SITE_SETTINGS.put("live", JSON.stringify(next));
  return json({ ok: true, saved: keys.length });
}
