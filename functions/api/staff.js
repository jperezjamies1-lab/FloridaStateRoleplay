import { json, body, bearer, timingSafeEqual } from "../lib/http.js";

const STATE_KEY = "fsrp_staff_operations_v1";
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_ITEMS = 700;
const MAX_AUDIT = 1400;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const EMPTY_STATE = {
  shifts: [],
  moderation: [],
  infractions: [],
  investigations: [],
  loa: [],
  training: [],
  promotions: [],
  requests: [],
  notes: [],
  audit: []
};

const PREFIXES = {
  moderation: "MOD",
  infractions: "INF",
  investigations: "INV",
  loa: "LOA",
  training: "TRN",
  promotions: "PRO",
  requests: "REQ",
  notes: "NOTE",
  shifts: "SHIFT"
};

const LEVELS = { staff: 1, supervisor: 2, hr: 3, admin: 4 };
const CREATE_LEVEL = {
  moderation: 1,
  infractions: 2,
  investigations: 2,
  loa: 1,
  training: 2,
  promotions: 3,
  requests: 1,
  notes: 2
};
const UPDATE_LEVEL = {
  moderation: 2,
  infractions: 3,
  investigations: 3,
  loa: 2,
  training: 2,
  promotions: 3,
  requests: 2,
  notes: 3
};

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function cleanString(value, max = 600) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanLong(value, max = 6000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function cleanArray(value, maxItems = 12, maxLength = 300) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => cleanString(item, maxLength)).filter(Boolean)
    : [];
}

function safeClone(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

function emptyState() {
  return safeClone(EMPTY_STATE);
}

function repairState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : emptyState();
  for (const key of Object.keys(EMPTY_STATE)) if (!Array.isArray(state[key])) state[key] = [];
  return state;
}

function toBase64Url(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), (character) => character.charCodeAt(0));
}

async function importKey(secret, usage) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

async function issueSession(account, secret) {
  const session = {
    id: account.id,
    name: account.name,
    discordId: account.discordId || "",
    roblox: account.roblox || "",
    callsign: account.callsign || "",
    role: account.role,
    exp: Date.now() + SESSION_MS
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await importKey(secret, "sign"), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

async function verifySession(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const valid = await crypto.subtle.verify("HMAC", await importKey(secret, "verify"), fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(decoder.decode(fromBase64Url(payload)));
    return data?.exp > Date.now() && LEVELS[data.role] ? data : null;
  } catch {
    return null;
  }
}

function sessionSecret(env) {
  return normalize(env.STAFF_SESSION_SECRET || env.AUTH_SECRET || env.ADMIN_TOKEN || env.OPERATIONS_TOKEN);
}

function staffStore(env) {
  return env.STAFF_STATE || env.SITE_SETTINGS || null;
}

function configuredRoles(env) {
  const roles = [];
  if (normalize(env.STAFF_PANEL_CODE)) roles.push("staff");
  if (normalize(env.STAFF_SUPERVISOR_CODE)) roles.push("supervisor");
  if (normalize(env.STAFF_HR_CODE)) roles.push("hr");
  if (normalize(env.ADMIN_TOKEN)) roles.push("admin");
  try {
    const accounts = JSON.parse(normalize(env.STAFF_ACCOUNTS_JSON) || "[]");
    if (Array.isArray(accounts)) {
      for (const account of accounts) if (LEVELS[normalize(account?.role).toLowerCase()]) roles.push(normalize(account.role).toLowerCase());
    }
  } catch {}
  return [...new Set(roles)];
}

function parseAccounts(env) {
  try {
    const parsed = JSON.parse(normalize(env.STAFF_ACCOUNTS_JSON) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 500) : [];
  } catch {
    return [];
  }
}

function accountFor(data, env) {
  const code = normalize(data.passcode);
  const suppliedId = normalize(data.staffId || data.discordId || data.roblox || data.name).toLowerCase();
  if (!code) return null;

  for (const raw of parseAccounts(env)) {
    const account = {
      id: cleanString(raw.id || raw.discordId || raw.roblox || raw.name, 120),
      name: cleanString(raw.name || raw.displayName || raw.roblox || "Staff Member", 120),
      discordId: cleanString(raw.discordId, 40),
      roblox: cleanString(raw.roblox, 80),
      callsign: cleanString(raw.callsign, 60),
      role: normalize(raw.role).toLowerCase(),
      code: normalize(raw.code)
    };
    const aliases = [account.id, account.discordId, account.roblox, account.name].map((item) => item.toLowerCase()).filter(Boolean);
    if (LEVELS[account.role] && account.code && aliases.includes(suppliedId) && timingSafeEqual(code, account.code)) return account;
  }

  const shared = [
    { role: "staff", code: normalize(env.STAFF_PANEL_CODE) },
    { role: "supervisor", code: normalize(env.STAFF_SUPERVISOR_CODE) },
    { role: "hr", code: normalize(env.STAFF_HR_CODE) },
    { role: "admin", code: normalize(env.ADMIN_TOKEN) }
  ];
  for (const entry of shared) {
    if (entry.code && timingSafeEqual(code, entry.code)) {
      const identity = cleanString(data.name || data.roblox || data.staffId || "Staff Member", 120);
      return {
        id: cleanString(data.staffId || data.discordId || data.roblox || identity, 120),
        name: identity,
        discordId: cleanString(data.discordId, 40),
        roblox: cleanString(data.roblox, 80),
        callsign: cleanString(data.callsign, 60),
        role: entry.role
      };
    }
  }
  return null;
}

async function loadState(store) {
  try { return repairState(await store.get(STATE_KEY, "json")); }
  catch { return emptyState(); }
}

async function saveState(store, state) {
  await store.put(STATE_KEY, JSON.stringify(repairState(state)));
}

function level(user) {
  return LEVELS[user?.role] || 0;
}

function own(user, item) {
  const candidates = [item?.createdById, item?.staffId, item?.discordId, item?.roblox, item?.subjectId]
    .map((value) => normalize(value).toLowerCase()).filter(Boolean);
  return [user?.id, user?.discordId, user?.roblox, user?.name].map((value) => normalize(value).toLowerCase()).some((value) => value && candidates.includes(value));
}

function nextCaseId(state, collection) {
  const prefix = PREFIXES[collection] || "CASE";
  const max = state[collection].reduce((highest, item) => {
    const match = String(item.caseId || "").match(/-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function cleanItem(item, collection, user, state) {
  const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    const safeKey = cleanString(key, 80);
    if (!safeKey) continue;
    if (typeof value === "string") output[safeKey] = ["details", "reason", "notes", "summary", "allegation", "outcome", "description"].includes(safeKey) ? cleanLong(value) : cleanString(value);
    else if (typeof value === "number" && Number.isFinite(value)) output[safeKey] = value;
    else if (typeof value === "boolean") output[safeKey] = value;
    else if (Array.isArray(value)) output[safeKey] = cleanArray(value);
  }
  output.id = cleanString(output.id || crypto.randomUUID(), 100);
  output.caseId = cleanString(output.caseId || nextCaseId(state, collection), 30);
  output.createdAt = Number(output.createdAt) || Date.now();
  output.updatedAt = Date.now();
  output.createdById = user.id;
  output.createdBy = user.name;
  output.createdByRole = user.role;
  output.status = cleanString(output.status || "Open", 80);
  return output;
}

function addAudit(state, user, action, collection, item, detail = "") {
  state.audit.unshift({
    id: crypto.randomUUID(),
    action: cleanString(action, 100),
    collection: cleanString(collection, 60),
    caseId: cleanString(item?.caseId || item?.id || "", 100),
    subject: cleanString(item?.subject || item?.target || item?.staffName || item?.name || "", 160),
    detail: cleanString(detail, 1200),
    actorId: user.id,
    actor: user.name,
    actorRole: user.role,
    createdAt: Date.now()
  });
  state.audit = state.audit.slice(0, MAX_AUDIT);
}

function webhookFor(collection, env) {
  const direct = {
    moderation: env.DISCORD_MODERATION_WEBHOOK,
    infractions: env.DISCORD_STAFF_INFRACTION_WEBHOOK,
    investigations: env.DISCORD_INVESTIGATION_WEBHOOK,
    loa: env.DISCORD_LOA_WEBHOOK,
    training: env.DISCORD_TRAINING_WEBHOOK,
    promotions: env.DISCORD_PROMOTION_WEBHOOK,
    requests: env.DISCORD_STAFF_REQUEST_WEBHOOK,
    shifts: env.DISCORD_SHIFT_WEBHOOK,
    notes: env.DISCORD_STAFF_NOTES_WEBHOOK
  }[collection];
  return normalize(direct || env.DISCORD_STAFF_WEBHOOK);
}

function colorFor(collection, item) {
  if (collection === "infractions") return 0xef4444;
  if (collection === "investigations") return 0xf59e0b;
  if (collection === "promotions") return 0x22c55e;
  if (collection === "loa") return 0x8b5cf6;
  if (collection === "training") return 0x38bdf8;
  if (collection === "requests") return 0x14b8a6;
  if (collection === "shifts") return 0x3b82f6;
  if (String(item?.action || item?.type || "").toLowerCase().includes("ban")) return 0xdc2626;
  return 0x63cfff;
}

function displayFields(item) {
  const preferred = ["subject", "target", "staffName", "roblox", "discordId", "action", "type", "category", "priority", "status", "reason", "details", "duration", "startDate", "endDate", "result", "fromRank", "toRank", "evidenceUrl"];
  const fields = [];
  for (const key of preferred) {
    const value = item?.[key];
    if (value === undefined || value === null || value === "") continue;
    fields.push({ name: key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()), value: cleanLong(Array.isArray(value) ? value.join(", ") : value, 1000), inline: !["reason", "details", "evidenceUrl"].includes(key) });
    if (fields.length >= 12) break;
  }
  return fields;
}

async function sendDiscord(collection, item, action, env, origin = "") {
  const url = webhookFor(collection, env);
  if (!url) return { configured: false, delivered: false };
  const title = `${PREFIXES[collection] || "STAFF"} · ${cleanString(action, 80)}`;
  const evidenceUrl = item.evidenceUrl && String(item.evidenceUrl).startsWith("/") ? `${origin}${item.evidenceUrl}` : cleanString(item.evidenceUrl, 1800);
  const displayItem = { ...item, evidenceUrl };
  const payload = {
    username: "FSRP Staff Operations",
    avatar_url: normalize(env.FSRP_WEBHOOK_AVATAR_URL),
    allowed_mentions: { parse: [] },
    embeds: [{
      title,
      description: `**${cleanString(item.caseId || item.id, 60)}** was updated through the FSRP Staff Operations panel.`,
      color: colorFor(collection, item),
      fields: displayFields(displayItem),
      footer: { text: `Florida State Roleplay · ${cleanString(item.createdBy || "Staff", 100)}` },
      timestamp: new Date().toISOString(),
      ...(evidenceUrl ? { image: { url: evidenceUrl } } : {})
    }]
  };
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return { configured: true, delivered: response.ok, status: response.status };
  } catch {
    return { configured: true, delivered: false, status: 0 };
  }
}

function filteredState(state, user) {
  if (level(user) >= LEVELS.supervisor) return state;
  const view = safeClone(state);
  view.infractions = state.infractions.filter((item) => own(user, item));
  view.investigations = state.investigations.filter((item) => own(user, item));
  view.loa = state.loa.filter((item) => own(user, item));
  view.training = state.training.filter((item) => own(user, item) || String(item.visibility || "").toLowerCase() === "team");
  view.notes = state.notes.filter((item) => own(user, item));
  view.requests = state.requests.filter((item) => own(user, item) || String(item.visibility || "").toLowerCase() === "team");
  view.audit = state.audit.filter((item) => normalize(item.actorId).toLowerCase() === normalize(user.id).toLowerCase()).slice(0, 200);
  return view;
}

function currentShift(state, user) {
  return state.shifts.find((shift) => shift.staffId === user.id && ["Active", "Break"].includes(shift.status));
}

function shiftMinutes(shift, end = Date.now()) {
  const start = Number(shift.startedAt) || end;
  const breaks = Number(shift.breakMinutes) || 0;
  const activeBreak = shift.status === "Break" && shift.breakStartedAt ? Math.max(0, (end - Number(shift.breakStartedAt)) / 60000) : 0;
  return Math.max(0, Math.round((end - start) / 60000 - breaks - activeBreak));
}

function canCreate(user, collection, item) {
  if (collection === "loa" || collection === "requests") return level(user) >= 1;
  if (collection === "infractions" && String(item?.action || "").toLowerCase().includes("termination")) return level(user) >= LEVELS.hr;
  return level(user) >= (CREATE_LEVEL[collection] || 99);
}

function canUpdate(user, collection, item) {
  if ((collection === "loa" || collection === "requests") && own(user, item) && ["Open", "Pending"].includes(String(item.status))) return true;
  return level(user) >= (UPDATE_LEVEL[collection] || 99);
}

export async function onRequestGet({ env }) {
  const store = staffStore(env);
  return json({
    ok: Boolean(store && sessionSecret(env) && configuredRoles(env).length),
    staffOpsReady: Boolean(store && sessionSecret(env) && configuredRoles(env).length),
    storageReady: Boolean(store),
    storageBinding: env.STAFF_STATE ? "STAFF_STATE" : env.SITE_SETTINGS ? "SITE_SETTINGS" : null,
    sessionSigningReady: Boolean(sessionSecret(env)),
    configuredRoles: configuredRoles(env),
    uniqueAccountsConfigured: parseAccounts(env).length,
    mediaReady: Boolean(env.MEDIA_BUCKET),
    discordLogging: {
      fallback: Boolean(normalize(env.DISCORD_STAFF_WEBHOOK)),
      moderation: Boolean(webhookFor("moderation", env)),
      infractions: Boolean(webhookFor("infractions", env)),
      investigations: Boolean(webhookFor("investigations", env)),
      loa: Boolean(webhookFor("loa", env)),
      training: Boolean(webhookFor("training", env)),
      promotions: Boolean(webhookFor("promotions", env)),
      requests: Boolean(webhookFor("requests", env)),
      shifts: Boolean(webhookFor("shifts", env))
    },
    apiVersion: 1
  });
}

export async function onRequestPost({ request, env }) {
  const secret = sessionSecret(env);
  const store = staffStore(env);
  if (!secret) return json({ error: "Add STAFF_SESSION_SECRET, AUTH_SECRET, or ADMIN_TOKEN to sign Staff Operations sessions." }, 503);
  if (!store) return json({ error: "SITE_SETTINGS KV is missing. Staff Operations reuses the existing website KV automatically." }, 503);

  const data = await body(request);
  const origin = new URL(request.url).origin;
  if (data.action === "login") {
    const account = accountFor(data, env);
    if (!configuredRoles(env).length) return json({ error: "No Staff Operations access codes are configured in Cloudflare Production." }, 503);
    if (!account) return json({ error: "The Staff Operations code or Staff ID did not match. Check capitalization and the Production environment." }, 401);
    return json({ ok: true, token: await issueSession(account, secret), user: { ...account, code: undefined }, expiresIn: SESSION_MS, apiVersion: 1 });
  }

  const user = await verifySession(bearer(request) || data.token, secret);
  if (!user) return json({ error: "Staff Operations session expired or is invalid. Sign in again." }, 401);
  const state = await loadState(store);

  if (data.action === "state") {
    return json({ ok: true, state: filteredState(state, user), user, apiVersion: 1 });
  }

  if (data.action === "shift") {
    const mode = normalize(data.mode).toLowerCase();
    let shift = currentShift(state, user);
    if (mode === "start") {
      if (shift) return json({ error: "You already have an active shift." }, 409);
      shift = {
        id: crypto.randomUUID(), caseId: nextCaseId(state, "shifts"), staffId: user.id, staffName: user.name,
        discordId: user.discordId, roblox: user.roblox, callsign: cleanString(data.callsign || user.callsign, 60),
        department: cleanString(data.department || "Staff Team", 100), status: "Active", startedAt: Date.now(),
        breakMinutes: 0, createdAt: Date.now(), updatedAt: Date.now()
      };
      state.shifts.unshift(shift);
      addAudit(state, user, "Shift Started", "shifts", shift);
    } else if (mode === "break") {
      if (!shift || shift.status !== "Active") return json({ error: "No active shift is available to place on break." }, 409);
      shift.status = "Break";
      shift.breakStartedAt = Date.now();
      shift.updatedAt = Date.now();
      addAudit(state, user, "Break Started", "shifts", shift);
    } else if (mode === "resume") {
      if (!shift || shift.status !== "Break") return json({ error: "No active break is available to resume." }, 409);
      shift.breakMinutes = Number(shift.breakMinutes || 0) + Math.round((Date.now() - Number(shift.breakStartedAt || Date.now())) / 60000);
      delete shift.breakStartedAt;
      shift.status = "Active";
      shift.updatedAt = Date.now();
      addAudit(state, user, "Break Ended", "shifts", shift);
    } else if (mode === "end") {
      if (!shift) return json({ error: "You do not have an active shift." }, 409);
      if (shift.status === "Break" && shift.breakStartedAt) shift.breakMinutes = Number(shift.breakMinutes || 0) + Math.round((Date.now() - Number(shift.breakStartedAt)) / 60000);
      shift.status = "Ended";
      shift.endedAt = Date.now();
      shift.minutes = shiftMinutes(shift, shift.endedAt);
      shift.summary = cleanLong(data.summary, 2000);
      delete shift.breakStartedAt;
      shift.updatedAt = Date.now();
      addAudit(state, user, "Shift Ended", "shifts", shift, `${shift.minutes} active minutes`);
    } else {
      return json({ error: "Unknown shift action." }, 400);
    }
    state.shifts = state.shifts.slice(0, MAX_ITEMS);
    await saveState(store, state);
    const discord = await sendDiscord("shifts", shift, `Shift ${shift.status}`, env, origin);
    return json({ ok: true, state: filteredState(state, user), user, discord, apiVersion: 1 });
  }

  if (data.action === "create") {
    const collection = normalize(data.collection);
    if (!(collection in CREATE_LEVEL)) return json({ error: "Invalid Staff Operations collection." }, 400);
    if (!canCreate(user, collection, data.item)) return json({ error: "Your Staff Operations role cannot create this record." }, 403);
    const item = cleanItem(data.item, collection, user, state);
    if (collection === "loa") {
      item.staffId ||= user.id;
      item.staffName ||= user.name;
      item.discordId ||= user.discordId;
      item.roblox ||= user.roblox;
      item.status ||= "Pending";
    }
    if (collection === "requests") {
      item.staffId ||= user.id;
      item.staffName ||= user.name;
      item.status ||= "Open";
    }
    state[collection].unshift(item);
    state[collection] = state[collection].slice(0, MAX_ITEMS);
    addAudit(state, user, "Record Created", collection, item, item.reason || item.details || "");
    await saveState(store, state);
    const discord = await sendDiscord(collection, item, "Created", env, origin);
    item.discordDelivery = discord;
    return json({ ok: true, item, state: filteredState(state, user), user, discord, apiVersion: 1 });
  }

  if (data.action === "update") {
    const collection = normalize(data.collection);
    if (!(collection in UPDATE_LEVEL)) return json({ error: "Invalid Staff Operations collection." }, 400);
    const index = state[collection].findIndex((entry) => entry.id === data.id || entry.caseId === data.id);
    if (index < 0) return json({ error: "Staff Operations record was not found." }, 404);
    const current = state[collection][index];
    if (!canUpdate(user, collection, current)) return json({ error: "Your Staff Operations role cannot update this record." }, 403);
    const patch = cleanItem({ ...current, ...(data.patch || {}), id: current.id, caseId: current.caseId, createdAt: current.createdAt }, collection, { ...user, id: current.createdById, name: current.createdBy }, state);
    patch.createdByRole = current.createdByRole;
    patch.updatedBy = user.name;
    patch.updatedById = user.id;
    patch.updatedAt = Date.now();
    state[collection][index] = patch;
    addAudit(state, user, "Record Updated", collection, patch, cleanString(data.note, 1000));
    await saveState(store, state);
    const discord = await sendDiscord(collection, patch, "Updated", env, origin);
    return json({ ok: true, item: patch, state: filteredState(state, user), user, discord, apiVersion: 1 });
  }

  if (data.action === "void") {
    const collection = normalize(data.collection);
    if (!(collection in UPDATE_LEVEL)) return json({ error: "Invalid Staff Operations collection." }, 400);
    const item = state[collection].find((entry) => entry.id === data.id || entry.caseId === data.id);
    if (!item) return json({ error: "Staff Operations record was not found." }, 404);
    if (level(user) < LEVELS.supervisor) return json({ error: "Supervisor access is required to void records." }, 403);
    item.status = "Voided";
    item.voidReason = cleanLong(data.reason, 2000);
    item.voidedAt = Date.now();
    item.voidedBy = user.name;
    item.updatedAt = Date.now();
    addAudit(state, user, "Record Voided", collection, item, item.voidReason);
    await saveState(store, state);
    const discord = await sendDiscord(collection, item, "Voided", env, origin);
    return json({ ok: true, item, state: filteredState(state, user), user, discord, apiVersion: 1 });
  }

  if (data.action === "test-discord") {
    if (level(user) < LEVELS.hr) return json({ error: "HR access is required to test Discord delivery." }, 403);
    const collection = normalize(data.collection || "requests");
    const sample = { id: crypto.randomUUID(), caseId: "TEST-0001", subject: "FSRP Staff Operations", status: "Test", createdBy: user.name };
    return json({ ok: true, discord: await sendDiscord(collection, sample, "Webhook Test", env, origin) });
  }

  return json({ error: "Unknown Staff Operations action." }, 400);
}
