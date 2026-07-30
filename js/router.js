(function () {
  "use strict";

  const validPages = new Set((window.FSRP_SITE_MAP || []).map((item) => item.page));
  let current = "home";

  function truthy(value) { return value !== false && String(value) !== "false"; }
  function isEnabled(page) {
    if (page === "home" || page === "manager") return true;
    const value = window.FSRP_STORE?.get(`features.${page}`);
    return value === undefined ? true : truthy(value);
  }

  function applyVisibility() {
    for (const page of validPages) {
      const visible = isEnabled(page);
      document.querySelectorAll(`[data-route="${page}"]`).forEach((node) => { node.hidden = !visible; });
    }
    if (!isEnabled(current)) {
      if (location.hash !== "#home") location.hash = "home";
      else navigate("home", { instant: true });
    }
  }

  function getPageFromHash() {
    const raw = location.hash.replace(/^#/, "").split("/")[0].trim();
    return validPages.has(raw) && isEnabled(raw) ? raw : "home";
  }

  function closeMobile() {
    const drawer = document.getElementById("mobile-drawer");
    const toggle = document.getElementById("mobile-toggle");
    drawer?.classList.remove("is-open");
    toggle?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-locked");
  }

  function navigate(page, options = {}) {
    if (!validPages.has(page) || !isEnabled(page)) page = "home";
    current = page;
    document.querySelectorAll("[data-page]").forEach((section) => {
      section.classList.toggle("is-active", section.dataset.page === page);
    });
    document.querySelectorAll(".nav-link[data-route]").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.route === page);
    });
    document.title = `${page === "home" ? "Florida State Roleplay" : page.replace(/(^|-)\w/g, (m) => m.toUpperCase())} — FSRP`;
    closeMobile();
    document.getElementById("notification-panel")?.classList.remove("is-open");
    if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: options.instant ? "auto" : "smooth" });
    window.dispatchEvent(new CustomEvent("fsrp:route", { detail: { page } }));
  }

  function routeFromHash(options) { navigate(getPageFromHash(), options); }

  function init() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-route]");
      if (!link) return;
      const page = link.dataset.route;
      if (!validPages.has(page)) return;
      event.preventDefault();
      if (location.hash === `#${page}`) navigate(page);
      else location.hash = page;
    });
    window.addEventListener("hashchange", () => routeFromHash());
    window.addEventListener("fsrp:content", applyVisibility);
    applyVisibility();
    routeFromHash({ instant: true });
  }

  window.FSRP_ROUTER = { init, navigate, get current() { return current; } };
})();
