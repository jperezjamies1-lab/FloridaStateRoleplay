import { json, preflight } from "../lib/util.js";

const CACHE_KEY = "live-counts-cache";
const CACHE_TTL_SECONDS = 300;

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.SITE_SETTINGS) return json({ error: "SITE_SETTINGS KV binding is missing" }, 500);

  const cached = await env.SITE_SETTINGS.get(CACHE_KEY, { type: "json" });
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_SECONDS * 1000) {
    return json({ ok: true, cached: true, counts: cached.counts, fetchedAt: cached.fetchedAt });
  }

  const [discord, roblox, youtube] = await Promise.all([
    fetchDiscord(env), fetchRoblox(env), fetchYouTube(env)
  ]);
  const counts = { discord, roblox, youtube };
  const fetchedAt = Date.now();

  try {
    await env.SITE_SETTINGS.put(
      CACHE_KEY,
      JSON.stringify({ counts, fetchedAt }),
      { expirationTtl: CACHE_TTL_SECONDS }
    );
  } catch {}

  return json({ ok: true, cached: false, counts, fetchedAt });
}

async function fetchDiscord(env) {
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID) {
    try {
      const response = await fetch(
        `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}?with_counts=true`,
        { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
      );
      if (!response.ok) throw new Error(`Discord API ${response.status}`);
      const data = await response.json();
      return {
        configured: true,
        members: data.approximate_member_count ?? null,
        online: data.approximate_presence_count ?? null,
      };
    } catch (error) {
      return { configured: true, error: String(error.message || error), members: null, online: null };
    }
  }

  try {
    const response = await fetch(
      "https://discord.com/api/v10/invites/fosrp?with_counts=true"
    );
    if (!response.ok) throw new Error("Invite preview unavailable");
    const data = await response.json();
    return {
      configured: true,
      members: data.approximate_member_count ?? null,
      online: data.approximate_presence_count ?? null,
      source: "invite",
    };
  } catch {
    return { configured: false, members: null, online: null };
  }
}

async function fetchRoblox(env) {
  if (!env.ROBLOX_GROUP_ID) return { configured: false, members: null };
  try {
    const response = await fetch(
      `https://groups.roblox.com/v1/groups/${env.ROBLOX_GROUP_ID}`
    );
    if (!response.ok) throw new Error(`Roblox API ${response.status}`);
    const data = await response.json();
    return { configured: true, members: data.memberCount ?? null, name: data.name || null };
  } catch (error) {
    return { configured: true, error: String(error.message || error), members: null };
  }
}

async function fetchYouTube(env) {
  if (!env.YOUTUBE_API_KEY || !env.YOUTUBE_CHANNEL_ID) {
    return { configured: false, subscribers: null, videos: null };
  }
  try {
    const url = "https://www.googleapis.com/youtube/v3/channels"
      + `?part=statistics&id=${env.YOUTUBE_CHANNEL_ID}&key=${env.YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`YouTube API ${response.status}`);
    const data = await response.json();
    const stats = data.items?.[0]?.statistics;
    if (!stats) throw new Error("Channel not found");
    return {
      configured: true,
      subscribers: stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount),
      videos: Number(stats.videoCount),
    };
  } catch (error) {
    return {
      configured: true, error: String(error.message || error),
      subscribers: null, videos: null
    };
  }
}
