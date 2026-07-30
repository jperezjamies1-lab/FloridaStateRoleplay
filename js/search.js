(function () {
  "use strict";

  let results = [];
  let activeIndex = 0;

  function text(value) { return String(value || "").toLowerCase(); }

  function buildIndex() {
    const c = window.FSRP_STORE.content;
    const pageEnabled = (page) => page === "home" || page === "manager" || c.features?.[page] !== false && String(c.features?.[page]) !== "false";
    const index = (window.FSRP_SITE_MAP || []).filter((item) => pageEnabled(item.page)).map((item) => ({
      type: "Page", label: item.label, description: item.description, page: item.page, icon: item.icon, keywords: item.keywords || "",
    }));

    (pageEnabled("departments") ? c.departments || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "Department", label: x.name, description: x.description, page: "departments", icon: x.code, keywords: `${x.code} ${x.category} ${x.requirements || ""}` }));
    (pageEnabled("staff") ? c.staff || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "Staff", label: x.displayName || x.username, description: `${x.positionTitle || "Staff"} · ${x.department || "FSRP"}`, page: "staff", icon: "♙", keywords: `${x.username} ${x.rankId} ${x.callsign || ""}` }));
    (pageEnabled("rules") ? c.rules || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "Rule", label: x.title, description: (x.items || []).slice(0, 2).join(" "), page: "rules", icon: x.number || "§", keywords: (x.items || []).join(" ") }));
    (pageEnabled("community") ? c.announcements || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "Announcement", label: x.title, description: x.body, page: "community", icon: "◎", keywords: `${x.category} ${x.date}` }));
    (pageEnabled("community") ? c.events || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "Event", label: x.title, description: x.description || "Community event", page: "community", icon: "◷", keywords: `${x.date} ${x.type || ""}` }));
    (pageEnabled("community") ? c.gallery || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "Media", label: x.title, description: x.category || "FSRP media", page: "community", icon: x.type === "video" ? "▶" : "▧", keywords: `${x.type} ${x.category || ""}` }));
    (pageEnabled("support") ? c.support || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "Support", label: x.title, description: x.body, page: "support", icon: x.icon || "?", keywords: x.label || "" }));
    (pageEnabled("platform") ? c.systems || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "System", label: x.title, description: x.body, page: "platform", icon: x.icon || "⌘", keywords: "community platform operations" }));
    (pageEnabled("platform") ? c.faqs || [] : []).filter((x) => x.published !== false).forEach((x) => index.push({ type: "FAQ", label: x.question, description: x.answer, page: "platform", icon: "?", keywords: "help question answer" }));
    return index;
  }

  function score(item, query) {
    const q = text(query).trim();
    if (!q) return 1;
    const label = text(item.label);
    const haystack = `${label} ${text(item.description)} ${text(item.keywords)} ${text(item.type)}`;
    if (label === q) return 100;
    if (label.startsWith(q)) return 80;
    if (label.includes(q)) return 60;
    const words = q.split(/\s+/).filter(Boolean);
    return words.every((word) => haystack.includes(word)) ? 30 + words.length : 0;
  }

  function search(query) {
    return buildIndex().map((item) => ({ ...item, score: score(item, query) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 24);
  }

  function render(query = "") {
    const host = document.getElementById("search-results");
    if (!host) return;
    results = search(query);
    activeIndex = 0;
    if (!results.length) {
      host.innerHTML = `<div class="search-empty"><strong>No results found.</strong><br>Try a department, rule, staff rank, support type, or page name.</div>`;
      return;
    }
    const grouped = results.reduce((acc, item, index) => {
      (acc[item.type] ||= []).push({ item, index });
      return acc;
    }, {});
    host.innerHTML = Object.entries(grouped).map(([group, rows]) => `<div class="search-group">${escapeHtml(group)}</div>${rows.map(({ item, index }) => `
      <button class="search-result ${index === 0 ? "is-active" : ""}" data-search-index="${index}">
        <span class="search-result-icon">${escapeHtml(item.icon)}</span>
        <span><strong>${highlight(item.label, query)}</strong><small>${highlight(item.description || "", query)}</small></span>
        <span class="dim">↵</span>
      </button>`).join("")}`).join("");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function highlight(value, query) {
    const safe = escapeHtml(value);
    const q = String(query || "").trim();
    if (!q) return safe;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(`(${escaped})`, "ig"), "<mark>$1</mark>");
  }

  function open() {
    const layer = document.getElementById("search-layer");
    const input = document.getElementById("search-input");
    layer?.classList.add("is-open");
    document.body.classList.add("is-locked");
    render(input?.value || "");
    setTimeout(() => input?.focus(), 30);
    window.FSRP_SOUND?.tone("open");
  }

  function close() {
    document.getElementById("search-layer")?.classList.remove("is-open");
    document.body.classList.remove("is-locked");
  }

  function setActive(next) {
    const items = [...document.querySelectorAll("[data-search-index]")];
    if (!items.length) return;
    activeIndex = (next + items.length) % items.length;
    items.forEach((node, i) => node.classList.toggle("is-active", i === activeIndex));
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  function choose(index) {
    const item = results[index];
    if (!item) return;
    close();
    if (location.hash === `#${item.page}`) window.FSRP_ROUTER.navigate(item.page);
    else location.hash = item.page;
  }

  function init() {
    const layer = document.getElementById("search-layer");
    const input = document.getElementById("search-input");
    document.getElementById("search-trigger")?.addEventListener("click", open);
    document.querySelectorAll("[data-open-search]").forEach((node) => node.addEventListener("click", open));
    input?.addEventListener("input", () => render(input.value));
    layer?.addEventListener("click", (event) => { if (event.target === layer) close(); });
    document.getElementById("search-results")?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-search-index]");
      if (row) choose(Number(row.dataset.searchIndex));
    });
    document.addEventListener("keydown", (event) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); layer?.classList.contains("is-open") ? close() : open(); }
      else if (event.key === "/" && !typing) { event.preventDefault(); open(); }
      else if (event.key === "Escape" && layer?.classList.contains("is-open")) close();
      else if (layer?.classList.contains("is-open") && event.key === "ArrowDown") { event.preventDefault(); setActive(activeIndex + 1); }
      else if (layer?.classList.contains("is-open") && event.key === "ArrowUp") { event.preventDefault(); setActive(activeIndex - 1); }
      else if (layer?.classList.contains("is-open") && event.key === "Enter") { event.preventDefault(); choose(activeIndex); }
    });
  }

  window.FSRP_SEARCH = { init, open, close, render };
})();
