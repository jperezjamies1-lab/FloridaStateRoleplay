/**
 * FSRP — Manager Access Gating
 * =============================
 * READ THIS BEFORE TRUSTING THIS FILE WITH ANYTHING SENSITIVE.
 *
 * Everything in this file runs in the visitor's browser. That means:
 *   - It can hide the Manager tab from casual browsing. ✅ handled below.
 *   - It can redirect a direct URL/hash visit to an Access Denied panel
 *     before the Manager UI paints. ✅ handled below.
 *   - It CANNOT stop someone from reading this file's source, calling
 *     checkManagerAuth() manually from devtools, or fetching whatever data
 *     the real Manager panel would need. ❌ not possible client-side.
 *
 * Real protection means a server checks the visitor's session BEFORE any
 * Manager markup or data leaves the server — e.g. a small serverless
 * function (Netlify/Vercel/Cloudflare) that validates a Discord OAuth
 * session against your staff role IDs (same role IDs the SWFLRP bot's
 * config.py already uses — reuse that list rather than keeping a second
 * one). Until that piece exists, treat this file as the correct UI
 * PATTERN, not a finished security boundary.
 */

(function () {
  "use strict";

  /**
   * TODO: replace with a real call to your auth backend once it exists,
   * e.g.:
   *   const res = await fetch('/api/whoami');
   *   const { isManager } = await res.json();
   *   return isManager;
   *
   * Until then this always resolves false, which is the safe default —
   * "hidden unless proven authorized," never the other way around.
   */
  async function checkManagerAuth() {
    return false;
  }

  async function applyManagerGate() {
    const isManager = await checkManagerAuth();
    const tab = document.querySelector("[data-manager-tab]");
    if (tab) {
      tab.hidden = !isManager;
    }

    const onManagerRoute = window.location.hash === "#manager";
    const managerPage = document.getElementById("page-manager");
    const deniedPage = document.getElementById("page-access-denied");

    if (!onManagerRoute) return;

    if (isManager) {
      managerPage && managerPage.removeAttribute("hidden");
      deniedPage && deniedPage.setAttribute("hidden", "");
    } else {
      managerPage && managerPage.setAttribute("hidden", "");
      deniedPage && deniedPage.removeAttribute("hidden");
    }
  }

  window.addEventListener("hashchange", applyManagerGate);
  window.FSRP_applyManagerGate = applyManagerGate;
})();
