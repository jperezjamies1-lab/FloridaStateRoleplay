/**
 * FSRP — App Init
 * ==================
 * NOTE ON PERSISTENCE: this preview keeps "remembered" choices (welcome
 * pick, theme) in a plain in-memory object rather than localStorage, so
 * they reset on a hard reload while you're previewing inside Claude.
 * Once these files are deployed to real hosting, swap `memory` below for
 * localStorage — three one-line changes, marked with TODO comments.
 */
(function () {
  "use strict";

  const memory = {};

  function rememberChoice(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      memory[key] = value;
    }
  }

  function recallChoice(key) {
    try {
      return window.localStorage.getItem(key) || memory[key] || null;
    } catch (_) {
      return memory[key] || null;
    }
  }

  function applyConfiguredLinks() {
    const links = window.FSRP_CONFIG && window.FSRP_CONFIG.links;
    if (!links) return;

    const bindings = {
      "hero-join-discord": links.discordInvite,
      "hero-join-roblox": links.robloxGroup,
      "footer-discord": links.discordInvite,
      "footer-youtube": links.youtube,
      "footer-tiktok": links.tiktok,
      "footer-instagram": links.instagram,
      "footer-roblox": links.robloxGroup,
    };

    Object.entries(bindings).forEach(([id, href]) => {
      const el = document.getElementById(id);
      if (!el || !href) return;
      el.href = href;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    });
  }

  function setSky() {
    const hour = new Date().getHours();
    let sky = "night";
    if (hour >= 5 && hour < 11) sky = "morning";
    else if (hour >= 11 && hour < 17) sky = "afternoon";
    else if (hour >= 17 && hour < 20) sky = "sunset";
    document.body.dataset.sky = sky;
  }

  function initTheme() {
    const saved = recallChoice("fsrp-theme") || "system";
    document.documentElement.dataset.theme = saved === "system" ? "" : saved;
    document.querySelectorAll("[data-theme-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.themeOption;
        document.documentElement.dataset.theme = value === "system" ? "" : value;
        rememberChoice("fsrp-theme", value);
        window.FSRP_showToast && window.FSRP_showToast(`Theme set to ${value}`);
      });
    });
  }

  function initWelcomeModal() {
    const overlay = document.getElementById("welcome-overlay");
    if (!overlay) return;

    const already = recallChoice("fsrp-welcome-choice");
    if (already) return; // returning visitor in this session — don't re-ask

    overlay.classList.add("is-open");
    overlay.querySelectorAll("[data-choice]").forEach((card) => {
      card.addEventListener("click", () => {
        rememberChoice("fsrp-welcome-choice", card.dataset.choice);
        overlay.classList.remove("is-open");
        const target = card.dataset.section;
        const targetEl = target && document.getElementById(target);
        if (targetEl && typeof targetEl.scrollIntoView === "function") {
          targetEl.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  }

  function initNavCondense() {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle("is-condensed", window.scrollY > 24);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function initScrollTop() {
    const btn = document.getElementById("scroll-top-btn");
    if (!btn) return;
    const onScroll = () => {
      btn.hidden = window.scrollY < 480;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    btn.addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: "smooth" })
    );
    onScroll();
  }

  function initTabRouting() {
    document.querySelectorAll(".tab[data-route]").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        document
          .querySelectorAll(".tab")
          .forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        window.location.hash = `#${tab.dataset.route}`;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setSky();
    applyConfiguredLinks();
    initTheme();
    initWelcomeModal();
    initNavCondense();
    initScrollTop();
    initTabRouting();

    window.FSRP_initAnimations && window.FSRP_initAnimations();
    window.FSRP_initNotifications && window.FSRP_initNotifications();
    window.FSRP_initCommandPalette && window.FSRP_initCommandPalette();
    window.FSRP_initDashboard && window.FSRP_initDashboard();
    window.FSRP_applyManagerGate && window.FSRP_applyManagerGate();
  });
})();
