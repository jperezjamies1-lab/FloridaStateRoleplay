(function () {
  "use strict";

  const READ_KEY = "fsrp_v3_read_notifications";
  let filter = "all";

  function readSet() {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); } catch (_) { return new Set(); }
  }

  function saveRead(set) { localStorage.setItem(READ_KEY, JSON.stringify([...set])); }

  function items() {
    const c = window.FSRP_STORE.content;
    const announcementItems = (c.announcements || []).filter((x) => x.published !== false).map((x) => ({ id: `announcement:${x.id}`, category: x.category || "announcement", title: x.title, body: x.body, date: x.date || "", icon: x.category === "website" ? "⌘" : "◎" }));
    const eventItems = (c.events || []).filter((x) => x.published !== false).map((x) => ({ id: `event:${x.id}`, category: "session", title: x.title, body: x.description || "Community event", date: x.date || "", icon: "◷" }));
    return [...announcementItems, ...eventItems].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function visibleItems() { return items().filter((x) => filter === "all" || x.category === filter || (filter === "announcement" && x.category !== "session" && x.category !== "website")); }

  function render() {
    const host = document.getElementById("notification-list");
    const badge = document.getElementById("notif-count");
    if (!host || !badge) return;
    const read = readSet();
    const all = items();
    const unread = all.filter((x) => !read.has(x.id)).length;
    badge.hidden = unread === 0;
    badge.textContent = unread > 99 ? "99+" : String(unread);
    const list = visibleItems();
    if (!list.length) {
      host.innerHTML = `<div class="notif-empty"><strong>No notifications in this category.</strong><br>Published announcements and events will appear here.</div>`;
      return;
    }
    host.innerHTML = list.map((item) => `
      <article class="notif-item ${read.has(item.id) ? "" : "is-unread"}" data-notification-id="${escapeHtml(item.id)}">
        <span class="notif-icon">${escapeHtml(item.icon)}</span>
        <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p><time>${formatDate(item.date)}</time></div>
      </article>`).join("");
  }

  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  function formatDate(value) { if (!value) return "Official update"; const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }

  function open() {
    const panel = document.getElementById("notification-panel");
    panel?.classList.toggle("is-open");
    document.getElementById("notif-trigger")?.setAttribute("aria-expanded", String(panel?.classList.contains("is-open")));
    render();
  }
  function close() { document.getElementById("notification-panel")?.classList.remove("is-open"); }

  function init() {
    document.getElementById("notif-trigger")?.addEventListener("click", (event) => { event.stopPropagation(); open(); });
    document.querySelectorAll("[data-open-notifications]").forEach((node) => node.addEventListener("click", open));
    document.addEventListener("click", (event) => {
      const panel = document.getElementById("notification-panel");
      if (panel?.classList.contains("is-open") && !event.target.closest("#notification-panel, #notif-trigger")) close();
    });
    document.getElementById("notification-list")?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-notification-id]");
      if (!item) return;
      const read = readSet(); read.add(item.dataset.notificationId); saveRead(read); render();
    });
    document.getElementById("mark-all-read")?.addEventListener("click", () => { const read = readSet(); items().forEach((x) => read.add(x.id)); saveRead(read); render(); });
    document.querySelectorAll("[data-notif-filter]").forEach((button) => button.addEventListener("click", () => {
      filter = button.dataset.notifFilter;
      document.querySelectorAll("[data-notif-filter]").forEach((node) => node.classList.toggle("is-active", node === button));
      render();
    }));
    window.addEventListener("fsrp:content", render);
    render();
  }

  window.FSRP_NOTIFICATIONS = { init, render, open };
})();
