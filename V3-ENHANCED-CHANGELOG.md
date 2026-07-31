# V3 Enhanced 3.7.0 — OCSO + Official ER:LC Live Integration

- Added OCSO CAD login through `CAD_OCSO_CODE`.
- Added OCSO Primary, TAC 1, and TAC 2 radio talkgroups.
- Added official ER:LC private-server synchronization through encrypted `ERLC_SERVER_KEY`.
- Added live server code, player count, queue, players, callsigns, teams, and street/postal locations.
- Added Unit Controls Roblox username field and **Sync From ER:LC**.
- Kept the ER:LC API key server-side inside Cloudflare Functions.
- Clarified that the companion radio cannot place custom UI inside the ER:LC game itself.

# FSRP V3 Enhanced Changelog

## 3.6.0 — Realistic CAD / MDT and Digital Radio

- Rebuilt the CAD workspace around connected calls, units, records, vehicles, reports, citations, alerts, radio, cameras, and audit history.
- Added dispatch call priorities, call numbers, call statuses, attached units, and quick actions.
- Added people and vehicle databases with search.
- Added agency talkgroups for FBI, FHP, FFW, and Staff Team.
- Added shared PTT state, connected-unit presence, scan mode, mute, volume, tones, quick radio phrases, and a local microphone meter.
- Added panic activation, panic banner, and dispatch alerts.
- Added bodycam/dashcam timestamp and callsign overlays.
- Added a CAD command line.
- Added role-aware edit permissions and signed session IDs.
- Migrates older `fsrp_cad_state_v1` data into the new `fsrp_cad_state_v2` state automatically.
- Continues to reuse `SITE_SETTINGS`; `CAD_STATE` remains optional.
- Passed 146/146 static package checks and a dynamic API flow test.
