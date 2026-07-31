import { json, body, timingSafeEqual } from "../lib/http.js";

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function onRequestPost({ request, env }) {
  const sessionSecret = env.AUTH_SECRET || env.ADMIN_TOKEN || env.OPERATIONS_TOKEN;
  if (!sessionSecret) return json({ error: "ADMIN_TOKEN or OPERATIONS_TOKEN is not configured." }, 503);
  const { passcode } = await body(request);
  let role = "";
  if (env.ADMIN_TOKEN && timingSafeEqual(String(passcode || ""), env.ADMIN_TOKEN)) role = "admin";
  else if (env.OPERATIONS_TOKEN && timingSafeEqual(String(passcode || ""), env.OPERATIONS_TOKEN)) role = "operations";
  else return json({ error: "Invalid manager passcode." }, 401);

  const payload = toBase64Url(encoder.encode(JSON.stringify({ role, exp: Date.now() + 8 * 60 * 60 * 1000 })));
  const signature = await sign(payload, sessionSecret);
  return json({ ok: true, role, token: `${payload}.${signature}` });
}
