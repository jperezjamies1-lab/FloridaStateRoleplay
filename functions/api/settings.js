// GET  /api/settings         -> public, returns the full saved site state
// PUT  /api/settings         -> saves site state (auth required)
//
// The site state is a flat object keyed by the same `fsrp_*` keys the
// front-end already uses for localStorage, e.g.
//   { "fsrp_website_content_preview_v2": "{...json string...}", ... }
// This lets the browser's existing read/write code work unchanged: on load
// we hydrate localStorage from this object, and on save we push the
// current localStorage snapshot back up. See the "fsrp-cloud-sync" script
// in index.html for the client side of this contract.
//
// Required Cloudflare secrets: ADMIN_TOKEN (required), OPERATIONS_TOKEN (optional)
// Required KV binding: SITE_SETTINGS

import { json, preflight, checkRateLimit, clientIp, timingSafeEqual } from "../lib/util.js";

const MAX_BODY_BYTES = 750_000; // ~750KB of JSON is generous for text/links/config
const MAX_KEYS = 200; // sanity ceiling -- a real save never touches this many keys at once

// Session Operations staff (SSU/SSD) may publish server status only.
// Every other key requires the full Admin token.
const OPERATIONS_ALLOWED_KEYS = new Set(["fsrp_website_manual_status_v1", "fsrp_v3_status"]);

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return preflight();
  if (!env.SITE_SETTINGS) return json({ error: "SITE_SETTINGS KV binding is missing" }, 500);

  if (request.method === "GET") {
    const settings = (await env.SITE_SETTINGS.get("live", { type: "json" })) || {};
    return json({ ok: true, settings });
  }

  if (request.method === "PUT") {
    if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN secret is not configured" }, 500);

    // Writes get their own rate limit (separate from /api/auth's login
    // limiter) so a token can't be brute-forced by hitting this endpoint
    // directly instead of the login form.
    const rateKey = `writelock:${clientIp(request)}`;
    const rate = await checkRateLimit(env.SITE_SETTINGS, rateKey, { limit: 20, windowSeconds: 600 });
    if (!rate.allowed) {
      const minutes = Math.ceil(rate.retryAfterMs / 60000);
      return json({ error: `Too many attempts. Try again in ${minutes} minute(s).` }, 429);
    }

    const supplied = request.headers.get("x-admin-token") || "";
    let role = null;
    if (supplied && timingSafeEqual(supplied, env.ADMIN_TOKEN)) role = "admin";
    else if (supplied && env.OPERATIONS_TOKEN && timingSafeEqual(supplied, env.OPERATIONS_TOKEN)) role = "operations";
    if (!role) return json({ error: "Unauthorized" }, 401);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (!body || typeof body.settings !== "object" || Array.isArray(body.settings) || body.settings === null) {
      return json({ error: "Invalid settings payload" }, 400);
    }

    const incoming = body.settings;
    const keys = Object.keys(incoming);

    if (keys.length > MAX_KEYS) {
      return json({ error: "Too many settings keys in one request" }, 400);
    }

    // Every value must be a string, matching the localStorage-mirroring
    // contract the front end relies on (see fsrp-cloud-sync). Rejecting
    // anything else keeps the KV blob predictable and stops odd payloads
    // (numbers, nested objects, null) from silently breaking the client's
    // JSON.parse calls on read.
    const badKey = keys.find((key) => typeof incoming[key] !== "string" || !key.startsWith("fsrp_"));
    if (badKey !== undefined) {
      return json({ error: `Invalid value for key "${badKey}" -- all settings must be fsrp_-prefixed strings` }, 400);
    }

    if (role === "operations") {
      const disallowed = keys.filter((key) => !OPERATIONS_ALLOWED_KEYS.has(key));
      if (disallowed.length) {
        return json({ error: `Operations access cannot update: ${disallowed.join(", ")}` }, 403);
      }
    }

    const serialized = JSON.stringify(incoming);
    if (serialized.length > MAX_BODY_BYTES) {
      return json({ error: "Settings payload too large" }, 413);
    }

    // Merge rather than overwrite so an Operations-only save can't wipe
    // fields it isn't allowed to touch, and so partial saves never nuke
    // other admins' unrelated changes.
    const current = (await env.SITE_SETTINGS.get("live", { type: "json" })) || {};
    const merged = { ...current, ...incoming };
    await env.SITE_SETTINGS.put("live", JSON.stringify(merged));

    return json({ ok: true, role, updatedAt: new Date().toISOString() });
  }

  return json({ error: "Method not allowed" }, 405);
}
