# FSRP V3 Enhanced — Features and Operation

## Foundation preserved

This version uses the uploaded V3 full backup as its base. It preserves the original FSRP logo, original V3 repository structure, legacy backup, existing `SITE_SETTINGS` namespace, routes, Manager concept, and Cloudflare Pages deployment method.

## Cinematic intro

The opening sequence is a real intro followed by a separate loader:

1. Florida night/sunset scene appears.
2. Palm trees move.
3. Left palm falls right and right palm falls left.
4. The loader stage appears.
5. The public website opens.
6. The live device clock continues updating.

Manager controls:

- Enable/disable intro
- Show every refresh or once per tab
- Animated background only
- Image URL
- MP4/WEBM video URL
- Local image/video preview

## Moving five-word ticker

The ticker moves automatically from left to right. Every entry is automatically trimmed to a maximum of five words.

Manager path:

```text
Manager → Intro, Ticker & Takeover
```

## Three-second announcement takeover

A large announcement appears in the middle of the screen after the intro. It closes after three seconds or when the visitor presses X. The announcement ID is saved on the visitor's device, so the same ID does not appear again after reloading. Change the ID to publish a new takeover.

## Staff Spotlight

The Staff page includes:

- Featured staff member
- Name, initials/avatar, rank, team, and recognition reason
- Achievement tags
- Staff Recognition Board
- Recent Promotion
- Most Active Staff
- Training Excellence

The Staff and Manager code is kept in external JavaScript/CSS files so source code cannot display as page text.

## Streamer Live Dashboard

Official creator cards support:

- YouTube
- Twitch
- TikTok
- Creator name
- Platform
- Avatar
- Stream title
- LIVE glow and badge
- Watch Live button

YouTube and Twitch can check official APIs after their Cloudflare secrets are added. TikTok can be marked live from Manager.

## Roleplay CAD

Authorized agencies:

- FBI
- FHP
- FFW
- Staff Team

Systems:

- Secure department codes
- Signed eight-hour CAD sessions
- Dispatch log
- Unit board and callsigns
- Unit status updates
- 911 calls
- Person and plate records
- Reports
- Citations
- Warrants and BOLOs
- Panic button
- Radio channels
- Shared text radio traffic
- Push-to-talk effects
- Bodycam preview and local recording
- Dashcam preview and local recording

Camera use always requires browser permission. Recordings stay on the user's device and are not uploaded automatically.

The CAD automatically reuses `SITE_SETTINGS`. It does not require a separate `CAD_STATE` binding.

## Maintenance and waiting music

Maintenance includes:

- Glassmorphism card
- Animated background lights
- Original generated ambient waiting music
- Optional custom music URL
- Volume control
- Discord button
- Manager button
- Continue to Website button
- URL bypass

Maintenance requires a double confirmation and safety version 3.

## Glassmorphism

Glass effects are applied to navigation, cards, Staff Spotlight, Streamer Dashboard, Manager, CAD, maintenance, service notices, and overlays.

## Easter eggs

### LWKTIMMY Role · 1 of 1

Click an FSRP logo twice within about 1.2 seconds.

### Party Mode

Click an FSRP logo four times. Party Mode runs for one minute with animated lighting, confetti, countdown, and original browser-generated music.

## Cache protection

All CSS and JavaScript references use version `3.5.1`. HTML is served with no-cache headers. This prevents older maintenance CSS or scripts from remaining stuck after a deployment.
