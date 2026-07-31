import { json } from "../lib/http.js";

const CONTENT_KEY = "fsrp_v3_content";
const ENDPOINT_CACHE_SECONDS = 120;
const YOUTUBE_CACHE_SECONDS = 900;
let twitchTokenCache = { token: "", expiresAt: 0 };

function keywordsMatch(text, keywords) {
  const haystack = String(text || "").toLowerCase();
  return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

async function getTwitchToken(env) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return "";
  if (twitchTokenCache.token && twitchTokenCache.expiresAt > Date.now() + 60_000) return twitchTokenCache.token;
  const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(env.TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(env.TWITCH_CLIENT_SECRET)}&grant_type=client_credentials`, { method: "POST" });
  if (!response.ok) return "";
  const data = await response.json();
  twitchTokenCache = {
    token: data.access_token || "",
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 3600)) * 1000,
  };
  return twitchTokenCache.token;
}

async function twitchStatuses(streamers, env, keywords) {
  const usernames = streamers.map((item) => item.username).filter(Boolean).slice(0, 100);
  if (!usernames.length || !env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return new Map();
  const token = await getTwitchToken(env);
  if (!token) return new Map();
  const query = usernames.map((name) => `user_login=${encodeURIComponent(name)}`).join("&");
  const response = await fetch(`https://api.twitch.tv/helix/streams?${query}`, {
    headers: { "Client-ID": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return new Map();
  const data = await response.json();
  return new Map((data.data || []).map((stream) => [stream.user_login.toLowerCase(), {
    live: keywordsMatch(`${stream.title} ${stream.game_name}`, keywords),
    liveTitle: stream.title,
    liveUrl: `https://www.twitch.tv/${stream.user_login}`,
    viewers: stream.viewer_count,
    source: "twitch-api",
  }]));
}

async function youtubeStatus(item, env, keywords) {
  if (!env.YOUTUBE_API_KEY || !item.channelId) return null;
  const cache = caches.default;
  const cacheKey = new Request(`https://fsrp-stream-cache.invalid/youtube/${encodeURIComponent(item.channelId)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", item.channelId);
  url.searchParams.set("eventType", "live");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("key", env.YOUTUBE_API_KEY);
  const response = await fetch(url);
  if (!response.ok) return null;
  const video = (await response.json()).items?.[0];
  const result = video ? {
    live: keywordsMatch(`${video.snippet?.title || ""} ${video.snippet?.description || ""}`, keywords),
    liveTitle: video.snippet?.title || "Live on YouTube",
    liveUrl: `https://www.youtube.com/watch?v=${video.id?.videoId}`,
    source: "youtube-api",
  } : { live: false, source: "youtube-api" };
  await cache.put(cacheKey, new Response(JSON.stringify(result), { headers: { "content-type": "application/json", "cache-control": `public,max-age=${YOUTUBE_CACHE_SECONDS}` } }));
  return result;
}

export async function onRequestGet({ request, env }) {
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/streamers?cached=1`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let content = null;
  if (env.SITE_SETTINGS) {
    content = await env.SITE_SETTINGS.get(CONTENT_KEY, "json");
    if (!content) {
      const legacy = await env.SITE_SETTINGS.get("live", "json");
      const raw = legacy?.[CONTENT_KEY];
      if (raw) {
        try { content = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { content = null; }
      }
    }
  }
  const streamers = (content?.streamers || []).filter((item) => item.enabled !== false).slice(0, 24);
  const keywords = (content?.streamerKeywords || ["FSRP", "Florida State Roleplay", "ER:LC"]).filter(Boolean).slice(0, 12);
  const twitchMap = await twitchStatuses(streamers.filter((item) => item.platform === "twitch"), env, keywords);

  const results = [];
  for (const item of streamers) {
    let status = null;
    if (item.manualLive) {
      status = { live: true, liveTitle: item.manualTitle || "Playing Florida State Roleplay", liveUrl: item.url, source: "manager" };
    } else if (item.platform === "youtube") {
      status = await youtubeStatus(item, env, keywords);
    } else if (item.platform === "twitch") {
      status = twitchMap.get(String(item.username || "").toLowerCase()) || { live: false, source: "twitch-api" };
    } else if (item.platform === "tiktok") {
      status = { live: false, source: "manager-required" };
    }
    results.push({
      id: item.id,
      name: item.name,
      platform: item.platform,
      username: item.username,
      channelId: item.channelId,
      url: item.url,
      avatarUrl: item.avatarUrl,
      live: Boolean(status?.live),
      liveTitle: status?.liveTitle || "",
      liveUrl: status?.liveUrl || item.url,
      source: status?.source || "not-configured",
    });
  }

  const response = json({ configured: Boolean(env.SITE_SETTINGS), checkedAt: Date.now(), streamers: results }, 200, { "cache-control": `public, max-age=${ENDPOINT_CACHE_SECONDS}` });
  await cache.put(cacheKey, response.clone());
  return response;
}
