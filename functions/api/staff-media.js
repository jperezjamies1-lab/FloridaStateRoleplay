import { json, bearer } from "../lib/http.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 10 * 1024 * 1024;

function fromBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), (character) => character.charCodeAt(0));
}

async function verify(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(decoder.decode(fromBase64Url(payload)));
    return data?.exp > Date.now() ? data : null;
  } catch { return null; }
}

export async function onRequestPost({ request, env }) {
  const secret = String(env.STAFF_SESSION_SECRET || env.AUTH_SECRET || env.ADMIN_TOKEN || env.OPERATIONS_TOKEN || "").trim();
  if (!secret) return json({ error: "Staff Operations session signing is not configured." }, 503);
  const user = await verify(bearer(request), secret);
  if (!user) return json({ error: "Staff Operations authorization required." }, 401);
  if (!env.MEDIA_BUCKET) return json({ error: "R2 binding MEDIA_BUCKET is required for permanent staff evidence uploads." }, 503);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Choose an evidence screenshot first." }, 400);
  if (!ALLOWED.has(file.type)) return json({ error: "Evidence must be a PNG, JPG, WEBP, or GIF image." }, 415);
  if (file.size > MAX_BYTES) return json({ error: "Evidence image is larger than 10 MB." }, 413);

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").slice(-120) || "evidence-image";
  const date = new Date().toISOString().slice(0, 10);
  const key = `staff-evidence/${date}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { uploadedBy: String(user.id || user.name || "staff").slice(0, 120), role: String(user.role || "staff") }
  });
  return json({ ok: true, key, url: `/api/media?key=${encodeURIComponent(key)}`, name: safeName, size: file.size, type: file.type });
}
