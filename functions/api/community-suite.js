import { json, body, bearer, timingSafeEqual } from "../lib/http.js";

const STATE_KEY = "fsrp_community_suite_v1";
const STAFF_STATE_KEY = "fsrp_staff_operations_v1";
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_SUBMISSIONS = 2200;
const MAX_AUDIT = 2500;
const MAX_ANALYTICS_DAYS = 70;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const LEVELS = { staff: 1, supervisor: 2, hr: 3, admin: 4 };
const REVIEW_LEVEL = { application: 2, department: 2, join: 2, appeal: 3, feedback: 1, verification: 2 };

const DEFAULT_FORMS = [
  {
    id: "staff-application",
    title: "Staff Application",
    type: "application",
    department: "Staff Team",
    description: "Apply to join the Florida State Roleplay staff team.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "age", label: "Age", type: "number", required: true },
      { id: "timezone", label: "Timezone", type: "text", required: true },
      { id: "experience", label: "Moderation experience", type: "textarea", required: true },
      { id: "reason", label: "Why should we select you?", type: "textarea", required: true }
    ]
  },
  {
    id: "fhp-application",
    title: "FHP Application",
    type: "department",
    department: "FHP",
    description: "Apply for Florida Highway Patrol.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "timezone", label: "Timezone", type: "text", required: true },
      { id: "experience", label: "Law-enforcement roleplay experience", type: "textarea", required: true },
      { id: "scenario", label: "Explain how you would handle a traffic stop", type: "textarea", required: true }
    ]
  },
  {
    id: "ocso-application",
    title: "OCSO Application",
    type: "department",
    department: "OCSO",
    description: "Apply for Orange County Sheriff's Office.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "timezone", label: "Timezone", type: "text", required: true },
      { id: "experience", label: "Sheriff roleplay experience", type: "textarea", required: true },
      { id: "scenario", label: "Explain how you would handle a priority scene", type: "textarea", required: true }
    ]
  },
  {
    id: "ffw-application",
    title: "FFW Application",
    type: "department",
    department: "FFW",
    description: "Apply for Florida Fish & Wildlife.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "experience", label: "Wildlife or marine roleplay experience", type: "textarea", required: true },
      { id: "scenario", label: "Explain a boating or wildlife enforcement scene", type: "textarea", required: true }
    ]
  },
  {
    id: "fbi-application",
    title: "FBI Application",
    type: "department",
    department: "FBI",
    description: "Apply for the Federal Bureau of Investigation.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "experience", label: "Investigative roleplay experience", type: "textarea", required: true },
      { id: "scenario", label: "Explain how you would document an investigation", type: "textarea", required: true }
    ]
  },
  {
    id: "server-join-request",
    title: "Private Server Join Request",
    type: "join",
    department: "Community",
    description: "Request access to the Florida State Roleplay private server.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "reason", label: "Why do you want to join?", type: "textarea", required: true }
    ]
  },
  {
    id: "ban-appeal",
    title: "Ban Appeal",
    type: "appeal",
    department: "Moderation",
    description: "Appeal an FSRP community or private-server ban.",
    status: "Open",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "banReason", label: "Ban reason", type: "textarea", required: true },
      { id: "appeal", label: "Why should the ban be reviewed?", type: "textarea", required: true },
      { id: "accountability", label: "What will you do differently?", type: "textarea", required: true }
    ]
  },
  {
    id: "media-team-application",
    title: "Media Team Application",
    type: "application",
    department: "Media Team",
    description: "Apply to create official FSRP content.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "portfolio", label: "Portfolio or example link", type: "url", required: false },
      { id: "experience", label: "Content experience", type: "textarea", required: true }
    ]
  },
  {
    id: "event-team-application",
    title: "Event Team Application",
    type: "application",
    department: "Event Team",
    description: "Apply to plan and run community events.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "idea", label: "Describe an event you would run", type: "textarea", required: true }
    ]
  },
  {
    id: "design-team-application",
    title: "Design Team Application",
    type: "application",
    department: "Design Team",
    description: "Apply to help with FSRP graphics and branding.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "portfolio", label: "Portfolio link", type: "url", required: true },
      { id: "tools", label: "Design tools you use", type: "text", required: true }
    ]
  },
  {
    id: "verification-request",
    title: "Roblox & Discord Verification",
    type: "verification",
    department: "Community",
    description: "Link your Roblox identity to your Discord account for staff review and role assignment.",
    status: "Open",
    approvedRoleId: "",
    fields: [
      { id: "roblox", label: "Exact Roblox username", type: "text", required: true },
      { id: "discordId", label: "Discord user ID", type: "text", required: true },
      { id: "verificationCode", label: "Verification code shown by staff or bot", type: "text", required: false }
    ]
  },
  {
    id: "community-feedback",
    title: "Community Feedback",
    type: "feedback",
    department: "Community",
    description: "Send suggestions, staff feedback, or website ideas.",
    status: "Open",
    fields: [
      { id: "category", label: "Category", type: "select", options: ["Staff", "Sessions", "Website", "Departments", "Other"], required: true },
      { id: "message", label: "Feedback", type: "textarea", required: true },
      { id: "discordId", label: "Discord user ID (optional)", type: "text", required: false }
    ]
  }
];

const EMPTY_STATE = {
  forms: [],
  submissions: [],
  giveaways: [],
  giveawayEntries: [],
  highlights: [],
  automationRules: [],
  departments: [],
  analytics: { days: {} },
  audit: []
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

function safeClone(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

function emptyState() {
  return safeClone(EMPTY_STATE);
}

function repairState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : emptyState();
  for (const key of ["forms", "submissions", "giveaways", "giveawayEntries", "highlights", "automationRules", "departments", "audit"]) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  if (!state.analytics || typeof state.analytics !== "object") state.analytics = { days: {} };
  if (!state.analytics.days || typeof state.analytics.days !== "object") state.analytics.days = {};
  return state;
}

function mergeForms(state) {
  const custom = Array.isArray(state.forms) ? state.forms : [];
  const map = new Map(DEFAULT_FORMS.map((form) => [form.id, safeClone(form)]));
  for (const form of custom) map.set(form.id, { ...(map.get(form.id) || {}), ...form });
  return [...map.values()];
}

function toBase64Url(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(normalized + padding), (character) => character.charCodeAt(0));
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
    const data = JSON.parse(decoder.decode(fromBase64Url(payload)));
    return data?.exp > Date.now() && LEVELS[data.role] ? data : null;
  } catch {
    return null;
  }
}

function sessionSecret(env) {
  return normalize(env.STAFF_SESSION_SECRET || env.AUTH_SECRET || env.ADMIN_TOKEN || env.OPERATIONS_TOKEN);
}

function storeFor(env) {
  return env.COMMUNITY_STATE || env.SITE_SETTINGS || null;
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

function publicForm(form) {
  return {
    id: form.id,
    title: form.title,
    type: form.type,
    department: form.department,
    description: form.description,
    status: form.status,
    opensAt: form.opensAt || "",
    closesAt: form.closesAt || "",
    fields: Array.isArray(form.fields) ? form.fields : []
  };
}

function formOpen(form) {
  if (String(form.status).toLowerCase() !== "open") return false;
  const now = Date.now();
  if (form.opensAt && Date.parse(form.opensAt) > now) return false;
  if (form.closesAt && Date.parse(form.closesAt) < now) return false;
  return true;
}

function sanitizeField(field = {}) {
  const type = ["text", "textarea", "number", "select", "url", "date", "checkbox"].includes(normalize(field.type).toLowerCase())
    ? normalize(field.type).toLowerCase()
    : "text";
  return {
    id: cleanString(field.id || field.label || crypto.randomUUID(), 80).toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 80),
    label: cleanString(field.label || "Question", 160),
    type,
    required: field.required === true,
    options: Array.isArray(field.options) ? field.options.slice(0, 30).map((option) => cleanString(option, 120)).filter(Boolean) : []
  };
}

function sanitizeForm(raw = {}) {
  return {
    id: cleanString(raw.id || raw.title || crypto.randomUUID(), 100).toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 100),
    title: cleanString(raw.title || "Untitled Form", 180),
    type: ["application", "department", "join", "appeal", "feedback", "verification"].includes(normalize(raw.type).toLowerCase()) ? normalize(raw.type).toLowerCase() : "application",
    department: cleanString(raw.department || "Community", 100),
    description: cleanLong(raw.description, 2000),
    status: ["Open", "Closed", "Draft"].includes(raw.status) ? raw.status : "Draft",
    approvedRoleId: cleanString(raw.approvedRoleId, 40),
    opensAt: cleanString(raw.opensAt, 60),
    closesAt: cleanString(raw.closesAt, 60),
    fields: Array.isArray(raw.fields) ? raw.fields.slice(0, 40).map(sanitizeField) : [],
    updatedAt: Date.now()
  };
}

function answersFor(form, rawAnswers) {
  const source = rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers) ? rawAnswers : {};
  const output = {};
  for (const field of form.fields || []) {
    const value = source[field.id];
    if (field.required && (value === undefined || value === null || normalize(value) === "")) {
      throw new Error(`${field.label} is required.`);
    }
    if (field.type === "checkbox") output[field.id] = value === true || value === "true";
    else output[field.id] = ["textarea"].includes(field.type) ? cleanLong(value, 6000) : cleanString(value, 1000);
  }
  return output;
}

function nextId(state, type) {
  const prefix = { application: "APP", department: "DEP", join: "JOIN", appeal: "APL", feedback: "FDB", verification: "VER" }[type] || "SUB";
  const max = state.submissions.reduce((highest, item) => {
    const match = String(item.caseId || "").match(/-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(5, "0")}`;
}

function addAudit(state, actor, action, target, detail = "") {
  state.audit.unshift({
    id: crypto.randomUUID(),
    actor: cleanString(actor?.name || actor || "Public User", 120),
    actorRole: cleanString(actor?.role || "public", 40),
    action: cleanString(action, 120),
    target: cleanString(target, 160),
    detail: cleanString(detail, 1600),
    createdAt: Date.now()
  });
  state.audit = state.audit.slice(0, MAX_AUDIT);
}

function webhookFor(type, env) {
  const direct = {
    application: env.DISCORD_APPLICATION_WEBHOOK,
    department: env.DISCORD_APPLICATION_WEBHOOK,
    join: env.DISCORD_APPLICATION_WEBHOOK,
    appeal: env.DISCORD_APPEAL_WEBHOOK,
    feedback: env.DISCORD_COMMUNITY_WEBHOOK,
    verification: env.DISCORD_VERIFICATION_WEBHOOK,
    giveaway: env.DISCORD_COMMUNITY_WEBHOOK,
    highlight: env.DISCORD_COMMUNITY_WEBHOOK
  }[type];
  return normalize(direct || env.DISCORD_COMMUNITY_WEBHOOK || env.DISCORD_STAFF_WEBHOOK);
}

async function sendWebhook(type, title, fields, env, color = 0x3ba7e3) {
  const url = webhookFor(type, env);
  if (!url) return { configured: false, delivered: false };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "FSRP Operations",
        avatar_url: env.PUBLIC_SITE_URL ? `${String(env.PUBLIC_SITE_URL).replace(/\/$/, "")}/assets/brand/fsrp-logo.png` : undefined,
        allowed_mentions: { parse: [] },
        embeds: [{
          title: cleanString(title, 240),
          color,
          fields: fields.slice(0, 20).map((field) => ({
            name: cleanString(field.name, 256),
            value: cleanLong(field.value || "—", 1000),
            inline: field.inline !== false
          })),
          timestamp: new Date().toISOString(),
          footer: { text: "Florida State Roleplay Operations" }
        }]
      })
    });
    return { configured: true, delivered: response.ok, status: response.status };
  } catch (error) {
    return { configured: true, delivered: false, error: cleanString(error.message, 200) };
  }
}

async function addDiscordRole(discordId, roleId, env) {
  const token = normalize(env.DISCORD_BOT_TOKEN);
  const guildId = normalize(env.DISCORD_GUILD_ID);
  const userId = cleanString(discordId, 40);
  const targetRole = cleanString(roleId, 40);
  if (!token || !guildId || !userId || !targetRole) return { configured: false, applied: false };
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(targetRole)}`, {
      method: "PUT",
      headers: { authorization: `Bot ${token}` }
    });
    return { configured: true, applied: response.ok, status: response.status };
  } catch (error) {
    return { configured: true, applied: false, error: cleanString(error.message, 200) };
  }
}

async function sendDiscordDM(discordId, message, env) {
  const token = normalize(env.DISCORD_BOT_TOKEN);
  const userId = cleanString(discordId, 40);
  if (!token || !userId) return { configured: false, delivered: false };
  try {
    const channelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ recipient_id: userId })
    });
    if (!channelResponse.ok) return { configured: true, delivered: false, status: channelResponse.status };
    const channel = await channelResponse.json();
    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: "POST",
      headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ content: cleanLong(message, 1800), allowed_mentions: { parse: [] } })
    });
    return { configured: true, delivered: messageResponse.ok, status: messageResponse.status };
  } catch (error) {
    return { configured: true, delivered: false, error: cleanString(error.message, 200) };
  }
}

function ruleMatches(rule, event) {
  if (rule.enabled === false || normalize(rule.trigger) !== event.type) return false;
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  return conditions.every((condition) => {
    const actual = String(event.payload?.[condition.field] ?? "").toLowerCase();
    const expected = String(condition.value ?? "").toLowerCase();
    if (condition.operator === "equals") return actual === expected;
    if (condition.operator === "not_equals") return actual !== expected;
    if (condition.operator === "contains") return actual.includes(expected);
    return true;
  });
}

async function runRules(state, event, env) {
  const results = [];
  for (const rule of state.automationRules.filter((entry) => ruleMatches(entry, event)).slice(0, 30)) {
    const action = normalize(rule.action);
    if (action === "discord_webhook") {
      results.push({ rule: rule.name, action, result: await sendWebhook(event.payload.type || "application", rule.name || "FSRP Automation", [
        { name: "Event", value: event.type },
        { name: "Subject", value: event.payload.subject || event.payload.caseId || "FSRP" },
        { name: "Details", value: event.payload.detail || event.payload.status || "Automation triggered", inline: false }
      ], env) });
    } else if (action === "discord_role_add") {
      results.push({ rule: rule.name, action, result: await addDiscordRole(event.payload.discordId, rule.roleId || event.payload.approvedRoleId, env) });
    } else if (action === "discord_dm") {
      results.push({ rule: rule.name, action, result: await sendDiscordDM(event.payload.discordId, rule.message || `Your FSRP request ${event.payload.caseId || ""} was updated.`, env) });
    } else if (action === "flag_review") {
      event.payload.flagged = true;
      event.payload.flagReason = cleanString(rule.message || rule.name || "Automation rule", 500);
      results.push({ rule: rule.name, action, result: { flagged: true } });
    }
  }
  return results;
}

function analyticsDay(state, date) {
  state.analytics.days[date] ||= { views: 0, visitors: [], routes: {}, submissions: 0, approvals: 0, erlcPeak: 0, erlcUnique: [] };
  return state.analytics.days[date];
}

function trimAnalytics(state) {
  const keys = Object.keys(state.analytics.days).sort().reverse();
  for (const key of keys.slice(MAX_ANALYTICS_DAYS)) delete state.analytics.days[key];
}

async function staffMetrics(store) {
  try {
    const staff = await store.get(STAFF_STATE_KEY, "json");
    const shifts = Array.isArray(staff?.shifts) ? staff.shifts : [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = shifts.filter((shift) => Number(shift.startedAt || shift.createdAt) >= cutoff);
    const byStaff = {};
    for (const shift of recent) {
      const name = cleanString(shift.staffName || shift.roblox || "Unknown", 120);
      byStaff[name] = (byStaff[name] || 0) + Number(shift.minutes || 0);
    }
    return {
      weeklyMinutes: recent.reduce((total, shift) => total + Number(shift.minutes || 0), 0),
      activeStaff: Object.keys(byStaff).length,
      leaderboard: Object.entries(byStaff).map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes).slice(0, 20)
    };
  } catch {
    return { weeklyMinutes: 0, activeStaff: 0, leaderboard: [] };
  }
}

async function erlcSnapshot(env) {
  const serverKey = normalize(env.ERLC_SERVER_KEY);
  if (!serverKey) return { configured: false };
  try {
    const response = await fetch("https://api.erlc.gg/v2/server?players=true&queue=true", {
      headers: { "server-key": serverKey, accept: "application/json" }
    });
    if (!response.ok) return { configured: true, ready: false, status: response.status };
    const data = await response.json();
    const players = Array.isArray(data.Players) ? data.Players : [];
    return {
      configured: true,
      ready: true,
      currentPlayers: Number(data.CurrentPlayers ?? players.length) || 0,
      maxPlayers: Number(data.MaxPlayers) || 0,
      queue: Number(data.Queue?.Count ?? data.Queue ?? 0) || 0,
      names: players.map((player) => cleanString(String(player.Player || "").split(":")[0], 80)).filter(Boolean)
    };
  } catch (error) {
    return { configured: true, ready: false, error: cleanString(error.message, 200) };
  }
}

function publicCatalog(state) {
  return {
    forms: mergeForms(state).filter(formOpen).map(publicForm),
    giveaways: state.giveaways.filter((item) => item.status === "Open" && (!item.endsAt || Date.parse(item.endsAt) > Date.now())).map((item) => ({
      id: item.id, title: item.title, description: item.description, endsAt: item.endsAt, requirements: item.requirements, prize: item.prize
    })),
    highlights: state.highlights.filter((item) => item.status === "Published").slice(0, 30)
  };
}

export async function onRequestGet({ env }) {
  const store = storeFor(env);
  if (!store) return json({ ok: false, ready: false, error: "SITE_SETTINGS KV is missing." }, 503);
  const state = await loadState(store);
  return json({
    ok: true,
    ready: true,
    catalog: publicCatalog(state),
    discordBotReady: Boolean(normalize(env.DISCORD_BOT_TOKEN) && normalize(env.DISCORD_GUILD_ID)),
    webhookReady: Boolean(webhookFor("application", env)),
    erlcReady: Boolean(normalize(env.ERLC_SERVER_KEY)),
    apiVersion: 1
  });
}

export async function onRequestPost({ request, env }) {
  const store = storeFor(env);
  if (!store) return json({ error: "SITE_SETTINGS KV is missing. Community Suite reuses the existing website KV." }, 503);
  const data = await body(request);
  const state = await loadState(store);
  const action = normalize(data.action).toLowerCase();

  if (action === "catalog") return json({ ok: true, catalog: publicCatalog(state), apiVersion: 1 });

  if (action === "analytics-ping") {
    const date = new Date().toISOString().slice(0, 10);
    const day = analyticsDay(state, date);
    const visitor = cleanString(data.visitorId, 100);
    const route = cleanString(data.route || "home", 80);
    day.views += 1;
    if (visitor && !day.visitors.includes(visitor)) day.visitors.push(visitor);
    day.visitors = day.visitors.slice(-5000);
    day.routes[route] = Number(day.routes[route] || 0) + 1;
    trimAnalytics(state);
    await saveState(store, state);
    return json({ ok: true });
  }

  if (action === "submit") {
    const forms = mergeForms(state);
    const form = forms.find((entry) => entry.id === data.formId);
    if (!form || !formOpen(form)) return json({ error: "That form is not currently open." }, 404);
    let answers;
    try { answers = answersFor(form, data.answers); }
    catch (error) { return json({ error: error.message }, 400); }
    const item = {
      id: crypto.randomUUID(),
      caseId: nextId(state, form.type),
      formId: form.id,
      formTitle: form.title,
      type: form.type,
      department: form.department,
      answers,
      discordId: cleanString(answers.discordId || data.discordId, 40),
      roblox: cleanString(answers.roblox || data.roblox, 80),
      subject: cleanString(answers.roblox || answers.discordId || answers.message || form.title, 160),
      status: "Pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      approvedRoleId: cleanString(form.approvedRoleId, 40)
    };
    state.submissions.unshift(item);
    state.submissions = state.submissions.slice(0, MAX_SUBMISSIONS);
    const date = new Date().toISOString().slice(0, 10);
    analyticsDay(state, date).submissions += 1;
    addAudit(state, "Public User", "Submission Received", item.caseId, `${form.title} · ${item.subject}`);
    const webhook = await sendWebhook(form.type, `${item.caseId} · ${form.title}`, [
      { name: "Subject", value: item.subject },
      { name: "Department", value: item.department },
      { name: "Status", value: item.status },
      { name: "Submitted Answers", value: Object.entries(answers).map(([key, value]) => `**${key}:** ${String(value).slice(0, 220)}`).join("\n").slice(0, 1000), inline: false }
    ], env, form.type === "appeal" ? 0xf59e0b : 0x3ba7e3);
    const automation = await runRules(state, { type: `${form.type}_received`, payload: item }, env);
    await saveState(store, state);
    return json({ ok: true, caseId: item.caseId, status: item.status, webhook, automation, apiVersion: 1 });
  }

  if (action === "giveaway-enter") {
    const giveaway = state.giveaways.find((entry) => entry.id === data.giveawayId && entry.status === "Open");
    if (!giveaway || (giveaway.endsAt && Date.parse(giveaway.endsAt) <= Date.now())) return json({ error: "That giveaway is not open." }, 404);
    const discordId = cleanString(data.discordId, 40);
    const roblox = cleanString(data.roblox, 80);
    if (!discordId && !roblox) return json({ error: "Enter a Discord ID or Roblox username." }, 400);
    const duplicate = state.giveawayEntries.some((entry) => entry.giveawayId === giveaway.id && ((discordId && entry.discordId === discordId) || (roblox && entry.roblox.toLowerCase() === roblox.toLowerCase())));
    if (duplicate) return json({ error: "You already entered this giveaway." }, 409);
    state.giveawayEntries.unshift({ id: crypto.randomUUID(), giveawayId: giveaway.id, discordId, roblox, createdAt: Date.now() });
    state.giveawayEntries = state.giveawayEntries.slice(0, 5000);
    await saveState(store, state);
    return json({ ok: true, message: "Giveaway entry recorded." });
  }

  const secret = sessionSecret(env);
  const user = await verifyStaffSession(bearer(request) || data.token, secret);
  if (!user) return json({ error: "Staff Operations session expired or is invalid. Sign into Staff Ops first." }, 401);

  if (action === "state") {
    const erlc = await erlcSnapshot(env);
    if (erlc.ready) {
      const date = new Date().toISOString().slice(0, 10);
      const day = analyticsDay(state, date);
      day.erlcPeak = Math.max(Number(day.erlcPeak || 0), erlc.currentPlayers);
      for (const name of erlc.names) if (!day.erlcUnique.includes(name)) day.erlcUnique.push(name);
      day.erlcUnique = day.erlcUnique.slice(-1000);
      trimAnalytics(state);
      await saveState(store, state);
    }
    return json({
      ok: true,
      state: { ...state, forms: mergeForms(state) },
      user,
      staffMetrics: await staffMetrics(store),
      erlc,
      apiVersion: 1
    });
  }

  if (action === "form-save") {
    if (level(user) < LEVELS.supervisor) return json({ error: "Supervisor access is required to manage forms." }, 403);
    const form = sanitizeForm(data.form);
    if (!form.fields.length) return json({ error: "Add at least one form field." }, 400);
    const index = state.forms.findIndex((entry) => entry.id === form.id);
    if (index < 0) state.forms.unshift(form); else state.forms[index] = form;
    addAudit(state, user, "Form Saved", form.id, `${form.title} · ${form.status}`);
    await saveState(store, state);
    return json({ ok: true, form, state: { ...state, forms: mergeForms(state) } });
  }

  if (action === "form-delete") {
    if (level(user) < LEVELS.hr) return json({ error: "HR access is required to delete custom forms." }, 403);
    const id = cleanString(data.id, 100);
    state.forms = state.forms.filter((entry) => entry.id !== id);
    addAudit(state, user, "Form Deleted", id);
    await saveState(store, state);
    return json({ ok: true, state: { ...state, forms: mergeForms(state) } });
  }

  if (action === "submission-review") {
    const item = state.submissions.find((entry) => entry.id === data.id || entry.caseId === data.id);
    if (!item) return json({ error: "Submission not found." }, 404);
    const needed = REVIEW_LEVEL[item.type] || LEVELS.supervisor;
    if (level(user) < needed) return json({ error: "Your role cannot review this submission." }, 403);
    const status = ["Approved", "Denied", "Needs Information", "Pending"].includes(data.status) ? data.status : "Pending";
    item.status = status;
    item.reviewNote = cleanLong(data.note, 3000);
    item.reviewedBy = user.name;
    item.reviewedByRole = user.role;
    item.reviewedAt = Date.now();
    item.updatedAt = Date.now();
    let roleResult = { configured: false, applied: false };
    if (status === "Approved" && item.discordId && item.approvedRoleId) roleResult = await addDiscordRole(item.discordId, item.approvedRoleId, env);
    const dm = item.discordId ? await sendDiscordDM(item.discordId, `Your Florida State Roleplay request ${item.caseId} is now **${status}**.${item.reviewNote ? `\n${item.reviewNote}` : ""}`, env) : { configured: false, delivered: false };
    const webhook = await sendWebhook(item.type, `${item.caseId} · ${status}`, [
      { name: "Subject", value: item.subject },
      { name: "Form", value: item.formTitle },
      { name: "Reviewed By", value: `${user.name} · ${user.role}` },
      { name: "Review Note", value: item.reviewNote || "No review note", inline: false }
    ], env, status === "Approved" ? 0x22c55e : status === "Denied" ? 0xef4444 : 0xf59e0b);
    const date = new Date().toISOString().slice(0, 10);
    if (status === "Approved") analyticsDay(state, date).approvals += 1;
    addAudit(state, user, "Submission Reviewed", item.caseId, `${status} · ${item.reviewNote}`);
    const automation = await runRules(state, { type: `${item.type}_${status.toLowerCase().replaceAll(" ", "_")}`, payload: item }, env);
    await saveState(store, state);
    return json({ ok: true, item, roleResult, dm, webhook, automation });
  }

  if (action === "giveaway-save") {
    if (level(user) < LEVELS.supervisor) return json({ error: "Supervisor access is required to manage giveaways." }, 403);
    const item = {
      id: cleanString(data.item?.id || crypto.randomUUID(), 100),
      title: cleanString(data.item?.title || "FSRP Giveaway", 180),
      description: cleanLong(data.item?.description, 2000),
      prize: cleanString(data.item?.prize, 180),
      requirements: cleanLong(data.item?.requirements, 1500),
      endsAt: cleanString(data.item?.endsAt, 80),
      status: ["Open", "Closed", "Draft"].includes(data.item?.status) ? data.item.status : "Draft",
      winner: cleanString(data.item?.winner, 120),
      updatedAt: Date.now(),
      createdAt: Number(data.item?.createdAt) || Date.now()
    };
    const index = state.giveaways.findIndex((entry) => entry.id === item.id);
    if (index < 0) state.giveaways.unshift(item); else state.giveaways[index] = item;
    addAudit(state, user, "Giveaway Saved", item.id, item.title);
    await saveState(store, state);
    return json({ ok: true, item, state });
  }

  if (action === "giveaway-pick") {
    if (level(user) < LEVELS.hr) return json({ error: "HR access is required to select giveaway winners." }, 403);
    const giveaway = state.giveaways.find((entry) => entry.id === data.id);
    if (!giveaway) return json({ error: "Giveaway not found." }, 404);
    const entries = state.giveawayEntries.filter((entry) => entry.giveawayId === giveaway.id);
    if (!entries.length) return json({ error: "No entries are available." }, 409);
    const winner = entries[Math.floor(Math.random() * entries.length)];
    giveaway.winner = winner.roblox || winner.discordId;
    giveaway.status = "Closed";
    giveaway.closedAt = Date.now();
    giveaway.closedBy = user.name;
    addAudit(state, user, "Giveaway Winner Selected", giveaway.id, giveaway.winner);
    const webhook = await sendWebhook("giveaway", `Giveaway Winner · ${giveaway.title}`, [
      { name: "Winner", value: giveaway.winner },
      { name: "Prize", value: giveaway.prize || "FSRP prize" },
      { name: "Entries", value: String(entries.length) }
    ], env, 0xffd467);
    await saveState(store, state);
    return json({ ok: true, giveaway, winner, webhook });
  }

  if (action === "highlight-save") {
    if (level(user) < LEVELS.supervisor) return json({ error: "Supervisor access is required to manage highlights." }, 403);
    const item = {
      id: cleanString(data.item?.id || crypto.randomUUID(), 100),
      title: cleanString(data.item?.title || "Community Highlight", 180),
      description: cleanLong(data.item?.description, 2000),
      messageUrl: cleanString(data.item?.messageUrl, 600),
      imageUrl: cleanString(data.item?.imageUrl, 600),
      submittedBy: cleanString(data.item?.submittedBy, 120),
      reactions: Math.max(0, Number(data.item?.reactions) || 0),
      status: ["Pending", "Published", "Hidden"].includes(data.item?.status) ? data.item.status : "Pending",
      createdAt: Number(data.item?.createdAt) || Date.now(),
      updatedAt: Date.now()
    };
    const index = state.highlights.findIndex((entry) => entry.id === item.id);
    if (index < 0) state.highlights.unshift(item); else state.highlights[index] = item;
    addAudit(state, user, "Reaction Board Updated", item.id, `${item.title} · ${item.status}`);
    await saveState(store, state);
    return json({ ok: true, item, state });
  }

  if (action === "automation-save") {
    if (level(user) < LEVELS.hr) return json({ error: "HR access is required to manage automation." }, 403);
    const rule = {
      id: cleanString(data.rule?.id || crypto.randomUUID(), 100),
      name: cleanString(data.rule?.name || "Automation Rule", 180),
      trigger: cleanString(data.rule?.trigger, 100),
      action: cleanString(data.rule?.action, 100),
      message: cleanLong(data.rule?.message, 1500),
      roleId: cleanString(data.rule?.roleId, 40),
      enabled: data.rule?.enabled !== false,
      conditions: Array.isArray(data.rule?.conditions) ? data.rule.conditions.slice(0, 8).map((condition) => ({
        field: cleanString(condition.field, 80),
        operator: ["equals", "not_equals", "contains"].includes(condition.operator) ? condition.operator : "equals",
        value: cleanString(condition.value, 300)
      })) : [],
      updatedAt: Date.now()
    };
    const index = state.automationRules.findIndex((entry) => entry.id === rule.id);
    if (index < 0) state.automationRules.unshift(rule); else state.automationRules[index] = rule;
    addAudit(state, user, "Automation Rule Saved", rule.id, `${rule.trigger} → ${rule.action}`);
    await saveState(store, state);
    return json({ ok: true, rule, state });
  }

  if (action === "department-save") {
    if (level(user) < LEVELS.hr) return json({ error: "HR access is required to manage department hierarchy." }, 403);
    const item = {
      id: cleanString(data.item?.id || data.item?.code || crypto.randomUUID(), 80).toLowerCase(),
      name: cleanString(data.item?.name, 160),
      code: cleanString(data.item?.code, 20).toUpperCase(),
      discordRoleId: cleanString(data.item?.discordRoleId, 40),
      leadershipRoleId: cleanString(data.item?.leadershipRoleId, 40),
      applicationFormId: cleanString(data.item?.applicationFormId, 100),
      access: Array.isArray(data.item?.access) ? data.item.access.slice(0, 30).map((entry) => cleanString(entry, 100)).filter(Boolean) : [],
      hierarchy: Array.isArray(data.item?.hierarchy) ? data.item.hierarchy.slice(0, 40).map((entry) => cleanString(entry, 100)).filter(Boolean) : [],
      updatedAt: Date.now()
    };
    const index = state.departments.findIndex((entry) => entry.id === item.id);
    if (index < 0) state.departments.unshift(item); else state.departments[index] = item;
    addAudit(state, user, "Department Hierarchy Saved", item.id, item.name);
    await saveState(store, state);
    return json({ ok: true, item, state });
  }

  if (action === "discord-test") {
    if (level(user) < LEVELS.hr) return json({ error: "HR access is required to test Discord integration." }, 403);
    return json({ ok: true, webhook: await sendWebhook("application", "FSRP Community Suite Test", [
      { name: "Triggered By", value: `${user.name} · ${user.role}` },
      { name: "Result", value: "Community Suite Discord delivery is working." }
    ], env) });
  }

  return json({ error: "Unknown Community Suite action." }, 400);
}
