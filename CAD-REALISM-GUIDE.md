# FSRP CAD / MDT 3.7.0

This build upgrades the Florida State Roleplay CAD into a connected roleplay operations system for FBI, FHP, FFW, and the Staff Team.

## What is included

- Secure department-code login with signed eight-hour sessions
- Operations overview with active-unit, open-call, panic, and radio-presence totals
- Dispatch calls with priority, location, status, attached units, and call numbers
- Unit board with callsign, status, location, attached call, and panic state
- 911 call queue
- Person records and vehicle records
- Incident, arrest, tow, field-interview, and supervisor report types
- Citations
- Warrants, BOLOs, vehicle alerts, and missing-person roleplay alerts
- Activity/audit log
- Agency-based radio talkgroups
- PTT transmit status shared through the CAD
- Connected-unit radio presence
- Scan, mute, volume, alert tones, quick transmissions, and microphone meter
- Panic activation and dispatch alert
- Bodycam and dashcam previews with callsign/time overlays
- Local camera recording downloads
- CAD command line

## Cloudflare requirements

The CAD reuses the existing `SITE_SETTINGS` KV binding. A separate `CAD_STATE` binding is optional.

Add these encrypted Production secrets:

```text
CAD_TOKEN_SECRET
CAD_FBI_CODE
CAD_FHP_CODE
CAD_OCSO_CODE
CAD_FFW_CODE
CAD_STAFF_CODE
```

Do not put the secret values in GitHub, `index.html`, or public JavaScript.

## Test readiness

Open:

```text
https://YOUR-DOMAIN.pages.dev/api/cad
```

A working configuration reports:

```json
{
  "cadReady": true,
  "storageReady": true,
  "sessionSigningReady": true,
  "configuredAgencies": ["FBI", "FHP", "FFW", "Staff Team"],
  "apiVersion": 5
}
```

## Radio behavior

The radio shares talkgroup selection, callsign presence, PTT status, panic alerts, and text transmissions through the CAD. The optional microphone meter reads the user's microphone locally after browser permission.

This package does not send live microphone audio between different users. True multi-user voice requires a dedicated WebRTC/signaling service and cannot be provided by KV polling alone.

## Keyboard radio control

While the Digital Radio panel is open and the cursor is not inside a form field:

- Hold `Space` to transmit
- Release `Space` to stop transmitting

## CAD command bar

Examples:

```text
STATUS 10-8 In Service
PANIC
CLEAR PANIC
ATTACH FSRP-1001
CHANNEL FHP PRIMARY
```

## Local preview

When the website is opened locally, use:

```text
FSRP-DEMO
```

The demo code is not accepted on the deployed Cloudflare website.


## Official ER:LC live synchronization

Add the encrypted Cloudflare Production secret `ERLC_SERVER_KEY`. The CAD then securely reads the official ER:LC private-server API and can display the server code, player count, queue, live player teams, callsigns, street/postal locations, emergency calls, and vehicles. The key is used only by the Cloudflare Function and is never sent to the browser.

Enter the member's exact Roblox username in Unit Controls and press **Sync From ER:LC**. The CAD fills their live callsign and location when they are currently in the server.

This is a companion CAD/radio. It cannot insert a custom ScreenGui inside the ER:LC Roblox experience because FSRP does not own that game. Use the CAD in a browser, phone, second display, or window beside Roblox.
