# Florida State Roleplay — Staff Operations Guide

Version: 3.9.0

## What this system is

Staff Operations is the secured internal workspace included with the FSRP website. It is designed for staff accountability and day-to-day roleplay community management.

The system includes:

- Staff, Supervisor, HR, and Admin access levels
- Optional unique staff accounts
- Eight-hour signed sessions
- Shift start, break, resume, and end controls
- Active-time calculations that exclude breaks
- Moderation cases
- Staff infractions and corrective actions
- Internal investigations
- Leave of Absence requests and approvals
- Training records
- Promotions and demotions
- Staff assistance requests
- Confidential staff notes
- Evidence screenshot uploads through Cloudflare R2
- Separate Discord webhook routes
- Search, JSON export, and CSV export
- Permanent audit history

Staff Operations stores its records under a separate key in the existing `SITE_SETTINGS` KV namespace. You do not need to create another KV namespace.

## Cloudflare secrets

Open your Cloudflare Pages project, choose the Production environment, then add these as encrypted secrets.

### Required access codes

```text
STAFF_PANEL_CODE
STAFF_SUPERVISOR_CODE
STAFF_HR_CODE
STAFF_SESSION_SECRET
```

- `STAFF_PANEL_CODE`: regular staff access
- `STAFF_SUPERVISOR_CODE`: supervisors and trainers
- `STAFF_HR_CODE`: HR and Internal Affairs access
- `STAFF_SESSION_SECRET`: signs Staff Operations login sessions

Use long, different values. Do not put them in GitHub, `index.html`, JavaScript, screenshots, or Discord messages.

`ADMIN_TOKEN` is also accepted as Admin-level Staff Operations access.

### Optional unique staff accounts

Shared access codes are easy to set up, but a person can type a different display name. Unique accounts are stronger because the server controls the account name, role, and identity.

Create one encrypted secret named:

```text
STAFF_ACCOUNTS_JSON
```

Example structure with fake values:

```json
[
  {
    "id": "staff-001",
    "name": "Example Moderator",
    "discordId": "000000000000000001",
    "roblox": "ExampleRobloxUser",
    "callsign": "M-01",
    "role": "staff",
    "code": "replace-with-a-private-code"
  },
  {
    "id": "hr-001",
    "name": "Example HR Member",
    "discordId": "000000000000000002",
    "roblox": "ExampleHRUser",
    "callsign": "HR-01",
    "role": "hr",
    "code": "replace-with-another-private-code"
  }
]
```

Allowed roles:

```text
staff
supervisor
hr
admin
```

When unique accounts are used, the staff member enters an ID, Discord ID, Roblox username, or account name plus their private code.

## Discord logging

Discord webhook URLs remain server-side. Never paste webhook URLs into public code.

Use one fallback webhook:

```text
DISCORD_STAFF_WEBHOOK
```

Or use separate channels:

```text
DISCORD_MODERATION_WEBHOOK
DISCORD_STAFF_INFRACTION_WEBHOOK
DISCORD_INVESTIGATION_WEBHOOK
DISCORD_LOA_WEBHOOK
DISCORD_TRAINING_WEBHOOK
DISCORD_PROMOTION_WEBHOOK
DISCORD_STAFF_REQUEST_WEBHOOK
DISCORD_SHIFT_WEBHOOK
DISCORD_STAFF_NOTES_WEBHOOK
```

Optional webhook avatar:

```text
FSRP_WEBHOOK_AVATAR_URL
```

The panel includes a safe Discord test button for HR/Admin accounts. The test does not reveal the webhook URL.

## Evidence screenshots

Permanent screenshot evidence requires a Cloudflare R2 bucket connected with this binding name:

```text
MEDIA_BUCKET
```

Accepted formats:

- PNG
- JPG/JPEG
- WEBP
- GIF

Maximum file size: 10 MB.

Evidence files are placed under `staff-evidence/` in the R2 bucket. The record stores the generated `/api/media?key=...` URL. Discord embeds receive the full absolute URL.

## Access levels

### Staff

Can:

- Start, pause, resume, and end their own shift
- Create moderation records
- Submit their own LOA
- Create staff requests
- View records assigned to them
- View team-visible requests and training

Cannot:

- Issue staff infractions
- Open confidential investigations
- Approve LOAs
- Record promotions
- Export all HR data

### Supervisor

Can also:

- Issue non-termination staff infractions
- Open investigations
- Approve or deny LOAs
- Log training
- Add staff notes
- Review and resolve staff requests
- Update or void cases

### HR

Can also:

- Issue termination-level actions
- Record promotions and demotions
- View all confidential records
- Export JSON and CSV backups
- Test Discord routes

### Admin

Has full Staff Operations access. The existing `ADMIN_TOKEN` can log in as Admin.

## How each panel works

### Overview

Shows active shifts, open moderation cases, active staff infractions, open investigations, pending reviews, and recent audit activity.

### My Shift

- Start Shift begins active tracking.
- Start Break pauses active time.
- Resume Shift returns to active time.
- End Shift stores the total active minutes and an optional summary.

Every action is written to the audit log and can be routed to Discord.

### Moderation

Use for member warnings, kicks, bans, timeouts, notes, and BOLO-style moderation records. Each record gets a number such as `MOD-0001`.

### Staff Infractions

Use for verbal warnings, written warnings, strikes, retraining, suspensions, demotions, terminations, and staff notes. Each record gets a number such as `INF-0001`.

Termination requires HR/Admin access.

### Investigations

Use for Internal Affairs or HR investigations. Cases include subject, priority, allegation, investigator, status, details, and evidence. Case numbers use `INV-0001` format.

### Leave of Absence

Staff submit start date, end date, contact availability, and reason. Supervisors or HR approve or deny the request.

### Training

Supervisors and trainers can record course, result, trainer, notes, and completion state.

### Promotions

HR records previous rank, new rank, effective date, status, and reason.

### Staff Requests

Staff can request supervisor help, HR review, session assistance, member escalation, or technical assistance.

### Staff Notes

Leadership-only documentation for performance, conduct, activity, leadership, recognition, and follow-up.

### Audit Log

Records the actor, action, collection, case number, details, role, and timestamp for Staff Operations changes.

## Deployment checklist

1. Upload all files to the GitHub repository root.
2. Confirm `index.html`, `css`, `js`, `functions`, and `assets` are at the root.
3. Add the required Production secrets.
4. Confirm the existing `SITE_SETTINGS` KV binding is connected.
5. Add `MEDIA_BUCKET` only when evidence uploads are needed.
6. Add optional Discord webhook secrets.
7. Trigger a fresh Cloudflare deployment.
8. Open `/api/staff` to check readiness.
9. Open `#staff-ops` and test each access role.
10. Use System Readiness to test Discord delivery.

## Readiness endpoint

Open:

```text
https://YOUR-DOMAIN/api/staff
```

It reports only setup status, configured roles, storage, R2 readiness, and webhook route readiness. It never returns passwords or webhook URLs.
