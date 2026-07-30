(function () {
  "use strict";

  let activeRank = "all";
  let livePresence = new Map();
  let presenceTimer = null;

  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  function truthy(value) { return value !== false && String(value) !== "false"; }
  function safeImage(value) {
    const url = String(value || "").trim();
    return /^(https?:\/\/|\/|data:image\/)/i.test(url) ? url : "";
  }

  const presenceLabels = {
    online: "Online",
    idle: "Idle",
    dnd: "Do Not Disturb",
    offline: "Offline",
    unavailable: "Status Unavailable",
  };

  function rankMap() {
    return new Map((window.FSRP_STORE.get("ranks") || []).filter((rank) => truthy(rank.published)).map((rank) => [rank.id, rank]));
  }

  function memberStatus(member) {
    const live = livePresence.get(String(member.discordUserId || ""));
    if (live && presenceLabels[live.status]) return live.status;
    return presenceLabels[member.presenceStatus] ? member.presenceStatus : "unavailable";
  }

  function publishedStaff() {
    return (window.FSRP_STORE.get("staff") || []).filter((x) => truthy(x.published)).sort((a, b) => (Number(a.customOrder) || 999) - (Number(b.customOrder) || 999));
  }

  function renderRanks() {
    const host = document.getElementById("rank-strip");
    if (!host) return;
    const ranks = (window.FSRP_STORE.get("ranks") || []).filter((rank) => truthy(rank.published)).slice().sort((a, b) => Number(a.order) - Number(b.order));
    const staff = publishedStaff();
    const allOnline = staff.filter((x) => memberStatus(x) === "online").length;
    const allCard = `<button class="rank-card ${activeRank === "all" ? "is-active" : ""}" data-rank-filter="all"><b>ALL</b><strong>All Staff</strong><small>${staff.length} members · ${allOnline} online</small></button>`;
    host.innerHTML = allCard + ranks.map((rank) => {
      const members = staff.filter((x) => x.rankId === rank.id);
      const online = members.filter((x) => memberStatus(x) === "online").length;
      return `<button class="rank-card ${activeRank === rank.id ? "is-active" : ""}" data-rank-filter="${esc(rank.id)}"><b>${String(rank.order).padStart(2, "0")}</b><strong>${esc(rank.name)}</strong><small>${members.length} member${members.length === 1 ? "" : "s"} · ${online} online</small></button>`;
    }).join("");
  }

  function initials(member) {
    const name = member.displayName || member.username || "FS";
    return name.replace(/^@/, "").split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  }

  function renderStaff() {
    const host = document.getElementById("staff-grid");
    if (!host) return;
    const ranks = rankMap();
    const all = publishedStaff();
    const list = activeRank === "all" ? all : all.filter((x) => x.rankId === activeRank);
    const rank = ranks.get(activeRank);
    document.getElementById("staff-section-title").textContent = activeRank === "all" ? "All published staff" : rank?.name || "Published staff";
    document.getElementById("staff-count-badge").textContent = `${list.length} member${list.length === 1 ? "" : "s"}`;
    if (!list.length) {
      host.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No published staff members in this division.</div>`;
      return;
    }
    host.innerHTML = list.map((member) => {
      const status = memberStatus(member);
      const rankName = ranks.get(member.rankId)?.name || member.positionTitle || "Staff";
      const avatarUrl = safeImage(member.avatarUrl);
      const avatar = avatarUrl ? `<img src="${esc(avatarUrl)}" alt="${esc(member.displayName || member.username)} avatar" loading="lazy" onerror="this.parentElement.textContent='${esc(initials(member))}'">` : esc(initials(member));
      return `<article class="staff-card reveal">
        <div class="staff-avatar">${avatar}</div>
        <div class="staff-main"><h3>${esc(member.displayName || member.username)}</h3><span class="username">${esc(member.username || "")}</span><p class="staff-role">${esc(member.positionTitle || rankName)}${member.department ? ` · ${esc(member.department)}` : ""}${member.callsign ? ` · ${esc(member.callsign)}` : ""}</p><span class="presence"><i class="status-dot ${esc(status)}"></i>${presenceLabels[status]}</span></div>
        <p class="staff-bio">${esc(member.bio || "Official Florida State Roleplay staff member.")}</p>
      </article>`;
    }).join("");
  }

  function render() {
    renderRanks();
    renderStaff();
    window.FSRP_REVEAL?.();
  }

  function schedulePresence() {
    clearTimeout(presenceTimer);
    if (document.hidden) return;
    presenceTimer = setTimeout(fetchPresence, 90_000);
  }

  async function fetchPresence() {
    if (document.hidden) return schedulePresence();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch("/api/presence", { signal: controller.signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Presence API ${response.status}`);
      const payload = await response.json();
      livePresence = new Map((payload.available ? payload.members : []).map((entry) => [String(entry.discordUserId), entry]));
      render();
    } catch (_) {
      // Preserve explicit manager-provided states. Unknown records remain
      // Status Unavailable instead of being mislabeled Offline.
    } finally {
      clearTimeout(timeout);
      schedulePresence();
    }
  }

  function init() {
    document.getElementById("rank-strip")?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-rank-filter]");
      if (!card) return;
      activeRank = card.dataset.rankFilter;
      render();
    });
    window.addEventListener("fsrp:content", render);
    window.addEventListener("fsrp:route", (event) => { if (event.detail.page === "staff") fetchPresence(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimeout(presenceTimer); else fetchPresence(); });
    render();
    fetchPresence();
  }

  window.FSRP_STAFF = { init, render };
})();
