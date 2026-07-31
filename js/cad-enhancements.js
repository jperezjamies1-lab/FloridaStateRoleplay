(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  let lastLive = null;
  let mapWindow = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function settings() {
    try { return JSON.parse(localStorage.getItem("fsrpCadWorkspace") || "{}"); } catch { return {}; }
  }

  function save(next) {
    localStorage.setItem("fsrpCadWorkspace", JSON.stringify({ ...settings(), ...next }));
  }

  function injectToolbar() {
    const workspace = $("#cad-workspace");
    const layout = workspace?.querySelector(".cad-layout");
    if (!workspace || !layout || $("#cad-enhancement-bar")) return;
    const saved = settings();
    workspace.dataset.cadTheme = saved.theme || "dispatch-blue";
    workspace.dataset.cadLayout = saved.layout || "standard";
    const bar = document.createElement("section");
    bar.id = "cad-enhancement-bar";
    bar.className = "cad-enhancement-bar";
    bar.innerHTML = `<div><span class="eyebrow">FSRP Modular Workspace</span><strong>Live map, themes & multi-monitor tools</strong></div><div class="cad-enhancement-tools"><label>Theme</label><select id="cad-theme-select"><option value="dispatch-blue">Dispatch Blue</option><option value="terminal-green">Terminal Green</option><option value="tactical-amber">Tactical Amber</option></select><label>Layout</label><select id="cad-layout-select"><option value="standard">Standard</option><option value="compact">Compact</option><option value="wide">Wide</option></select><button class="btn btn-ghost btn-small" id="cad-voice-command" type="button">Voice Dispatch Command</button><button class="btn btn-ghost btn-small" id="cad-map-popout" type="button">Pop Out Live Map</button></div>`;
    layout.before(bar);
    $("#cad-theme-select").value = workspace.dataset.cadTheme;
    $("#cad-layout-select").value = workspace.dataset.cadLayout;
    $("#cad-theme-select").addEventListener("change", (event) => { workspace.dataset.cadTheme = event.target.value; save({ theme: event.target.value }); });
    $("#cad-layout-select").addEventListener("change", (event) => { workspace.dataset.cadLayout = event.target.value; save({ layout: event.target.value }); });
    $("#cad-map-popout").addEventListener("click", openMapWindow);
    $("#cad-voice-command").addEventListener("click", startVoiceCommand);
  }

  function injectMap() {
    const live = $("#cad-workspace .cad-erlc-live");
    if (!live || $("#cad-live-map-card")) return;
    const card = document.createElement("article");
    card.id = "cad-live-map-card";
    card.className = "panel cad-card";
    card.innerHTML = `<div class="cad-card-head"><div><span class="eyebrow">ER:LC companion map</span><h3>Live Unit Tracking</h3><p class="muted">A schematic plot made from official ER:LC coordinate data. It is not injected into Roblox.</p></div><span class="badge" id="cad-map-count">0 Units</span></div><div class="cad-live-map" id="cad-live-map"><span class="cad-map-road"></span><span class="cad-map-road two"></span><div class="cad-map-empty">Connect ERLC_SERVER_KEY to display live player positions.</div></div><div class="cad-map-legend"><span><i></i> Player or unit</span><span><i class="staff"></i> Staff-listed player</span></div>`;
    live.insertAdjacentElement("afterend", card);
  }

  function pointRange(players) {
    const points = players.map((player) => ({ player, x: Number(player.location?.x), z: Number(player.location?.z) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
    if (!points.length) return { points, minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    const xs = points.map((point) => point.x), zs = points.map((point) => point.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    return { points, minX, maxX: maxX === minX ? minX + 1 : maxX, minZ, maxZ: maxZ === minZ ? minZ + 1 : maxZ };
  }

  function mapMarkup(live) {
    const players = Array.isArray(live?.players) ? live.players : [];
    const staffIds = new Set((live?.staffIds || []).map(String));
    const range = pointRange(players);
    if (!range.points.length) return '<span class="cad-map-road"></span><span class="cad-map-road two"></span><div class="cad-map-empty">No coordinate-enabled players were returned by ER:LC.</div>';
    return `<span class="cad-map-road"></span><span class="cad-map-road two"></span>${range.points.map(({ player, x, z }) => {
      const left = 6 + ((x - range.minX) / (range.maxX - range.minX)) * 88;
      const top = 8 + ((z - range.minZ) / (range.maxZ - range.minZ)) * 84;
      const label = `${player.callsign || player.name} · ${player.location?.postal || player.location?.street || "Live"}`;
      return `<button class="cad-map-unit ${staffIds.has(String(player.userId)) ? "is-staff" : ""}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" data-label="${esc(label)}" title="${esc(player.name)}">${esc((player.callsign || player.name || "U").slice(0, 3))}</button>`;
    }).join("")}`;
  }

  function renderMap(live) {
    lastLive = live;
    const map = $("#cad-live-map");
    if (map) map.innerHTML = mapMarkup(live);
    const count = $("#cad-map-count");
    if (count) count.textContent = `${Array.isArray(live?.players) ? live.players.length : 0} Units`;
    if (mapWindow && !mapWindow.closed) {
      mapWindow.document.querySelector("#map").innerHTML = mapMarkup(live);
      mapWindow.document.querySelector("#updated").textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }
  }

  function startVoiceCommand() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return window.alert("Voice commands are not supported by this browser. Type the command in the CAD Command Bar instead.");
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const button = $("#cad-voice-command");
    if (button) button.textContent = "Listening…";
    recognition.addEventListener("result", (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
      const normalized = transcript
        .replace(/^set status to /i, "STATUS ")
        .replace(/^status /i, "STATUS ")
        .replace(/^attach to call /i, "ATTACH ")
        .replace(/^switch channel to /i, "CHANNEL ")
        .replace(/^activate panic$/i, "PANIC")
        .replace(/^clear panic$/i, "CLEAR PANIC");
      const input = $("#cad-command-input");
      if (input) input.value = normalized.toUpperCase();
      $("#cad-command-run")?.click();
    });
    recognition.addEventListener("error", () => window.alert("The voice command could not be captured. Check microphone permission or type the command."));
    recognition.addEventListener("end", () => { if (button) button.textContent = "Voice Dispatch Command"; });
    recognition.start();
  }

  function openMapWindow() {
    mapWindow = window.open("", "FSRP_Live_Map", "width=880,height=650,resizable=yes");
    if (!mapWindow) return;
    mapWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>FSRP Live Unit Map</title><link rel="stylesheet" href="${location.origin}/css/base.css?v=4.2.0"><link rel="stylesheet" href="${location.origin}/css/cad-enhancements.css?v=4.2.0"><style>body{margin:0;padding:18px;background:#03070d;color:#fff}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.cad-live-map{min-height:540px}</style></head><body><header><div><span class="eyebrow">FSRP MULTI-MONITOR DISPATCH</span><h2>Live Unit Map</h2></div><span id="updated">Connecting…</span></header><div class="cad-live-map" id="map"></div></body></html>`);
    mapWindow.document.close();
    renderMap(lastLive);
  }

  document.addEventListener("fsrp:erlc-live", (event) => renderMap(event.detail));
  document.addEventListener("fsrp:route", (event) => {
    if (event.detail === "cad") setTimeout(() => { injectToolbar(); injectMap(); renderMap(lastLive); }, 80);
  });
  document.addEventListener("DOMContentLoaded", () => { injectToolbar(); injectMap(); });
})();
