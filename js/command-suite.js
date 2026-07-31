(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  let token = sessionStorage.getItem("fsrpStaffOpsToken") || "";
  let user = null;
  let state = { watchdogAlerts: [], watchdogSnapshots: [], modActions: [], banBolos: [], automationEvents: [], audit: [], settings: {} };
  let live = null;
  let refreshTimer = null;
  let overlayWindow = null;
  let reportEvidenceUrl = "";
  const demo = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";

  try { user = JSON.parse(sessionStorage.getItem("fsrpStaffOpsUser") || "null"); } catch { user = null; }

  function toast(message, good = false) {
    const element = $("#staffops-toast") || $("#toast");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-success", good);
    element.classList.add("is-visible");
    setTimeout(() => element.classList.remove("is-visible"), 3200);
  }

  async function api(action, payload = {}) {
    if (demo) return demoApi(action, payload);
    const response = await fetch("/api/command-suite", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Command Suite request failed.");
    return data;
  }

  function demoApi(action, payload) {
    if (!user) user = { id: "demo", name: "Demo Staff", role: "admin", callsign: "A-01", roblox: "DemoPlayer" };
    const demoLive = {
      server: { name: "FSRP Local Preview", currentPlayers: 3, maxPlayers: 40, queue: 0, joinKey: "FSRP" },
      players: [
        { name: "DemoPlayer", callsign: "A-01", team: "Sheriff", permission: "Server Administrator", location: { street: "Park Street", postal: "218", building: "2083", x: 100, z: 200 } },
        { name: "RoleplayerOne", callsign: "2S-12", team: "Sheriff", permission: "Normal", location: { street: "Freedom Avenue", postal: "105", building: "", x: 200, z: 280 } },
        { name: "CivilianOne", callsign: "", team: "Civilian", permission: "Normal", location: { street: "River City", postal: "301", building: "", x: 400, z: 500 } }
      ], modCalls: [], vehicles: [{ name: "2021 Falcon Advance", owner: "CivilianOne", plate: "FSRP" }]
    };
    if (action === "state") return Promise.resolve({ ok: true, state, user, live: demoLive, liveError: "" });
    if (action === "moderate") {
      const item = { id: crypto.randomUUID(), action: payload.mode, player: payload.player, reason: payload.reason, createdBy: user.name, createdAt: Date.now(), result: "Local preview only" };
      state.modActions.unshift(item); return Promise.resolve({ ok: true, item, state });
    }
    if (action === "watchdog-scan") {
      const alert = { id: crypto.randomUUID(), player: "PreviewPlayer", title: "Example movement anomaly", detail: "Local preview alert. Cloudflare ER:LC data is required for real scans.", score: 58, combinedScore: 58, confidence: "Low", status: "Review Required", signals: ["movement"], createdAt: Date.now() };
      state.watchdogAlerts.unshift(alert); return Promise.resolve({ ok: true, state, live: demoLive, newAlerts: [alert], autoActions: [] });
    }
    if (action === "watchdog-report") {
      const alert = { id: crypto.randomUUID(), player: payload.player, title: payload.title, detail: payload.detail, score: payload.score || 45, confidence: "Low", status: "Review Required", signals: ["staff-report"], createdAt: Date.now() };
      state.watchdogAlerts.unshift(alert); return Promise.resolve({ ok: true, state, alert });
    }
    if (action === "watchdog-review") {
      const alert = state.watchdogAlerts.find((entry) => entry.id === payload.id); if (alert) alert.status = payload.decision; return Promise.resolve({ ok: true, state, alert });
    }
    if (action === "watchdog-settings") {
      state.settings = { ...state.settings, ...(payload.settings || {}) };
      return Promise.resolve({ ok: true, state, settings: state.settings });
    }
    if (action === "bolo-save") {
      const item = { ...payload.item, id: payload.item?.id || crypto.randomUUID(), status: "Active", createdAt: Date.now(), createdBy: user.name };
      state.banBolos.unshift(item);
      return Promise.resolve({ ok: true, state, item });
    }
    if (action === "bolo-update") {
      const item = state.banBolos.find((entry) => entry.id === payload.id);
      if (item) { item.status = payload.status || "Closed"; item.reviewNote = payload.note || ""; item.updatedAt = Date.now(); }
      return Promise.resolve({ ok: true, state, item });
    }
    if (action === "automation-settings") {
      state.settings = { ...state.settings, ...(payload.settings || {}) };
      return Promise.resolve({ ok: true, state, settings: state.settings });
    }
    return Promise.resolve({ ok: true, state });
  }

  function currentRoute() {
    return location.hash.slice(1).split("?")[0] || "home";
  }

  function showAccess(message = "Sign in through Staff Operations first.") {
    $("#command-suite-access").hidden = false;
    $("#command-suite-workspace").hidden = true;
    $("#command-access-message").textContent = message;
  }

  function showWorkspace() {
    $("#command-suite-access").hidden = true;
    $("#command-suite-workspace").hidden = false;
    $("#command-user-label").textContent = user?.callsign ? `${user.callsign} · ${user.name}` : user?.name || "FSRP Staff";
    $("#command-role-label").textContent = `${String(user?.role || "staff").toUpperCase()} access · External ER:LC companion`;
    $("#command-permission-badge").textContent = `${String(user?.role || "staff").toUpperCase()} permissions`;
    $("#command-raw-wrap").classList.toggle("command-hidden", user?.role !== "admin");
  }

  function locationLabel(location = {}) {
    return [location.building, location.street, location.postal ? `Postal ${location.postal}` : ""].filter(Boolean).join(" · ") || "Location unavailable";
  }

  function renderLive() {
    const ready = Boolean(live?.players);
    $("#command-live-status").innerHTML = `<i></i>${ready ? "ER:LC live connected" : "ER:LC data unavailable"}`;
    $("#command-player-count").textContent = ready ? `${live.server?.currentPlayers ?? live.players.length}/${live.server?.maxPlayers ?? "?"}` : "—";
    $("#command-queue-count").textContent = ready ? live.server?.queue ?? 0 : "—";
    $("#command-modcall-count").textContent = ready ? live.modCalls?.length ?? 0 : "—";
    $("#command-vehicle-count").textContent = ready ? live.vehicles?.length ?? 0 : "—";

    const roster = $("#command-player-roster");
    const options = $("#command-player-options");
    if (!ready || !live.players.length) {
      roster.innerHTML = '<div class="command-empty">No live players were returned by ER:LC.</div>';
      options.innerHTML = "";
    } else {
      roster.innerHTML = live.players.map((player) => `<button class="command-row" type="button" data-select-live-player="${esc(player.name)}"><span><strong>${esc(player.callsign || player.name)}</strong><small>${esc(player.name)} · ${esc(player.team || "Unknown team")} · ${esc(locationLabel(player.location))}</small></span><span class="badge">${esc(player.permission || "Normal")}</span></button>`).join("");
      options.innerHTML = live.players.map((player) => `<option value="${esc(player.name)}">${esc(player.callsign || player.team || "Player")}</option>`).join("");
    }
    syncMyUnit(false);
    updateOverlayWindow();
  }

  function renderModLog() {
    const list = $("#command-mod-log");
    const items = state.modActions || [];
    list.innerHTML = items.length ? items.slice(0, 100).map((item) => `<article class="command-row"><span><strong>${esc(String(item.action || "Action").toUpperCase())} · ${esc(item.player || "Server")}</strong><small>${esc(item.reason || item.command || "No reason")} · ${esc(item.createdBy || "Staff")} · ${new Date(item.createdAt).toLocaleString()}</small></span><span class="badge">${esc(item.result || "Logged")}</span></article>`).join("") : '<div class="command-empty">No ER:LC staff actions have been recorded.</div>';
  }

  function renderWatchdog() {
    const list = $("#command-watchdog-list");
    const alerts = state.watchdogAlerts || [];
    $("#command-watchdog-mode").textContent = state.settings?.reviewOnly === false ? "High-Confidence Auto Action" : "Review First";
    list.innerHTML = alerts.length ? alerts.slice(0, 150).map((alert) => {
      const canReview = ["supervisor", "hr", "admin"].includes(user?.role);
      const statusClass = String(alert.confidence).toLowerCase() === "high" ? " high" : "";
      return `<article class="command-alert${statusClass}"><div class="command-alert-head"><div><h4>${esc(alert.title || alert.type)}</h4><small>${esc(alert.player)} · ${new Date(alert.createdAt).toLocaleString()}</small></div><span class="command-score">${esc(alert.combinedScore || alert.score || 0)}/100</span></div><p>${esc(alert.detail)}</p><div class="card-meta"><span class="badge">${esc(alert.status || "Review Required")}</span><span>${esc((alert.distinctSignals || alert.signals || []).join(" · "))}</span></div>${canReview && !["Dismissed", "Ban", "Kick"].includes(alert.status) ? `<div class="command-row-actions"><button class="btn btn-ghost btn-small" data-watchdog-decision="Dismissed" data-alert-id="${esc(alert.id)}">Dismiss</button><button class="btn btn-secondary btn-small" data-watchdog-decision="Reviewed" data-alert-id="${esc(alert.id)}">Mark Reviewed</button><button class="btn btn-danger btn-small" data-watchdog-decision="Kick" data-alert-id="${esc(alert.id)}">Kick</button>${["hr", "admin"].includes(user?.role) ? `<button class="btn btn-danger btn-small" data-watchdog-decision="Ban" data-alert-id="${esc(alert.id)}">Ban</button>` : ""}</div>` : ""}</article>`;
    }).join("") : '<div class="command-empty">No Watchdog alerts are waiting for review.</div>';
  }

  function renderAutomation() {
    const settings = state.settings || {};
    if ($("#command-watchdog-enabled")) $("#command-watchdog-enabled").value = String(settings.watchdogEnabled !== false);
    if ($("#command-watchdog-review")) $("#command-watchdog-review").value = String(settings.reviewOnly !== false);
    if ($("#command-watchdog-strictness")) $("#command-watchdog-strictness").value = settings.strictness ?? 55;
    if ($("#command-watchdog-autoban")) $("#command-watchdog-autoban").value = settings.autoBanThreshold ?? 95;
    if ($("#command-watchdog-rules")) $("#command-watchdog-rules").value = (settings.rules || []).join("\n");
    if ($("#command-auto-shift-start")) $("#command-auto-shift-start").checked = Boolean(settings.autoShiftStart);
    if ($("#command-auto-shift-end")) $("#command-auto-shift-end").checked = Boolean(settings.autoShiftEnd);
    if ($("#command-suspend-access-lock")) $("#command-suspend-access-lock").checked = settings.suspendAccessLock !== false;
    if ($("#command-linked-staff")) $("#command-linked-staff").value = (settings.linkedStaff || []).map((entry) => `${entry.roblox} | ${entry.username || ""} | ${entry.callsign || ""}`).join("\n");

    const list = $("#command-bolo-list");
    const bolos = state.banBolos || [];
    if (list) list.innerHTML = bolos.length ? bolos.slice(0, 150).map((item) => `<article class="command-row"><span><strong>${esc(item.player)} · ${esc(item.action || "Alert Staff")}</strong><small>${esc(item.reason || "No reason")} · ${esc(item.createdBy || "Staff")} · ${new Date(item.createdAt).toLocaleString()}</small></span><div class="command-row-actions"><span class="badge">${esc(item.status || "Active")}</span>${item.status === "Active" && ["supervisor","hr","admin"].includes(user?.role) ? `<button class="btn btn-ghost btn-small" data-bolo-status="Closed" data-bolo-id="${esc(item.id)}">Close</button>` : ""}</div></article>`).join("") : '<div class="command-empty">No active Ban BOLOs.</div>';

    const events = $("#command-automation-events");
    const eventItems = state.automationEvents || [];
    if (events) events.innerHTML = eventItems.length ? eventItems.slice(0, 100).map((item) => `<article class="command-row"><span><strong>${esc(item.type || "Automation")}</strong><small>${esc(item.detail || "No details")}</small></span><time>${new Date(item.createdAt).toLocaleString()}</time></article>`).join("") : '<div class="command-empty">No automation events yet.</div>';

    if ($("#command-ready-erlc")) $("#command-ready-erlc").textContent = live?.players ? "READY" : "OFFLINE";
    if ($("#command-ready-watchdog")) $("#command-ready-watchdog").textContent = settings.watchdogEnabled === false ? "OFF" : "READY";
    if ($("#command-ready-radio")) $("#command-ready-radio").textContent = state.readiness?.liveRadioReady ? "READY" : "SETUP";
    if ($("#command-ready-discord")) $("#command-ready-discord").textContent = state.readiness?.discordReady ? "READY" : "OPTIONAL";
  }

  function renderAudit() {
    const list = $("#command-audit-log");
    const items = state.audit || [];
    list.innerHTML = items.length ? items.slice(0, 300).map((entry) => `<article class="command-row"><span><strong>${esc(entry.action)}</strong><small>${esc(entry.subject || "System")} · ${esc(entry.actor || "System")} (${esc(entry.actorRole || "system")})</small><small>${esc(entry.detail || "No details")}</small></span><time>${new Date(entry.createdAt).toLocaleString()}</time></article>`).join("") : '<div class="command-empty">No Command Suite audit entries yet.</div>';
  }

  function renderAll() {
    renderLive();
    renderModLog();
    renderWatchdog();
    renderAutomation();
    renderAudit();
  }

  async function loadState(showToast = false) {
    token = sessionStorage.getItem("fsrpStaffOpsToken") || "";
    try { user = JSON.parse(sessionStorage.getItem("fsrpStaffOpsUser") || "null"); } catch { user = null; }
    if (!token || !user) return showAccess("Staff Operations login is required before opening the Command Suite.");
    try {
      const data = await api("state");
      user = data.user || user;
      state = data.state || state;
      live = data.live || null;
      showWorkspace();
      renderAll();
      if (showToast) toast(data.liveError ? data.liveError : "Command Suite refreshed.", !data.liveError);
      scheduleRefresh();
    } catch (error) {
      if (/login|required|expired|invalid/i.test(error.message)) showAccess(error.message);
      else { showWorkspace(); toast(error.message); }
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (currentRoute() !== "command-suite" || document.hidden || $("#command-suite-workspace")?.hidden) return;
    refreshTimer = setTimeout(async () => {
      await loadState(false);
    }, 20000);
  }

  function syncMyUnit(showToast = true) {
    const username = String($("#command-roblox-name")?.value || localStorage.getItem("fsrpCommandRoblox") || user?.roblox || "").trim();
    if ($("#command-roblox-name") && !$("#command-roblox-name").value) $("#command-roblox-name").value = username;
    if (!username) return;
    localStorage.setItem("fsrpCommandRoblox", username);
    const player = live?.players?.find((entry) => entry.name.toLowerCase() === username.toLowerCase());
    if (!player) {
      $("#command-overlay-unit").textContent = username;
      $("#command-overlay-location").textContent = live ? "Player is not currently shown in the ER:LC roster." : "ER:LC live data unavailable.";
      $("#command-overlay-team").textContent = "Not connected in-game";
      if (showToast) toast("That username was not found in the live ER:LC roster.");
    } else {
      $("#command-overlay-unit").textContent = player.callsign ? `${player.callsign} · ${player.name}` : player.name;
      $("#command-overlay-location").textContent = locationLabel(player.location);
      $("#command-overlay-team").textContent = `${player.team || "Unknown team"} · ${player.permission || "Normal"}`;
      if (showToast) toast("Your in-game unit is synced.", true);
    }
    updateOverlayWindow();
  }

  function overlayMarkup() {
    const username = String($("#command-roblox-name")?.value || localStorage.getItem("fsrpCommandRoblox") || user?.roblox || "").trim();
    const player = live?.players?.find((entry) => entry.name.toLowerCase() === username.toLowerCase());
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FSRP Staff Overlay</title><style>body{margin:0;background:#03070d;color:#fff;font-family:Arial,sans-serif}main{padding:14px;background:radial-gradient(circle at 80% 0,rgba(70,180,255,.2),transparent 40%),#050a11;min-height:100vh;box-sizing:border-box}.top{display:flex;justify-content:space-between;align-items:center}.tag{font-size:10px;font-weight:900;letter-spacing:.13em;color:#63cfff}.unit{font-size:24px;font-weight:1000;margin-top:18px}.muted{color:#94a2b4;font-size:12px}.card{margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}button{border:0;border-radius:11px;padding:11px;background:#1b6fa8;color:#fff;font-weight:900;cursor:pointer}.danger{background:#9e2f38}.status{display:inline-flex;gap:6px;align-items:center;color:#86efac;font-size:11px}.dot{width:7px;height:7px;border-radius:50%;background:#38d889}</style></head><body><main><div class="top"><div class="tag">FSRP STAFF COMPANION</div><div class="status"><i class="dot"></i> LIVE</div></div><div class="unit">${esc(player?.callsign || username || "Not Synced")}</div><div class="muted">${esc(player?.name || "Enter username in the main Command Suite")}</div><div class="card"><b>${esc(player?.team || "Not connected")}</b><div class="muted">${esc(player ? locationLabel(player.location) : "ER:LC data unavailable")}</div></div><div class="card"><div class="muted">SERVER</div><b>${esc(live?.server?.name || "FSRP")}</b><div class="muted">${esc(live?.server?.currentPlayers ?? "—")}/${esc(live?.server?.maxPlayers ?? "—")} players · Queue ${esc(live?.server?.queue ?? "—")}</div></div><div class="grid"><button onclick="opener?.FSRP_COMMAND_SUITE?.quick('warn')">WARN</button><button onclick="opener?.FSRP_COMMAND_SUITE?.quick('refresh')">REFRESH</button><button class="danger" onclick="opener?.FSRP_COMMAND_SUITE?.quick('kick')">KICK</button><button class="danger" onclick="opener?.FSRP_COMMAND_SUITE?.openMain()">OPEN PANEL</button></div><p class="muted">External overlay only. Keep this window beside Roblox or use your operating system's window controls.</p></main></body></html>`;
  }

  function openOverlay() {
    overlayWindow = window.open("", "FSRPStaffOverlay", "width=390,height=650,resizable=yes,scrollbars=no");
    if (!overlayWindow) return toast("Your browser blocked the overlay window. Allow pop-ups for this website.");
    overlayWindow.document.open();
    overlayWindow.document.write(overlayMarkup());
    overlayWindow.document.close();
  }

  function updateOverlayWindow() {
    if (!overlayWindow || overlayWindow.closed) return;
    try { overlayWindow.document.open(); overlayWindow.document.write(overlayMarkup()); overlayWindow.document.close(); } catch {}
  }

  async function runModeration(mode) {
    const player = String($("#command-target-player")?.value || "").trim();
    const reason = String($("#command-action-reason")?.value || "").trim();
    if (["ban", "kick", "jail"].includes(mode) && !confirm(`${mode.toUpperCase()} ${player || "this player"}? This action is sent to the live ER:LC server.`)) return;
    try {
      const data = await api("moderate", { mode, player, reason });
      state = data.state || state;
      renderModLog(); renderAudit();
      toast(`${mode.toUpperCase()} command sent successfully.`, true);
    } catch (error) { toast(error.message); }
  }

  async function uploadEvidence(input, preview) {
    const file = input?.files?.[0];
    if (!file) return "";
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) throw new Error("Use PNG, JPG, WEBP, or GIF evidence.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Evidence must be 10 MB or smaller.");
    if (preview) { preview.src = URL.createObjectURL(file); preview.hidden = false; }
    if (demo) return preview?.src || "local-preview";
    const form = new FormData(); form.append("file", file);
    const response = await fetch("/api/staff-media", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Evidence upload failed.");
    return data.url;
  }

  async function runWatchdogScan() {
    try {
      toast("Scanning current ER:LC activity…");
      const data = await api("watchdog-scan");
      state = data.state || state; live = data.live || live;
      renderAll();
      toast(`${data.newAlerts?.length || 0} new Watchdog alert(s).`, true);
    } catch (error) { toast(error.message); }
  }

  async function submitWatchdogReport() {
    try {
      const player = String($("#command-report-player").value || "").trim();
      const type = $("#command-report-type").value;
      const detail = String($("#command-report-detail").value || "").trim();
      if (!player || !detail) throw new Error("Player and report details are required.");
      if ($("#command-report-evidence").files?.[0]) reportEvidenceUrl = await uploadEvidence($("#command-report-evidence"), $("#command-report-preview"));
      const data = await api("watchdog-report", { player, type, title: type, detail, evidenceUrl: reportEvidenceUrl, score: 45 });
      state = data.state || state; renderWatchdog(); renderAudit();
      $("#command-report-detail").value = ""; $("#command-report-evidence").value = "";
      toast("Watchdog report submitted for review.", true);
    } catch (error) { toast(error.message); }
  }

  async function reviewAlert(id, decision) {
    const note = prompt(`${decision} review note:`, decision === "Dismissed" ? "Insufficient evidence" : "Reviewed by staff") || "";
    if (["Ban", "Kick"].includes(decision) && !confirm(`${decision.toUpperCase()} the reported player in the live ER:LC server?`)) return;
    try {
      const data = await api("watchdog-review", { id, decision, note });
      state = data.state || state; renderWatchdog(); renderAudit(); toast(`Watchdog alert marked ${decision}.`, true);
    } catch (error) { toast(error.message); }
  }

  async function saveWatchdogPolicy() {
    try {
      const rules = String($("#command-watchdog-rules")?.value || "").split(/\n+/).map((value) => value.trim()).filter(Boolean).slice(0, 5);
      const settings = {
        watchdogEnabled: $("#command-watchdog-enabled").value === "true",
        reviewOnly: $("#command-watchdog-review").value === "true",
        strictness: Number($("#command-watchdog-strictness").value) || 55,
        autoBanThreshold: Number($("#command-watchdog-autoban").value) || 95,
        rules
      };
      const data = await api("watchdog-settings", { settings });
      state = data.state || state; renderWatchdog(); renderAutomation(); renderAudit();
      toast("Watchdog policy saved.", true);
    } catch (error) { toast(error.message); }
  }

  async function saveBolo() {
    try {
      const item = {
        player: String($("#command-bolo-player")?.value || "").trim(),
        action: $("#command-bolo-action")?.value || "Alert Staff",
        reason: String($("#command-bolo-reason")?.value || "").trim()
      };
      if (!item.player || !item.reason) throw new Error("Roblox username and reason are required.");
      const data = await api("bolo-save", { item });
      state = data.state || state; renderAutomation(); renderAudit();
      $("#command-bolo-player").value = ""; $("#command-bolo-reason").value = "";
      toast("Ban BOLO created.", true);
    } catch (error) { toast(error.message); }
  }

  async function updateBolo(id, status) {
    const note = prompt("Review note:", "Closed by staff") || "";
    try {
      const data = await api("bolo-update", { id, status, note });
      state = data.state || state; renderAutomation(); renderAudit();
      toast(`Ban BOLO marked ${status}.`, true);
    } catch (error) { toast(error.message); }
  }

  function parseLinkedStaff() {
    return String($("#command-linked-staff")?.value || "").split(/\n+/).map((line) => {
      const [roblox, username, callsign] = line.split("|").map((part) => String(part || "").trim());
      return { roblox, username, callsign };
    }).filter((entry) => entry.roblox).slice(0, 150);
  }

  async function saveAutomation() {
    try {
      const settings = {
        autoShiftStart: Boolean($("#command-auto-shift-start")?.checked),
        autoShiftEnd: Boolean($("#command-auto-shift-end")?.checked),
        suspendAccessLock: Boolean($("#command-suspend-access-lock")?.checked),
        linkedStaff: parseLinkedStaff()
      };
      const data = await api("automation-settings", { settings });
      state = data.state || state; renderAutomation(); renderAudit();
      toast("Session automation saved.", true);
    } catch (error) { toast(error.message); }
  }

  function exportAudit() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), audit: state.audit || [], modActions: state.modActions || [], watchdogAlerts: state.watchdogAlerts || [], banBolos: state.banBolos || [], automationEvents: state.automationEvents || [] }, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `FSRP-Command-Suite-${Date.now()}.json`; link.click(); URL.revokeObjectURL(link.href);
  }

  function switchTab(name) {
    $$("[data-command-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.commandTab === name));
    $$("[data-command-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.commandPanel === name));
  }

  function bind() {
    $("#command-retry-access")?.addEventListener("click", () => loadState(true));
    $("#command-refresh")?.addEventListener("click", () => loadState(true));
    $("#command-open-overlay")?.addEventListener("click", openOverlay);
    $("#command-sync-player")?.addEventListener("click", () => syncMyUnit(true));
    $("#command-copy-server")?.addEventListener("click", async () => {
      const code = live?.server?.joinKey || ""; if (!code) return toast("Server code is unavailable."); await navigator.clipboard.writeText(code); toast("Server code copied.", true);
    });
    $$("[data-command-tab]").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.commandTab)));
    $("#command-action-grid")?.addEventListener("click", (event) => { const button = event.target.closest("[data-command-action]"); if (button) runModeration(button.dataset.commandAction); });
    $("#command-run-raw")?.addEventListener("click", async () => { const rawCommand = $("#command-raw-input").value; try { const data = await api("moderate", { mode: "raw", rawCommand }); state = data.state || state; renderModLog(); toast("Admin command sent.", true); } catch (error) { toast(error.message); } });
    $("#command-player-roster")?.addEventListener("click", (event) => { const row = event.target.closest("[data-select-live-player]"); if (!row) return; $("#command-target-player").value = row.dataset.selectLivePlayer; $("#command-report-player").value = row.dataset.selectLivePlayer; switchTab("moderation"); });
    $("#command-run-scan")?.addEventListener("click", runWatchdogScan);
    $("#command-submit-report")?.addEventListener("click", submitWatchdogReport);
    $("#command-report-evidence")?.addEventListener("change", () => uploadEvidence($("#command-report-evidence"), $("#command-report-preview")).then((url) => { reportEvidenceUrl = url; }).catch((error) => toast(error.message)));
    $("#command-watchdog-list")?.addEventListener("click", (event) => { const button = event.target.closest("[data-watchdog-decision]"); if (button) reviewAlert(button.dataset.alertId, button.dataset.watchdogDecision); });
    $("#command-save-watchdog-settings")?.addEventListener("click", saveWatchdogPolicy);
    $("#command-save-bolo")?.addEventListener("click", saveBolo);
    $("#command-bolo-list")?.addEventListener("click", (event) => { const button = event.target.closest("[data-bolo-status]"); if (button) updateBolo(button.dataset.boloId, button.dataset.boloStatus); });
    $("#command-save-automation")?.addEventListener("click", saveAutomation);
    $("#command-export-audit")?.addEventListener("click", exportAudit);
    document.addEventListener("visibilitychange", scheduleRefresh);
    document.addEventListener("fsrp:route", (event) => { if (event.detail === "command-suite") loadState(false); else clearTimeout(refreshTimer); });
    window.addEventListener("storage", (event) => { if (event.key === "fsrpStaffOpsToken") loadState(false); });
  }

  window.FSRP_COMMAND_SUITE = {
    quick(mode) { switchTab("moderation"); runModeration(mode); },
    openMain() { window.focus(); location.hash = "command-suite"; }
  };

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    if (currentRoute() === "command-suite") loadState(false);
  });
})();
