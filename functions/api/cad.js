import { json, body, timingSafeEqual } from "../lib/http.js";

const EMPTY_STATE = { dispatch: [], units: [], calls: [], records: [], reports: [], citations: [], warrants: [], radio: [] };
const COLLECTIONS = new Set(["dispatch", "calls", "records", "reports", "citations", "warrants", "radio"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function base64UrlToBytes(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), (character) => character.charCodeAt(0));
}
async function importKey(secret, usage) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}
async function sign(value, secret) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await importKey(secret, "sign"), encoder.encode(value))));
}
async function issue(role, agency, secret) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ role, agency, exp: Date.now() + 8 * 60 * 60 * 1000 })));
  return `${payload}.${await sign(payload, secret)}`;
}
async function verify(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature) return null;
    const valid = await crypto.subtle.verify("HMAC", await importKey(secret, "verify"), base64UrlToBytes(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
function agencyFor(code, env) {
  const pairs = [
    ["fbi", "FBI", env.CAD_FBI_CODE],
    ["fhp", "FHP", env.CAD_FHP_CODE],
    ["ffw", "FFW", env.CAD_FFW_CODE],
    ["staff", "Staff Team", env.CAD_STAFF_CODE],
  ];
  for (const [role, agency, secret] of pairs) {
    if (secret && timingSafeEqual(String(code || ""), secret)) return { role, agency };
  }
  return null;
}
function cleanString(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function cleanItem(item = {}) {
  const output = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === "string") output[key] = cleanString(value, key === "body" || key === "details" || key === "notes" ? 4000 : 500);
    else if (typeof value === "number" || typeof value === "boolean") output[key] = value;
  }
  output.id = cleanString(output.id || crypto.randomUUID(), 80);
  output.updatedAt = Date.now();
  return output;
}

export async function onRequestPost({ request, env }) {
  const tokenSecret = env.CAD_TOKEN_SECRET || env.AUTH_SECRET || env.ADMIN_TOKEN || env.OPERATIONS_TOKEN;
  const cadStore = env.CAD_STATE || env.SITE_SETTINGS;
  if (!tokenSecret) return json({ error: "Add ADMIN_TOKEN, OPERATIONS_TOKEN, AUTH_SECRET, or CAD_TOKEN_SECRET to enable secure CAD sessions." }, 503);
  if (!cadStore) return json({ error: "SITE_SETTINGS KV is missing. The CAD can reuse the existing website KV automatically." }, 503);
  const data = await body(request);

  if (data.action === "login") {
    const match = agencyFor(data.code, env);
    if (!match) return json({ error: "Invalid CAD access code." }, 401);
    return json({ ...match, token: await issue(match.role, match.agency, tokenSecret), apiVersion: 2 });
  }

  const user = await verify(data.token, tokenSecret);
  if (!user) return json({ error: "CAD session expired or invalid." }, 401);
  const state = await cadStore.get("fsrp_cad_state_v1", "json") || structuredClone(EMPTY_STATE);
  for (const key of Object.keys(EMPTY_STATE)) if (!Array.isArray(state[key])) state[key] = [];

  if (data.action === "state") {
    state.units = state.units.filter((unit) => !unit.updatedAt || Date.now() - unit.updatedAt < 8 * 60 * 60 * 1000);
    return json({ state, user, apiVersion: 2 });
  }

  if (data.action === "append") {
    if (!COLLECTIONS.has(data.collection)) return json({ error: "Invalid CAD collection." }, 400);
    const item = { ...cleanItem(data.item), agency: user.agency, role: user.role };
    state[data.collection].unshift(item);
    state[data.collection] = state[data.collection].slice(0, 500);
  } else if (data.action === "unit") {
    const item = { ...cleanItem(data.item), agency: user.agency, role: user.role };
    if (!item.callsign) return json({ error: "A callsign is required." }, 400);
    const index = state.units.findIndex((unit) => String(unit.callsign).toLowerCase() === String(item.callsign).toLowerCase());
    if (index < 0) state.units.unshift(item); else state.units[index] = item;
    state.units = state.units.slice(0, 250);
  } else {
    return json({ error: "Unknown CAD action." }, 400);
  }

  await cadStore.put("fsrp_cad_state_v1", JSON.stringify(state));
  return json({ ok: true, state, apiVersion: 2 });
}
