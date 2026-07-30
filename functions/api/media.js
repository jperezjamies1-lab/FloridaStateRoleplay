// Optional Cloudflare R2 media library for the FSRP Manager.
//
// Bind an R2 bucket as MEDIA_BUCKET in Cloudflare Pages settings.
// Required for writes: ADMIN_TOKEN secret and SITE_SETTINGS KV.
// GET /api/media              -> list asset metadata
// GET /api/media?key=<key>    -> serve an uploaded object
// POST /api/media             -> multipart upload: file + label (Admin only)
// DELETE /api/media?key=<key> -> delete an uploaded object (Admin only)

import { json, preflight, timingSafeEqual } from "../lib/util.js";

const INDEX_KEY = "fsrp-media-index-v1";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg",
]);

function safeName(name) {
  return String(name || "asset")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "asset";
}

function isAdmin(request, env) {
  const supplied = request.headers.get("x-admin-token") || "";
  return Boolean(env.ADMIN_TOKEN && supplied && timingSafeEqual(supplied, env.ADMIN_TOKEN));
}

async function readIndex(env) {
  if (!env.SITE_SETTINGS) return [];
  return (await env.SITE_SETTINGS.get(INDEX_KEY, { type: "json" })) || [];
}

async function writeIndex(env, list) {
  if (!env.SITE_SETTINGS) return;
  await env.SITE_SETTINGS.put(INDEX_KEY, JSON.stringify(list.slice(0, 500)));
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (!env.MEDIA_BUCKET) return json({ error: "MEDIA_BUCKET R2 binding is not configured. Add it in Cloudflare Pages settings before uploading media." }, 503);

  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (request.method === "GET" && key) {
    const object = await env.MEDIA_BUCKET.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  }

  if (request.method === "GET") {
    return json({ ok: true, assets: await readIndex(env) });
  }

  if (!isAdmin(request, env)) return json({ error: "Admin authorization required" }, 401);

  if (request.method === "POST") {
    let form;
    try { form = await request.formData(); } catch { return json({ error: "Invalid multipart upload" }, 400); }
    const file = form.get("file");
    const label = String(form.get("label") || file?.name || "Asset").slice(0, 120);
    if (!(file instanceof File)) return json({ error: "File is required" }, 400);
    if (!ALLOWED_TYPES.has(file.type)) return json({ error: `Unsupported file type: ${file.type || "unknown"}` }, 415);
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) return json({ error: "File must be between 1 byte and 15 MB" }, 413);

    const keyName = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName(file.name)}`;
    await env.MEDIA_BUCKET.put(keyName, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { label, originalName: file.name },
    });

    const asset = {
      id: crypto.randomUUID(),
      key: keyName,
      label,
      name: file.name,
      type: file.type,
      size: file.size,
      url: `/api/media?key=${encodeURIComponent(keyName)}`,
      source: "r2",
      createdAt: new Date().toISOString(),
    };
    const index = await readIndex(env);
    index.unshift(asset);
    await writeIndex(env, index);
    return json({ ok: true, asset }, 201);
  }

  if (request.method === "DELETE") {
    if (!key) return json({ error: "key is required" }, 400);
    await env.MEDIA_BUCKET.delete(key);
    const index = (await readIndex(env)).filter((asset) => asset.key !== key);
    await writeIndex(env, index);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
