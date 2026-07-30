# FSRP Features and How They Work

## Website structure repair

The original uploaded `index.html` had large intro and Staff Spotlight blocks pasted after the website's main script list. The repaired version keeps `index.html` as the page structure and moves all visual code to `/css` and all behavior to `/js`. This prevents CSS or JavaScript source from appearing as visible text in the Staff section.

## Intro sequence

1. The cinematic Florida scene opens.
2. The palm trees move in the wind.
3. The left palm falls toward the right and the right palm falls toward the left.
4. The separate loader stage appears.
5. The website opens and the device clock begins displaying the visitor's local time.

Manager location: `#manager` → **Intro, Ticker & Takeover**.

The intro accepts:
- A direct PNG, JPG, WEBP, or GIF URL
- A direct MP4 or WEBM URL
- A local browser preview file
- No media, which uses the built-in animated Florida background

Browsers normally require autoplay videos to begin muted.

## Moving FSRP update ticker

The bar below the website notice moves from left to right and repeats the enabled messages. Hovering over the bar pauses it.

Default messages:
- Staff Applications Are Open
- Florida State Roleplay Website Updated
- OCSO Applications Are Open
- FHP Applications Are Open
- FFW Applications Are Open

Messages can be added, edited, removed, enabled, or disabled from the Manager.

## Three-second announcement takeover

A large official announcement appears in the center of the screen after the intro.

It closes when:
- Three seconds pass
- The visitor clicks X
- The visitor clicks the announcement button and leaves the page

The announcement has an ID. When it closes, the browser saves that ID in local storage. That exact ID will not display again on reload. Change the ID in the Manager to publish a new takeover to everyone.

## Staff Spotlight

The Staff Spotlight is now inside the real Staff route and contains:
- Name
- Initials or avatar
- Rank
- Team
- Recognition reason
- Achievement tags
- Three recognition board cards

It is managed from `#manager` → **Intro, Ticker & Takeover**.

## Whitelist corrections

Whitelisted/public structure in the package:
- FHP
- OCSO
- FFW
- FBI
- Staff Team

CIV is a public civilian category and is not whitelisted.

Fire Department / Fire & Rescue is not included as a whitelisted department or application department.

## Easter egg 1: LWKTIMMY

Click an FSRP logo exactly two times within the click window. A hidden card opens showing:

`LWKTIMMY Role · 1 of 1`

## Easter egg 2: one-minute party

Click an FSRP logo four times within the click window. Party Mode runs for 60 seconds and includes:
- Animated colored lighting
- Falling confetti
- Countdown timer
- Stop button
- Original generated FSRP synth music

The music is created live through the browser Web Audio API. It is not a copied commercial song.

## Integrated FSRP Roleplay CAD

Open `#cad` or use the Roleplay CAD navigation item.

Authorized agencies:
- FBI
- FHP
- FFW
- Staff Team

The browser sends the entered code to the Cloudflare Function. The code is compared against an encrypted Cloudflare secret. The secret is never sent back to the browser or stored in public JavaScript.

CAD tools:
- Secure code login
- Signed eight-hour CAD session token
- Dispatch feed
- Unit callsigns and 10-status board
- 911 roleplay call creation
- Person, plate, and username records
- Incident reports
- Citations
- Warrants and BOLOs
- Panic / emergency activation
- Radio channel and text transmissions
- Push-to-talk radio sound effects
- Bodycam camera preview
- Dashcam camera preview
- Local camera recording downloads

The public browser must grant camera and microphone permission before a camera can start. Camera recordings stay on the user's device and are not automatically uploaded.

The radio includes shared text transmissions and push-to-talk effects. Real multi-user live voice requires a separate real-time voice service and signaling server.

## CAD local test

Run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/#cad` and use:

```text
FSRP-DEMO
```

This demo code works only on localhost or a local file preview. It does not work on the deployed Cloudflare API.

## Cloudflare data

`SITE_SETTINGS` stores Manager-published website settings.

`CAD_STATE` stores:
- Dispatch entries
- Units
- 911 calls
- Records
- Reports
- Citations
- Warrants / BOLOs
- Radio messages

`MEDIA_BUCKET` is an optional R2 bucket for permanent media uploads.

## Required encrypted secrets

- `ADMIN_TOKEN`
- `OPERATIONS_TOKEN`
- `AUTH_SECRET`
- `CAD_TOKEN_SECRET`
- `CAD_FBI_CODE`
- `CAD_FHP_CODE`
- `CAD_FFW_CODE`
- `CAD_STAFF_CODE`

Never put these values in GitHub or `index.html`.

## Manager media uploader

The Asset Library supports:
- Local preview
- Permanent R2 upload when `MEDIA_BUCKET` is connected
- Copyable uploaded file URL

That URL can be pasted into the intro media, gallery, hero image, or other Manager fields.

## Other included improvements

- Live device clock and date
- Search modal with Ctrl/Command + K
- Notification center
- Mobile navigation drawer
- Mobile quick-access dock
- Scene of the Week feature
- Application status cards
- Session status and priority board
- Manager local preview mode
- JSON export and import backups
- Cloudflare security headers
- No duplicate HTML IDs
- No missing local CSS, JavaScript, or logo references
