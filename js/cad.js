(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  const EMPTY_STATE = {
    dispatch: [], units: [], calls: [], people: [], vehicles: [], records: [], reports: [],
    citations: [], warrants: [], radio: [], radioPresence: [], audit: []
  };

  const demo = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
  let token = sessionStorage.getItem("fsrpCadToken") || "";
  let agency = sessionStorage.getItem("fsrpCadAgency") || "";
  let role = sessionStorage.getItem("fsrpCadRole") || "";
  let state = structuredClone(EMPTY_STATE);
  let refreshTimer = null;
  let presenceTimer = null;
  let clockTimer = null;
  let erlcTimer = null;
  let erlcLive = null;
  let currentChannel = "STATEWIDE";
  let radioMuted = false;
  let radioScanning = false;
  let pttActive = false;
  let audioContext = null;
  let micStream = null;
  let micAnalyser = null;
  let micAnimation = null;
  let localDispatchHidden = false;
  let localRadioHidden = false;
  const streams = {};
  const recorders = {};

  const CHANNELS = {
    staff: ["STATEWIDE", "STAFF COMMAND", "EVENT OPERATIONS", "OCSO PRIMARY", "OCSO TAC 1", "OCSO TAC 2", "FHP PRIMARY", "FHP TAC 1", "FHP TAC 2", "FBI FED 1", "FBI TAC", "FFW PRIMARY", "FFW TAC"],
    fbi: ["STATEWIDE", "FBI FED 1", "FBI TAC", "EVENT OPERATIONS"],
    fhp: ["STATEWIDE", "FHP PRIMARY", "FHP TAC 1", "FHP TAC 2", "EVENT OPERATIONS"],
    ffw: ["STATEWIDE", "FFW PRIMARY", "FFW TAC", "EVENT OPERATIONS"],
    ocso: ["STATEWIDE", "OCSO PRIMARY", "OCSO TAC 1", "OCSO TAC 2", "EVENT OPERATIONS"]
  };

  function nowLabel() {
    return new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function id(prefix = "CAD") {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  function currentCallsign() {
    return String($("#cad-unit-callsign")?.value || localStorage.getItem(`fsrpCadCallsign:${agency}`) || "").trim();
  }

  function message(text, good = false) {
    const element = $("#cad-login-message");
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("cad-message-good", good);
  }

  function setConnection(text, online = true) {
    const element = $("#cad-connection-label");
    if (element) element.textContent = text;
    const badge = element?.closest(".badge");
    if (badge) badge.classList.toggle("is-live", online);
    const signal = $("#cad-radio-signal");
    const label = $("#cad-radio-signal-label");
    if (signal) signal.textContent = online ? "▮▮▮▮▮" : "▮▮▯▯▯";
    if (label) label.textContent = online ? "Excellent" : "Weak";
  }

  function value(selector) {
    return String($(selector)?.value || "").trim();
  }

  function normalizeState(input) {
    const next = input && typeof input === "object" ? input : {};
    for (const key of Object.keys(EMPTY_STATE)) if (!Array.isArray(next[key])) next[key] = [];
    return next;
  }

  async function demoApi(action, payload = {}) {
    if (action === "login") {
      if (String(payload.code || "").trim() !== "FSRP-DEMO") throw new Error("Local demo code: FSRP-DEMO");
      return { token: "demo", agency: "Staff Team", role: "staff", apiVersion: 5 };
    }
    if (action === "state") return { state, user: { agency, role }, apiVersion: 5 };
    if (action === "append") {
      const item = { ...payload.item, id: payload.item?.id || id(payload.collection), agency, role, updatedAt: Date.now(), time: payload.item?.time || nowLabel() };
      state[payload.collection] ??= [];
      state[payload.collection].unshift(item);
      return { state };
    }
    if (action === "unit") {
      const item = { ...payload.item, id: payload.item?.id || currentCallsign().toLowerCase(), agency, role, updatedAt: Date.now() };
      const index = state.units.findIndex((unit) => String(unit.callsign).toLowerCase() === String(item.callsign).toLowerCase());
      if (index < 0) state.units.unshift(item); else state.units[index] = { ...state.units[index], ...item };
      return { state };
    }
    if (action === "upsert") {
      const item = { ...payload.item, id: payload.item?.id || id(payload.collection), agency: payload.item?.agency || agency, role: payload.item?.role || role, updatedAt: Date.now() };
      state[payload.collection] ??= [];
      const index = state[payload.collection].findIndex((entry) => entry.id === item.id);
      if (index < 0) state[payload.collection].unshift(item); else state[payload.collection][index] = { ...state[payload.collection][index], ...item };
      return { state };
    }
    if (action === "attach-unit") {
      const unit = state.units.find((entry) => String(entry.callsign).toLowerCase() === String(payload.callsign).toLowerCase());
      const call = state.calls.find((entry) => entry.id === payload.callId);
      if (unit && call) {
        unit.attachedCall = call.id;
        unit.status = "10-23 Assigned / On Scene";
        call.attachedUnits = [...new Set([...(call.attachedUnits || []), unit.callsign])];
        call.status = "Dispatched";
      }
      return { state };
    }
    if (action === "call-status") {
      const call = state.calls.find((entry) => entry.id === payload.callId);
      if (call) call.status = payload.status;
      return { state };
    }
    if (action === "panic") {
      let unit = state.units.find((entry) => String(entry.callsign).toLowerCase() === String(payload.callsign).toLowerCase());
      if (!unit) {
        unit = { id: id("UNIT"), callsign: payload.callsign, agency, role, status: "10-8 In Service" };
        state.units.unshift(unit);
      }
      unit.panic = Boolean(payload.active);
      if (payload.active) state.dispatch.unshift({ id: id("PANIC"), type: "PANIC / EMERGENCY", priority: "Priority 1", location: payload.location || "Unknown", details: `${payload.callsign} activated panic`, agency, time: nowLabel() });
      return { state };
    }
    if (action === "radio-presence") {
      const item = { id: "demo", sessionId: "demo", callsign: payload.callsign || "DEMO UNIT", agency, role, channel: payload.channel, transmitting: payload.transmitting, scanning: payload.scanning, muted: payload.muted, updatedAt: Date.now() };
      const index = state.radioPresence.findIndex((entry) => entry.sessionId === "demo");
      if (index < 0) state.radioPresence.unshift(item); else state.radioPresence[index] = item;
      return { state };
    }
    if (action === "erlc-state") {
      return {
        ready: true,
        server: { name: "FSRP Local Preview", currentPlayers: 4, maxPlayers: 40, joinKey: "DEMO", queue: 0 },
        players: [
          { name: "DemoTrooper", team: "Police", callsign: "1K-81", location: { postal: "104", street: "Freedom Avenue", building: "" }, permission: "Normal", wantedStars: 0 },
          { name: "DemoDeputy", team: "Sheriff", callsign: "2S-12", location: { postal: "205", street: "Colonial Drive", building: "" }, permission: "Normal", wantedStars: 0 }
        ],
        emergencyCalls: [],
        vehicles: [],
        fetchedAt: Date.now()
      };
    }
    return { state };
  }

  async function api(action, payload = {}) {
    if (demo) return demoApi(action, payload);
    const response = await fetch("/api/cad", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action, token, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `CAD request failed (${response.status}).`);
    return data;
  }

  async function checkCADSetup() {
    if (demo) return message("Local preview code: FSRP-DEMO", true);
    try {
      const response = await fetch("/api/cad", { headers: { "Accept": "application/json" }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check CAD setup.");
      if (!data.cadReady) {
        const missing = [];
        if (!data.configuredAgencies?.length) missing.push("department codes");
        if (!data.storageReady) missing.push("SITE_SETTINGS KV");
        if (!data.sessionSigningReady) missing.push("CAD_TOKEN_SECRET");
        message(`CAD setup incomplete: ${missing.join(", ")}.`);
      } else {
        message(`Secure access ready: ${data.configuredAgencies.join(", ")}.${data.erlcReady ? " ER:LC live sync connected." : " Add ERLC_SERVER_KEY for live game sync."}`, true);
      }
    } catch (error) {
      message(`CAD setup check failed: ${error.message}`);
    }
  }

  function saveSession(data) {
    token = data.token;
    agency = data.agency;
    role = data.role;
    sessionStorage.setItem("fsrpCadToken", token);
    sessionStorage.setItem("fsrpCadAgency", agency);
    sessionStorage.setItem("fsrpCadRole", role);
  }

  function clearSession() {
    token = "";
    agency = "";
    role = "";
    sessionStorage.removeItem("fsrpCadToken");
    sessionStorage.removeItem("fsrpCadAgency");
    sessionStorage.removeItem("fsrpCadRole");
  }

  async function login() {
    const code = String($("#cad-access-code")?.value || "").normalize("NFKC").trim();
    if (!code) return message("Enter your assigned access code.");
    message("Checking secure access…");
    try {
      const data = await api("login", { code });
      saveSession(data);
      await openWorkspace();
    } catch (error) {
      message(error.message);
    }
  }

  async function openWorkspace() {
    $("#cad-agency-label").textContent = `${agency} CAD / MDT`;
    $("#cad-session-label").textContent = `${role.toUpperCase()} access · Signed session`;
    $("#cad-access").hidden = true;
    $("#cad-workspace").hidden = false;
    const savedCallsign = localStorage.getItem(`fsrpCadCallsign:${agency}`) || "";
    const savedUsername = localStorage.getItem(`fsrpCadRoblox:${agency}`) || "";
    if ($("#cad-unit-callsign")) $("#cad-unit-callsign").value = savedCallsign;
    if ($("#cad-unit-roblox")) $("#cad-unit-roblox").value = savedUsername;
    populateChannels();
    updateCameraOverlays();
    message("");
    await refresh();
    await fetchErlcLive(false);
    scheduleRefresh();
    schedulePresence();
    scheduleErlc();
  }

  async function tryRestoreSession() {
    if (!token || !agency || !role) return;
    try {
      await openWorkspace();
    } catch {
      clearSession();
      $("#cad-workspace").hidden = true;
      $("#cad-access").hidden = false;
    }
  }

  function erlcLocationLabel(location = {}) {
    return [location.building, location.street, location.postal ? `Postal ${location.postal}` : ""]
      .filter(Boolean)
      .join(" · ") || "Location unavailable";
  }

  function currentRobloxUsername() {
    return String($("#cad-unit-roblox")?.value || localStorage.getItem(`fsrpCadRoblox:${agency}`) || "").trim();
  }

  function matchedErlcPlayer() {
    const username = currentRobloxUsername().toLowerCase();
    if (!username || !Array.isArray(erlcLive?.players)) return null;
    return erlcLive.players.find((player) => String(player.name || "").toLowerCase() === username) || null;
  }

  function renderErlcLive() {
    const status = $("#cad-erlc-status");
    const server = erlcLive?.server;
    if (!status) return;

    if (!erlcLive?.ready || !server) {
      status.textContent = erlcLive?.error || "ER:LC live sync is not configured.";
      $("#cad-erlc-server").textContent = "Not connected";
      $("#cad-erlc-players").textContent = "—";
      $("#cad-erlc-queue").textContent = "—";
      $("#cad-erlc-unit").textContent = "Not synced";
      $("#cad-erlc-player-list").innerHTML = '<p class="muted">Add ERLC_SERVER_KEY in Cloudflare Production to connect live ER:LC data.</p>';
      return;
    }

    status.textContent = `${server.name || "ER:LC Private Server"} · Updated ${new Date(erlcLive.fetchedAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
    $("#cad-erlc-server").textContent = server.joinKey || "Online";
    $("#cad-erlc-players").textContent = `${server.currentPlayers ?? erlcLive.players.length}/${server.maxPlayers ?? "—"}`;
    $("#cad-erlc-queue").textContent = server.queue ?? 0;

    const player = matchedErlcPlayer();
    $("#cad-erlc-unit").textContent = player ? `${player.callsign || "No callsign"} · ${player.team || "Unknown team"}` : "Enter Roblox username";
    $("#cad-erlc-player-list").innerHTML = (erlcLive.players || []).slice(0, 18).map((entry) => `
      <article class="erlc-player-row ${player === entry ? "is-me" : ""}">
        <span><strong>${esc(entry.callsign || entry.name)}</strong><small>${esc(entry.name)} · ${esc(entry.team || "Unknown")}</small></span>
        <span>${esc(erlcLocationLabel(entry.location))}</span>
      </article>`).join("") || '<p class="muted">No players are currently returned by ER:LC.</p>';
  }

  async function fetchErlcLive(force = false) {
    if (!token) return;
    try {
      const data = await api("erlc-state", { force });
      erlcLive = { ready: true, ...data };
    } catch (error) {
      erlcLive = { ready: false, error: error.message };
    }
    renderErlcLive();
  }

  function scheduleErlc() {
    clearTimeout(erlcTimer);
    if (!token || document.hidden) return;
    erlcTimer = setTimeout(async () => {
      await fetchErlcLive(false);
      scheduleErlc();
    }, 30000);
  }

  async function syncUnitFromErlc() {
    const username = currentRobloxUsername();
    if (!username) throw new Error("Enter your Roblox username first.");
    localStorage.setItem(`fsrpCadRoblox:${agency}`, username);
    await fetchErlcLive(true);
    const player = matchedErlcPlayer();
    if (!player) throw new Error(`${username} is not currently listed in the ER:LC private server.`);
    if (player.callsign) $("#cad-unit-callsign").value = player.callsign;
    $("#cad-unit-location").value = erlcLocationLabel(player.location);
    await updateUnit();
    renderErlcLive();
  }

  function activeCalls() {
    return state.calls.filter((call) => !["Closed", "Cleared", "Cancelled"].includes(call.status));
  }

  function priorityClass(priority = "") {
    const number = String(priority).match(/\d/)?.[0] || "3";
    return `priority-${number}`;
  }

  function statusClass(status = "") {
    const text = String(status).toLowerCase();
    if (text.includes("10-8") || text.includes("available") || text.includes("10-98")) return "available";
    if (text.includes("10-7")) return "offline";
    if (text.includes("10-80") || text.includes("signal 100")) return "urgent";
    return "busy";
  }

  function callCard(call, compact = false) {
    const attached = (call.attachedUnits || []).join(", ") || "No units attached";
    return `<article class="cad-call-entry ${priorityClass(call.priority)}">
      <header><span class="cad-call-number">${esc(call.callNumber || call.id || "CALL")}</span><span class="cad-call-status">${esc(call.status || "Pending")}</span></header>
      <h4>${esc(call.type || call.title || "Dispatch Call")}</h4>
      <p><b>${esc(call.location || "Location unavailable")}</b>${compact ? "" : `<br>${esc(call.details || "")}`}</p>
      <small>${esc(call.priority || "Priority 3")} · ${esc(attached)}</small>
      ${compact ? "" : `<div class="cad-entry-actions"><button data-attach-call="${esc(call.id)}">Attach My Unit</button><button data-call-status-id="${esc(call.id)}" data-call-status="On Scene">On Scene</button><button data-call-status-id="${esc(call.id)}" data-call-status="Cleared">Clear</button></div>`}
    </article>`;
  }

  function unitCard(unit, compact = false) {
    return `<article class="unit-entry ${unit.panic ? "unit-panic" : ""}">
      <header><strong>${esc(unit.callsign || "UNIT")}</strong><span class="unit-status-dot ${statusClass(unit.status)}"></span></header>
      <p>${esc(unit.agency || "FSRP")} · ${esc(unit.status || "Status unavailable")}${compact ? "" : `<br>${esc(unit.location || "No location set")}`}</p>
      <small>${unit.panic ? "PANIC ACTIVE · " : ""}${unit.attachedCall ? `Attached: ${esc(unit.attachedCall)} · ` : ""}${esc(unit.time || "Active")}</small>
    </article>`;
  }

  function recordEntry(item, fallback) {
    const main = item.title || item.type || item.subject || item.name || item.plate || fallback;
    const detail = item.details || item.body || item.notes || item.offense || item.location || item.model || "";
    return `<article class="record-entry"><strong>${esc(main)}</strong><p>${esc(detail)}</p><small>${esc(item.by || item.agency || agency || "FSRP")} · ${esc(item.time || "")}</small></article>`;
  }

  function renderOverview() {
    const openCalls = activeCalls();
    const panicUnits = state.units.filter((unit) => unit.panic);
    $("#cad-metric-units").textContent = state.units.length;
    $("#cad-metric-calls").textContent = openCalls.length;
    $("#cad-metric-panic").textContent = panicUnits.length;
    $("#cad-metric-radio").textContent = state.radioPresence.length;
    $("#cad-overview-calls").innerHTML = openCalls.slice(0, 5).map((call) => callCard(call, true)).join("") || '<p class="muted">No active calls.</p>';
    $("#cad-overview-units").innerHTML = state.units.slice(0, 7).map((unit) => unitCard(unit, true)).join("") || '<p class="muted">No units have checked in.</p>';
  }

  function renderDispatch() {
    if (localDispatchHidden) {
      $("#cad-dispatch-feed").innerHTML = '<p class="muted">Local dispatch view cleared. New traffic will appear after refresh.</p>';
      return;
    }
    const combined = [
      ...state.dispatch.map((item) => ({ ...item, sortTime: item.updatedAt || item.createdAt || 0 })),
      ...activeCalls().map((call) => ({ ...call, type: call.type || "DISPATCH CALL", sortTime: call.updatedAt || call.createdAt || 0, isCall: true }))
    ].sort((a, b) => b.sortTime - a.sortTime).slice(0, 100);

    $("#cad-dispatch-feed").innerHTML = combined.map((item) => item.isCall ? callCard(item) : `<article class="dispatch-entry ${priorityClass(item.priority)}"><header><strong>${esc(item.type || "DISPATCH")}</strong><time>${esc(item.time || "")}</time></header><p><b>${esc(item.location || "FSRP Operations")}</b><br>${esc(item.details || "")}</p><small>${esc(item.priority || "General")} · ${esc(item.by || item.agency || "FSRP")}</small></article>`).join("") || '<p class="muted">No dispatch traffic yet.</p>';
  }

  function renderUnits() {
    $("#cad-unit-count").textContent = `${state.units.length} Unit${state.units.length === 1 ? "" : "s"}`;
    $("#cad-unit-board").innerHTML = state.units.map((unit) => unitCard(unit)).join("") || '<p class="muted">No active units.</p>';
  }

  function renderCalls() {
    $("#cad-call-count").textContent = `${activeCalls().length} Open`;
    $("#cad-call-list").innerHTML = state.calls.map((call) => callCard(call)).join("") || '<p class="muted">No 911 calls.</p>';
  }

  function renderRecords(query = "") {
    if (!query) return;
    const needle = query.toLowerCase();
    const all = [
      ...state.people.map((item) => ({ ...item, recordType: "PERSON" })),
      ...state.vehicles.map((item) => ({ ...item, recordType: "VEHICLE" })),
      ...state.records.map((item) => ({ ...item, recordType: "LEGACY" }))
    ].filter((item) => JSON.stringify(item).toLowerCase().includes(needle));

    $("#cad-record-results").innerHTML = all.map((item) => {
      if (item.recordType === "PERSON") return `<article class="record-entry record-hit"><span class="record-type">PERSON</span><strong>${esc(item.name || "Unknown")}</strong><p>Username: ${esc(item.username || "Unknown")} · DOB: ${esc(item.dob || "Unknown")}<br>License: ${esc(item.license || "Unknown")}<br>${esc(item.notes || "")}</p><small>${esc(item.agency || "FSRP")}</small></article>`;
      if (item.recordType === "VEHICLE") return `<article class="record-entry record-hit"><span class="record-type">VEHICLE</span><strong>${esc(item.plate || "NO PLATE")}</strong><p>${esc(item.color || "")} ${esc(item.model || "Vehicle")}<br>Owner: ${esc(item.owner || "Unknown")} · Registration: ${esc(item.registration || "Unknown")}<br>Flag: ${esc(item.flag || "Clear")}</p><small>${esc(item.agency || "FSRP")}</small></article>`;
      return recordEntry(item, "Record");
    }).join("") || '<p class="muted">No matching people or vehicles.</p>';
  }

  function renderLists() {
    $("#cad-report-count").textContent = `${state.reports.length} Reports`;
    $("#cad-report-list").innerHTML = state.reports.map((item) => recordEntry(item, "Report")).join("") || '<p class="muted">No reports filed.</p>';
    $("#cad-citation-count").textContent = `${state.citations.length} Citations`;
    $("#cad-citation-list").innerHTML = state.citations.map((item) => recordEntry(item, "Citation")).join("") || '<p class="muted">No citations issued.</p>';
    $("#cad-warrant-count").textContent = `${state.warrants.length} Alerts`;
    $("#cad-warrant-list").innerHTML = state.warrants.map((item) => recordEntry(item, "Alert")).join("") || '<p class="muted">No active warrants or BOLOs.</p>';
    $("#cad-audit-count").textContent = `${state.audit.length} Events`;
    $("#cad-audit-list").innerHTML = state.audit.map((item) => recordEntry(item, "Activity")).join("") || '<p class="muted">No CAD activity recorded.</p>';
  }

  function renderRadio() {
    const channelPresence = state.radioPresence.filter((item) => item.channel === currentChannel);
    const activeSpeaker = channelPresence.find((item) => item.transmitting);
    $("#cad-radio-online-count").textContent = `${channelPresence.length} Online`;
    $("#cad-radio-presence-count").textContent = channelPresence.length;
    $("#cad-radio-channel").textContent = currentChannel;
    $("#cad-radio-speaker").textContent = activeSpeaker ? `${activeSpeaker.callsign} transmitting` : "No active transmission";
    if (!pttActive) $("#cad-radio-state").textContent = activeSpeaker ? "RECEIVING" : "STANDBY";
    $("#cad-radio-presence-list").innerHTML = channelPresence.map((item) => `<article class="radio-presence ${item.transmitting ? "is-transmitting" : ""}"><i></i><span><strong>${esc(item.callsign)}</strong><small>${esc(item.agency)} · ${item.transmitting ? "TX" : item.scanning ? "SCANNING" : "MONITORING"}</small></span></article>`).join("") || '<p class="muted">No units connected to this talkgroup.</p>';
    if (!localRadioHidden) {
      $("#cad-radio-log").innerHTML = state.radio.filter((item) => item.type === currentChannel || radioScanning).map((item) => recordEntry(item, "Transmission")).join("") || '<p class="muted">No radio traffic on this channel.</p>';
    }
    $("#cad-radio-wave").classList.toggle("active", Boolean(activeSpeaker || pttActive));
  }

  function renderPanic() {
    const panicUnits = state.units.filter((unit) => unit.panic);
    const banner = $("#cad-panic-banner");
    banner.hidden = panicUnits.length === 0;
    if (panicUnits.length) $("#cad-panic-banner-text").textContent = `${panicUnits.map((unit) => unit.callsign).join(", ")} requested immediate assistance.`;
    const mine = panicUnits.some((unit) => String(unit.callsign).toLowerCase() === currentCallsign().toLowerCase());
    $("#cad-panic-btn").textContent = mine ? "Panic Active" : "Activate Panic";
    $("#cad-workspace").classList.toggle("panic-active", panicUnits.length > 0);
  }

  function render() {
    renderOverview();
    renderDispatch();
    renderUnits();
    renderCalls();
    renderLists();
    renderRadio();
    renderPanic();
    renderErlcLive();
    updateCameraOverlays();
  }

  async function refresh() {
    if (!token) return;
    try {
      const data = await api("state");
      state = normalizeState(data.state);
      setConnection("Connected", true);
      render();
    } catch (error) {
      setConnection("Reconnecting", false);
      if (/expired|invalid/i.test(error.message)) logout();
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!token || document.hidden) return;
    refreshTimer = setTimeout(async () => {
      await refresh();
      scheduleRefresh();
    }, 2500);
  }

  async function updatePresence() {
    if (!token) return;
    try {
      const data = await api("radio-presence", {
        callsign: currentCallsign() || `${agency} UNIT`,
        channel: currentChannel,
        transmitting: pttActive,
        scanning: radioScanning,
        muted: radioMuted
      });
      state = normalizeState(data.state || state);
      renderRadio();
    } catch {
      // Presence expires automatically when the connection is unavailable.
    }
  }

  function schedulePresence() {
    clearTimeout(presenceTimer);
    if (!token || document.hidden) return;
    updatePresence().finally(() => {
      if (token && !document.hidden) presenceTimer = setTimeout(schedulePresence, 8000);
    });
  }

  async function append(collection, item) {
    const payload = { id: item.id || id(collection.toUpperCase()), time: item.time || nowLabel(), by: currentCallsign() || agency, ...item };
    const data = await api("append", { collection, item: payload });
    state = normalizeState(data.state || state);
    render();
    return payload;
  }

  async function updateUnit(statusOverride = "") {
    const callsign = currentCallsign();
    if (!callsign) throw new Error("Enter a callsign before updating your unit.");
    localStorage.setItem(`fsrpCadCallsign:${agency}`, callsign);
    const robloxUsername = currentRobloxUsername();
    if (robloxUsername) localStorage.setItem(`fsrpCadRoblox:${agency}`, robloxUsername);
    const existing = state.units.find((unit) => String(unit.callsign).toLowerCase() === callsign.toLowerCase());
    const item = {
      id: existing?.id || id("UNIT"),
      callsign,
      robloxUsername,
      inGameTeam: matchedErlcPlayer()?.team || existing?.inGameTeam || "",
      status: statusOverride || value("#cad-unit-status") || "10-8 In Service",
      location: value("#cad-unit-location"),
      attachedCall: existing?.attachedCall || "",
      panic: Boolean(existing?.panic),
      time: nowLabel()
    };
    const data = await api("unit", { item });
    state = normalizeState(data.state || state);
    $("#cad-unit-status").value = item.status;
    render();
    updatePresence();
  }

  function populateChannels() {
    const select = $("#cad-radio-channel-select");
    if (!select) return;
    const channels = CHANNELS[role] || CHANNELS.staff;
    const preferred = localStorage.getItem(`fsrpCadChannel:${agency}`) || channels[0];
    select.innerHTML = channels.map((channel) => `<option>${esc(channel)}</option>`).join("");
    currentChannel = channels.includes(preferred) ? preferred : channels[0];
    select.value = currentChannel;
    $("#cad-radio-zone").textContent = role === "staff" ? "COMMAND ZONE" : `${agency} ZONE`;
  }

  function audio() {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    return audioContext;
  }

  function tone(frequency = 720, duration = 0.08, gainValue = 0.06) {
    if (radioMuted) return;
    try {
      const ctx = audio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = gainValue * Number($("#cad-radio-volume")?.value || 0.65);
      osc.frequency.value = frequency;
      osc.type = "square";
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      window.FSRP_BEEP?.(frequency, duration, gainValue);
    }
  }

  function alertTone() {
    [880, 880, 660, 660].forEach((frequency, index) => setTimeout(() => tone(frequency, 0.16, 0.08), index * 190));
  }

  async function startPTT() {
    if (pttActive || !token) return;
    const callsign = currentCallsign();
    if (!callsign) return window.alert("Enter and update your callsign before using PTT.");
    pttActive = true;
    $("#cad-radio-ptt")?.classList.add("transmitting");
    $("#cad-radio-state").textContent = "TRANSMITTING";
    $("#cad-radio-speaker").textContent = `${callsign} transmitting`;
    $("#cad-radio-wave").classList.add("active");
    tone(1050, 0.07, 0.08);
    await updatePresence();
  }

  async function stopPTT() {
    if (!pttActive) return;
    pttActive = false;
    $("#cad-radio-ptt")?.classList.remove("transmitting");
    $("#cad-radio-state").textContent = "STANDBY";
    tone(520, 0.09, 0.07);
    await updatePresence();
  }

  async function enableMicMeter() {
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
      cancelAnimationFrame(micAnimation);
      $("#cad-radio-mic").textContent = "Enable Mic Meter";
      $$("#cad-radio-wave i").forEach((bar) => { bar.style.height = "20%"; });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires HTTPS and a supported browser.");
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx = audio();
    const source = ctx.createMediaStreamSource(micStream);
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 64;
    source.connect(micAnalyser);
    $("#cad-radio-mic").textContent = "Disable Mic Meter";
    const data = new Uint8Array(micAnalyser.frequencyBinCount);
    const bars = $$("#cad-radio-wave i");
    const animate = () => {
      micAnalyser.getByteFrequencyData(data);
      bars.forEach((bar, index) => {
        const level = data[index % data.length] || 0;
        bar.style.height = `${Math.max(12, Math.min(100, level / 2.55))}%`;
      });
      micAnimation = requestAnimationFrame(animate);
    };
    animate();
  }

  async function camera(kind) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires HTTPS and a supported browser.");
    streams[kind] = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $(`#${kind}-video`).srcObject = streams[kind];
    $(`#${kind}-status`).textContent = "Live";
    $(`#${kind}-status`).classList.add("is-live");
  }

  function record(kind) {
    const stream = streams[kind];
    if (!stream) throw new Error("Start the camera first.");
    if (!window.MediaRecorder) throw new Error("Recording is not supported in this browser.");
    if (recorders[kind]?.state === "recording") return recorders[kind].stop();
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorders[kind] = recorder;
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `FSRP-${kind}-${Date.now()}.webm`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
      $(`#${kind}-status`).textContent = "Live";
    };
    recorder.start();
    $(`#${kind}-status`).textContent = "Recording";
  }

  function stopCamera(kind) {
    if (recorders[kind]?.state === "recording") recorders[kind].stop();
    streams[kind]?.getTracks().forEach((track) => track.stop());
    delete streams[kind];
    const video = $(`#${kind}-video`);
    if (video) video.srcObject = null;
    const status = $(`#${kind}-status`);
    if (status) {
      status.textContent = "Off";
      status.classList.remove("is-live");
    }
  }

  function updateCameraOverlays() {
    const callsign = currentCallsign() || "UNIT";
    const time = new Date().toLocaleTimeString();
    ["bodycam", "dashcam"].forEach((kind) => {
      const cs = $(`#${kind}-overlay-callsign`);
      const clock = $(`#${kind}-overlay-time`);
      if (cs) cs.textContent = callsign;
      if (clock) clock.textContent = time;
    });
    const radioClock = $("#cad-radio-clock");
    if (radioClock) radioClock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function panic(active) {
    const callsign = currentCallsign();
    if (!callsign) throw new Error("Enter and update your callsign before using panic.");
    alertTone();
    const data = await api("panic", { callsign, active, location: value("#cad-unit-location") });
    state = normalizeState(data.state || state);
    render();
  }

  async function runCommand() {
    const raw = value("#cad-command-input");
    const result = $("#cad-command-result");
    if (!raw) return;
    const [command, ...parts] = raw.split(/\s+/);
    const arg = parts.join(" ").trim();
    try {
      switch (command.toUpperCase()) {
        case "STATUS":
          if (!arg) throw new Error("Use STATUS followed by a unit status.");
          await updateUnit(arg);
          result.textContent = `Unit status changed to ${arg}.`;
          break;
        case "PANIC":
          await panic(true);
          result.textContent = "Panic activated.";
          break;
        case "CLEAR":
          if (arg.toUpperCase() !== "PANIC") throw new Error("Supported command: CLEAR PANIC");
          await panic(false);
          result.textContent = "Panic cleared.";
          break;
        case "CHANNEL": {
          const option = [...$("#cad-radio-channel-select").options].find((item) => item.text.toLowerCase() === arg.toLowerCase());
          if (!option) throw new Error("That talkgroup is not available to your agency.");
          $("#cad-radio-channel-select").value = option.text;
          currentChannel = option.text;
          localStorage.setItem(`fsrpCadChannel:${agency}`, currentChannel);
          await updatePresence();
          renderRadio();
          result.textContent = `Radio changed to ${currentChannel}.`;
          break;
        }
        case "ATTACH": {
          const call = state.calls.find((item) => String(item.callNumber || item.id).toLowerCase() === arg.toLowerCase());
          if (!call) throw new Error("Call number not found.");
          const callsign = currentCallsign();
          if (!callsign) throw new Error("Enter a callsign first.");
          const data = await api("attach-unit", { callsign, callId: call.id });
          state = normalizeState(data.state || state);
          render();
          result.textContent = `${callsign} attached to ${call.callNumber || call.id}.`;
          break;
        }
        default:
          throw new Error("Unknown command. Try STATUS, PANIC, CLEAR PANIC, ATTACH, or CHANNEL.");
      }
      $("#cad-command-input").value = "";
    } catch (error) {
      result.textContent = error.message;
    }
  }

  function switchCadTab(name) {
    $$('[data-cad-tab]').forEach((item) => item.classList.toggle("is-active", item.dataset.cadTab === name));
    $$('[data-cad-panel]').forEach((item) => item.classList.toggle("is-active", item.dataset.cadPanel === name));
  }

  async function logout() {
    clearTimeout(refreshTimer);
    clearTimeout(presenceTimer);
    clearTimeout(erlcTimer);
    await stopPTT();
    if (micStream) micStream.getTracks().forEach((track) => track.stop());
    stopCamera("bodycam");
    stopCamera("dashcam");
    clearSession();
    state = structuredClone(EMPTY_STATE);
    erlcLive = null;
    $("#cad-workspace").hidden = true;
    $("#cad-access").hidden = false;
    setConnection("Disconnected", false);
    checkCADSetup();
  }

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.id === "cad-login-btn") return login();
    if (target.id === "cad-logout-btn") return logout();

    const nav = target.closest("[data-cad-tab]");
    if (nav) switchCadTab(nav.dataset.cadTab);
    const jump = target.closest("[data-cad-jump]");
    if (jump) switchCadTab(jump.dataset.cadJump);

    const recordTab = target.closest("[data-record-form]");
    if (recordTab) {
      $$('[data-record-form]').forEach((button) => button.classList.toggle("is-active", button === recordTab));
      $("#cad-person-form").hidden = recordTab.dataset.recordForm !== "person";
      $("#cad-vehicle-form").hidden = recordTab.dataset.recordForm !== "vehicle";
    }

    const statusShortcut = target.closest("[data-unit-status]");
    if (statusShortcut) {
      try { await updateUnit(statusShortcut.dataset.unitStatus); } catch (error) { alert(error.message); }
    }

    const quickRadio = target.closest("[data-radio-quick]");
    if (quickRadio) $("#cad-radio-message").value = quickRadio.dataset.radioQuick;

    const attachButton = target.closest("[data-attach-call]");
    if (attachButton) {
      try {
        const callsign = currentCallsign();
        if (!callsign) throw new Error("Enter and update your callsign first.");
        const data = await api("attach-unit", { callsign, callId: attachButton.dataset.attachCall });
        state = normalizeState(data.state || state);
        render();
      } catch (error) { alert(error.message); }
    }

    const callStatus = target.closest("[data-call-status-id]");
    if (callStatus) {
      try {
        const data = await api("call-status", { callId: callStatus.dataset.callStatusId, status: callStatus.dataset.callStatus });
        state = normalizeState(data.state || state);
        render();
      } catch (error) { alert(error.message); }
    }

    try {
      if (target.id === "cad-clear-feed") { localDispatchHidden = true; renderDispatch(); }
      if (target.id === "cad-command-run") await runCommand();
      if (target.id === "cad-unit-update") await updateUnit();
      if (target.id === "cad-erlc-refresh") await fetchErlcLive(true);
      if (target.id === "cad-erlc-sync-unit") await syncUnitFromErlc();
      if (target.id === "cad-dispatch-submit") {
        const details = value("#cad-dispatch-details");
        const location = value("#cad-dispatch-location");
        if (!details || !location) throw new Error("Enter the call location and details.");
        const call = await append("calls", {
          id: id("CALL"), callNumber: `FSRP-${String(Date.now()).slice(-5)}`,
          priority: value("#cad-dispatch-priority"), type: value("#cad-dispatch-type"),
          location, details, status: "Pending", attachedUnits: []
        });
        await append("dispatch", { type: call.type, priority: call.priority, location, details, callId: call.id });
      }
      if (target.id === "cad-call-submit") {
        const location = value("#cad-call-location");
        const details = value("#cad-call-details");
        if (!location || !details) throw new Error("Enter the 911 call location and emergency.");
        await append("calls", {
          id: id("CALL"), callNumber: `911-${String(Date.now()).slice(-5)}`,
          priority: "Priority 2", type: "911 Call", caller: value("#cad-call-caller"), phone: value("#cad-call-phone"),
          location, details, status: "Pending", attachedUnits: []
        });
      }
      if (target.id === "cad-person-add") {
        if (!value("#cad-person-name")) throw new Error("Enter the person's name.");
        await append("people", { name: value("#cad-person-name"), username: value("#cad-person-username"), dob: value("#cad-person-dob"), license: value("#cad-person-license"), notes: value("#cad-person-notes") });
      }
      if (target.id === "cad-vehicle-add") {
        if (!value("#cad-vehicle-plate")) throw new Error("Enter a vehicle plate.");
        await append("vehicles", { plate: value("#cad-vehicle-plate").toUpperCase(), owner: value("#cad-vehicle-owner"), model: value("#cad-vehicle-model"), color: value("#cad-vehicle-color"), registration: value("#cad-vehicle-registration"), flag: value("#cad-vehicle-flag") });
      }
      if (target.id === "cad-record-search-btn") renderRecords(value("#cad-record-search"));
      if (target.id === "cad-report-submit") {
        if (!value("#cad-report-title") || !value("#cad-report-body")) throw new Error("Enter a report title and narrative.");
        await append("reports", { type: value("#cad-report-type"), title: value("#cad-report-title"), body: value("#cad-report-body") });
      }
      if (target.id === "cad-citation-submit") {
        if (!value("#cad-citation-subject") || !value("#cad-citation-offense")) throw new Error("Enter the citation subject and offense.");
        await append("citations", { subject: value("#cad-citation-subject"), plate: value("#cad-citation-plate"), amount: value("#cad-citation-amount"), location: value("#cad-citation-location"), offense: value("#cad-citation-offense") });
      }
      if (target.id === "cad-warrant-submit") {
        if (!value("#cad-warrant-subject") || !value("#cad-warrant-details")) throw new Error("Enter the alert subject and details.");
        await append("warrants", { type: value("#cad-warrant-type"), subject: value("#cad-warrant-subject"), priority: value("#cad-warrant-priority"), details: value("#cad-warrant-details") });
      }
      if (target.id === "cad-radio-send") {
        const details = value("#cad-radio-message");
        if (!details) throw new Error("Enter a radio transmission.");
        tone(920, 0.07, 0.08);
        await append("radio", { type: currentChannel, details, callsign: currentCallsign() || `${agency} UNIT` });
        await append("dispatch", { type: "RADIO", priority: "General", location: currentChannel, details: `${currentCallsign() || agency}: ${details}` });
        $("#cad-radio-message").value = "";
      }
      if (target.id === "cad-radio-clear-local") { localRadioHidden = true; $("#cad-radio-log").innerHTML = '<p class="muted">Local radio view cleared.</p>'; }
      if (target.id === "cad-radio-mic") await enableMicMeter();
      if (target.id === "cad-radio-scan") { radioScanning = !radioScanning; target.textContent = radioScanning ? "Scan On" : "Scan Off"; await updatePresence(); renderRadio(); }
      if (target.id === "cad-radio-mute") { radioMuted = !radioMuted; target.textContent = radioMuted ? "Mute On" : "Mute Off"; await updatePresence(); }
      if (target.id === "cad-radio-tone") alertTone();
      if (target.id === "cad-panic-btn") await panic(true);
      if (target.id === "cad-clear-my-panic") await panic(false);
      if (target.id === "bodycam-start") await camera("bodycam");
      if (target.id === "bodycam-record") record("bodycam");
      if (target.id === "bodycam-stop") stopCamera("bodycam");
      if (target.id === "dashcam-start") await camera("dashcam");
      if (target.id === "dashcam-record") record("dashcam");
      if (target.id === "dashcam-stop") stopCamera("dashcam");
    } catch (error) {
      alert(error.message);
    }
  });

  $("#cad-access-code")?.addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  $("#cad-command-input")?.addEventListener("keydown", (event) => { if (event.key === "Enter") runCommand(); });
  $("#cad-record-search")?.addEventListener("keydown", (event) => { if (event.key === "Enter") renderRecords(value("#cad-record-search")); });
  $("#cad-radio-channel-select")?.addEventListener("change", async (event) => {
    currentChannel = event.target.value;
    localStorage.setItem(`fsrpCadChannel:${agency}`, currentChannel);
    localRadioHidden = false;
    await updatePresence();
    renderRadio();
  });
  $("#cad-unit-callsign")?.addEventListener("input", updateCameraOverlays);
  $("#cad-unit-roblox")?.addEventListener("input", () => { renderErlcLive(); });

  const ptt = $("#cad-radio-ptt");
  ptt?.addEventListener("pointerdown", (event) => { event.preventDefault(); startPTT(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((name) => ptt?.addEventListener(name, stopPTT));

  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    const typing = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag);
    const radioVisible = $('[data-cad-panel="radio"]')?.classList.contains("is-active");
    if (event.code === "Space" && !event.repeat && !typing && radioVisible) {
      event.preventDefault();
      startPTT();
    }
  });
  document.addEventListener("keyup", (event) => {
    if (event.code === "Space" && pttActive) {
      event.preventDefault();
      stopPTT();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(refreshTimer);
      clearTimeout(presenceTimer);
      clearTimeout(erlcTimer);
      if (pttActive) stopPTT();
    } else {
      refresh();
      scheduleRefresh();
      schedulePresence();
      scheduleErlc();
    }
  });

  window.addEventListener("beforeunload", () => {
    micStream?.getTracks().forEach((track) => track.stop());
    Object.values(streams).forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
  });

  function scheduleClock() {
    clearTimeout(clockTimer);
    updateCameraOverlays();
    clockTimer = setTimeout(scheduleClock, 1000);
  }

  scheduleClock();
  checkCADSetup();
  tryRestoreSession();
})();
