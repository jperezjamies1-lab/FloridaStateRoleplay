import { json, body } from "../lib/http.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const RADIO_TOKEN_MS = 15 * 60 * 1000;

const CHANNELS = {
  staff: ["STATEWIDE", "STAFF COMMAND", "EVENT OPERATIONS", "EMERGENCY TRAFFIC", "OCSO PRIMARY", "OCSO TAC 1", "OCSO TAC 2", "FHP PRIMARY", "FHP TAC 1", "FHP TAC 2", "FBI FED 1", "FBI TAC", "FFW PRIMARY", "FFW TAC"],
  fbi: ["STATEWIDE", "FBI FED 1", "FBI TAC", "EVENT OPERATIONS", "EMERGENCY TRAFFIC"],
  fhp: ["STATEWIDE", "FHP PRIMARY", "FHP TAC 1", "FHP TAC 2", "EVENT OPERATIONS", "EMERGENCY TRAFFIC"],
  ffw: ["STATEWIDE", "FFW PRIMARY", "FFW TAC", "EVENT OPERATIONS", "EMERGENCY TRAFFIC"],
  ocso: ["STATEWIDE", "OCSO PRIMARY", "OCSO TAC 1", "OCSO TAC 2", "EVENT OPERATIONS", "EMERGENCY TRAFFIC"]
};

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function bytesToBase64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(normalized + padding), (character) => character.charCodeAt(0));
}

async function importKey(secret, usage) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

async function sign(value, secret) {
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret, "sign"), encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyCadToken(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const valid = await crypto.subtle.verify("HMAC", await importKey(secret, "verify"), base64UrlToBytes(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
    if (!data?.role || !data?.agency || Number(data.exp) <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

async function issueRadioToken(user, callsign, channel, secret) {
  const allowedChannels = CHANNELS[user.role] || [];
  const payloadData = {
    sub: user.sid || crypto.randomUUID(),
    role: user.role,
    agency: user.agency,
    callsign,
    channel,
    channels: allowedChannels,
    issuedAt: Date.now(),
    exp: Date.now() + RADIO_TOKEN_MS
  };
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(payloadData)));
  return `${payload}.${await sign(payload, secret)}`;
}

async function parseIceServers(env, subject = "fsrp-radio") {
  const fallback = [{ urls: ["stun:stun.cloudflare.com:3478"] }];
  const raw = normalize(env.RADIO_ICE_SERVERS_JSON);
  if (raw) {
    try {
      const value = JSON.parse(raw);
      if (Array.isArray(value) && value.length) return value;
    } catch {}
  }
  const keyId = normalize(env.TURN_KEY_ID);
  const apiToken = normalize(env.TURN_API_TOKEN);
  if (!keyId || !apiToken) return fallback;
  try {
    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ ttl: 28800, customIdentifier: String(subject).slice(0, 120) })
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    return Array.isArray(data.iceServers) && data.iceServers.length ? data.iceServers : fallback;
  } catch {
    return fallback;
  }
}

export async function onRequestGet({ env }) {
  const ready = Boolean(normalize(env.RADIO_WORKER_URL) && normalize(env.RADIO_SESSION_SECRET));
  return json({
    ok: ready,
    liveRadioReady: ready,
    workerConfigured: Boolean(normalize(env.RADIO_WORKER_URL)),
    signingConfigured: Boolean(normalize(env.RADIO_SESSION_SECRET)),
    apiVersion: 1
  }, ready ? 200 : 503);
}

export async function onRequestPost({ request, env }) {
  const cadSecret = normalize(env.CAD_TOKEN_SECRET || env.AUTH_SECRET || env.ADMIN_TOKEN || env.OPERATIONS_TOKEN);
  const radioSecret = normalize(env.RADIO_SESSION_SECRET);
  const workerUrl = normalize(env.RADIO_WORKER_URL).replace(/\/$/, "");
  if (!cadSecret) return json({ error: "CAD_TOKEN_SECRET is required before live radio can authenticate CAD users." }, 503);
  if (!radioSecret || !workerUrl) return json({ error: "Live radio is not deployed yet. Add RADIO_SESSION_SECRET and RADIO_WORKER_URL in Cloudflare Production." }, 503);

  const data = await body(request);
  const user = await verifyCadToken(data.cadToken, cadSecret);
  if (!user) return json({ error: "Your CAD session is invalid or expired. Sign into CAD again." }, 401);

  const callsign = normalize(data.callsign).slice(0, 60);
  const channel = normalize(data.channel).toUpperCase().slice(0, 80);
  const allowedChannels = CHANNELS[user.role] || [];
  if (!callsign) return json({ error: "Update your CAD callsign before joining live radio." }, 400);
  if (!allowedChannels.includes(channel)) return json({ error: "That talkgroup is not assigned to your department." }, 403);

  const token = await issueRadioToken(user, callsign, channel, radioSecret);
  return json({
    ok: true,
    token,
    workerUrl,
    channel,
    callsign,
    agency: user.agency,
    role: user.role,
    allowedChannels,
    iceServers: await parseIceServers(env, `${user.agency}:${callsign}`),
    expiresIn: RADIO_TOKEN_MS,
    apiVersion: 2
  });
}
