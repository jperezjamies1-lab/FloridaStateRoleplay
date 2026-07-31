# FSRP Community Management Suite

## Public tools

- Staff, FHP, OCSO, FFW, and FBI applications
- Private-server join requests
- Ban appeals
- Media, Events, and Design team applications
- Community feedback
- Roblox and Discord verification requests
- Giveaways and community highlights

## Staff tools

Authorized Staff Operations sessions unlock:

- Form builder and open/closed status
- Pending submission counts
- Application approval, denial, and needs-information review
- Ban appeal review restricted to HR or Admin
- Discord direct-message results
- Optional Discord role assignment
- Department hierarchy and tool permissions
- Conditional automation rules
- Staff shift metrics
- Website and ER:LC traffic analytics
- Giveaway winner selection
- Reaction-board publishing

## Official Roblox OAuth

Optional Roblox OAuth proves account ownership through Roblox rather than relying only on typed usernames.

Create a Roblox OAuth app and add these encrypted Pages secrets:

```text
ROBLOX_OAUTH_CLIENT_ID
ROBLOX_OAUTH_CLIENT_SECRET
ROBLOX_OAUTH_REDIRECT_URI
```

The redirect URI should be:

```text
https://YOUR-DOMAIN/api/roblox-oauth?action=callback
```

For a signed Discord `/verify` link and automatic verified role, also add:

```text
VERIFICATION_LINK_SECRET
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID
DISCORD_VERIFIED_ROLE_ID
```

The client secret stays server-side.

## Automation

Community rules support triggers such as received, approved, and denied applications or verification requests. Actions include Discord webhooks, role assignment, direct messages, and staff-review flags.

The optional scheduled Worker in `workers/community-automation-cron.js` closes expired giveaways, records ER:LC traffic snapshots, excludes approved LOAs from activity alerts, and posts a summary to Discord.
