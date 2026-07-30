(function () {
  "use strict";

  let countState = { discord: null, roblox: null, youtube: null };

  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  function truthy(value) { return value !== false && String(value) !== "false"; }

  function safeHref(value, fallback = "#") {
    const url = String(value || "").trim();
    return /^(https?:\/\/|\/|#)/i.test(url) ? url : fallback;
  }

  function safeImage(value, fallback = "/assets/brand/fsrp-logo.png") {
    const url = String(value || "").trim();
    return /^(https?:\/\/|\/|data:image\/)/i.test(url) ? url : fallback;
  }

  function fmt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : "—";
  }

  function setAll(selector, value) {
    document.querySelectorAll(selector).forEach((node) => { node.textContent = value; });
  }

  function statusValue(value, fallback = "Unavailable") {
    return String(value || "").trim() || fallback;
  }

  function renderStatus() {
    const s = window.FSRP_STORE.get("status") || {};
    const session = statusValue(s.session, "Server Offline");
    setAll("[data-session-status]", session);
    setAll("[data-player-count]", statusValue(s.players));
    setAll("[data-queue-count]", statusValue(s.queue));
    setAll("[data-priority-status]", statusValue(s.priority));
    setAll("[data-server-code]", session.toLowerCase().includes("offline") ? "Hidden while offline" : statusValue(s.code));
    const hero = document.getElementById("hero-session-status");
    if (hero) hero.textContent = session;
    const message = document.getElementById("dashboard-status-message");
    if (message) message.textContent = s.message || "Status details are managed by FSRP leadership.";
    const by = document.getElementById("dashboard-updated-by");
    if (by) by.textContent = s.updatedBy || "FSRP Leadership";
    const updated = s.updatedAt ? new Date(s.updatedAt) : null;
    const updatedText = updated && !Number.isNaN(updated.getTime()) ? updated.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Waiting for update";
    [document.getElementById("dashboard-updated"), document.getElementById("status-updated")].forEach((node) => { if (node) node.textContent = updatedText; });

    const active = /active|full|starting|restart/i.test(session) && !/offline|shutdown/i.test(session);
    const badge = document.getElementById("dashboard-status-badge");
    if (badge) badge.innerHTML = `<i class="status-dot ${active ? "online" : "unavailable"}"></i>${active ? "Operations active" : "Manual status"}`;
  }

  async function fetchCounts() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4200);
    try {
      const response = await fetch("/api/counts", { signal: controller.signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Counts API ${response.status}`);
      const payload = await response.json();
      countState = payload.counts || countState;
    } catch (_) {
      countState = countState || {};
    } finally {
      clearTimeout(timer);
      renderCounts();
    }
  }

  function extractCount(platform, keys) {
    const data = countState?.[platform] || {};
    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== "") return data[key];
    }
    return null;
  }

  function renderCounts() {
    const members = extractCount("discord", ["members", "memberCount", "approximate_member_count"]);
    const online = extractCount("discord", ["online", "onlineCount", "approximate_presence_count"]);
    setAll("[data-discord-members]", members == null ? "—" : fmt(members));
    setAll("[data-discord-online]", online == null ? "—" : fmt(online));
  }

  function renderDepartments() {
    const depts = (window.FSRP_STORE.get("departments") || []).filter((x) => truthy(x.published));
    const cards = depts.map((dept) => `
      <article class="dept-card reveal" data-code="${esc(dept.code)}" data-category="${esc(dept.category)}">
        <img src="${esc(safeImage(dept.image))}" alt="${esc(dept.name)} emblem" loading="lazy" onerror="this.src='/assets/brand/fsrp-logo.png'">
        <span class="badge ${String(dept.status).toLowerCase() === "active" ? "is-live" : ""}">${esc(dept.status || "Unavailable")}</span>
        <h3>${esc(dept.name)}</h3><p>${esc(dept.description)}</p>
        <footer><span>${esc(dept.code)}</span><a href="${esc(safeHref(dept.link, safeHref(window.FSRP_STORE.get("links.discord"))))}" target="_blank" rel="noopener">Department access →</a></footer>
      </article>`).join("");
    ["home-departments", "departments-grid"].forEach((id) => {
      const host = document.getElementById(id);
      if (host) host.innerHTML = cards || `<div class="empty-state" style="grid-column:1/-1">No departments are published.</div>`;
    });
    const dash = document.getElementById("dashboard-departments");
    if (dash) dash.innerHTML = depts.map((d) => `<div class="quick-card"><span>${esc(d.code)}</span><strong>${esc(d.status || "Unavailable")}</strong></div>`).join("");
  }

  function renderMarketplace() {
    const host = document.getElementById("market-grid");
    if (!host) return;
    const items = (window.FSRP_STORE.get("marketplace") || []).filter((x) => truthy(x.published));
    host.innerHTML = items.length ? items.map((item) => `
      <article class="market-card ${item.featured ? "featured" : ""}"><span class="badge ${item.featured ? "is-warning" : ""}">${esc(item.tag || "Official")}</span><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><div class="market-list">${(item.benefits || []).map((b) => `<span>${esc(b)}</span>`).join("")}</div><a class="btn ${item.featured ? "btn-primary" : "btn-secondary"}" href="${esc(safeHref(item.buttonUrl, safeHref(window.FSRP_STORE.get("links.discord"))))}" target="_blank" rel="noopener">${esc(item.buttonLabel || "Open")}</a></article>`).join("") : `<div class="empty-state" style="grid-column:1/-1">No marketplace items are published.</div>`;
  }

  function renderRules() {
    const nav = document.getElementById("rule-nav");
    const host = document.getElementById("rule-content");
    if (!nav || !host) return;
    const rules = (window.FSRP_STORE.get("rules") || []).filter((x) => truthy(x.published));
    nav.innerHTML = rules.map((rule, i) => `<button class="${i === 0 ? "is-active" : ""}" data-rule-target="${esc(rule.id)}">${esc(rule.number)} · ${esc(rule.title)}</button>`).join("");
    host.innerHTML = rules.map((rule) => `<article class="rule-card reveal" id="rule-${esc(rule.id)}"><h3>${esc(rule.number)} · ${esc(rule.title)}</h3><ul>${(rule.items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul></article>`).join("") || `<div class="empty-state">No rule categories are published.</div>`;
    nav.querySelectorAll("[data-rule-target]").forEach((button) => button.addEventListener("click", () => {
      nav.querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === button));
      document.getElementById(`rule-${button.dataset.ruleTarget}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  function renderPlatform() {
    const systemsHost = document.getElementById("systems-grid");
    const systems = (window.FSRP_STORE.get("systems") || []).filter((x) => truthy(x.published));
    if (systemsHost) systemsHost.innerHTML = systems.map((item) => `<article class="support-card system-card reveal"><span class="support-icon system-icon">${esc(item.icon || "FS")}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join("") || `<div class="empty-state" style="grid-column:1/-1">No community systems are published.</div>`;

    const stepsHost = document.getElementById("join-steps");
    const steps = (window.FSRP_STORE.get("joinSteps") || []).filter((x) => truthy(x.published));
    if (stepsHost) stepsHost.innerHTML = steps.map((item, index) => `<article class="value-item reveal"><b>${esc(item.number || String(index + 1).padStart(2, "0"))}</b><div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div></article>`).join("") || `<div class="empty-state" style="grid-column:1/-1">No onboarding steps are published.</div>`;

    const faqHost = document.getElementById("faq-list");
    const faqs = (window.FSRP_STORE.get("faqs") || []).filter((x) => truthy(x.published));
    if (faqHost) faqHost.innerHTML = faqs.map((item, index) => `<details class="faq-item reveal" ${index === 0 ? "open" : ""}><summary>${esc(item.question)}<span aria-hidden="true">+</span></summary><p>${esc(item.answer)}</p></details>`).join("") || `<div class="empty-state">No frequently asked questions are published.</div>`;
  }

  function renderSupport() {
    const host = document.getElementById("support-grid");
    if (!host) return;
    const items = (window.FSRP_STORE.get("support") || []).filter((x) => truthy(x.published));
    host.innerHTML = items.map((item) => `<article class="support-card reveal"><span class="support-icon">${esc(item.icon || "?")}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><a href="${esc(safeHref(item.url, safeHref(window.FSRP_STORE.get("links.discord"))))}" target="_blank" rel="noopener">${esc(item.label || "Open support")} →</a></article>`).join("") || `<div class="empty-state" style="grid-column:1/-1">No support paths are published.</div>`;
  }

  function renderCommunity() {
    const announcements = (window.FSRP_STORE.get("announcements") || []).filter((x) => truthy(x.published)).slice().sort((a, b) => Number(truthy(b.pinned)) - Number(truthy(a.pinned)) || String(b.date || "").localeCompare(String(a.date || "")));
    const featured = announcements.find((x) => x.priority === "featured") || announcements[0];
    if (featured) {
      document.getElementById("featured-announcement-title").textContent = featured.title;
      document.getElementById("featured-announcement-body").textContent = featured.body;
      document.getElementById("featured-announcement-date").textContent = featured.date || "Latest update";
      const image = document.getElementById("featured-announcement-image");
      const imageUrl = safeImage(featured.image, "");
      if (image) { image.hidden = !imageUrl; if (imageUrl) image.src = imageUrl; image.alt = imageUrl ? `${featured.title || "Announcement"} image` : ""; }
      const actions = document.getElementById("featured-announcement-actions");
      if (actions) {
        const buttons = [[featured.button1Label, featured.button1Url], [featured.button2Label, featured.button2Url]].filter(([label, url]) => label && safeHref(url, "") !== "");
        actions.innerHTML = `${buttons.map(([label, url], index) => `<a class="btn ${index === 0 ? "btn-primary" : "btn-secondary"} btn-small" href="${esc(safeHref(url))}" target="_blank" rel="noopener">${esc(label)}</a>`).join("")}<button class="btn btn-ghost btn-small" data-community-tab-jump="announcements">All announcements</button>`;
        actions.querySelector("[data-community-tab-jump]")?.addEventListener("click", () => switchCommunity("announcements"));
      }
    }
    const grid = document.getElementById("announcement-grid");
    if (grid) grid.innerHTML = announcements.length ? announcements.map((item, i) => {
      const imageUrl = safeImage(item.image, "");
      const buttons = [[item.button1Label, item.button1Url], [item.button2Label, item.button2Url]].filter(([label, url]) => label && safeHref(url, "") !== "");
      return `<article class="bento-card announcement-card ${i === 0 ? "span-7 featured" : "span-5"}">${imageUrl ? `<img class="announcement-image" src="${esc(imageUrl)}" alt="${esc(item.title || "Announcement")} image" loading="lazy">` : ""}<div class="card-meta"><span class="badge ${item.priority === "featured" ? "is-warning" : ""}">${truthy(item.pinned) ? "Pinned · " : ""}${esc(item.category || "Announcement")}</span><time>${esc(item.date || "Official update")}</time></div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${buttons.length ? `<div class="announcement-actions">${buttons.map(([label, url], index) => `<a class="btn ${index === 0 ? "btn-secondary" : "btn-ghost"} btn-small" href="${esc(safeHref(url))}" target="_blank" rel="noopener">${esc(label)}</a>`).join("")}</div>` : ""}</article>`;
    }).join("") : `<div class="empty-state" style="grid-column:1/-1">No public announcements are available.</div>`;

    const events = (window.FSRP_STORE.get("events") || []).filter((x) => truthy(x.published));
    const rail = document.getElementById("events-rail");
    if (rail) rail.innerHTML = events.length ? events.map((item) => `<article class="event-card"><div class="event-date">${esc(item.date || "TBD")}</div><span class="badge">${esc(item.type || "Community event")}</span><h3>${esc(item.title)}</h3><p>${esc(item.description || "Official FSRP event")}</p></article>`).join("") : `<div class="empty-state">No event is scheduled yet. Leadership can publish one from the Manager panel.</div>`;
    const next = events.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
    document.getElementById("next-event-title").textContent = next?.title || "No event scheduled";
    document.getElementById("next-event-description").textContent = next?.description || "Leadership can publish the next SSU, training, meeting, or community event from the Manager panel.";
    document.getElementById("next-event-date").textContent = next?.date || "Awaiting schedule";
    document.getElementById("next-event-short").textContent = next?.date || "Not scheduled";

    const gallery = (window.FSRP_STORE.get("gallery") || []).filter((x) => truthy(x.published));
    const galleryHost = document.getElementById("media-gallery");
    if (galleryHost) galleryHost.innerHTML = gallery.length ? gallery.map((item) => {
      const title = esc(item.title || "FSRP Media");
      const category = esc(item.category || "Community");
      const media = item.type === "video"
        ? `<video controls preload="metadata" src="${esc(safeHref(item.url))}" aria-label="${title}"></video>`
        : `<img src="${esc(safeImage(item.url))}" alt="${title}" loading="lazy" onerror="this.src='/assets/brand/fsrp-logo.png'">`;
      return `<article class="gallery-card ${truthy(item.featured) ? "featured" : ""}">${media}<div><span class="badge">${category}</span><h3>${title}</h3></div></article>`;
    }).join("") : `<div class="empty-state" style="grid-column:1/-1">No media is published yet.</div>`;

    const timeline = (window.FSRP_STORE.get("timeline") || []).filter((x) => truthy(x.published));
    const timeHost = document.getElementById("community-timeline");
    if (timeHost) timeHost.innerHTML = timeline.map((item) => `<article class="timeline-item"><time>${esc(item.date)}</time><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join("") || `<div class="empty-state">No milestones are published.</div>`;
  }

  function renderMaintenance() {
    const screen = document.getElementById("maintenance-screen");
    if (!screen) return;
    const maintenance = window.FSRP_STORE.get("maintenance") || {};
    const managerOpen = window.FSRP_ROUTER?.current === "manager";
    screen.hidden = !truthy(maintenance.enabled) || managerOpen;
    const title = document.getElementById("maintenance-title");
    const message = document.getElementById("maintenance-message");
    if (title) title.textContent = maintenance.title || "Community Hub maintenance";
    if (message) message.textContent = maintenance.message || "Florida State Roleplay is applying an official website update.";
  }

  function renderNoticeAndHero() {
    const c = window.FSRP_STORE.content;
    const notice = document.getElementById("site-notice");
    const noticeEnabled = truthy(c.notice?.enabled);
    if (notice) notice.hidden = !noticeEnabled;
    document.documentElement.style.setProperty("--notice-h", noticeEnabled ? "34px" : "0px");
    document.getElementById("notice-label").textContent = c.notice?.label || "Website Update";
    document.getElementById("notice-text").textContent = c.notice?.text || "";
    document.getElementById("hero-title").innerHTML = `${esc(c.hero?.title1 || "Florida State")}<span class="title-accent">${esc(c.hero?.title2 || "Roleplay.")}</span>`;
    document.getElementById("hero-subtitle").textContent = c.hero?.subtitle || "";
    const primary = document.getElementById("hero-primary");
    if (primary) { primary.textContent = c.hero?.primaryLabel || "Join Florida State Roleplay"; primary.href = safeHref(c.hero?.primaryUrl, safeHref(c.links?.discord)); }
    Object.entries(c.links || {}).forEach(([key, url]) => {
      if (!url) return;
      document.querySelectorAll(`[data-link="${key}"]`).forEach((node) => { node.href = safeHref(url); });
    });
    const heroBackground = String(c.hero?.backgroundUrl || "").trim();
    const safeBackground = /^(https?:\/\/|\/|data:image\/)/i.test(heroBackground);
    document.documentElement.style.setProperty("--hero-image", safeBackground ? `url("${heroBackground.replace(/["\\]/g, "\\$&")}")` : "none");
    document.documentElement.style.setProperty("--cyan", c.theme?.cyan || "#43c7f1");
    document.documentElement.style.setProperty("--gold", c.theme?.gold || "#d9a23a");
  }

  function renderAll() {
    renderNoticeAndHero();
    renderMaintenance();
    renderStatus();
    renderCounts();
    renderDepartments();
    renderMarketplace();
    renderRules();
    renderPlatform();
    renderSupport();
    renderCommunity();
    window.FSRP_STAFF?.render();
    window.FSRP_NOTIFICATIONS?.render();
    window.FSRP_REVEAL?.();
  }

  function init() {
    renderAll();
    fetchCounts();
    window.addEventListener("fsrp:content", renderAll);
    window.addEventListener("fsrp:route", (event) => {
      renderMaintenance();
      if (event.detail.page === "dashboard") fetchCounts();
    });
    document.getElementById("department-filters")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dept-filter]");
      if (!button) return;
      document.querySelectorAll("[data-dept-filter]").forEach((node) => node.classList.toggle("is-active", node === button));
      const filter = button.dataset.deptFilter;
      document.querySelectorAll("#departments-grid .dept-card").forEach((card) => { card.hidden = filter !== "all" && card.dataset.category !== filter; });
    });
    document.querySelectorAll("[data-community-tab]").forEach((button) => button.addEventListener("click", () => switchCommunity(button.dataset.communityTab)));
    document.querySelectorAll("[data-community-tab-jump]").forEach((button) => button.addEventListener("click", () => switchCommunity(button.dataset.communityTabJump)));
  }

  function switchCommunity(tab) {
    document.querySelectorAll("[data-community-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.communityTab === tab));
    document.querySelectorAll("[data-community-panel]").forEach((panel) => { const active = panel.dataset.communityPanel === tab; panel.classList.toggle("is-active", active); panel.hidden = !active; });
  }

  window.FSRP_DASHBOARD = { init, render: renderAll, fetchCounts };
})();
