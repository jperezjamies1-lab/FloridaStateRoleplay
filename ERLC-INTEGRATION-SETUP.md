# FSRP ER:LC Integration Setup

## What this integration does

The CAD securely connects to the official ER:LC Private Server API through a Cloudflare Function. It can load live server status, current players, in-game callsigns, teams, streets/postals, queue size, emergency calls, and vehicles.

It does **not** insert custom UI inside the ER:LC Roblox game. The radio and CAD run as a website companion on a phone, second screen, or browser window beside Roblox.

## Required Cloudflare Production secrets

```text
CAD_TOKEN_SECRET
CAD_FBI_CODE
CAD_FHP_CODE
CAD_OCSO_CODE
CAD_FFW_CODE
CAD_STAFF_CODE
ERLC_SERVER_KEY
```

Only add the department codes you currently use. Keep every value encrypted and out of GitHub.

## Get the ER:LC server key

1. Purchase/enable the ER:LC API server pack for the private server.
2. Join the private server.
3. Open the server settings.
4. Find the ER:LC API key setting.
5. Copy the key into the Cloudflare Production secret named `ERLC_SERVER_KEY`.
6. Redeploy the website.

## OCSO setup

Add the encrypted Production secret `CAD_OCSO_CODE`. OCSO users receive these talkgroups:

- STATEWIDE
- OCSO PRIMARY
- OCSO TAC 1
- OCSO TAC 2
- EVENT OPERATIONS

## Sync a member with ER:LC

1. Sign into CAD with the department code.
2. Open Unit Board.
3. Enter the exact Roblox username.
4. Press **Sync From ER:LC**.
5. The CAD fills the live callsign and current street/postal when the player is in the server.

## Test readiness

Open `/api/cad`. The response should show `erlcReady: true` and list OCSO under `configuredAgencies` after the corresponding secrets are deployed.
