# FSRP Live Radio Setup

## What this radio is

The radio is an original FSRP WebRTC system. It sends microphone audio directly between authorized CAD users while PTT is held. A Cloudflare Durable Object handles talkgroup presence, one-speaker locking, channel locks, panic state, reconnects, and WebRTC signaling.

It does not inject anything into Roblox. The website, installable PWA, pop-out radio, and Electron companion are external tools used beside ER:LC.

## Talkgroups

- Statewide
- FHP Primary / TAC 1 / TAC 2
- OCSO Primary / TAC 1 / TAC 2
- FFW Primary / TAC
- FBI FED 1 / TAC
- Staff Command
- Event Operations
- Emergency Traffic

CAD login controls which talkgroups a member may access. Staff Command can lock a channel, preempt normal PTT, and start emergency traffic.

## Deploy the radio Worker

1. Install Wrangler and log in to Cloudflare.
2. From the repository root, run:

```bash
npx wrangler deploy --config wrangler.radio.toml
```

3. Copy the deployed Worker URL.
4. Create a long random value:

```bash
openssl rand -hex 32
```

5. Add that value as the Worker secret:

```bash
npx wrangler secret put RADIO_SESSION_SECRET --config wrangler.radio.toml
```

6. Add the exact same value to the Pages Production secret named `RADIO_SESSION_SECRET`.
7. Add the Worker URL to the Pages Production variable `RADIO_WORKER_URL`.
8. Redeploy Pages.

## Restrict the Worker origin

After the website domain is final, add a Worker variable named `RADIO_ALLOWED_ORIGINS`. Use comma-separated origins without a trailing slash.

```text
https://your-site.pages.dev,https://your-custom-domain.com
```

## TURN fallback

The radio works with STUN by default. Some school, mobile, or restricted networks need TURN. To enable Cloudflare TURN, add these encrypted Pages secrets:

```text
TURN_KEY_ID
TURN_API_TOKEN
```

The server creates short-lived browser credentials. Never place the long-lived TURN token in JavaScript or GitHub.

## Live bodycam

The radio includes optional live bodycam sharing inside the current talkgroup. It stays off until the officer clicks **Share Live Bodycam** and approves camera permission. Use video in smaller channels because every camera stream uses extra bandwidth.

## Companion overlay

The `overlay-app` folder contains an Electron always-on-top companion. It loads the deployed CAD externally and never injects or modifies ER:LC.
