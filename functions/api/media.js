import { json, bearer } from "../lib/http.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/ogg",
]);
const MAX_BYTES = 25 * 1024 * 1024;

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function verify(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(decoder.decode(fromBase64Url(payload)));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.MEDIA_BUCKET) return json({ error: "R2 binding MEDIA_BUCKET is missing." }, 503);
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return json({ error: "Missing media key." }, 400);
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.AUTH_SECRET) return json({ error: "AUTH_SECRET is not configured." }, 503);
  const user = await verify(bearer(request), env.AUTH_SECRET);
  if (!user || user.role !== "admin") return json({ error: "Admin authorization required." }, 401);
  if (!env.MEDIA_BUCKET) return json({ error: "R2 binding MEDIA_BUCKET is missing." }, 503);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "No file uploaded." }, 400);
  if (!ALLOWED.has(file.type)) return json({ error: "Unsupported media type." }, 415);
  if (file.size > MAX_BYTES) return json({ error: "File is larger than 25 MB." }, 413);

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").slice(-120);
  const key = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  await env.MEDIA_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return json({ ok: true, key, url: `/api/media?key=${encodeURIComponent(key)}` });
}
