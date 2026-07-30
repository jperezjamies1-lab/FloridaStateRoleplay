# V3 Rebuild Changelog

## Foundation and performance

- Replaced the 10,000+ line single-page implementation with modular HTML, CSS, and JavaScript.
- Removed giant embedded base64 images and repeated inline payloads.
- Made initial rendering independent of slow Cloudflare or third-party API calls.
- Removed recurring interval loops and consolidated event handling.
- Added local assets and eliminated the external font dependency.
- Added automatic migration of supported V2 content and Cloudflare settings into the V3 preview.

## Public experience

- Rebuilt the homepage, responsive header, mobile drawer, and footer.
- Integrated search and notifications into the navigation.
- Added focused routes for Community Hub, Mission Control, Departments, Staff, Marketplace, Rules, Support, and Manager.
- Rebuilt Community Hub with overview, announcements, events, media, and timeline views.
- Added richer announcement presentation with optional imagery, pinning, expiration, and action buttons.
- Added honest loading, empty, error, and unavailable states.
- Rebuilt Chain of Command rank navigation and staff cards.

## Website Manager

- Added editable homepage, notice, status, announcements, events, timeline, departments, staff, rules, marketplace, support, official links, theme, and sound settings.
- Added add, edit, delete, publish/unpublish, and reordering controls for content collections.
- Added JSON backup export/import.
- Added Local Preview Mode for safe browser-only review.
- Added optional Cloudflare R2 media uploads, reusable asset URLs, preview, copy, and deletion controls.
- Added page visibility controls and maintenance mode.

## Backend and security

- Preserved the existing Cloudflare Pages, Functions, and KV architecture.
- Added server-side Manager authorization and role-limited Operations publishing.
- Added rate limiting and timing-safe secret comparison.
- Added cached Discord, Roblox, and YouTube public counts with last-known-good fallback.
- Added a protected staff-presence snapshot bridge for an external Discord Gateway bot.
- Added URL scheme validation in public renderers.
- Never exposes secrets or invents live data.

## Known integration boundary

Reliable individual Discord presence requires a persistent Discord Gateway service. V3 provides the protected bridge endpoint, but an always-on bot must still supply fresh snapshots. Until connected, staff presence safely defaults to `Status Unavailable` rather than falsely displaying `Offline`.
