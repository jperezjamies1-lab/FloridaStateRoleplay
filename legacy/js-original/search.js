/**
 * FSRP — Command Palette
 * =========================
 * Fully functional client-side search — no backend needed since it
 * searches the static site map in config.js. Add a page? Add a row to
 * config.siteMap and it's searchable immediately.
 */
(function () {
  "use strict";

  let activeIndex = 0;
  let currentResults = [];

  function fuzzyMatch(query, label) {
    query = query.toLowerCase().trim();
    label = label.toLowerCase();
    if (!query) return true;
    return label.includes(query);
  }

  function getResults(query) {
    const items = window.FSRP_CONFIG.siteMap;
    return items.filter((item) => fuzzyMatch(query, item.label));
  }

  function renderResults(results) {
    const list = document.getElementById("palette-results");
    if (!list) return;
    currentResults = results;
    activeIndex = 0;

    if (results.length === 0) {
      list.innerHTML = `<div class="palette-empty">No matches. Try "departments", "rules", or "support".</div>`;
      return;
    }

    list.innerHTML =
      `<div class="palette-group-label">Jump to</div>` +
      results
        .map(
          (item, i) => `
        <div class="palette-item ${i === 0 ? "is-active" : ""}" data-index="${i}" data-section="${item.section}">
          <span class="p-icon">${item.icon}</span>
          <span>${item.label}</span>
        </div>`
        )
        .join("");
  }

  function setActive(index) {
    const items = document.querySelectorAll("#palette-results .palette-item");
    if (!items.length) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((el, i) =>
      el.classList.toggle("is-active", i === activeIndex)
    );
  }

  function openResult(index) {
    const item = currentResults[index];
    if (!item) return;
    closePalette();
    if (item.external) {
      window.open(window.FSRP_CONFIG.links.discordInvite, "_blank", "noopener");
    } else {
      window.location.hash = `#${item.section}`;
    }
  }

  function openPalette() {
    const overlay = document.getElementById("palette-overlay");
    const input = document.getElementById("palette-input");
    if (!overlay) return;
    overlay.classList.add("is-open");
    renderResults(getResults(""));
    input && input.focus();
  }

  function closePalette() {
    const overlay = document.getElementById("palette-overlay");
    const input = document.getElementById("palette-input");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    if (input) input.value = "";
  }

  function initCommandPalette() {
    const trigger = document.getElementById("palette-trigger");
    const overlay = document.getElementById("palette-overlay");
    const input = document.getElementById("palette-input");
    if (!overlay || !input) return;

    trigger && trigger.addEventListener("click", openPalette);

    document.addEventListener("keydown", (e) => {
      const typingInField =
        document.activeElement &&
        ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        overlay.classList.contains("is-open") ? closePalette() : openPalette();
      } else if (e.key === "/" && !typingInField) {
        e.preventDefault();
        openPalette();
      } else if (e.key === "Escape") {
        closePalette();
      } else if (overlay.classList.contains("is-open")) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive(activeIndex + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive(activeIndex - 1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          openResult(activeIndex);
        }
      }
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePalette();
    });

    input.addEventListener("input", () => {
      renderResults(getResults(input.value));
    });

    document.getElementById("palette-results").addEventListener("click", (e) => {
      const row = e.target.closest(".palette-item");
      if (row) openResult(Number(row.dataset.index));
    });
  }

  window.FSRP_initCommandPalette = initCommandPalette;
})();
