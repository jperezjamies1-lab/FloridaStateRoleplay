import { json, body, bearer, timingSafeEqual } from "../lib/http.js";

const STATE_KEY = "fsrp_command_suite_v1";
const STAFF_SESSION_MS = 8 * 60 * 60 * 1000;
const SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000;
const MAX_ALERTS = 800;
const MAX_AUDIT = 1500;
const LEVELS = { staff: 1, supervisor: 2, hr: 3, admin: 4 };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const EMPTY_STATE = {
  watchdogAlerts: [],
  watchdogSnapshots: [],
  modActions: [],
  banBolos: [],
  automationEvents: [],
  audit: [],
  settings: {
    watchdogEnabled: true,
    reviewOnly: true,
    strictness: 55,
    movementThreshold: 250,
    killBurstThreshold: 4,
    autoBanThreshold: 95,
    rules: [],
    autoShiftStart: false,
    autoShiftEnd: false,
    suspendAccessLock: true,
    linkedStaff: []
  }
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

function cleanLong(value, max = 5000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function safeClone(value) {
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
}

function emptyState() {
  return safeClone(EMPTY_STATE);
}

function repairState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : emptyState();
  for (const key of ["watchdogAlerts", "watchdogSnapshots", "modActions", "banBolos", "automationEvents", "audit"]) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  state.settings = { ...EMPTY_STATE.settings, ...(state.settings && typeof state.settings === "object" ? state.settings : {}) };
  return state;
}

function storeFor(env) {
  return env.COMMAND_SUITE_STATE || env.SITE_SETTINGS || null;
}

function sessionSecret(env) {
  return normalize(env.STAFF_SESSION_SECRET || env.AUTH_SECRET || env.ADMIN_TOKEN || env.OPERATIONS_TOKEN);
}

function fromBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), (character) => character.charCodeAt(0));
}

async function importKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
}

async function verifyStaffSession(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const valid = await crypto.subtle.verify("HMAC", await importKey(secret), fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    const user = JSON.parse(decoder.decode(fromBase64Url(payload)));
    if (!user || !LEVELS[user.role] || Number(user.exp) <= Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

function level(user) {
  return LEVELS[user?.role] || 0;
}

async function loadState(store) {
  try { return repairState(await store.get(STATE_KEY, "json")); }
  catch { return emptyState(); }
}

async function saveState(store, state) {
  await store.put(STATE_KEY, JSON.stringify(repairState(state)));
}

function addAudit(state, user, action, detail = "", subject = "") {
  state.audit.unshift({
    id: crypto.randomUUID(),
    action: cleanString(action, 100),
    detail: cleanLong(detail, 1800),
    subject: cleanString(subject, 160),
    actor: cleanString(user?.name || "System", 120),
    actorId: cleanString(user?.id || "system", 120),
    actorRole: cleanString(user?.role || "system", 40),
    createdAt: Date.now()
  });
  state.audit = state.audit.slice(0, MAX_AUDIT);
}

function parseIdentity(value) {
  const raw = cleanString(value, 180);
  const split = raw.lastIndexOf(":");
  if (split <= 0) return { name: raw, userId: "" };
  return { name: raw.slice(0, split), userId: raw.slice(split + 1) };
}

function normalizedLocation(source = {}) {
  return {
    x: Number.isFinite(Number(source.LocationX)) ? Number(source.LocationX) : null,
    z: Number.isFinite(Number(source.LocationZ)) ? Number(source.LocationZ) : null,
    postal: cleanString(source.PostalCode, 40),
    street: cleanString(source.StreetName, 120),
    building: cleanString(source.BuildingNumber, 40)
  };
}

function normalizeServerPayload(payload = {}) {
  const players = Array.isArray(payload.Players) ? payload.Players.map((entry) => {
    const identity = parseIdentity(entry?.Player);
    return {
      name: identity.name,
      userId: identity.userId,
      team: cleanString(entry?.Team, 80),
      callsign: cleanString(entry?.Callsign, 60),
      permission: cleanString(entry?.Permission, 100),
      wantedStars: Number.isFinite(Number(entry?.WantedStars)) ? Number(entry.WantedStars) : 0,
      location: normalizedLocation(entry?.Location)
    };
  }) : [];

  const killLogs = Array.isArray(payload.KillLogs) ? payload.KillLogs.slice(0, 300).map((entry) => ({
    killer: parseIdentity(entry?.Killer).name,
    killed: parseIdentity(entry?.Killed).name,
    timestamp: Number(entry?.Timestamp) || 0
  })) : [];

  const commandLogs = Array.isArray(payload.CommandLogs) ? payload.CommandLogs.slice(0, 300).map((entry) => ({
    player: parseIdentity(entry?.Player).name,
    command: cleanString(entry?.Command, 300),
    timestamp: Number(entry?.Timestamp) || 0
  })) : [];

  const modCalls = Array.isArray(payload.ModCalls) ? payload.ModCalls.slice(0, 200).map((entry) => ({
    caller: parseIdentity(entry?.Caller).name,
    moderator: parseIdentity(entry?.Moderator).name,
    timestamp: Number(entry?.Timestamp) || 0
  })) : [];

  const vehicles = Array.isArray(payload.Vehicles) ? payload.Vehicles.slice(0, 300).map((entry) => ({
    name: cleanString(entry?.Name, 120),
    owner: cleanString(entry?.Owner, 120),
    plate: cleanString(entry?.Plate, 60),
    livery: cleanString(entry?.Texture, 160),
    color: cleanString(entry?.ColorName || entry?.ColorHex, 80)
  })) : [];

  const joinLogs = Array.isArray(payload.JoinLogs) ? payload.JoinLogs.slice(0, 300).map((entry) => ({
    player: parseIdentity(entry?.Player).name,
    joined: Boolean(entry?.Join),
    timestamp: Number(entry?.Timestamp) || 0
  })) : [];

  const staffIds = new Set();
  for (const group of [payload?.Staff?.Admins, payload?.Staff?.Mods, payload?.Staff?.Helpers]) {
    if (!group || typeof group !== "object") continue;
    for (const id of Object.keys(group)) staffIds.add(String(id));
  }

  return {
    server: {
      name: cleanString(payload?.Name, 160),
      currentPlayers: Number(payload?.CurrentPlayers) || players.length,
      maxPlayers: Number(payload?.MaxPlayers) || null,
      joinKey: cleanString(payload?.JoinKey, 120),
      queue: Array.isArray(payload?.Queue) ? payload.Queue.length : 0
    },
    players,
    killLogs,
    commandLogs,
    modCalls,
    vehicles,
    joinLogs,
    staffIds: [...staffIds],
    fetchedAt: Date.now()
  };
}

async function fetchErlc(env) {
  const serverKey = normalize(env.ERLC_SERVER_KEY);
  if (!serverKey) throw new Error("ERLC_SERVER_KEY is not configured in Cloudflare Production.");
  const query = new URLSearchParams({
    Players: "true",
    Staff: "true",
    Queue: "true",
    KillLogs: "true",
    CommandLogs: "true",
    ModCalls: "true",
    Vehicles: "true",
    EmergencyCalls: "true",
    JoinLogs: "true"
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`https://api.erlc.gg/v2/server?${query}`, {
      headers: { "server-key": serverKey, "accept": "application/json" },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(cleanString(payload?.message || payload?.error || `ER:LC API error ${response.status}`, 400));
    return normalizeServerPayload(payload);
  } finally {
    clearTimeout(timeout);
  }
}

const ACTION_LEVELS = {
  hint: 1,
  message: 1,
  pm: 1,
  warn: 1,
  refresh: 1,
  heal: 2,
  kick: 2,
  jail: 2,
  wanted: 2,
  unwanted: 2,
  ban: 3,
  unban: 3,
  mod: 4,
  unmod: 4,
  admin: 4,
  unadmin: 4,
  raw: 4
};

function commandFor(action, player, reason, rawCommand = "") {
  const target = cleanString(player, 80);
  const detail = cleanString(reason, 220);
  const templates = {
    hint: `:h ${detail}`,
    message: `:m ${detail}`,
    pm: `:pm ${target} ${detail}`,
    warn: `:pm ${target} [FSRP Staff Warning] ${detail}`,
    refresh: `:refresh ${target}`,
    heal: `:heal ${target}`,
    kick: `:kick ${target} ${detail}`,
    jail: `:jail ${target}`,
    wanted: `:wanted ${target}`,
    unwanted: `:unwanted ${target}`,
    ban: `:ban ${target}`,
    unban: `:unban ${target}`,
    mod: `:mod ${target}`,
    unmod: `:unmod ${target}`,
    admin: `:admin ${target}`,
    unadmin: `:unadmin ${target}`,
    raw: cleanString(rawCommand, 300)
  };
  return templates[action] || "";
}

async function runErlcCommand(env, command) {
  const serverKey = normalize(env.ERLC_SERVER_KEY);
  if (!serverKey) throw new Error("ERLC_SERVER_KEY is not configured.");
  if (!command || command.length > 300 || /[\r\n]/.test(command)) throw new Error("The ER:LC command is invalid.");
  const response = await fetch("https://api.erlc.gg/v1/server/command", {
    method: "POST",
    headers: { "server-key": serverKey, "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ command })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(cleanString(payload?.message || payload?.error || `ER:LC command failed (${response.status}).`, 400));
  return { ok: true, message: cleanString(payload?.message || "Success", 300), commandId: cleanString(payload?.commandId, 120) };
}

function webhookFor(kind, env) {
  return normalize({
    watchdog: env.DISCORD_WATCHDOG_WEBHOOK,
    moderation: env.DISCORD_MODERATION_WEBHOOK,
    bolo: env.DISCORD_WATCHDOG_WEBHOOK || env.DISCORD_MODERATION_WEBHOOK
  }[kind] || env.DISCORD_STAFF_WEBHOOK);
}

async function sendDiscord(kind, title, fields, env, color = 0x63cfff) {
  const url = webhookFor(kind, env);
  if (!url) return { configured: false, delivered: false };
  const payload = {
    username: "FSRP Command Suite",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: cleanString(title, 250),
      color,
      fields: fields.slice(0, 20).map((field) => ({
        name: cleanString(field.name, 100),
        value: cleanLong(field.value, 1000) || "—",
        inline: Boolean(field.inline)
      })),
      footer: { text: "Florida State Roleplay · Staff Command Suite" },
      timestamp: new Date().toISOString()
    }]
  };
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return { configured: true, delivered: response.ok, status: response.status };
  } catch {
    return { configured: true, delivered: false, status: 0 };
  }
}

function distance(a, b) {
  if (![a?.x, a?.z, b?.x, b?.z].every((value) => Number.isFinite(Number(value)))) return null;
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.z) - Number(b.z));
}

function recentTimestamp(value) {
  const number = Number(value) || 0;
  return number > 1e12 ? number : number * 1000;
}

function alertId(player, type, marker) {
  return `${cleanString(player, 80).toLowerCase()}|${type}|${marker}`;
}

function createAlert({ player, type, title, detail, score, evidence = {}, signals = [] }) {
  return {
    id: crypto.randomUUID(),
    signature: alertId(player, type, evidence.marker || Math.floor(Date.now() / 30000)),
    player: cleanString(player, 100),
    type: cleanString(type, 60),
    title: cleanString(title, 160),
    detail: cleanLong(detail, 1600),
    score: Math.max(0, Math.min(100, Number(score) || 0)),
    confidence: score >= 85 ? "High" : score >= 60 ? "Medium" : "Low",
    signals: [...new Set(signals.map((value) => cleanString(value, 80)).filter(Boolean))],
    evidence,
    status: "Review Required",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function aggregateAlerts(alerts) {
  const grouped = new Map();
  for (const alert of alerts) {
    const key = alert.player.toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(alert);
  }
  for (const group of grouped.values()) {
    const signals = [...new Set(group.flatMap((alert) => alert.signals || [alert.type]))];
    const total = Math.min(100, group.reduce((sum, alert) => sum + alert.score, 0));
    for (const alert of group) {
      alert.combinedScore = total;
      alert.distinctSignals = signals;
    }
  }
  return alerts;
}

function scanSignals(live, previous, settings) {
  const alerts = [];
  const previousPlayers = new Map((previous?.players || []).map((player) => [player.name.toLowerCase(), player]));
  const elapsedSeconds = previous?.fetchedAt ? Math.max(1, (live.fetchedAt - previous.fetchedAt) / 1000) : 0;
  const speedThreshold = Math.max(100, Number(settings.movementThreshold) || 250);

  if (elapsedSeconds >= 3 && elapsedSeconds <= 90) {
    for (const player of live.players) {
      const old = previousPlayers.get(player.name.toLowerCase());
      if (!old) continue;
      const moved = distance(player.location, old.location);
      if (moved === null) continue;
      const speed = moved / elapsedSeconds;
      if (speed > speedThreshold) {
        alerts.push(createAlert({
          player: player.name,
          type: "movement-anomaly",
          title: "Impossible movement pattern",
          detail: `${player.name} moved approximately ${Math.round(moved)} map units in ${Math.round(elapsedSeconds)} seconds (${Math.round(speed)}/s). This may be teleporting, flinging, a respawn, or an API jump and requires staff review.`,
          score: speed > speedThreshold * 2.2 ? 70 : 48,
          signals: ["movement"],
          evidence: { marker: live.fetchedAt, speed: Math.round(speed), from: old.location, to: player.location, callsign: player.callsign, team: player.team }
        }));
      }
    }
  }

  const now = Date.now();
  const killWindowMs = 45 * 1000;
  const recentKills = live.killLogs.filter((entry) => entry.killer && recentTimestamp(entry.timestamp) >= now - killWindowMs);
  const killsByPlayer = new Map();
  for (const entry of recentKills) killsByPlayer.set(entry.killer, (killsByPlayer.get(entry.killer) || 0) + 1);
  const killThreshold = Math.max(3, Number(settings.killBurstThreshold) || 4);
  for (const [player, count] of killsByPlayer) {
    if (count >= killThreshold) {
      alerts.push(createAlert({
        player,
        type: "kill-burst",
        title: "Rapid kill burst",
        detail: `${player} appeared in ${count} kill log entries inside approximately 45 seconds. Review for mass RDM, weapon abuse, or an exploit before taking action.`,
        score: count >= killThreshold + 3 ? 88 : 72,
        signals: ["kill-burst"],
        evidence: { marker: Math.floor(now / killWindowMs), count }
      }));
    }
  }

  const staffIds = new Set(live.staffIds || []);
  const dangerousCommands = [":ban", ":kick", ":mod", ":admin", ":shutdown", ":jail", ":kill", ":unadmin", ":unmod"];
  const dangerousByActor = new Map();
  for (const log of live.commandLogs) {
    if (recentTimestamp(log.timestamp) < now - 60 * 1000) continue;
    if (!dangerousCommands.some((command) => log.command.toLowerCase().startsWith(command))) continue;
    const key = log.player.toLowerCase();
    if (!dangerousByActor.has(key)) dangerousByActor.set(key, []);
    dangerousByActor.get(key).push(log);
  }
  const staffBurstThreshold = Math.max(5, Number(settings.staffCommandBurstThreshold) || 8);
  for (const logs of dangerousByActor.values()) {
    if (logs.length < staffBurstThreshold) continue;
    const actor = logs[0].player;
    const player = live.players.find((entry) => entry.name.toLowerCase() === actor.toLowerCase());
    const listedStaff = Boolean(player?.userId && staffIds.has(String(player.userId)));
    alerts.push(createAlert({
      player: actor,
      type: "moderator-command-burst",
      title: "Moderator action burst requires review",
      detail: `${actor} used ${logs.length} high-impact commands in approximately one minute. ${listedStaff ? "The account is listed as staff, so this is an administrative-abuse review and never an automatic staff ban." : "The account was not listed as staff at scan time."}`,
      score: listedStaff ? 68 : 92,
      signals: [listedStaff ? "moderator-oversight" : "command-abuse"],
      evidence: { marker: Math.floor(now / 60000), commands: logs.slice(0, 15).map((entry) => entry.command), listedStaff }
    }));
  }
  for (const log of live.commandLogs) {
    if (recentTimestamp(log.timestamp) < now - 2 * 60 * 1000) continue;
    const player = live.players.find((entry) => entry.name.toLowerCase() === log.player.toLowerCase());
    const isListedStaff = player?.userId && staffIds.has(String(player.userId));
    if (!isListedStaff && dangerousCommands.some((command) => log.command.toLowerCase().startsWith(command))) {
      alerts.push(createAlert({
        player: log.player,
        type: "unauthorized-command",
        title: "Possible unauthorized staff command",
        detail: `${log.player} used ${log.command}. The player was not present in the API staff lists at scan time. Verify role sync and command context.`,
        score: 82,
        signals: ["command-abuse"],
        evidence: { marker: log.timestamp, command: log.command }
      }));
    }
  }

  return aggregateAlerts(alerts);
}

function dedupeNewAlerts(state, alerts) {
  const signatures = new Set(state.watchdogAlerts.map((alert) => alert.signature));
  return alerts.filter((alert) => !signatures.has(alert.signature));
}

function isProtectedStaff(live, playerName) {
  const player = live.players.find((entry) => entry.name.toLowerCase() === String(playerName).toLowerCase());
  return Boolean(player?.userId && new Set(live.staffIds || []).has(String(player.userId)));
}

async function maybeAutoBan(alerts, live, state, env) {
  const enabled = normalize(env.WATCHDOG_AUTO_BAN_ENABLED).toLowerCase() === "true";
  if (!enabled) return [];
  const threshold = Math.max(90, Number(env.WATCHDOG_AUTO_BAN_THRESHOLD) || Number(state.settings.autoBanThreshold) || 95);
  const results = [];
  const byPlayer = new Map();
  for (const alert of alerts) {
    const key = alert.player.toLowerCase();
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(alert);
  }
  for (const group of byPlayer.values()) {
    const player = group[0].player;
    const signals = [...new Set(group.flatMap((alert) => alert.distinctSignals || alert.signals || []))];
    const score = Math.max(...group.map((alert) => Number(alert.combinedScore || alert.score) || 0));
    const hasStrongSignal = signals.includes("kill-burst") || signals.includes("command-abuse");
    if (score < threshold || signals.length < 2 || !hasStrongSignal || isProtectedStaff(live, player)) continue;
    try {
      const result = await runErlcCommand(env, `:ban ${cleanString(player, 80)}`);
      for (const alert of group) {
        alert.status = "Auto Action Applied";
        alert.autoAction = "Ban";
        alert.actionAt = Date.now();
      }
      results.push({ player, score, signals, result });
    } catch (error) {
      results.push({ player, score, signals, error: error.message });
    }
  }
  return results;
}

async function executeWatchdogScan(state, user, env) {
  const live = await fetchErlc(env);
  const previous = state.watchdogSnapshots[0] || null;
  const scanned = scanSignals(live, previous, state.settings);
  const newAlerts = dedupeNewAlerts(state, scanned);
  const autoActions = await maybeAutoBan(newAlerts, live, state, env);
  for (const alert of newAlerts) {
    state.watchdogAlerts.unshift(alert);
    await sendDiscord("watchdog", `FSRP Watchdog · ${alert.title}`, [
      { name: "Player", value: alert.player, inline: true },
      { name: "Confidence", value: `${alert.confidence} · ${alert.combinedScore || alert.score}/100`, inline: true },
      { name: "Signals", value: (alert.distinctSignals || alert.signals || []).join(", ") || alert.type },
      { name: "Review", value: alert.detail }
    ], env, alert.confidence === "High" ? 0xef4444 : 0xf59e0b);
  }
  state.watchdogAlerts = state.watchdogAlerts.slice(0, MAX_ALERTS);
  state.watchdogSnapshots.unshift({ fetchedAt: live.fetchedAt, players: live.players, killLogs: live.killLogs, commandLogs: live.commandLogs, joinLogs: live.joinLogs });
  state.watchdogSnapshots = state.watchdogSnapshots.filter((snapshot) => Date.now() - Number(snapshot.fetchedAt) < SNAPSHOT_MAX_AGE_MS).slice(0, 40);
  addAudit(state, user, "Watchdog Scan", `${newAlerts.length} new alerts; ${autoActions.length} auto-actions`, live.server.name);
  return { live, newAlerts, autoActions };
}

function publicState(state, user) {
  const result = safeClone(state);
  if (level(user) < LEVELS.supervisor) {
    result.watchdogSnapshots = [];
    result.audit = result.audit.filter((entry) => entry.actorId === user.id).slice(0, 200);
  }
  return result;
}

export async function onRequestGet({ env }) {
  return json({
    ok: Boolean(storeFor(env) && sessionSecret(env)),
    commandSuiteReady: Boolean(storeFor(env) && sessionSecret(env)),
    storageReady: Boolean(storeFor(env)),
    staffSessionReady: Boolean(sessionSecret(env)),
    erlcReady: Boolean(normalize(env.ERLC_SERVER_KEY)),
    moderationDiscordReady: Boolean(webhookFor("moderation", env)),
    watchdogDiscordReady: Boolean(webhookFor("watchdog", env)),
    liveRadioReady: Boolean(normalize(env.RADIO_WORKER_URL) && normalize(env.RADIO_SESSION_SECRET)),
    autoBanEnabled: normalize(env.WATCHDOG_AUTO_BAN_ENABLED).toLowerCase() === "true",
    apiVersion: 1
  });
}

export async function onRequestPost({ request, env }) {
  const store = storeFor(env);
  const secret = sessionSecret(env);
  if (!store) return json({ error: "SITE_SETTINGS KV is missing. The Command Suite reuses the existing website KV." }, 503);
  if (!secret) return json({ error: "STAFF_SESSION_SECRET, AUTH_SECRET, or ADMIN_TOKEN is required." }, 503);

  const data = await body(request);
  const state = await loadState(store);

  if (data.action === "watchdog-cron") {
    const configured = normalize(env.WATCHDOG_CRON_TOKEN);
    const supplied = normalize(request.headers.get("x-watchdog-token"));
    if (!configured || !supplied || !timingSafeEqual(configured, supplied)) return json({ error: "Watchdog cron authorization failed." }, 401);
    const systemUser = { id: "watchdog-cron", name: "FSRP Watchdog", role: "admin" };
    const result = await executeWatchdogScan(state, systemUser, env);
    await saveState(store, state);
    return json({ ok: true, ...result, apiVersion: 1 });
  }

  const user = await verifyStaffSession(bearer(request) || data.token, secret);
  if (!user) return json({ error: "Staff Operations login is required. Sign in through Staff Ops first." }, 401);

  if (data.action === "state") {
    let live = null;
    let liveError = "";
    if (normalize(env.ERLC_SERVER_KEY)) {
      try { live = await fetchErlc(env); }
      catch (error) { liveError = error.message; }
    }
    return json({ ok: true, state: { ...publicState(state, user), readiness: { liveRadioReady: Boolean(normalize(env.RADIO_WORKER_URL) && normalize(env.RADIO_SESSION_SECRET)), discordReady: Boolean(webhookFor("watchdog", env) || webhookFor("moderation", env)) } }, user, live, liveError, apiVersion: 2 });
  }

  if (data.action === "moderate") {
    const action = normalize(data.mode).toLowerCase();
    if (!ACTION_LEVELS[action]) return json({ error: "Unknown moderation action." }, 400);
    if (level(user) < ACTION_LEVELS[action]) return json({ error: "Your Staff Operations role cannot use this action." }, 403);
    const player = cleanString(data.player, 80);
    const reason = cleanString(data.reason, 220);
    if (!["hint", "message", "raw"].includes(action) && !player) return json({ error: "Select an in-game player first." }, 400);
    if (["hint", "message", "pm", "warn", "kick"].includes(action) && !reason) return json({ error: "A message or reason is required." }, 400);
    const command = commandFor(action, player, reason, data.rawCommand);
    const result = await runErlcCommand(env, command);
    const item = {
      id: crypto.randomUUID(), action, player, reason, command, result: result.message,
      createdBy: user.name, createdById: user.id, createdByRole: user.role, createdAt: Date.now()
    };
    state.modActions.unshift(item);
    state.modActions = state.modActions.slice(0, 800);
    addAudit(state, user, `ER:LC ${action}`, reason || command, player || "Server");
    await saveState(store, state);
    const discord = await sendDiscord("moderation", `ER:LC Staff Action · ${action.toUpperCase()}`, [
      { name: "Target", value: player || "Server-wide", inline: true },
      { name: "Staff", value: `${user.name} (${user.role})`, inline: true },
      { name: "Reason", value: reason || "No reason supplied" },
      { name: "Result", value: result.message }
    ], env, ["ban", "kick", "jail"].includes(action) ? 0xef4444 : 0x63cfff);
    return json({ ok: true, item, state: publicState(state, user), discord, apiVersion: 1 });
  }

  if (data.action === "watchdog-scan") {
    if (level(user) < LEVELS.supervisor) return json({ error: "Supervisor access is required to run Watchdog scans." }, 403);
    const result = await executeWatchdogScan(state, user, env);
    await saveState(store, state);
    return json({ ok: true, ...result, state: publicState(state, user), apiVersion: 1 });
  }

  if (data.action === "watchdog-report") {
    if (level(user) < LEVELS.staff) return json({ error: "Staff access is required." }, 403);
    const player = cleanString(data.player, 100);
    const type = cleanString(data.type || "manual-report", 80);
    const detail = cleanLong(data.detail, 1800);
    if (!player || !detail) return json({ error: "Player and report details are required." }, 400);
    const alert = createAlert({
      player,
      type,
      title: cleanString(data.title || "Staff-submitted exploit report", 160),
      detail,
      score: Math.max(10, Math.min(100, Number(data.score) || 45)),
      signals: ["staff-report"],
      evidence: { marker: Date.now(), evidenceUrl: cleanString(data.evidenceUrl, 1800), reporter: user.name }
    });
    state.watchdogAlerts.unshift(alert);
    state.watchdogAlerts = state.watchdogAlerts.slice(0, MAX_ALERTS);
    addAudit(state, user, "Watchdog Report", detail, player);
    await saveState(store, state);
    const discord = await sendDiscord("watchdog", "FSRP Watchdog · Staff Report", [
      { name: "Player", value: player, inline: true },
      { name: "Reported by", value: user.name, inline: true },
      { name: "Type", value: type, inline: true },
      { name: "Details", value: detail },
      ...(data.evidenceUrl ? [{ name: "Evidence", value: cleanString(data.evidenceUrl, 1800) }] : [])
    ], env, 0xf59e0b);
    return json({ ok: true, alert, state: publicState(state, user), discord, apiVersion: 1 });
  }

  if (data.action === "watchdog-review") {
    if (level(user) < LEVELS.supervisor) return json({ error: "Supervisor access is required." }, 403);
    const alert = state.watchdogAlerts.find((entry) => entry.id === data.id);
    if (!alert) return json({ error: "Watchdog alert was not found." }, 404);
    const decision = normalize(data.decision || "Reviewed");
    alert.status = decision;
    alert.reviewedBy = user.name;
    alert.reviewedAt = Date.now();
    alert.reviewNote = cleanLong(data.note, 1600);
    if (["Ban", "Kick"].includes(decision)) {
      const mode = decision.toLowerCase();
      if (level(user) < ACTION_LEVELS[mode]) return json({ error: `${decision} requires a higher Staff Operations role.` }, 403);
      const result = await runErlcCommand(env, commandFor(mode, alert.player, alert.reviewNote || "Watchdog review"));
      alert.actionResult = result.message;
    }
    addAudit(state, user, `Watchdog ${decision}`, alert.reviewNote, alert.player);
    await saveState(store, state);
    return json({ ok: true, alert, state: publicState(state, user), apiVersion: 1 });
  }

  if (data.action === "watchdog-settings") {
    if (level(user) < LEVELS.hr) return json({ error: "HR access is required to change Watchdog settings." }, 403);
    const patch = data.settings && typeof data.settings === "object" ? data.settings : {};
    state.settings = {
      ...state.settings,
      watchdogEnabled: patch.watchdogEnabled !== undefined ? Boolean(patch.watchdogEnabled) : state.settings.watchdogEnabled,
      reviewOnly: patch.reviewOnly !== undefined ? Boolean(patch.reviewOnly) : state.settings.reviewOnly,
      strictness: Math.max(1, Math.min(100, Number(patch.strictness) || state.settings.strictness)),
      movementThreshold: Math.max(100, Math.min(1500, Number(patch.movementThreshold) || state.settings.movementThreshold)),
      killBurstThreshold: Math.max(3, Math.min(12, Number(patch.killBurstThreshold) || state.settings.killBurstThreshold)),
      autoBanThreshold: Math.max(90, Math.min(100, Number(patch.autoBanThreshold) || state.settings.autoBanThreshold)),
      rules: Array.isArray(patch.rules) ? patch.rules.slice(0, 5).map((value) => cleanString(value, 300)).filter(Boolean) : state.settings.rules
    };
    addAudit(state, user, "Watchdog Settings Updated", JSON.stringify(state.settings));
    await saveState(store, state);
    return json({ ok: true, settings: state.settings, state: publicState(state, user), apiVersion: 1 });
  }

  if (data.action === "bolo-save") {
    if (level(user) < LEVELS.supervisor) return json({ error: "Supervisor access is required to create Ban BOLOs." }, 403);
    const source = data.item && typeof data.item === "object" ? data.item : {};
    const item = {
      id: crypto.randomUUID(),
      player: cleanString(source.player, 100),
      action: cleanString(source.action || "Alert Staff", 100),
      reason: cleanLong(source.reason, 2400),
      status: "Active",
      createdAt: Date.now(),
      createdBy: user.name,
      createdById: user.id
    };
    if (!item.player || !item.reason) return json({ error: "Roblox username and reason are required." }, 400);
    state.banBolos.unshift(item);
    state.banBolos = state.banBolos.slice(0, 500);
    state.automationEvents.unshift({ id: crypto.randomUUID(), type: "Ban BOLO Created", detail: `${item.player} · ${item.action}`, createdAt: Date.now(), actor: user.name });
    state.automationEvents = state.automationEvents.slice(0, 600);
    addAudit(state, user, "Ban BOLO Created", item.reason, item.player);
    await saveState(store, state);
    const discord = await sendDiscord("bolo", "FSRP Ban BOLO Created", [
      { name: "Player", value: item.player, inline: true },
      { name: "Requested action", value: item.action, inline: true },
      { name: "Created by", value: user.name, inline: true },
      { name: "Reason", value: item.reason }
    ], env, 0xf59e0b);
    return json({ ok: true, item, state: publicState(state, user), discord, apiVersion: 2 });
  }

  if (data.action === "bolo-update") {
    if (level(user) < LEVELS.supervisor) return json({ error: "Supervisor access is required to update Ban BOLOs." }, 403);
    const item = state.banBolos.find((entry) => entry.id === data.id);
    if (!item) return json({ error: "Ban BOLO was not found." }, 404);
    item.status = cleanString(data.status || "Closed", 80);
    item.reviewNote = cleanLong(data.note, 1600);
    item.updatedAt = Date.now();
    item.updatedBy = user.name;
    state.automationEvents.unshift({ id: crypto.randomUUID(), type: `Ban BOLO ${item.status}`, detail: `${item.player} · ${item.reviewNote || "No note"}`, createdAt: Date.now(), actor: user.name });
    state.automationEvents = state.automationEvents.slice(0, 600);
    addAudit(state, user, `Ban BOLO ${item.status}`, item.reviewNote, item.player);
    await saveState(store, state);
    return json({ ok: true, item, state: publicState(state, user), apiVersion: 2 });
  }

  if (data.action === "automation-settings") {
    if (level(user) < LEVELS.hr) return json({ error: "HR access is required to change automation settings." }, 403);
    const patch = data.settings && typeof data.settings === "object" ? data.settings : {};
    const linkedStaff = Array.isArray(patch.linkedStaff) ? patch.linkedStaff.slice(0, 150).map((entry) => ({
      roblox: cleanString(entry?.roblox, 100),
      username: cleanString(entry?.username, 100),
      callsign: cleanString(entry?.callsign, 60)
    })).filter((entry) => entry.roblox) : state.settings.linkedStaff;
    state.settings = {
      ...state.settings,
      autoShiftStart: patch.autoShiftStart !== undefined ? Boolean(patch.autoShiftStart) : state.settings.autoShiftStart,
      autoShiftEnd: patch.autoShiftEnd !== undefined ? Boolean(patch.autoShiftEnd) : state.settings.autoShiftEnd,
      suspendAccessLock: patch.suspendAccessLock !== undefined ? Boolean(patch.suspendAccessLock) : state.settings.suspendAccessLock,
      linkedStaff
    };
    state.automationEvents.unshift({ id: crypto.randomUUID(), type: "Automation Settings Updated", detail: `${linkedStaff.length} linked staff account(s)`, createdAt: Date.now(), actor: user.name });
    state.automationEvents = state.automationEvents.slice(0, 600);
    addAudit(state, user, "Automation Settings Updated", JSON.stringify({ autoShiftStart: state.settings.autoShiftStart, autoShiftEnd: state.settings.autoShiftEnd, suspendAccessLock: state.settings.suspendAccessLock, linkedStaff: linkedStaff.length }));
    await saveState(store, state);
    return json({ ok: true, settings: state.settings, state: publicState(state, user), apiVersion: 2 });
  }

  return json({ error: "Unknown Command Suite action." }, 400);
}
