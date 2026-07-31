const encoder = new TextEncoder();
function b64url(bytes) { let raw = ""; for (const byte of bytes) raw += String.fromCharCode(byte); return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
async function signVerification(discordId, expires, secret) {
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${discordId}.${expires}`))));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function hexBytes(value) {
  const clean = String(value || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(clean)) throw new Error("DISCORD_PUBLIC_KEY is invalid");
  return Uint8Array.from(clean.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

async function verifyDiscord(request, publicKey) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp || !publicKey) return { valid: false, raw: "" };
  const raw = await request.text();
  try {
    const key = await crypto.subtle.importKey("raw", hexBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexBytes(signature),
      encoder.encode(timestamp + raw)
    );
    return { valid, raw };
  } catch {
    return { valid: false, raw };
  }
}

function option(interaction, name) {
  return interaction?.data?.options?.find((entry) => entry.name === name)?.value;
}

function siteUrl(env) {
  return String(env.FSRP_SITE_URL || "https://YOUR-PAGES-DOMAIN.pages.dev").replace(/\/$/, "");
}

function linkButton(label, url) {
  return { type: 2, style: 5, label, url };
}

function response(content, buttons = [], ephemeral = false) {
  return json({
    type: 4,
    data: {
      content,
      flags: ephemeral ? 64 : 0,
      components: buttons.length ? [{ type: 1, components: buttons.slice(0, 5) }] : undefined
    }
  });
}

async function statusCommand(env) {
  const site = siteUrl(env);
  let summary = "FSRP website services are available.";
  try {
    const res = await fetch(`${site}/api/counts`, { cf: { cacheTtl: 60, cacheEverything: true } });
    const data = await res.json();
    const discord = data?.counts?.discord;
    if (res.ok && discord?.configured) {
      summary = `FSRP Community: ${discord.members ?? "—"} members · ${discord.online ?? "—"} online.`;
    }
  } catch {
    summary = "FSRP status could not be loaded right now. Use the website for the newest update.";
  }
  return response(summary, [
    linkButton("Server Status", `${site}/#dashboard`),
    linkButton("Roleplay CAD", `${site}/#cad`)
  ]);
}

async function handleCommand(interaction, env) {
  const command = interaction?.data?.name;
  const site = siteUrl(env);
  if (command === "status") return statusCommand(env);
  if (command === "apply") {
    const department = String(option(interaction, "department") || "community").toLowerCase();
    return response(`Open the FSRP application center and select ${department.toUpperCase()}.`, [linkButton("Open Applications", `${site}/#community-suite`)], true);
  }
  if (command === "appeal") return response("Open the secured FSRP ban-appeal form.", [linkButton("Submit Appeal", `${site}/#community-suite`)], true);
  if (command === "verify") {
    const discordId = String(interaction?.member?.user?.id || interaction?.user?.id || "");
    const expires = Date.now() + 10 * 60 * 1000;
    const signature = await signVerification(discordId, expires, env.VERIFICATION_LINK_SECRET);
    const link = signature
      ? `${site}/api/roblox-oauth?action=start&discordId=${encodeURIComponent(discordId)}&expires=${expires}&signature=${encodeURIComponent(signature)}`
      : `${site}/#community-suite`;
    return response("Verify Roblox through the official OAuth screen. The signed link expires in ten minutes.", [linkButton("Verify Roblox", link)], true);
  }
  if (command === "cad") return response("Open the FSRP CAD/MDT and live radio companion.", [linkButton("Open CAD", `${site}/#cad`)], true);
  if (command === "staff") return response("Open Staff Operations for shifts, cases, LOAs, training, and internal requests.", [linkButton("Staff Operations", `${site}/#staff-ops`)], true);
  if (command === "watchdog") return response("Watchdog alerts and ER:LC command oversight are available to authorized staff.", [linkButton("Command Suite", `${site}/#command-suite`)], true);
  return response("Unknown FSRP command.", [], true);
}

export default {
  async fetch(request, env) {
    if (request.method === "GET") return json({ ok: true, service: "FSRP Discord Bot Interactions", version: "1.0.0" });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const verification = await verifyDiscord(request, env.DISCORD_PUBLIC_KEY);
    if (!verification.valid) return new Response("Invalid request signature", { status: 401 });

    let interaction;
    try { interaction = JSON.parse(verification.raw); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (interaction.type === 1) return json({ type: 1 });
    if (interaction.type === 2) return handleCommand(interaction, env);
    return response("This interaction is not supported yet.", [], true);
  }
};
