# FSRP Website V4 — Features

## Website experience

- Original FSRP PNG logo preserved everywhere
- Cinematic Florida palm-tree intro
- Separate animated loading stage
- Optional intro image or video URL
- Live device time and timezone
- Glassmorphism across panels, navigation, Manager, Staff, CAD, and modals
- Responsive phone, tablet, and desktop layouts

## Update ticker

- Moves automatically from left to right
- Managed through Website Manager
- Each message is automatically limited to five words
- Disabled messages are skipped
- Hover pauses it on desktop

## Announcement takeover

- Displays a large centered Admin announcement
- Closes automatically after three seconds
- Visitors can close it with the X
- The announcement ID is remembered locally and does not reappear after reload
- Change the ID to publish a new takeover

## Maintenance and failure recovery

- Maintenance mode starts disabled
- Discord remains accessible during maintenance
- Manager Access can bypass the maintenance screen for the current tab
- Original generated waiting music or a custom audio URL
- Retry panel appears when cloud settings cannot load or the device is offline
- The public site remains available using local/default content

## Streamer Live Dashboard

- Row of official YouTube, Twitch, and TikTok creator cards
- LIVE cards glow, animate, and link directly to the stream
- YouTube and Twitch can update from official server-side APIs
- Live-title keywords verify that the broadcast is about FSRP / ER:LC
- TikTok uses a Manager live switch unless TikTok approves a LIVE embed integration
- API secrets stay inside Cloudflare and never appear in browser JavaScript

## Staff systems

- Staff Spotlight
- Staff Recognition Board
- Rank filters
- Optional Discord presence bridge
- No fake online/offline information

## Integrated CAD

Authorized agencies: FBI, FHP, FFW, Staff Team.

Included tools:

- Live dispatch feed
- Five-second shared-state refresh
- Active unit board and statuses
- 911 roleplay calls
- Person, username, and plate records
- Incident reports
- Citations
- Warrants and BOLOs
- Radio text log and push-to-talk effects
- Panic button
- Bodycam and dashcam previews
- Local browser recordings
- Signed eight-hour CAD sessions
- Server-side access codes
- Input sanitizing and entry limits

## Easter eggs

- Click an FSRP logo twice: **LWKTIMMY Role · 1 of 1**
- Click an FSRP logo four times: one-minute Party Mode with original synth audio, lights, and confetti

## Security improvements

- Admin uploads require a verified Admin session
- Operations can publish Server Status only
- No fallback `change-me` signing secret
- Local blob/data media is blocked from cloud publishing
- Shared CAD entries are cleaned and length-limited server-side
- Secrets are never stored in GitHub or public JavaScript
