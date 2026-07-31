import { json } from "../lib/http.js";

const COMMUNITY_KEY = "fsrp_community_suite_v1";
const OAUTH_TTL_SECONDS = 600;
const encoder = new TextEncoder();

function normalize(value) { return String(value ?? "").normalize("NFKC").trim(); }
function clean(value, max = 300) { return normalize(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max); }
function base64url(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function randomToken(size = 24) { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return base64url(bytes); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]); }
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}
async function validDiscordChallenge(discordId, expires, signature, secret) {
  if (!discordId || !expires || !signature || !secret || Number(expires) < Date.now()) return false;
  const expected = await hmac(`${discordId}.${expires}`, secret);
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let index = 0; index < expected.length; index += 1) result |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return result === 0;
}
function redirectUri(request, env) {
  return normalize(env.ROBLOX_OAUTH_REDIRECT_URI) || `${new URL(request.url).origin}/api/roblox-oauth?action=callback`;
}
async function addDiscordRole(env, discordId) {
  if (!discordId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.DISCORD_VERIFIED_ROLE_ID) return { attempted: false };
  const response = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${discordId}/roles/${env.DISCORD_VERIFIED_ROLE_ID}`, {
    method: "PUT",
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  return { attempted: true, ok: response.ok, status: response.status };
}
function htmlResult(title, message, success = true) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#03070d;color:#fff;font-family:system-ui}.card{max-width:560px;margin:20px;padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(11,25,40,.9);box-shadow:0 25px 80px #000}.status{color:${success ? "#64e69a" : "#ff7180"};font-weight:900}.btn{display:inline-block;margin-top:15px;padding:11px 16px;border-radius:999px;background:#52c7ff;color:#03101a;text-decoration:none;font-weight:900}</style></head><body><article class="card"><div class="status">${success ? "VERIFIED" : "ACTION REQUIRED"}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="btn" href="/#community-suite">Return to FSRP</a></article></body></html>`, { status: success ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function onRequestGet({ request, env }) {
  if (!env.SITE_SETTINGS) return json({ error: "SITE_SETTINGS KV is required." }, 503);
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "start";
  const clientId = normalize(env.ROBLOX_OAUTH_CLIENT_ID);
  const clientSecret = normalize(env.ROBLOX_OAUTH_CLIENT_SECRET);
  if (!clientId || !clientSecret) return json({ error: "Roblox OAuth is not configured. Add ROBLOX_OAUTH_CLIENT_ID and ROBLOX_OAUTH_CLIENT_SECRET." }, 503);

  if (action === "start") {
    const discordId = clean(url.searchParams.get("discordId"), 40);
    const expires = clean(url.searchParams.get("expires"), 30);
    const signature = clean(url.searchParams.get("signature"), 120);
    const discordTrusted = await validDiscordChallenge(discordId, expires, signature, normalize(env.VERIFICATION_LINK_SECRET));
    const state = randomToken();
    await env.SITE_SETTINGS.put(`roblox_oauth_state:${state}`, JSON.stringify({ discordId, discordTrusted, createdAt: Date.now() }), { expirationTtl: OAUTH_TTL_SECONDS });
    const authorize = new URL("https://apis.roblox.com/oauth/v1/authorize");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri(request, env));
    authorize.searchParams.set("scope", "openid profile");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("prompt", "consent");
    return Response.redirect(authorize.toString(), 302);
  }

  if (action !== "callback") return json({ error: "Unknown OAuth action." }, 400);
  const code = normalize(url.searchParams.get("code"));
  const stateToken = normalize(url.searchParams.get("state"));
  if (!code || !stateToken) return htmlResult("Verification could not start", "Roblox did not return a usable authorization code.", false);
  const state = await env.SITE_SETTINGS.get(`roblox_oauth_state:${stateToken}`, "json");
  await env.SITE_SETTINGS.delete(`roblox_oauth_state:${stateToken}`);
  if (!state || Date.now() - Number(state.createdAt) > OAUTH_TTL_SECONDS * 1000) return htmlResult("Verification link expired", "Start verification again from the FSRP website or Discord bot.", false);

  const tokenResponse = await fetch("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri(request, env) })
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) return htmlResult("Roblox verification failed", tokenData.error_description || "The authorization code could not be exchanged.", false);
  const userResponse = await fetch("https://apis.roblox.com/oauth/v1/userinfo", { headers: { authorization: `Bearer ${tokenData.access_token}` } });
  const profile = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !profile.sub) return htmlResult("Roblox profile unavailable", "Roblox did not return a verified user profile.", false);

  const community = (await env.SITE_SETTINGS.get(COMMUNITY_KEY, "json")) || {};
  community.verifiedIdentities = Array.isArray(community.verifiedIdentities) ? community.verifiedIdentities : [];
  community.submissions = Array.isArray(community.submissions) ? community.submissions : [];
  community.audit = Array.isArray(community.audit) ? community.audit : [];
  const identity = {
    id: crypto.randomUUID(),
    robloxUserId: clean(profile.sub, 40),
    robloxUsername: clean(profile.preferred_username || profile.name, 80),
    displayName: clean(profile.name || profile.nickname, 80),
    avatarUrl: clean(profile.picture, 500),
    profileUrl: clean(profile.profile, 500),
    discordId: clean(state.discordId, 40),
    discordTrusted: Boolean(state.discordTrusted),
    verifiedAt: Date.now(),
    status: state.discordTrusted ? "Verified" : "Roblox Verified · Discord Review Required"
  };
  community.verifiedIdentities = community.verifiedIdentities.filter((item) => item.robloxUserId !== identity.robloxUserId && (!identity.discordId || item.discordId !== identity.discordId));
  community.verifiedIdentities.unshift(identity);
  community.verifiedIdentities = community.verifiedIdentities.slice(0, 3000);
  community.submissions.unshift({
    id: crypto.randomUUID(), caseId: `VER-${String(Date.now()).slice(-7)}`, formId: "roblox-oauth", formTitle: "Roblox OAuth Verification", type: "verification", department: "Community", subject: identity.robloxUsername, status: state.discordTrusted ? "Approved" : "Pending Review", answers: { robloxUserId: identity.robloxUserId, robloxUsername: identity.robloxUsername, discordId: identity.discordId || "Not linked", trustedDiscordLink: identity.discordTrusted ? "Yes" : "No" }, createdAt: Date.now()
  });
  community.submissions = community.submissions.slice(0, 2200);
  const roleResult = state.discordTrusted ? await addDiscordRole(env, identity.discordId) : { attempted: false };
  community.audit.unshift({ id: crypto.randomUUID(), action: "roblox-oauth-verified", actor: identity.robloxUsername, details: `Roblox ${identity.robloxUserId}; Discord ${identity.discordId || "not linked"}; role ${roleResult.ok ? "assigned" : roleResult.attempted ? "assignment failed" : "not attempted"}`, createdAt: Date.now() });
  community.audit = community.audit.slice(0, 2500);
  await env.SITE_SETTINGS.put(COMMUNITY_KEY, JSON.stringify(community));
  return htmlResult("Roblox account verified", state.discordTrusted ? `${identity.robloxUsername} is linked to your Discord verification request.` : `${identity.robloxUsername} is verified. Staff must review the Discord account link before assigning roles.`);
}
