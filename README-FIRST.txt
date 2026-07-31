FLORIDA STATE ROLEPLAY — V3 ENHANCED 3.5.1
============================================

THIS PACKAGE WAS BUILT FROM:
FloridaStateRoleplayWebsite-V3-FULL-BACKUP(2)(1).zip

IMPORTANT:
1. Do not mix these files with any older rebuilt ZIP.
2. Replace the repository contents with EVERYTHING inside this package.
3. index.html, wrangler.toml, css, js, functions, and assets must all be at the repository root.
4. Keep the production branch set to main.
5. After Cloudflare deploys, open the website in a private/incognito window first.
6. The package includes cache-busting version tags so old CSS/JS should not remain stuck.

CLOUDFLARE PAGES SETTINGS
-------------------------
Framework preset: None
Build command: exit 0
Build output directory: .
Root directory: leave blank
Production branch: main

THE WORKING KV BINDING IS ALREADY IN wrangler.toml
--------------------------------------------------
Binding: SITE_SETTINGS
Namespace ID: d5253d8c54c54cb19f08b3bc3b61e90e

The CAD automatically reuses SITE_SETTINGS under a separate key.
You do NOT need to create or add CAD_STATE for this package.

MINIMUM SECRETS
---------------
ADMIN_TOKEN
OPERATIONS_TOKEN
CAD_FBI_CODE
CAD_FHP_CODE
CAD_OCSO_CODE
CAD_FFW_CODE
CAD_STAFF_CODE

OPTIONAL BUT RECOMMENDED
------------------------
AUTH_SECRET
CAD_TOKEN_SECRET
YOUTUBE_API_KEY
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
PRESENCE_SYNC_TOKEN

AUTH_SECRET and CAD_TOKEN_SECRET are optional in this build. If missing, secure sessions reuse the existing Admin/Operations secret.

MAINTENANCE SAFETY
------------------
Maintenance starts OFF.
Old saved maintenance settings from earlier builds are automatically neutralized by safety migration 3.
The maintenance screen also includes Continue to Website.
Emergency bypass: add ?maintenance=off to the website URL.
Manager bypass: open #manager.
