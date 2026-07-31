# FSRP Discord Bot Setup

The optional interactions Worker provides these slash commands:

- `/status`
- `/apply`
- `/appeal`
- `/verify`
- `/cad`
- `/staff`
- `/watchdog`

## Deploy

1. Create a Discord application and bot.
2. Deploy `workers/discord-bot.js` using `wrangler.discord.example.toml`.
3. Add the encrypted Worker secret `DISCORD_PUBLIC_KEY`.
4. Set `FSRP_SITE_URL` to the deployed website.
5. Put the Worker URL into the Discord application's Interactions Endpoint URL.
6. Register commands locally:

```bash
DISCORD_BOT_TOKEN="..." \
DISCORD_APPLICATION_ID="..." \
DISCORD_GUILD_ID="..." \
node scripts/register-discord-commands.mjs
```

Do not commit the bot token.

## Signed verification

Add the same long random `VERIFICATION_LINK_SECRET` to the Discord Worker and Pages. `/verify` then creates a ten-minute signed Roblox OAuth link tied to the Discord user who invoked the command.
