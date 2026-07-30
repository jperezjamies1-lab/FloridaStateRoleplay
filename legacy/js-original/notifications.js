/**
 * FSRP — Notification Center
 * =============================
 * Starts empty on purpose — no fabricated "SSU Started" / "Giveaway"
 * entries. Real notifications get added later by calling
 * window.FSRP_pushNotification({ icon, text, category }) from wherever
 * the real event happens (SSU command, application system, etc).
 * In-memory only for this preview; swap the `store` object for
 * localStorage once this is deployed to real hosting (see note at the
 * bottom of this file).
 */
(function () {
  "use strict";

  const store = { items: [] }; // { id, icon, text, category, time, read }
  let nextId = 1;

  function render() {
    const list = document.getElementById("notif-list");
    const badge = document.getElementById("notif-badge");
    if (!list || !badge) return;

    const unread = store.items.filter((n) => !n.read).length;
    badge.textContent = String(unread);
    badge.hidden = unread === 0;

    if (store.items.length === 0) {
      list.innerHTML = `<div class="notif-empty">No notifications yet.<br>You'll see SSUs, application updates, and announcements here.</div>`;
      return;
    }

    list.innerHTML = store.items
      .map(
        (n) => `
        <div class="notif-item ${n.read ? "" : "is-unread"}" data-id="${n.id}">
          <span class="notif-icon">${n.icon}</span>
          <div>
            <div class="notif-text">${n.text}</div>
            <div class="notif-time">${n.time}</div>
          </div>
        </div>`
      )
      .join("");
  }

  function pushNotification({ icon = "🔔", text, category = "general" }) {
    store.items.unshift({
      id: nextId++,
      icon,
      text,
      category,
      time: new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
      read: false,
    });
    render();
  }

  function markAllRead() {
    store.items.forEach((n) => (n.read = true));
    render();
  }

  function initNotifications() {
    const bellBtn = document.getElementById("notif-bell");
    const panel = document.getElementById("notif-panel");
    const markReadBtn = document.getElementById("notif-mark-read");
    if (!bellBtn || !panel) return;

    bellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("is-open");
      bellBtn.setAttribute(
        "aria-expanded",
        panel.classList.contains("is-open") ? "true" : "false"
      );
    });

    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target) && e.target !== bellBtn) {
        panel.classList.remove("is-open");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") panel.classList.remove("is-open");
    });

    markReadBtn && markReadBtn.addEventListener("click", markAllRead);

    render();
  }

  window.FSRP_initNotifications = initNotifications;
  window.FSRP_pushNotification = pushNotification;
})();
