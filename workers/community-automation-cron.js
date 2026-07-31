const COMMUNITY_KEY = "fsrp_community_suite_v1";
const STAFF_KEY = "fsrp_staff_operations_v1";
const MAX_DAYS = 70;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function normalize(value) { return String(value ?? "").trim(); }
function dayKey(time = Date.now()) { return new Date(time).toISOString().slice(0, 10); }

async function readJson(kv, key, fallback) {
  try { return (await kv.get(key, "json")) || structuredClone(fallback); } catch { return structuredClone(fallback); }
}

async function erlcSnapshot(env) {
  const serverKey = normalize(env.ERLC_SERVER_KEY);
  if (!serverKey) return null;
  try {
    const response = await fetch("https://api.erlc.gg/v2/server", {
      headers: { "server-key": serverKey, accept: "application/json" },
      cf: { cacheTtl: 0 }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return {
      players: Number(payload.CurrentPlayers) || (Array.isArray(payload.Players) ? payload.Players.length : 0),
      maxPlayers: Number(payload.MaxPlayers) || null,
      queue: Array.isArray(payload.Queue) ? payload.Queue.length : 0,
      uniquePlayers: Array.isArray(payload.Players) ? new Set(payload.Players.map((entry) => String(entry.Player || "").split(":").at(-1))).size : 0
    };
  } catch { return null; }
}

async function postDiscord(env, title, description) {
  const url = normalize(env.DISCORD_AUTOMATION_WEBHOOK || env.DISCORD_STAFF_WEBHOOK);
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "FSRP Automation", embeds: [{ title, description, color: 3447003, timestamp: new Date().toISOString() }] })
    });
    return response.ok;
  } catch { return false; }
}

async function run(env) {
  if (!env.SITE_SETTINGS) return { ok: false, error: "SITE_SETTINGS binding missing" };
  const community = await readJson(env.SITE_SETTINGS, COMMUNITY_KEY, { giveaways: [], analytics: { days: {} }, audit: [] });
  const staff = await readJson(env.SITE_SETTINGS, STAFF_KEY, { shifts: [], loa: [] });
  community.giveaways = Array.isArray(community.giveaways) ? community.giveaways : [];
  community.analytics = community.analytics && typeof community.analytics === "object" ? community.analytics : { days: {} };
  community.analytics.days = community.analytics.days && typeof community.analytics.days === "object" ? community.analytics.days : {};
  community.audit = Array.isArray(community.audit) ? community.audit : [];

  const now = Date.now();
  const closed = [];
  for (const giveaway of community.giveaways) {
    const endsAt = Date.parse(giveaway.endsAt || "");
    if (giveaway.status === "Open" && Number.isFinite(endsAt) && endsAt <= now) {
      giveaway.status = "Closed";
      giveaway.closedAt = now;
      closed.push(giveaway.title || giveaway.id);
    }
  }

  const live = await erlcSnapshot(env);
  const today = dayKey(now);
  const current = community.analytics.days[today] || { snapshots: 0, peakPlayers: 0, uniquePlayers: 0, queuePeak: 0 };
  if (live) {
    current.snapshots += 1;
    current.peakPlayers = Math.max(Number(current.peakPlayers) || 0, live.players);
    current.uniquePlayers = Math.max(Number(current.uniquePlayers) || 0, live.uniquePlayers);
    current.queuePeak = Math.max(Number(current.queuePeak) || 0, live.queue);
    current.lastSnapshot = live;
  }
  current.updatedAt = now;
  community.analytics.days[today] = current;
  const keys = Object.keys(community.analytics.days).sort();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete community.analytics.days[key];

  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weeklyMinutes = new Map();
  for (const shift of Array.isArray(staff.shifts) ? staff.shifts : []) {
    if ((Number(shift.endedAt) || Number(shift.startedAt) || 0) < weekAgo) continue;
    const id = shift.userId || shift.username || shift.name || "unknown";
    weeklyMinutes.set(id, (weeklyMinutes.get(id) || 0) + Math.max(0, Number(shift.minutes) || 0));
  }
  const activeLoa = new Set((Array.isArray(staff.loa) ? staff.loa : []).filter((entry) => entry.status === "Approved" && Date.parse(entry.endDate || 0) >= now).map((entry) => entry.userId || entry.username));
  const belowTarget = [...weeklyMinutes.entries()].filter(([id, minutes]) => minutes < Number(env.STAFF_WEEKLY_MINUTES_TARGET || 120) && !activeLoa.has(id)).map(([id, minutes]) => ({ id, minutes }));

  community.audit.unshift({ id: crypto.randomUUID(), action: "automation-run", actor: "FSRP Automation", details: `Closed ${closed.length} giveaways; captured ${live ? "ER:LC snapshot" : "no ER:LC snapshot"}; ${belowTarget.length} active staff below weekly target.`, createdAt: now });
  community.audit = community.audit.slice(0, 2500);
  await env.SITE_SETTINGS.put(COMMUNITY_KEY, JSON.stringify(community));

  if (closed.length || belowTarget.length) {
    await postDiscord(env, "FSRP Automation Report", `${closed.length} giveaway(s) closed automatically.\n${belowTarget.length} active staff member(s) are below the weekly target; approved LOAs were excluded.`);
  }
  return { ok: true, closedGiveaways: closed.length, erlcSnapshot: live, belowWeeklyTarget: belowTarget.length, ranAt: now };
}

export default {
  async scheduled(_controller, env, ctx) { ctx.waitUntil(run(env)); },
  async fetch(request, env) {
    const expected = normalize(env.AUTOMATION_CRON_TOKEN);
    const supplied = normalize(request.headers.get("x-automation-token"));
    if (!expected || !supplied || expected !== supplied) return json({ error: "Automation authorization failed" }, 401);
    return json(await run(env));
  }
};
