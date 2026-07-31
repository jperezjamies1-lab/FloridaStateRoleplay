(function () {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escape = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "");
  let token = "";
  let agency = "";
  let state = { dispatch: [], units: [], calls: [], records: [], reports: [], citations: [], warrants: [], radio: [] };
  const streams = {};
  const recorders = {};
  let refreshTimer = null;
  const demo = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";

  function message(text) {
    const element = $("#cad-login-message");
    if (element) element.textContent = text;
  }
  function setConnection(text, online = true) {
    const element = $("#cad-connection-label");
    if (element) element.textContent = text;
    const badge = element?.closest(".badge");
    if (badge) badge.classList.toggle("is-live", online);
  }
  async function api(action, payload = {}) {
    if (demo) {
      if (action === "login") {
        if (payload.code !== "FSRP-DEMO") throw new Error("Local demo code: FSRP-DEMO");
        return { token: "demo", agency: "Staff Team", role: "staff" };
      }
      if (action === "state") return { state };
      if (action === "append") {
        state[payload.collection] ??= [];
        state[payload.collection].unshift(payload.item);
        return { state };
      }
      if (action === "unit") {
        const index = state.units.findIndex((item) => item.callsign === payload.item.callsign);
        if (index < 0) state.units.unshift(payload.item); else state.units[index] = payload.item;
        return { state };
      }
      return { state };
    }
    const response = await fetch("/api/cad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token, ...payload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "CAD request failed");
    return data;
  }
  async function login() {
    const code = $("#cad-access-code").value.trim();
    if (!code) return message("Enter your assigned access code.");
    message("Checking secure access…");
    try {
      const data = await api("login", { code });
      token = data.token;
      agency = data.agency;
      $("#cad-agency-label").textContent = `${agency} CAD`;
      $("#cad-access").hidden = true;
      $("#cad-workspace").hidden = false;
      message("");
      await refresh();
      scheduleRefresh();
    } catch (error) {
      message(error.message);
    }
  }
  function recordEntry(item, fallback) {
    return `<article class="record-entry"><strong>${escape(item.title || item.type || item.subject || item.name || fallback)}</strong><p>${escape(item.details || item.body || item.notes || item.offense || item.location || "")}</p><small>${escape(item.by || item.agency || agency || "")} · ${escape(item.time || "")}</small></article>`;
  }
  function render() {
    const feed = $("#cad-dispatch-feed");
    if (feed) feed.innerHTML = (state.dispatch || []).map((item) => `<article class="dispatch-entry"><header><strong>${escape(item.type)}</strong><time>${escape(item.time)}</time></header><p><b>${escape(item.location)}</b><br>${escape(item.details)}</p><small>${escape(item.by || item.agency)}</small></article>`).join("") || '<p class="muted">No dispatch traffic yet.</p>';
    const units = $("#cad-unit-board");
    if (units) units.innerHTML = (state.units || []).map((item) => `<article class="unit-entry"><header><strong>${escape(item.callsign)}</strong><span class="badge">${escape(item.agency)}</span></header><p>${escape(item.status)}</p></article>`).join("") || '<p class="muted">No units are signed in.</p>';
    const mappings = [
      ["#cad-call-list", "calls", "911 Call"], ["#cad-record-results", "records", "Record"],
      ["#cad-report-list", "reports", "Report"], ["#cad-citation-list", "citations", "Citation"],
      ["#cad-warrant-list", "warrants", "Alert"], ["#cad-radio-log", "radio", "Radio"],
    ];
    for (const [selector, key, label] of mappings) {
      const root = $(selector);
      if (root) root.innerHTML = (state[key] || []).map((item) => recordEntry(item, label)).join("") || `<p class="muted">No ${label.toLowerCase()} entries.</p>`;
    }
  }
  async function refresh() {
    if (!token || document.hidden) return;
    try {
      setConnection("Syncing…", true);
      const data = await api("state");
      state = data.state || state;
      render();
      setConnection("Connected", true);
    } catch (error) {
      setConnection("Reconnecting", false);
      if (/expired|invalid/i.test(error.message)) logout();
    }
  }
  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    if (!token || document.hidden) return;
    refreshTimer = window.setTimeout(async () => {
      await refresh();
      scheduleRefresh();
    }, 5000);
  }
  async function append(collection, item) {
    item.id = crypto.randomUUID?.() || String(Date.now());
    item.time = new Date().toLocaleString();
    item.by = agency;
    const data = await api("append", { collection, item });
    state = data.state || state;
    render();
  }
  function value(selector) {
    return $(selector)?.value.trim() || "";
  }
  function beep(frequency = 640) {
    window.FSRP_BEEP?.(frequency, 0.08, 0.06);
  }
  async function camera(kind) {
    if (!navigator.mediaDevices?.getUserMedia) return alert("Camera access requires HTTPS and a supported browser.");
    try {
      streams[kind] = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      $(`#${kind}-video`).srcObject = streams[kind];
      $(`#${kind}-status`).textContent = "Live";
    } catch (error) {
      alert(`Camera permission was not granted: ${error.message}`);
    }
  }
  function record(kind) {
    const stream = streams[kind];
    if (!stream) return alert("Start the camera first.");
    if (!window.MediaRecorder) return alert("Recording is not supported in this browser.");
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
      window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
      $(`#${kind}-status`).textContent = "Live";
    };
    recorder.start();
    $(`#${kind}-status`).textContent = "Recording";
  }
  function stopCamera(kind) {
    if (recorders[kind]?.state === "recording") recorders[kind].stop();
    streams[kind]?.getTracks().forEach((track) => track.stop());
    const video = $(`#${kind}-video`);
    if (video) video.srcObject = null;
    const status = $(`#${kind}-status`);
    if (status) status.textContent = "Off";
  }
  function logout() {
    token = "";
    agency = "";
    window.clearTimeout(refreshTimer);
    stopCamera("bodycam");
    stopCamera("dashcam");
    $("#cad-workspace").hidden = true;
    $("#cad-access").hidden = false;
    setConnection("Disconnected", false);
  }

  document.addEventListener("click", async (event) => {
    if (event.target.id === "cad-login-btn") login();
    if (event.target.id === "cad-logout-btn") logout();
    const navigation = event.target.closest("[data-cad-tab]");
    if (navigation) {
      $$("[data-cad-tab]").forEach((item) => item.classList.toggle("is-active", item === navigation));
      $$("[data-cad-panel]").forEach((item) => item.classList.toggle("is-active", item.dataset.cadPanel === navigation.dataset.cadTab));
    }
    try {
      if (event.target.id === "cad-clear-feed") { state.dispatch = []; render(); }
      if (event.target.id === "cad-dispatch-submit") await append("dispatch", { type: value("#cad-dispatch-type"), location: value("#cad-dispatch-location"), details: value("#cad-dispatch-details") });
      if (event.target.id === "cad-unit-update") {
        const item = { callsign: value("#cad-unit-callsign"), status: value("#cad-unit-status"), agency, time: new Date().toLocaleString() };
        if (!item.callsign) throw new Error("Enter a callsign.");
        const data = await api("unit", { item }); state = data.state || state; render();
      }
      if (event.target.id === "cad-call-submit") await append("calls", { title: "911 Call", name: value("#cad-call-caller"), location: value("#cad-call-location"), details: value("#cad-call-details") });
      if (event.target.id === "cad-record-add") await append("records", { name: value("#cad-record-name"), plate: value("#cad-record-plate"), notes: value("#cad-record-notes") });
      if (event.target.id === "cad-record-search-btn") {
        const query = value("#cad-record-search").toLowerCase();
        $("#cad-record-results").innerHTML = (state.records || []).filter((item) => JSON.stringify(item).toLowerCase().includes(query)).map((item) => recordEntry(item, "Record")).join("") || '<p class="muted">No matching records.</p>';
      }
      if (event.target.id === "cad-report-submit") await append("reports", { title: value("#cad-report-title"), body: value("#cad-report-body") });
      if (event.target.id === "cad-citation-submit") await append("citations", { subject: value("#cad-citation-subject"), amount: value("#cad-citation-amount"), offense: value("#cad-citation-offense") });
      if (event.target.id === "cad-warrant-submit") await append("warrants", { type: value("#cad-warrant-type"), subject: value("#cad-warrant-subject"), details: value("#cad-warrant-details") });
      if (event.target.id === "cad-radio-send") {
        const channel = value("#cad-radio-channel-select");
        const details = value("#cad-radio-message");
        if (!details) throw new Error("Enter a radio transmission.");
        beep(900);
        await append("radio", { type: channel, details });
        await append("dispatch", { type: "RADIO", location: channel, details });
      }
      if (event.target.id === "cad-panic-btn") {
        $("#cad-workspace").classList.add("panic-active");
        beep(1100);
        await append("dispatch", { type: "PANIC / EMERGENCY", location: "Unit requested immediate assistance", details: `${agency} emergency activation` });
        window.setTimeout(() => $("#cad-workspace").classList.remove("panic-active"), 5000);
      }
      if (event.target.id === "bodycam-start") camera("bodycam");
      if (event.target.id === "bodycam-record") record("bodycam");
      if (event.target.id === "bodycam-stop") stopCamera("bodycam");
      if (event.target.id === "dashcam-start") camera("dashcam");
      if (event.target.id === "dashcam-record") record("dashcam");
      if (event.target.id === "dashcam-stop") stopCamera("dashcam");
    } catch (error) {
      alert(error.message);
    }
  });

  const ptt = $("#cad-radio-ptt");
  function pttOn() { ptt?.classList.add("transmitting"); $("#cad-radio-state").textContent = "TRANSMITTING"; beep(1000); }
  function pttOff() { ptt?.classList.remove("transmitting"); $("#cad-radio-state").textContent = "STANDBY"; beep(550); }
  ptt?.addEventListener("pointerdown", pttOn);
  ptt?.addEventListener("pointerup", pttOff);
  ptt?.addEventListener("pointerleave", pttOff);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(refreshTimer); else scheduleRefresh();
  });
})();
