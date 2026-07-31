import { json } from "../lib/http.js";

function has(value) { return Boolean(String(value ?? "").trim()); }

export async function onRequestGet({ env }) {
  const cadCodes = {
    FBI: has(env.CAD_FBI_CODE),
    FHP: has(env.CAD_FHP_CODE),
    OCSO: has(env.CAD_OCSO_CODE),
    FFW: has(env.CAD_FFW_CODE),
    Staff: has(env.CAD_STAFF_CODE)
  };
  const required = {
    SITE_SETTINGS: Boolean(env.SITE_SETTINGS),
    ADMIN_TOKEN: has(env.ADMIN_TOKEN),
    OPERATIONS_TOKEN: has(env.OPERATIONS_TOKEN),
    CAD_TOKEN_SECRET: has(env.CAD_TOKEN_SECRET || env.AUTH_SECRET || env.ADMIN_TOKEN),
    STAFF_SESSION_SECRET: has(env.STAFF_SESSION_SECRET || env.AUTH_SECRET || env.ADMIN_TOKEN),
    STAFF_PANEL_CODE: has(env.STAFF_PANEL_CODE),
    STAFF_SUPERVISOR_CODE: has(env.STAFF_SUPERVISOR_CODE),
    STAFF_HR_CODE: has(env.STAFF_HR_CODE)
  };
  const optional = {
    MEDIA_BUCKET: Boolean(env.MEDIA_BUCKET),
    ERLC_SERVER_KEY: has(env.ERLC_SERVER_KEY),
    RADIO_WORKER_URL: has(env.RADIO_WORKER_URL),
    RADIO_SESSION_SECRET: has(env.RADIO_SESSION_SECRET),
    TURN: has(env.TURN_KEY_ID) && has(env.TURN_API_TOKEN),
    DiscordBot: has(env.DISCORD_BOT_TOKEN) && has(env.DISCORD_GUILD_ID),
    RobloxOAuth: has(env.ROBLOX_OAUTH_CLIENT_ID) && has(env.ROBLOX_OAUTH_CLIENT_SECRET),
    VerificationAutoRole: has(env.DISCORD_BOT_TOKEN) && has(env.DISCORD_GUILD_ID) && has(env.DISCORD_VERIFIED_ROLE_ID) && has(env.VERIFICATION_LINK_SECRET),
    YouTubeLive: has(env.YOUTUBE_API_KEY),
    TwitchLive: has(env.TWITCH_CLIENT_ID) && has(env.TWITCH_CLIENT_SECRET)
  };
  const missingRequired = Object.entries(required).filter(([, ready]) => !ready).map(([name]) => name);
  const configuredAgencies = Object.entries(cadCodes).filter(([, ready]) => ready).map(([name]) => name);
  return json({
    ok: missingRequired.length === 0,
    version: "4.2.0",
    required,
    optional,
    cadCodes,
    configuredAgencies,
    missingRequired,
    notes: {
      CAD_STATE: "Not required. CAD reuses SITE_SETTINGS.",
      StaffState: "Not required. Staff Operations reuses SITE_SETTINGS.",
      CommandSuiteState: "Not required. Command Suite reuses SITE_SETTINGS.",
      CommunitySuiteState: "Not required. Community Suite reuses SITE_SETTINGS."
    }
  }, missingRequired.length ? 503 : 200);
}
