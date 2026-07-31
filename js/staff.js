(function () {
  let rank = "all";
  let presence = new Map();
  let presenceTimer = null;
  const escape = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "");

  function statusFor(member) {
    if (member.discordUserId && presence.has(String(member.discordUserId))) {
      const value = presence.get(String(member.discordUserId));
      return value === "dnd" ? "Do Not Disturb" : value.charAt(0).toUpperCase() + value.slice(1);
    }
    return member.status || "Status Unavailable";
  }

  function render() {
    const site = FSRP_STORE.get();
    const spotlight = site.spotlight || {};
    const avatar = document.getElementById("spotlight-avatar");
    if (avatar) {
      avatar.replaceChildren();
      if (spotlight.avatarUrl) {
        const image = new Image();
        image.src = spotlight.avatarUrl;
        image.alt = spotlight.name || "Staff spotlight";
        avatar.append(image);
      } else avatar.textContent = spotlight.initials || "FS";
    }
    const values = {
      "spotlight-name": spotlight.name,
      "spotlight-rank": spotlight.rank,
      "spotlight-team": spotlight.team,
      "spotlight-reason": spotlight.reason,
    };
    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id);
      if (element) element.textContent = value || "";
    }
    const tags = document.getElementById("spotlight-tags");
    if (tags) {
      tags.replaceChildren();
      for (const value of spotlight.tags || []) {
        const tag = document.createElement("span");
        tag.textContent = value;
        tags.append(tag);
      }
    }
    const recognition = document.getElementById("recognition-board");
    if (recognition) recognition.innerHTML = (site.recognition || []).map((item) => `<article class="recognition-card"><span class="eyebrow">Recognition</span><h3>${escape(item.title)}</h3><strong>${escape(item.name)}</strong><p>${escape(item.description)}</p></article>`).join("");
    const strip = document.getElementById("rank-strip");
    if (strip) strip.innerHTML = `<button class="rank-filter ${rank === "all" ? "is-active" : ""}" data-rank="all">All Staff</button>` + (site.ranks || []).slice().sort((a, b) => Number(a.order || 999) - Number(b.order || 999)).map((item) => `<button class="rank-filter ${rank === item.id ? "is-active" : ""}" data-rank="${escape(item.id)}">${escape(item.name)}</button>`).join("");
    const members = (site.staff || []).filter((member) => member.published !== false && (rank === "all" || member.rank === rank)).sort((a, b) => Number(a.customOrder || 999) - Number(b.customOrder || 999));
    const grid = document.getElementById("staff-grid");
    if (grid) grid.innerHTML = members.map((member) => `<article class="staff-card"><div class="staff-card-head"><div class="staff-avatar">${member.avatarUrl ? `<img src="${escape(member.avatarUrl)}" alt="">` : escape(member.initials || "FS")}</div><div><h3>${escape(member.name)}</h3><span class="badge">${escape((site.ranks || []).find((item) => item.id === member.rank)?.name || member.rank)}</span></div></div><p>${escape(member.title || "")}</p><small>${escape(statusFor(member))}</small></article>`).join("") || '<p class="muted">No published staff members in this rank.</p>';
    const badge = document.getElementById("staff-count-badge");
    if (badge) badge.textContent = `${members.length} member${members.length === 1 ? "" : "s"}`;
  }

  async function pollPresence() {
    window.clearTimeout(presenceTimer);
    if (document.hidden) return;
    try {
      const response = await fetch("/api/presence", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        presence = new Map((data.available ? data.members : []).map((item) => [String(item.discordUserId), item.status]));
        render();
      }
    } catch {}
    presenceTimer = window.setTimeout(pollPresence, 120000);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rank]");
    if (button) {
      rank = button.dataset.rank;
      render();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(presenceTimer);
    else pollPresence();
  });
  document.addEventListener("fsrp:state", render);
  document.addEventListener("DOMContentLoaded", () => {
    render();
    pollPresence();
  });
})();
