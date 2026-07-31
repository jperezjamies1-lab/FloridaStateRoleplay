# FSRP 4.2.0 — Features and How They Work

## Public website

- Original FSRP logo and dark Florida glassmorphism design
- Cinematic palm-tree intro followed by a separate loader
- Intro image or video support
- Live device clock
- Automatic five-word update ticker
- Three-second announcement takeover remembered per announcement ID
- Staff Spotlight and recognition board
- Live streamer cards for YouTube, Twitch, and manager-controlled TikTok status
- Maintenance safety bypass and optional original waiting music
- Installable PWA and offline static-shell support
- Logo easter eggs preserved

## CAD / MDT

- FBI, FHP, OCSO, FFW, and Staff Team access codes
- Eight-hour signed sessions
- Live ER:LC private-server roster, callsigns, teams, locations, queue, and server information
- Calls, unit statuses, 911 queue, dispatch feed, panic, records, vehicles, reports, citations, warrants, BOLOs, evidence, and audit history
- Schematic live unit map from official ER:LC coordinates
- Multi-monitor map popout
- Dispatch Blue, Terminal Green, and Tactical Amber workspace themes
- Compact and wide layouts
- Browser voice-command assistant for the CAD command bar where supported
- Local bodycam/dashcam recording and optional talkgroup live-bodycam streaming

## Live radio

- Real WebRTC microphone audio while PTT is held
- Durable Object signaling and talkgroup presence
- Department permissions from signed CAD tokens
- One normal transmitter at a time
- Staff priority preemption and channel lock
- Emergency traffic mode, panic indicators, reconnect, signal state, tones, mute, deafen, and external popout
- STUN included; optional short-lived Cloudflare TURN credentials
- External Electron overlay source included

The radio is near-real-time. No internet voice system has literally zero latency. It is external to Roblox and cannot draw controls inside the ER:LC game client.

## Staff Operations

- Shifts, breaks, weekly activity, and exports
- LOA requests and supervisor review
- Moderation cases and punishment history
- Staff infractions, investigations, training, promotions/demotions, requests, confidential notes, and evidence
- Staff, Supervisor, HR, and Admin permission levels
- Discord routing and complete audit history

## Watchdog and Command Suite

- Live ER:LC roster and moderation actions
- Player evidence review for impossible movement patterns, rapid kill bursts, unauthorized commands, and repeated signals
- Moderator command-burst oversight for possible administrative abuse
- Review notes, screenshots, Discord alerts, and audit history
- Automatic bans remain disabled by default and require multiple independent high-confidence signals plus explicit configuration
- External staff companion window; no Roblox injection

## Community Management

- Custom form builder
- Staff and department applications
- Private-server join requests
- Ban appeals
- Media, Event, and Design applications
- Feedback and verification requests
- Review queue, pending counts, approval/denial/needs-info decisions
- Discord result DMs and role assignment
- Optional official Roblox OAuth verification
- Giveaways, winner selection, reaction-board highlights
- Department hierarchy and tool access
- Trigger/action/condition automation rules
- Staff activity, website traffic, ER:LC peak, queue, and unique-player analytics

## Optional Workers

- Discord slash commands
- Scheduled community automation
- Always-on Watchdog scans
- Live WebRTC radio

Optional modules are separated so their setup cannot trap or break the public website.
