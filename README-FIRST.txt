FLORIDA STATE ROLEPLAY — COMPLETE WEBSITE V4

1. Extract this ZIP.
2. Upload every file and folder INSIDE it directly to the root of your GitHub repository.
3. Do not upload the ZIP itself into the repository.
4. Cloudflare Pages settings:
   Production branch: main
   Framework preset: None
   Build command: exit 0
   Build output directory: .
   Root directory: blank
5. Add the Cloudflare bindings and secrets listed in README-SETUP.md.
6. Redeploy, then force refresh with Command + Shift + R.

IMPORTANT:
There is intentionally no active wrangler.toml. This keeps Cloudflare Dashboard
Bindings editable, including CAD_STATE. An optional wrangler.example.toml is included.
