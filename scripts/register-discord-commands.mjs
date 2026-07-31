const token = process.env.DISCORD_BOT_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !applicationId) {
  console.error("Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID. DISCORD_GUILD_ID is optional for instant guild registration.");
  process.exit(1);
}

const commands = [
  { name: "status", description: "Show FSRP website and community status" },
  {
    name: "apply",
    description: "Open an FSRP application",
    options: [{
      name: "department",
      description: "Application department",
      type: 3,
      required: false,
      choices: ["Staff", "FHP", "OCSO", "FFW", "FBI", "Media", "Events", "Design"].map((name) => ({ name, value: name.toLowerCase() }))
    }]
  },
  { name: "appeal", description: "Open the FSRP ban appeal form" },
  { name: "verify", description: "Open Roblox and Discord verification" },
  { name: "cad", description: "Open the FSRP CAD and radio" },
  { name: "staff", description: "Open Staff Operations" },
  { name: "watchdog", description: "Open the authorized Watchdog console" }
];

const target = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/commands`;
const response = await fetch(target, {
  method: "PUT",
  headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
  body: JSON.stringify(commands)
});
const payload = await response.text();
if (!response.ok) {
  console.error(`Discord API ${response.status}: ${payload}`);
  process.exit(1);
}
console.log(`Registered ${commands.length} FSRP commands ${guildId ? "to the selected guild" : "globally"}.`);
