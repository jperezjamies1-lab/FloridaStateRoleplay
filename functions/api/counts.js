// GET /api/counts
// Public, cached automatic follower/member counts for Discord, Roblox, and
// YouTube. TikTok and Instagram have no reliable public counts API, so
// they're intentionally excluded here -- the front end reads those two
// manually-entered numbers from /api/settings instead.
//
// Optional Cloudflare secrets (any that are missing are simply omitted from
// the response so the panel can fall back to "not configured"):
//   DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
//   YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID
//   ROBLOX_GROUP_ID
// Required KV binding: SITE_SETTINGS (used as a 5-minute cache, plus a
// longer-lived "last known good" fallback per platform)

import { json, preflight } from "../lib/util.js";

const CACHE_KEY = "live-counts-cache";
const CACHE_TTL_SECONDS = 300;
const LAST_GOOD_KEY = "live-counts-last-good";
const LAST_GOOD_TTL_SECONDS = 60 * 60 * 24; // 1 day -- generous fallback window

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.SITE_SETTINGS) return json({ error: "SITE_SETTINGS KV binding is missing" }, 500);

  const cached = await env.SITE_SETTINGS.get(CACHE_KEY, { type: "json" });
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_SECONDS * 1000) {
    return json({ ok: true, cached: true, counts: cached.counts, fetchedAt: cached.fetchedAt });
  }

  const lastGood = (await env.SITE_SETTINGS.get(LAST_GOOD_KEY, { type: "json" })) || {};

  const [discord, roblox, youtube] = await Promise.all([
    fetchDiscord(env, lastGood.discord),
    fetchRoblox(env, lastGood.roblox),
    fetchYouTube(env, lastGood.youtube),
  ]);

  const counts = { discord, roblox, youtube };
  const fetchedAt = Date.now();

  try {
    await env.SITE_SETTINGS.put(CACHE_KEY, JSON.stringify({ counts, fetchedAt }), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
    // Only remember platforms that actually returned a real number, so a
    // transient outage on one platform doesn't erase another's last-good
    // value, and so we never persist nulls as "last good".
    const nextGood = { ...lastGood };
    if (discord.configured && !discord.error) nextGood.discord = discord;
    if (roblox.configured && !roblox.error) nextGood.roblox = roblox;
    if (youtube.configured && !youtube.error) nextGood.youtube = youtube;
    await env.SITE_SETTINGS.put(LAST_GOOD_KEY, JSON.stringify(nextGood), {
      expirationTtl: LAST_GOOD_TTL_SECONDS,
    });
  } catch {
    /* cache write failing shouldn't break the response */
  }

  return json({ ok: true, cached: false, counts, fetchedAt });
}

// If a live fetch fails but we have a recent last-known-good value for this
// platform, fall back to it (flagged as stale) instead of showing a bare
// error -- this is real previously-fetched data, never an invented number.
function withFallback(result, lastGoodForPlatform) {
  if (!result.error || !lastGoodForPlatform) return result;
  return { ...lastGoodForPlatform, stale: true, error: result.error };
}

async function fetchDiscord(env, lastGoodForPlatform) {
  // Prefer the bot-backed guild endpoint when configured. If it is not yet
  // configured (or temporarily fails), fall back to Discord's public invite
  // preview so launch-day member/online counts can still work without exposing
  // a token in the browser.
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}?with_counts=true`,
        { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
      );
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Bot token invalid or missing server access" : `Discord API ${res.status}`);
      const data = await res.json();
      return {
        configured: true,
        source: "bot",
        members: Number.isFinite(data.approximate_member_count) ? data.approximate_member_count : null,
        online: Number.isFinite(data.approximate_presence_count) ? data.approximate_presence_count : null,
      };
    } catch (error) {
      const inviteFallback = await fetchDiscordInvitePreview();
      if (!inviteFallback.error) return inviteFallback;
      return withFallback({ configured: true, error: String(error.message || error), members: null, online: null }, lastGoodForPlatform);
    }
  }

  return fetchDiscordInvitePreview();
}

async function fetchDiscordInvitePreview() {
  try {
    const res = await fetch("https://discord.com/api/v10/invites/fosrp?with_counts=true&with_expiration=true");
    if (!res.ok) throw new Error(`Discord invite API ${res.status}`);
    const data = await res.json();
    return {
      configured: true,
      source: "invite",
      members: Number.isFinite(data.approximate_member_count) ? data.approximate_member_count : null,
      online: Number.isFinite(data.approximate_presence_count) ? data.approximate_presence_count : null,
    };
  } catch (error) {
    return { configured: false, error: String(error.message || error), members: null, online: null };
  }
}

async function fetchRoblox(env, lastGoodForPlatform) {
  if (!env.ROBLOX_GROUP_ID) return { configured: false, members: null };
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${env.ROBLOX_GROUP_ID}`);
    if (!res.ok) throw new Error(res.status === 404 ? "Roblox group ID not found" : `Roblox API ${res.status}`);
    const data = await res.json();
    return {
      configured: true,
      members: Number.isFinite(data.memberCount) ? data.memberCount : null,
      name: data.name || null,
    };
  } catch (error) {
    return withFallback({ configured: true, error: String(error.message || error), members: null }, lastGoodForPlatform);
  }
}

async function fetchYouTube(env, lastGoodForPlatform) {
  if (!env.YOUTUBE_API_KEY || !env.YOUTUBE_CHANNEL_ID) {
    return { configured: false, subscribers: null, videos: null };
  }
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${env.YOUTUBE_CHANNEL_ID}&key=${env.YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (res.status === 403) throw new Error("YouTube API quota exceeded or key restricted");
    if (!res.ok) throw new Error(`YouTube API ${res.status}`);
    const data = await res.json();
    const stats = data.items?.[0]?.statistics;
    if (!stats) throw new Error("Channel not found -- check YOUTUBE_CHANNEL_ID is the UC... ID, not the @handle");
    return {
      configured: true,
      subscribers: stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount),
      hiddenByChannel: Boolean(stats.hiddenSubscriberCount),
      videos: Number(stats.videoCount),
    };
  } catch (error) {
    return withFallback({ configured: true, error: String(error.message || error), subscribers: null, videos: null }, lastGoodForPlatform);
  }
}
