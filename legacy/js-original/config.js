/**
 * FSRP — Site Configuration
 * =========================
 * Every real-world value the site needs lives here, same pattern as
 * config.py on the Discord bot. Fill these in with your real values.
 *
 * Anything still marked null/empty renders a polished "not connected yet"
 * state instead of fake data — see dashboard.js / notifications.js.
 */
window.FSRP_CONFIG = {
  links: {
    discordInvite: "https://discord.gg/dNRXwCsS9Z",
    robloxGroup: "https://www.roblox.com/communities/219522276",
    youtube: "https://www.youtube.com/channel/UCapQbvZpNgdIwbFh09WNKOw",
    tiktok: "https://www.tiktok.com/@floridastateroleplayprc",
    instagram: "https://www.instagram.com/floridastateroleplay23/",
  },

  // Static site map the command palette searches. Add a row any time you
  // add a real page/section — this list IS the search index.
  siteMap: [
    { label: "Departments", section: "departments", icon: "🚔" },
    { label: "Marketplace", section: "marketplace", icon: "🛒" },
    { label: "Staff & Chain of Command", section: "staff", icon: "👮" },
    { label: "Support Center", section: "support", icon: "🎫" },
    { label: "Rules", section: "rules", icon: "📜" },
    { label: "FAQ", section: "faq", icon: "❓" },
    { label: "News & Announcements", section: "news", icon: "📢" },
    { label: "Staff Application", section: "apply", icon: "📝" },
    { label: "Join Discord", section: "discord", icon: "💬", external: true },
  ],

  // Department roster shown on the dashboard + department cards.
  // status: "active" | "training" | "closed"
  departments: [
    { code: "FHP", name: "Florida Highway Patrol", status: "active" },
    { code: "OCSO", name: "Orange County Sheriff's Office", status: "active" },
    { code: "FWC", name: "Fish & Wildlife Conservation", status: "training" },
    { code: "FBI", name: "Federal Bureau of Investigation", status: "closed" },
    { code: "CIV", name: "Civilian Operations", status: "active" },
  ],

  // Live server data. Leave dataSource as "none" until an API is wired up
  // (see the TODO in dashboard.js) — the console shows a fallback state
  // rather than a fabricated player count.
  server: {
    dataSource: "none", // "none" | "roblox-api" | "custom-backend"
    nextSSU: null, // e.g. "2026-07-27T23:00:00-04:00"
  },
};
