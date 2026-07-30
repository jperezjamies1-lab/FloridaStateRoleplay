/**
 * FSRP — Motion System
 * =======================
 */
(function () {
  "use strict";

  const TIPS = [
    "Tip: press Ctrl+K anywhere to jump to any page instantly.",
    "Tip: your theme choice is saved automatically.",
    "Tip: department status updates the moment duty changes.",
    "Tip: use the notification bell to catch SSU announcements.",
  ];

  function observeReveals() {
    const targets = document.querySelectorAll(".reveal:not(.is-visible)");
    if (!targets.length) return;
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((t) => t.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    targets.forEach((t) => io.observe(t));
  }

  function initRipple() {
    document.addEventListener("click", (e) => {
      const host = e.target.closest(".btn, .icon-btn, .tab, .choice-card");
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const span = document.createElement("span");
      const size = Math.max(rect.width, rect.height);
      span.className = "ripple";
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${e.clientX - rect.left - size / 2}px`;
      span.style.top = `${e.clientY - rect.top - size / 2}px`;
      host.appendChild(span);
      span.addEventListener("animationend", () => span.remove());
    });
  }

  function initCursorGlow() {
    if (window.matchMedia("(pointer: coarse)").matches) return; // skip on touch
    document.querySelectorAll(".glow-field").forEach((field) => {
      field.addEventListener("mousemove", (e) => {
        const rect = field.getBoundingClientRect();
        field.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        field.style.setProperty("--my", `${e.clientY - rect.top}px`);
      });
    });
  }

  function initLoader() {
    const loader = document.getElementById("loader");
    const fill = document.getElementById("loader-bar-fill");
    const tip = document.getElementById("loader-tip");
    if (!loader) return;

    if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

    let progress = 0;
    const step = () => {
      progress = Math.min(progress + Math.random() * 22, 100);
      if (fill) fill.style.width = `${progress}%`;
      if (progress < 100) {
        setTimeout(step, 120);
      } else {
        setTimeout(() => loader.classList.add("is-hidden"), 200);
      }
    };
    step();
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  window.FSRP_observeReveals = observeReveals;
  window.FSRP_showToast = showToast;

  window.FSRP_initAnimations = function initAnimations() {
    initLoader();
    initRipple();
    initCursorGlow();
    observeReveals();
  };
})();
