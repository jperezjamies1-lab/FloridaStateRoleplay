import { json, body, bearer } from "../lib/http.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CONTENT_KEY = "fsrp_v3_content";
const STATUS_KEY = "fsrp_v3_status";
const LEGACY_LIVE_KEY = "live";

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function verifyToken(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(decoder.decode(fromBase64Url(payload)));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function parseMaybe(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function sanitizeContent(value) {
  const content = value && typeof value === "object" ? structuredClone(value) : value;
  if (!content || typeof content !== "object") return content;
  content.maintenance ??= {};
  if (Number(content.maintenance.safetyVersion) < 3) {
    content.maintenance.enabled = false;
    content.maintenance.publicLockConfirmed = false;
    content.maintenance.safetyVersion = 3;
  }
  if (content.maintenance.enabled === true && content.maintenance.publicLockConfirmed !== true) {
    content.maintenance.enabled = false;
  }
  return content;
}

async function readState(env) {
  const [directContent, directStatus, legacy] = await Promise.all([
    env.SITE_SETTINGS.get(CONTENT_KEY, "json"),
    env.SITE_SETTINGS.get(STATUS_KEY, "json"),
    env.SITE_SETTINGS.get(LEGACY_LIVE_KEY, "json"),
  ]);
  const legacyObject = legacy && typeof legacy === "object" ? legacy : {};
  return {
    content: sanitizeContent(directContent || parseMaybe(legacyObject[CONTENT_KEY])),
    status: directStatus || parseMaybe(legacyObject[STATUS_KEY]),
    legacy: legacyObject,
  };
}

async function writeLegacy(env, currentLegacy, updates) {
  const next = { ...(currentLegacy || {}), ...updates };
  await env.SITE_SETTINGS.put(LEGACY_LIVE_KEY, JSON.stringify(next));
}

export async function onRequestGet({ env }) {
  if (!env.SITE_SETTINGS) return json({ content: null, status: null, settings: {}, configured: false });
  const state = await readState(env);
  const settings = { ...state.legacy };
  if (state.content) settings[CONTENT_KEY] = JSON.stringify(state.content);
  if (state.status) settings[STATUS_KEY] = JSON.stringify(state.status);
  return json({ content: state.content, status: state.status, settings, configured: true });
}

export async function onRequestPut({ request, env }) {
  const sessionSecret = env.AUTH_SECRET || env.ADMIN_TOKEN || env.OPERATIONS_TOKEN;
  if (!sessionSecret) return json({ error: "ADMIN_TOKEN or OPERATIONS_TOKEN is not configured." }, 503);
  const user = await verifyToken(bearer(request), sessionSecret);
  if (!user) return json({ error: "Unauthorized or expired Manager session." }, 401);
  if (!env.SITE_SETTINGS) return json({ error: "Cloudflare KV binding SITE_SETTINGS is missing." }, 503);

  const data = await body(request);
  const current = await readState(env);

  if (user.role === "operations") {
    if (!data.status || typeof data.status !== "object") return json({ error: "Operations may publish server status only." }, 403);
    const status = data.status;
    await Promise.all([
      env.SITE_SETTINGS.put(STATUS_KEY, JSON.stringify(status)),
      writeLegacy(env, current.legacy, { [STATUS_KEY]: JSON.stringify(status) }),
    ]);
    return json({ ok: true, scope: "status" });
  }

  if (user.role !== "admin") return json({ error: "Admin access required." }, 403);
  const content = sanitizeContent(data.content || data.settings);
  if (!content || typeof content !== "object") return json({ error: "Missing website content." }, 400);
  content.maintenance ??= {};
  content.maintenance.safetyVersion = 3;
  if (content.maintenance.enabled === true && content.maintenance.publicLockConfirmed !== true) {
    return json({ error: "Public maintenance requires explicit confirmation." }, 400);
  }

  const writes = [env.SITE_SETTINGS.put(CONTENT_KEY, JSON.stringify(content))];
  const legacyUpdates = { [CONTENT_KEY]: JSON.stringify(content) };
  if (content.status) {
    writes.push(env.SITE_SETTINGS.put(STATUS_KEY, JSON.stringify(content.status)));
    legacyUpdates[STATUS_KEY] = JSON.stringify(content.status);
  }
  writes.push(writeLegacy(env, current.legacy, legacyUpdates));
  await Promise.all(writes);
  return json({ ok: true, scope: "full" });
}
