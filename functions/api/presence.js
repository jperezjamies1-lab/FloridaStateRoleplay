// Optional bridge for reliable per-member Discord presence.
//
// A normal Cloudflare Pages Function cannot stay connected to the Discord
// Gateway. An always-on bot can listen for presence updates and PUT a safe
// snapshot here. The public site reads only discordUserId, status, and time.
//
// GET /api/presence
// PUT /api/presence  header: x-presence-token: <PRESENCE_SYNC_TOKEN>
//                    body: { members: [{ discordUserId, status }] }

import { json, preflight, timingSafeEqual } from "../lib/util.js";

const KEY = "fsrp-staff-presence-v1";
const ALLOWED = new Set(["online", "idle", "dnd", "offline"]);
const MAX_MEMBERS = 500;
const MAX_AGE_MS = 5 * 60 * 1000;

function authorized(request, env) {
  const sync = request.headers.get("x-presence-token") || "";
  const admin = request.headers.get("x-admin-token") || "";
  return Boolean(
    (env.PRESENCE_SYNC_TOKEN && sync && timingSafeEqual(sync, env.PRESENCE_SYNC_TOKEN)) ||
    (env.ADMIN_TOKEN && admin && timingSafeEqual(admin, env.ADMIN_TOKEN))
  );
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return preflight();
  if (!env.SITE_SETTINGS) return json({ error: "SITE_SETTINGS KV binding is missing" }, 500);

  if (request.method === "GET") {
    const snapshot = await env.SITE_SETTINGS.get(KEY, { type: "json" });
    if (!snapshot || !Array.isArray(snapshot.members)) {
      return json({ ok: true, configured: Boolean(env.PRESENCE_SYNC_TOKEN), available: false, stale: false, members: [] });
    }
    const updatedAt = Number(snapshot.updatedAt) || 0;
    const stale = !updatedAt || Date.now() - updatedAt > MAX_AGE_MS;
    return json({
      ok: true,
      configured: Boolean(env.PRESENCE_SYNC_TOKEN),
      available: !stale,
      stale,
      updatedAt,
      members: stale ? [] : snapshot.members,
    });
  }

  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  if (!env.PRESENCE_SYNC_TOKEN && !env.ADMIN_TOKEN) return json({ error: "Presence sync is not configured" }, 503);
  if (!authorized(request, env)) return json({ error: "Presence sync authorization required" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!Array.isArray(body?.members)) return json({ error: "members must be an array" }, 400);
  if (body.members.length > MAX_MEMBERS) return json({ error: `A maximum of ${MAX_MEMBERS} members is allowed` }, 413);

  const seen = new Set();
  const members = [];
  for (const entry of body.members) {
    const discordUserId = String(entry?.discordUserId || "").trim();
    const status = String(entry?.status || "").trim().toLowerCase();
    if (!/^\d{15,22}$/.test(discordUserId) || !ALLOWED.has(status) || seen.has(discordUserId)) continue;
    seen.add(discordUserId);
    members.push({ discordUserId, status, updatedAt: Date.now() });
  }

  const snapshot = { updatedAt: Date.now(), members };
  await env.SITE_SETTINGS.put(KEY, JSON.stringify(snapshot), { expirationTtl: 10 * 60 });
  return json({ ok: true, accepted: members.length, updatedAt: snapshot.updatedAt });
}
