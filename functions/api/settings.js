import { json, body, bearer } from "../lib/http.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CONTENT_KEY = "fsrp_v3_content";
const STATUS_KEY = "fsrp_v3_status";

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function verifyToken(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(decoder.decode(fromBase64Url(payload)));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ env }) {
  if (!env.SITE_SETTINGS) return json({ content: null, status: null, configured: false });
  const [storedContent, status] = await Promise.all([
    env.SITE_SETTINGS.get(CONTENT_KEY, "json"),
    env.SITE_SETTINGS.get(STATUS_KEY, "json"),
  ]);
  const content = storedContent && typeof storedContent === "object" ? structuredClone(storedContent) : storedContent;
  if (content?.maintenance && Number(content.maintenance.safetyVersion) < 2) {
    content.maintenance.enabled = false;
    content.maintenance.publicLockConfirmed = false;
    content.maintenance.safetyVersion = 2;
  }
  if (content?.maintenance?.enabled === true && content.maintenance.publicLockConfirmed !== true) {
    content.maintenance.enabled = false;
  }
  return json({ content, status, configured: true });
}

export async function onRequestPut({ request, env }) {
  if (!env.AUTH_SECRET) return json({ error: "AUTH_SECRET is not configured." }, 503);
  const user = await verifyToken(bearer(request), env.AUTH_SECRET);
  if (!user) return json({ error: "Unauthorized or expired Manager session." }, 401);
  if (!env.SITE_SETTINGS) return json({ error: "Cloudflare KV binding SITE_SETTINGS is missing." }, 503);

  const data = await body(request);
  if (user.role === "operations") {
    if (!data.status || typeof data.status !== "object") {
      return json({ error: "Operations may publish server status only." }, 403);
    }
    await env.SITE_SETTINGS.put(STATUS_KEY, JSON.stringify(data.status));
    return json({ ok: true, scope: "status" });
  }

  if (user.role !== "admin") return json({ error: "Admin access required." }, 403);
  const content = data.content || data.settings;
  if (!content || typeof content !== "object") return json({ error: "Missing website content." }, 400);
  content.maintenance ??= {};
  content.maintenance.safetyVersion = 2;
  if (content.maintenance.enabled === true && content.maintenance.publicLockConfirmed !== true) {
    return json({ error: "Public maintenance requires explicit confirmation." }, 400);
  }
  await env.SITE_SETTINGS.put(CONTENT_KEY, JSON.stringify(content));
  if (content.status) await env.SITE_SETTINGS.put(STATUS_KEY, JSON.stringify(content.status));
  return json({ ok: true, scope: "full" });
}
