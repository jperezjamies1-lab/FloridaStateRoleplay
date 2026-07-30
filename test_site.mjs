import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });

const requiredIds = [
  "page-home", "page-community", "page-dashboard", "page-departments", "page-platform",
  "page-staff", "page-marketplace", "page-rules", "page-support", "page-manager",
  "search-trigger", "notif-trigger", "notification-panel", "mobile-drawer",
  "hero-title", "staff-grid", "rank-strip", "manager-app", "asset-file",
  "export-btn", "publish-btn", "app-loader"
];

const requiredFiles = [
  "css/base.css", "css/navigation.css", "css/hero.css", "css/pages.css",
  "css/dashboard.css", "css/staff.css", "css/search.css", "css/notifications.css",
  "css/manager.css", "css/animations.css", "css/mobile.css",
  "js/config.js", "js/store.js", "js/router.js", "js/sound.js", "js/search.js",
  "js/notifications.js", "js/dashboard.js", "js/staff.js", "js/manager.js", "js/app.js",
  "functions/api/auth.js", "functions/api/counts.js", "functions/api/settings.js",
  "functions/api/media.js", "functions/api/presence.js", "functions/lib/util.js",
  "assets/brand/fsrp-logo.png", "assets/brand/social-preview.png",
  "assets/brand/fhp.png", "assets/brand/ocso.png", "assets/brand/ffw.png",
  "assets/brand/fbi.png", "assets/brand/civ.png"
];

check("index.html is below 100 KB", Buffer.byteLength(html) < 100_000, `${Buffer.byteLength(html)} bytes`);
const legacyBackup = path.join(root, "legacy/index-original.html");
check("legacy backup is omitted from deploy or preserves the original site", !fs.existsSync(legacyBackup) || fs.statSync(legacyBackup).size > 700_000, fs.existsSync(legacyBackup) ? `${fs.statSync(legacyBackup).size} bytes` : "omitted from deploy package");
check("new index has no giant embedded base64 images", !html.includes("data:image/"));
check("new index has no inline style blocks", !/<style\b/i.test(html));
check("new index has no inline script blocks", !/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
check("header integrates search", /id="search-trigger"/.test(html));
check("header integrates notifications", /id="notif-trigger"/.test(html));
check("Server Status text exists as one navigation label", html.includes("Server Status"));
check("Community Hub uses focused tabs", (html.match(/data-community-tab=/g) || []).length >= 5);
check("Manager includes browser content editors", html.includes("data-manager-panel=\"homepage\"") && html.includes("data-manager-panel=\"staff\""));
check("Manager includes R2 asset upload", html.includes("id=\"asset-upload-btn\"") && fs.existsSync("functions/api/media.js"));
check("Manager includes JSON backup and restore", html.includes("id=\"export-btn\"") && html.includes("id=\"import-file\""));
check("Manager includes rank editing", html.includes("id=\"rank-editor\"") && html.includes("data-add-item=\"ranks\""));
check("Manager includes timeline, marketplace, and support editing", html.includes("id=\"timeline-editor\"") && html.includes("id=\"marketplace-editor\"") && html.includes("id=\"support-editor\""));
check("V3 preserves platform systems, onboarding, and FAQ content", html.includes("id=\"systems-grid\"") && html.includes("id=\"join-steps\"") && html.includes("id=\"faq-list\""));
check("Community Hub includes editable media gallery", html.includes("id=\"media-gallery\"") && html.includes("id=\"gallery-editor\""));
check("Staff copy promises honest unavailable state", html.includes("Status Unavailable"));
check("No external font stylesheet blocks first paint", !/fonts\.googleapis\.com/i.test(html));

for (const id of requiredIds) check(`required element #${id} exists`, html.includes(`id="${id}"`));
for (const file of requiredFiles) check(`required file ${file} exists`, fs.existsSync(path.join(root, file)));

const localRefs = [...html.matchAll(/(?:href|src)="\/(css|js|assets)\/([^"?#]+)"/g)]
  .map((m) => `${m[1]}/${m[2]}`);
for (const ref of localRefs) check(`referenced asset ${ref} exists`, fs.existsSync(path.join(root, ref)));

const jsFiles = fs.readdirSync(path.join(root, "js")).filter((file) => file.endsWith(".js"))
  .map((file) => path.join("js", file));
const functionFiles = [
  ...fs.readdirSync(path.join(root, "functions/api")).filter((file) => file.endsWith(".js")).map((file) => path.join("functions/api", file)),
  ...fs.readdirSync(path.join(root, "functions/lib")).filter((file) => file.endsWith(".js")).map((file) => path.join("functions/lib", file)),
];
for (const file of [...jsFiles, ...functionFiles]) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    check(`JavaScript syntax ${file}`, true);
  } catch (error) {
    check(`JavaScript syntax ${file}`, false, error.stderr?.toString() || error.message);
  }
}

const allClientJs = jsFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
check("client has no repeating setInterval loops", !/\bsetInterval\s*\(/.test(allClientJs));
check("staff presence polling pauses and uses the safe API", allClientJs.includes("/api/presence") && allClientJs.includes("visibilitychange"));
check("presence endpoint requires a sync token for writes", fs.readFileSync("functions/api/presence.js", "utf8").includes("PRESENCE_SYNC_TOKEN") && fs.readFileSync("functions/api/presence.js", "utf8").includes("x-presence-token"));
check("loader hides before cloud hydration finishes", /setTimeout\(\(\) => document\.getElementById\("app-loader"\).*140\)/s.test(fs.readFileSync("js/app.js", "utf8")));
check("cloud settings use V3 content key", fs.readFileSync("js/store.js", "utf8").includes("fsrp_v3_content"));
check("Operations can publish only the V3 status key", fs.readFileSync("functions/api/settings.js", "utf8").includes("fsrp_v3_status"));
check("embedded local media is blocked from KV publishing", fs.readFileSync("js/store.js", "utf8").includes("containsDataUrl") && fs.readFileSync("js/store.js", "utf8").includes("Embedded local preview media cannot be published to KV"));

for (const cssFile of fs.readdirSync(path.join(root, "css")).filter((file) => file.endsWith(".css"))) {
  const css = fs.readFileSync(path.join(root, "css", cssFile), "utf8");
  const opens = (css.match(/{/g) || []).length;
  const closes = (css.match(/}/g) || []).length;
  check(`CSS braces balanced in ${cssFile}`, opens === closes, `${opens} opening / ${closes} closing`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${"=".repeat(72)}\nFSRP V3 STATIC TESTS: ${passed}/${results.length} passed\n${"=".repeat(72)}`);
for (const result of results) console.log(`${result.pass ? "✅" : "❌"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
if (results.some((r) => !r.pass)) process.exit(1);
