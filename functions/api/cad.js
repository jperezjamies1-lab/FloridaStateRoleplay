import { json, body, timingSafeEqual } from "../lib/http.js";

const CAD_STATE_KEY = "fsrp_cad_state_v2";
const ERLC_CACHE_KEY = "fsrp_erlc_live_cache_v1";
const ERLC_CACHE_MS = 20 * 1000;
const SESSION_LENGTH_MS = 8 * 60 * 60 * 1000;
const UNIT_EXPIRY_MS = 8 * 60 * 60 * 1000;
const RADIO_PRESENCE_EXPIRY_MS = 25 * 1000;
const MAX_COLLECTION_ITEMS = 600;
const MAX_UNITS = 250;

const EMPTY_STATE = {
  dispatch: [],
  units: [],
  calls: [],
  people: [],
  vehicles: [],
  records: [],
  reports: [],
  citations: [],
  warrants: [],
  radio: [],
  radioPresence: [],
  audit: []
};

const APPEND_COLLECTIONS = new Set([
  "dispatch",
  "calls",
  "people",
  "vehicles",
  "records",
  "reports",
  "citations",
  "warrants",
  "radio",
  "audit"
]);

const MUTABLE_COLLECTIONS = new Set([
  ...APPEND_COLLECTIONS,
  "units",
  "radioPresence"
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function normalizeCode(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function normalizeSecret(value) {
  return String(value ?? "").trim();
}

function cleanString(value, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function cleanArray(value, maxItems = 30, itemMax = 100) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => cleanString(item, itemMax)).filter(Boolean);
}

function cleanItem(item = {}) {
  const output = {};
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { id: crypto.randomUUID(), updatedAt: Date.now() };
  }

  for (const [key, value] of Object.entries(item)) {
    const safeKey = cleanString(key, 80);
    if (!safeKey) continue;

    if (typeof value === "string") {
      const longField = ["body", "details", "notes", "description", "narrative"].includes(safeKey);
      output[safeKey] = cleanString(value, longField ? 6000 : 600);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      output[safeKey] = value;
    } else if (typeof value === "boolean") {
      output[safeKey] = value;
    } else if (Array.isArray(value)) {
      output[safeKey] = cleanArray(value);
    }
  }

  output.id = cleanString(output.id || crypto.randomUUID(), 90);
  output.updatedAt = Date.now();
  return output;
}

function safeClone(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function createEmptyState() {
  return safeClone(EMPTY_STATE);
}

function repairState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : createEmptyState();

  for (const key of Object.keys(EMPTY_STATE)) {
    if (!Array.isArray(state[key])) state[key] = [];
  }

  return state;
}

function getTokenSecret(env) {
  return normalizeSecret(
    env.CAD_TOKEN_SECRET ||
    env.AUTH_SECRET ||
    env.ADMIN_TOKEN ||
    env.OPERATIONS_TOKEN
  );
}

function getCadStore(env) {
  return env.CAD_STATE || env.SITE_SETTINGS || null;
}

function cadCodePairs(env) {
  return [
    { role: "fbi", agency: "FBI", code: normalizeSecret(env.CAD_FBI_CODE) },
    { role: "fhp", agency: "FHP", code: normalizeSecret(env.CAD_FHP_CODE) },
    { role: "ffw", agency: "FFW", code: normalizeSecret(env.CAD_FFW_CODE) },
    { role: "ocso", agency: "OCSO", code: normalizeSecret(env.CAD_OCSO_CODE) },
    { role: "staff", agency: "Staff Team", code: normalizeSecret(env.CAD_STAFF_CODE) }
  ];
}

function configuredAgencies(env) {
  return cadCodePairs(env).filter((entry) => entry.code).map((entry) => entry.agency);
}

function agencyFor(enteredCode, env) {
  const entered = normalizeCode(enteredCode);
  if (!entered) return null;

  for (const entry of cadCodePairs(env)) {
    if (entry.code && timingSafeEqual(entered, entry.code)) {
      return { role: entry.role, agency: entry.agency };
    }
  }

  return null;
}


function splitPlayerIdentity(value) {
  const raw = cleanString(value, 160);
  const index = raw.lastIndexOf(":");
  if (index <= 0) return { name: raw, userId: "" };
  return { name: raw.slice(0, index), userId: raw.slice(index + 1) };
}

function normalizeErlcLocation(location) {
  const source = location && typeof location === "object" ? location : {};
  return {
    x: Number.isFinite(Number(source.LocationX)) ? Number(source.LocationX) : null,
    z: Number.isFinite(Number(source.LocationZ)) ? Number(source.LocationZ) : null,
    postal: cleanString(source.PostalCode, 40),
    street: cleanString(source.StreetName, 120),
    building: cleanString(source.BuildingNumber, 40)
  };
}

function normalizeErlcPayload(payload) {
  const players = Array.isArray(payload?.Players) ? payload.Players.map((entry) => {
    const identity = splitPlayerIdentity(entry?.Player);
    return {
      name: identity.name,
      userId: identity.userId,
      team: cleanString(entry?.Team, 80),
      callsign: cleanString(entry?.Callsign, 60),
      location: normalizeErlcLocation(entry?.Location),
      permission: cleanString(entry?.Permission, 100),
      wantedStars: Number.isFinite(Number(entry?.WantedStars)) ? Number(entry.WantedStars) : 0
    };
  }) : [];

  const emergencyCalls = Array.isArray(payload?.EmergencyCalls) ? payload.EmergencyCalls.slice(0, 100).map((entry) => ({
    team: cleanString(entry?.Team, 80),
    caller: cleanString(entry?.Caller, 80),
    callNumber: cleanString(entry?.CallNumber, 40),
    description: cleanString(entry?.Description, 1000),
    location: cleanString(entry?.PositionDescriptor, 240),
    startedAt: Number.isFinite(Number(entry?.StartedAt)) ? Number(entry.StartedAt) : null
  })) : [];

  const vehicles = Array.isArray(payload?.Vehicles) ? payload.Vehicles.slice(0, 250).map((entry) => ({
    name: cleanString(entry?.Name, 120),
    owner: cleanString(entry?.Owner, 120),
    plate: cleanString(entry?.Plate, 60),
    livery: cleanString(entry?.Texture, 160),
    colorHex: cleanString(entry?.ColorHex, 20),
    colorName: cleanString(entry?.ColorName, 80)
  })) : [];

  return {
    server: {
      name: cleanString(payload?.Name, 160),
      ownerId: Number.isFinite(Number(payload?.OwnerId)) ? Number(payload.OwnerId) : null,
      currentPlayers: Number.isFinite(Number(payload?.CurrentPlayers)) ? Number(payload.CurrentPlayers) : players.length,
      maxPlayers: Number.isFinite(Number(payload?.MaxPlayers)) ? Number(payload.MaxPlayers) : null,
      joinKey: cleanString(payload?.JoinKey, 120),
      queue: Array.isArray(payload?.Queue) ? payload.Queue.length : 0,
      teamBalance: Boolean(payload?.TeamBalance)
    },
    players,
    emergencyCalls,
    vehicles,
    fetchedAt: Date.now()
  };
}

async function fetchErlcLive(env, store, force = false) {
  const serverKey = normalizeSecret(env.ERLC_SERVER_KEY);
  if (!serverKey) {
    return { ready: false, error: "ERLC_SERVER_KEY is not configured in Cloudflare Production." };
  }

  if (!force && store) {
    try {
      const cached = await store.get(ERLC_CACHE_KEY, "json");
      if (cached?.fetchedAt && Date.now() - Number(cached.fetchedAt) < ERLC_CACHE_MS) {
        return { ready: true, cached: true, ...cached };
      }
    } catch {}
  }

  const query = new URLSearchParams({
    Players: "true",
    Staff: "true",
    Queue: "true",
    EmergencyCalls: "true",
    Vehicles: "true"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.erlc.gg/v2/server?${query.toString()}`, {
      headers: { "server-key": serverKey, "Accept": "application/json" },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ready: false, status: response.status, error: cleanString(payload?.message || payload?.error || "ER:LC API request failed.", 500) };
    }

    const normalized = normalizeErlcPayload(payload);
    if (store) {
      try { await store.put(ERLC_CACHE_KEY, JSON.stringify(normalized)); } catch {}
    }
    return { ready: true, cached: false, ...normalized };
  } catch (error) {
    return { ready: false, error: error?.name === "AbortError" ? "ER:LC API request timed out." : cleanString(error?.message || "ER:LC API request failed.", 500) };
  } finally {
    clearTimeout(timeout);
  }
}

function bytesToBase64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(normalized + padding), (character) => character.charCodeAt(0));
}

async function importKey(secret, usage) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

async function sign(value, secret) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret, "sign"),
    encoder.encode(value)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

async function issue(role, agency, secret) {
  const session = {
    sid: crypto.randomUUID(),
    role,
    agency,
    issuedAt: Date.now(),
    exp: Date.now() + SESSION_LENGTH_MS
  };
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(session)));
  return `${payload}.${await sign(payload, secret)}`;
}

async function verify(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature) return null;

    const valid = await crypto.subtle.verify(
      "HMAC",
      await importKey(secret, "verify"),
      base64UrlToBytes(signature),
      encoder.encode(payload)
    );
    if (!valid) return null;

    const data = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
    if (!data || data.exp <= Date.now() || !data.role || !data.agency || !data.sid) return null;
    return data;
  } catch {
    return null;
  }
}

async function loadState(store) {
  try {
    const state = await store.get(CAD_STATE_KEY, "json");
    if (state) return repairState(state);

    // One-time compatibility import from the older CAD state key.
    const legacy = await store.get("fsrp_cad_state_v1", "json");
    return repairState(legacy);
  } catch {
    return createEmptyState();
  }
}

async function saveState(store, state) {
  await store.put(CAD_STATE_KEY, JSON.stringify(repairState(state)));
}

function pruneState(state) {
  const now = Date.now();
  state.units = state.units.filter((item) => !item.updatedAt || now - Number(item.updatedAt) < UNIT_EXPIRY_MS);
  state.radioPresence = state.radioPresence.filter((item) => !item.updatedAt || now - Number(item.updatedAt) < RADIO_PRESENCE_EXPIRY_MS);
  return state;
}

function findIndexById(collection, id) {
  const normalized = cleanString(id, 90);
  return collection.findIndex((item) => String(item.id || "") === normalized);
}

function canManageAll(user) {
  return user.role === "staff";
}

function canEditItem(user, item) {
  return canManageAll(user) || item.role === user.role || item.agency === user.agency || item.sessionId === user.sid;
}

function appendAudit(state, user, action, details = "") {
  state.audit.unshift({
    id: crypto.randomUUID(),
    action: cleanString(action, 120),
    details: cleanString(details, 1000),
    agency: user.agency,
    role: user.role,
    time: new Date().toISOString(),
    updatedAt: Date.now()
  });
  state.audit = state.audit.slice(0, 600);
}

export async function onRequestGet({ env }) {
  const tokenSecret = getTokenSecret(env);
  const cadStore = env.CAD_STATE || env.SITE_SETTINGS || null;
  const agencies = configuredAgencies(env);

  return json({
    ok: Boolean(tokenSecret) && Boolean(cadStore) && agencies.length > 0,
    cadReady: Boolean(tokenSecret) && Boolean(cadStore) && agencies.length > 0,
    configuredAgencies: agencies,
    storageReady: Boolean(cadStore),
    storageBinding: env.CAD_STATE ? "CAD_STATE" : env.SITE_SETTINGS ? "SITE_SETTINGS" : null,
    sessionSigningReady: Boolean(tokenSecret),
    erlcReady: Boolean(normalizeSecret(env.ERLC_SERVER_KEY)),
    apiVersion: 5
  });
}

export async function onRequestPost({ request, env }) {
  const tokenSecret = getTokenSecret(env);
  const cadStore = env.CAD_STATE || env.SITE_SETTINGS || null;
  const agencies = configuredAgencies(env);

  if (!tokenSecret) {
    return json({
      error: "CAD session signing is not configured. Add CAD_TOKEN_SECRET to Cloudflare Production and redeploy.",
      code: "CAD_TOKEN_SECRET_MISSING"
    }, 503);
  }

  if (!cadStore) {
    return json({
      error: "CAD storage is not connected. Add SITE_SETTINGS or CAD_STATE as a KV binding and redeploy.",
      code: "CAD_STORAGE_MISSING"
    }, 503);
  }

  const data = await body(request);
  if (!data || typeof data !== "object") {
    return json({ error: "A valid CAD request is required.", code: "INVALID_REQUEST" }, 400);
  }

  if (data.action === "login") {
    if (!agencies.length) {
      return json({
        error: "No CAD department passwords are configured in the Cloudflare Production deployment.",
        code: "CAD_CODES_NOT_CONFIGURED",
        configuredAgencies: []
      }, 503);
    }

    const enteredCode = normalizeCode(data.code);
    if (!enteredCode) {
      return json({ error: "Enter your assigned CAD access code.", code: "CAD_CODE_REQUIRED", configuredAgencies: agencies }, 400);
    }

    const match = agencyFor(enteredCode, env);
    if (!match) {
      return json({
        error: "The CAD access code did not match. Check capitalization and confirm the secret is saved in Cloudflare Production.",
        code: "INVALID_CAD_CODE",
        configuredAgencies: agencies
      }, 401);
    }

    return json({
      ok: true,
      token: await issue(match.role, match.agency, tokenSecret),
      role: match.role,
      agency: match.agency,
      expiresIn: SESSION_LENGTH_MS,
      apiVersion: 5
    });
  }

  const user = await verify(data.token, tokenSecret);
  if (!user) {
    return json({ error: "Your CAD session expired or is invalid. Sign in again.", code: "CAD_SESSION_INVALID" }, 401);
  }

  if (data.action === "erlc-state") {
    const live = await fetchErlcLive(env, cadStore, Boolean(data.force));
    return json({ ok: live.ready, ...live, user, apiVersion: 5 }, live.ready ? 200 : 503);
  }

  let state = pruneState(await loadState(cadStore));

  if (data.action === "state") {
    return json({ ok: true, state, user, serverTime: Date.now(), apiVersion: 5 });
  }

  if (data.action === "append") {
    const collection = cleanString(data.collection, 50);
    if (!APPEND_COLLECTIONS.has(collection)) {
      return json({ error: "Invalid CAD collection.", code: "INVALID_COLLECTION" }, 400);
    }

    const item = {
      ...cleanItem(data.item),
      agency: user.agency,
      role: user.role,
      sessionId: user.sid,
      createdAt: Date.now()
    };

    state[collection].unshift(item);
    state[collection] = state[collection].slice(0, MAX_COLLECTION_ITEMS);
    appendAudit(state, user, `Created ${collection} entry`, item.title || item.type || item.subject || item.id);
  } else if (data.action === "upsert") {
    const collection = cleanString(data.collection, 50);
    if (!MUTABLE_COLLECTIONS.has(collection)) {
      return json({ error: "Invalid CAD collection.", code: "INVALID_COLLECTION" }, 400);
    }

    const item = {
      ...cleanItem(data.item),
      agency: cleanString(data.item?.agency || user.agency, 80),
      role: cleanString(data.item?.role || user.role, 50),
      sessionId: cleanString(data.item?.sessionId || user.sid, 90)
    };

    const index = findIndexById(state[collection], item.id);
    if (index >= 0) {
      if (!canEditItem(user, state[collection][index])) {
        return json({ error: "You do not have permission to edit this entry.", code: "CAD_PERMISSION_DENIED" }, 403);
      }
      state[collection][index] = { ...state[collection][index], ...item };
    } else {
      state[collection].unshift(item);
    }
    state[collection] = state[collection].slice(0, collection === "units" ? MAX_UNITS : MAX_COLLECTION_ITEMS);
    appendAudit(state, user, `Updated ${collection}`, item.title || item.type || item.callsign || item.id);
  } else if (data.action === "remove") {
    const collection = cleanString(data.collection, 50);
    if (!MUTABLE_COLLECTIONS.has(collection)) {
      return json({ error: "Invalid CAD collection.", code: "INVALID_COLLECTION" }, 400);
    }

    const index = findIndexById(state[collection], data.id);
    if (index < 0) return json({ error: "CAD entry was not found.", code: "CAD_ENTRY_NOT_FOUND" }, 404);
    if (!canEditItem(user, state[collection][index])) {
      return json({ error: "You do not have permission to remove this entry.", code: "CAD_PERMISSION_DENIED" }, 403);
    }

    const removed = state[collection].splice(index, 1)[0];
    appendAudit(state, user, `Removed ${collection}`, removed.title || removed.type || removed.callsign || removed.id);
  } else if (data.action === "unit") {
    const item = {
      ...cleanItem(data.item),
      agency: user.agency,
      role: user.role,
      sessionId: user.sid
    };
    item.callsign = cleanString(item.callsign, 50);
    if (!item.callsign) return json({ error: "A callsign is required.", code: "CALLSIGN_REQUIRED" }, 400);

    const index = state.units.findIndex((unit) =>
      String(unit.callsign || "").trim().toLowerCase() === item.callsign.toLowerCase()
    );
    if (index >= 0 && !canEditItem(user, state.units[index])) {
      return json({ error: "That callsign is already assigned to another active session.", code: "CALLSIGN_IN_USE" }, 409);
    }

    if (index < 0) state.units.unshift(item);
    else state.units[index] = { ...state.units[index], ...item };
    state.units = state.units.slice(0, MAX_UNITS);
    appendAudit(state, user, "Updated unit", `${item.callsign} · ${item.status || "Status updated"}`);
  } else if (data.action === "attach-unit") {
    const callsign = cleanString(data.callsign, 50);
    const callId = cleanString(data.callId, 90);
    const unit = state.units.find((item) => String(item.callsign || "").toLowerCase() === callsign.toLowerCase());
    const call = state.calls.find((item) => item.id === callId);
    if (!unit || !call) return json({ error: "Unit or call was not found.", code: "CAD_ENTRY_NOT_FOUND" }, 404);
    if (!canEditItem(user, unit)) return json({ error: "You cannot attach that unit.", code: "CAD_PERMISSION_DENIED" }, 403);

    unit.attachedCall = call.id;
    unit.status = "10-23 Assigned / On Scene";
    unit.updatedAt = Date.now();
    call.attachedUnits = Array.from(new Set([...(call.attachedUnits || []), unit.callsign]));
    call.status = call.status === "Pending" ? "Dispatched" : (call.status || "Dispatched");
    call.updatedAt = Date.now();
    appendAudit(state, user, "Attached unit to call", `${unit.callsign} → ${call.callNumber || call.id}`);
  } else if (data.action === "call-status") {
    const call = state.calls.find((item) => item.id === cleanString(data.callId, 90));
    if (!call) return json({ error: "Call was not found.", code: "CAD_ENTRY_NOT_FOUND" }, 404);
    call.status = cleanString(data.status, 80) || call.status;
    call.updatedAt = Date.now();
    appendAudit(state, user, "Changed call status", `${call.callNumber || call.id} · ${call.status}`);
  } else if (data.action === "panic") {
    const callsign = cleanString(data.callsign, 50) || `${user.agency} UNIT`;
    const active = Boolean(data.active);
    let unit = state.units.find((item) => String(item.callsign || "").toLowerCase() === callsign.toLowerCase());
    if (!unit) {
      unit = { id: crypto.randomUUID(), callsign, agency: user.agency, role: user.role, sessionId: user.sid, status: "10-8 In Service" };
      state.units.unshift(unit);
    }
    if (!canEditItem(user, unit)) return json({ error: "You cannot change that unit's panic state.", code: "CAD_PERMISSION_DENIED" }, 403);

    unit.panic = active;
    unit.updatedAt = Date.now();
    if (active) {
      state.dispatch.unshift({
        id: crypto.randomUUID(),
        type: "PANIC / EMERGENCY",
        priority: "Priority 1",
        location: cleanString(data.location, 200) || "Location not provided",
        details: `${callsign} activated emergency assistance`,
        agency: user.agency,
        role: user.role,
        time: new Date().toISOString(),
        updatedAt: Date.now()
      });
    }
    appendAudit(state, user, active ? "Activated panic" : "Cleared panic", callsign);
  } else if (data.action === "radio-presence") {
    const presence = {
      id: user.sid,
      sessionId: user.sid,
      callsign: cleanString(data.callsign, 50) || `${user.agency} UNIT`,
      agency: user.agency,
      role: user.role,
      channel: cleanString(data.channel, 80) || "STATEWIDE",
      transmitting: Boolean(data.transmitting),
      scanning: Boolean(data.scanning),
      muted: Boolean(data.muted),
      updatedAt: Date.now()
    };
    const index = state.radioPresence.findIndex((item) => item.sessionId === user.sid);
    if (index < 0) state.radioPresence.unshift(presence);
    else state.radioPresence[index] = presence;
  } else {
    return json({ error: "Unknown CAD action.", code: "UNKNOWN_CAD_ACTION" }, 400);
  }

  try {
    await saveState(cadStore, pruneState(state));
  } catch {
    return json({
      error: "The CAD could not save to Cloudflare KV. Check the SITE_SETTINGS or CAD_STATE binding.",
      code: "CAD_SAVE_FAILED"
    }, 500);
  }

  return json({ ok: true, state, user, serverTime: Date.now(), apiVersion: 5 });
}
