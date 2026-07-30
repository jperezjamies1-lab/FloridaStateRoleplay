(function () {
  "use strict";

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function observeReveals() {
    const nodes = [...document.querySelectorAll(".reveal:not(.is-visible)")];
    if (!nodes.length) return;
    if (!("IntersectionObserver" in window)) { nodes.forEach((node) => node.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    }, { threshold: .1, rootMargin: "0px 0px -30px" });
    nodes.forEach((node) => observer.observe(node));
  }

  function initHeader() {
    const mobileToggle = document.getElementById("mobile-toggle");
    const drawer = document.getElementById("mobile-drawer");
    mobileToggle?.addEventListener("click", () => {
      const open = !drawer.classList.contains("is-open");
      drawer.classList.toggle("is-open", open);
      mobileToggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("is-locked", open);
    });
    const explore = document.getElementById("explore-trigger");
    explore?.addEventListener("click", () => {
      const host = explore.closest(".nav-menu");
      const open = !host.classList.contains("is-open");
      host.classList.toggle("is-open", open);
      explore.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".nav-menu")) {
        document.querySelector(".nav-menu")?.classList.remove("is-open");
        explore?.setAttribute("aria-expanded", "false");
      }
    });
    document.querySelectorAll("[data-scroll-top]").forEach((button) => button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" })));
  }

  async function initCloud() {
    const result = await window.FSRP_STORE.hydrateCloud();
    const storage = document.getElementById("manager-storage-status");
    if (storage) storage.textContent = result.ok && result.found ? "Cloud connected" : "Local fallback ready";
    if (!result.ok) console.info("FSRP cloud settings fallback:", result.error);
  }

  function initFooter() { document.getElementById("footer-year").textContent = new Date().getFullYear(); }

  async function boot() {
    window.FSRP_TOAST = showToast;
    window.FSRP_REVEAL = observeReveals;
    initHeader();
    initFooter();
    window.FSRP_ROUTER.init();
    window.FSRP_SOUND.init();
    window.FSRP_SEARCH.init();
    window.FSRP_NOTIFICATIONS.init();
    window.FSRP_STAFF.init();
    window.FSRP_DASHBOARD.init();
    window.FSRP_MANAGER.init();
    observeReveals();

    // Hide the loader after the first local render. Cloud/API requests continue
    // in the background, so a slow binding or external service can never hold
    // the whole website on a loading screen.
    setTimeout(() => document.getElementById("app-loader")?.classList.add("is-hidden"), 140);

    // Cloud hydration runs after first paint. The store publishes one content
    // event when cloud data arrives, updating the visible UI without a reload.
    initCloud();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
