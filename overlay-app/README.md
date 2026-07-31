# FSRP Companion Overlay

This is an external always-on-top desktop companion. It does not inject code into Roblox or modify ER:LC.

1. Install Node.js 20 or newer.
2. Copy `overlay-config.example.json` to `overlay-config.json`.
3. Replace `siteUrl` with the deployed FSRP website URL.
4. Run `npm install` and then `npm start` inside this folder.
5. `Ctrl/Command + Shift + O` shows or hides the overlay.
6. `Ctrl/Command + Shift + R` requests priority PTT when the signed-in role permits it.

Microphone and camera permissions still require the normal browser/Electron permission prompt.
