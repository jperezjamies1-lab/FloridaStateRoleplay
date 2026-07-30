/**
 * FSRP — Mission Control Dashboard
 * ==================================
 * Renders the console, department chips, and department cards from
 * config.js. Live numbers (players/queue/priority) only render once a
 * real data source is wired up — see fetchServerStatus() below. Until
 * then it shows the same "updating" fallback the spec asked for, never
 * a fabricated number.
 */
(function () {
  "use strict";

  const cfg = window.FSRP_CONFIG;

  /**
   * TODO: point this at a real source once one exists, e.g.:
   *   const res = await fetch('/api/server-status');
   *   return res.json(); // { online, players, queue, priority }
   * Returns null when nothing is connected — the caller shows a fallback
   * state rather than guessing at numbers.
   */
  async function fetchServerStatus() {
    if (cfg.server.dataSource === "none") return null;
    return null; // real integrations implemented in a later phase
  }

  function renderConsole(status) {
    const root = document.getElementById("console-root");
    if (!root) return;

    const live = Boolean(status && status.online);
    const dotClass = status ? (live ? "is-live" : "is-offline") : "";

    root.querySelector("[data-dot]").className = `status-dot ${dotClass}`;
    root.querySelector("[data-status-label]").textContent = status
      ? live
        ? "Live"
        : "Offline"
      : "Awaiting connection";

    const cells = {
      players: status ? String(status.players) : "—",
      queue: status ? String(status.queue) : "—",
      priority: status && status.priority ? "Active" : status ? "Inactive" : "—",
      nextSSU: cfg.server.nextSSU
        ? new Date(cfg.server.nextSSU).toLocaleString(undefined, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })
        : "Not scheduled",
    };
    Object.entries(cells).forEach(([key, value]) => {
      const el = root.querySelector(`[data-cell="${key}"]`);
      if (el) el.textContent = value;
    });

    const footer = root.querySelector("[data-console-footer]");
    if (footer) {
      footer.textContent = status
        ? `Updated ${new Date().toLocaleTimeString()}`
        : "Live data connects in a later phase — showing placeholder-free fallback state";
    }
  }

  function renderDeptChips(status) {
    const wrap = document.getElementById("console-departments");
    if (!wrap) return;
    wrap.innerHTML = "";
    cfg.departments.forEach((dept) => {
      const chip = document.createElement("div");
      chip.className = "dept-chip";
      chip.dataset.status = dept.status;
      chip.innerHTML = `<span class="dept-name">${dept.code}</span><span class="dept-status">${dept.status}</span>`;
      wrap.appendChild(chip);
    });
  }

  function renderDeptCards() {
    const grid = document.getElementById("dept-grid");
    if (!grid) return;
    grid.innerHTML = "";
    cfg.departments.forEach((dept) => {
      const card = document.createElement("article");
      card.className = "dept-card glass reveal";
      card.innerHTML = `
        <div class="dept-card-top">
          <div class="dept-card-icon">${dept.code}</div>
          <span class="badge" data-status="${dept.status}">${dept.status}</span>
        </div>
        <h3>${dept.name}</h3>
        <p>Roleplay the men and women of ${dept.name}.</p>
      `;
      grid.appendChild(card);
    });
    window.FSRP_observeReveals && window.FSRP_observeReveals();
  }

  function animateCounter(el) {
    const target = Number(el.dataset.target || 0);
    const duration = 1200;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function setupStatCounters() {
    const counters = document.querySelectorAll("[data-counter]");
    if (!counters.length) return;
    if (typeof IntersectionObserver === "undefined") {
      counters.forEach(animateCounter);
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            entry.target.closest(".stat-card")?.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach((c) => io.observe(c));
  }

  async function initDashboard() {
    const status = await fetchServerStatus();
    renderConsole(status);
    renderDeptChips(status);
    renderDeptCards();
    setupStatCounters();
  }

  window.FSRP_initDashboard = initDashboard;
})();
