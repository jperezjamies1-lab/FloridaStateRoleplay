(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const EMPTY_STATE = { shifts: [], moderation: [], infractions: [], investigations: [], loa: [], training: [], promotions: [], requests: [], notes: [], audit: [] };
  const LEVELS = { staff: 1, supervisor: 2, hr: 3, admin: 4 };
  const TITLES = {
    moderation: "Moderation Case",
    infractions: "Staff Infraction",
    investigations: "Investigation",
    loa: "Leave of Absence",
    training: "Training Record",
    promotions: "Rank Change",
    requests: "Staff Request",
    notes: "Staff Note",
    shifts: "Staff Shift"
  };

  let token = sessionStorage.getItem("fsrpStaffOpsToken") || "";
  let user = null;
  let state = structuredClone(EMPTY_STATE);
  let readiness = null;
  let shiftTimer = 0;
  let search = "";

  function escape(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function toast(message) {
    const node = $("#staffops-toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("is-visible");
    window.clearTimeout(node._timer);
    node._timer = window.setTimeout(() => node.classList.remove("is-visible"), 3200);
  }

  function roleLevel(role = user?.role) {
    return LEVELS[role] || 0;
  }

  function normalizeState(value) {
    const next = value && typeof value === "object" ? value : {};
    for (const key of Object.keys(EMPTY_STATE)) if (!Array.isArray(next[key])) next[key] = [];
    return next;
  }

  function formatDate(value, withTime = true) {
    if (!value) return "Not set";
    const date = new Date(Number(value) || value);
    if (Number.isNaN(date.getTime())) return String(value);
    return withTime ? date.toLocaleString() : date.toLocaleDateString();
  }

  function formatMinutes(minutes) {
    const total = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return `${hours}h ${String(mins).padStart(2, "0")}m`;
  }

  function currentShift() {
    if (!user) return null;
    return state.shifts.find((shift) => shift.staffId === user.id && ["Active", "Break"].includes(shift.status));
  }

  function liveShiftMinutes(shift) {
    if (!shift) return 0;
    const end = shift.endedAt || Date.now();
    let breaks = Number(shift.breakMinutes) || 0;
    if (shift.status === "Break" && shift.breakStartedAt) breaks += Math.max(0, (end - Number(shift.breakStartedAt)) / 60000);
    return Math.max(0, Math.floor((end - Number(shift.startedAt || end)) / 60000 - breaks));
  }

  async function api(action, payload = {}) {
    const response = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Staff Operations request failed.");
    return data;
  }

  async function checkReadiness() {
    try {
      const response = await fetch("/api/staff", { cache: "no-store" });
      readiness = await response.json();
      renderReadiness();
      const message = $("#staffops-login-message");
      if (message && !readiness.staffOpsReady) message.textContent = "Staff Operations is not fully configured yet. Open System Readiness for the missing setup.";
    } catch {
      readiness = { staffOpsReady: false, storageReady: false, sessionSigningReady: false, configuredRoles: [], mediaReady: false, discordLogging: {} };
      renderReadiness();
    }
  }

  async function login() {
    const passcode = $("#staffops-passcode")?.value || "";
    const staffId = $("#staffops-staff-id")?.value || "";
    const name = $("#staffops-name")?.value || "";
    const discordId = $("#staffops-discord-id")?.value || "";
    const roblox = $("#staffops-roblox")?.value || "";
    const callsign = $("#staffops-callsign")?.value || "";
    const message = $("#staffops-login-message");
    if (message) message.textContent = "Checking Staff Operations access…";
    try {
      const data = await api("login", { passcode, staffId, name, discordId, roblox, callsign });
      token = data.token;
      user = data.user;
      sessionStorage.setItem("fsrpStaffOpsToken", token);
      sessionStorage.setItem("fsrpStaffOpsUser", JSON.stringify(user));
      document.dispatchEvent(new CustomEvent("fsrp:staff-session", { detail: { user, signedIn: true } }));
      if (message) message.textContent = "";
      await loadState();
      unlock();
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  async function loadState(silent = false) {
    if (!token) return;
    try {
      const data = await api("state");
      user = data.user;
      state = normalizeState(data.state);
      sessionStorage.setItem("fsrpStaffOpsUser", JSON.stringify(user));
      render();
      if (!silent) toast("Staff Operations synced");
    } catch (error) {
      if (/expired|invalid|sign in/i.test(error.message)) logout(false);
      if (!silent) toast(error.message);
    }
  }

  function unlock() {
    if (!user) return;
    $("#staffops-access").hidden = true;
    $("#staffops-workspace").hidden = false;
    $("#staffops-user-name").textContent = user.name || "Staff Member";
    $("#staffops-user-meta").textContent = [user.callsign, user.roblox, user.discordId].filter(Boolean).join(" · ") || "FSRP Staff Team";
    $("#staffops-role").textContent = user.role;
    applyPermissions();
    render();
  }

  function logout(showMessage = true) {
    window.clearTimeout(shiftTimer);
    token = "";
    user = null;
    state = structuredClone(EMPTY_STATE);
    sessionStorage.removeItem("fsrpStaffOpsToken");
    sessionStorage.removeItem("fsrpStaffOpsUser");
    document.dispatchEvent(new CustomEvent("fsrp:staff-session", { detail: { signedIn: false } }));
    if ($("#staffops-workspace")) $("#staffops-workspace").hidden = true;
    if ($("#staffops-access")) $("#staffops-access").hidden = false;
    if (showMessage) toast("Staff Operations signed out");
  }

  function applyPermissions() {
    $$('[data-staff-min-role]').forEach((element) => {
      const required = LEVELS[element.dataset.staffMinRole] || 99;
      element.hidden = roleLevel() < required;
    });
    const roleNote = $("#staffops-role-note");
    if (roleNote) {
      roleNote.textContent = user.role === "staff"
        ? "Staff access: shifts, moderation cases, your LOA requests, your requests, and records assigned to you."
        : user.role === "supervisor"
          ? "Supervisor access: staff oversight, training, investigations, notes, approvals, and case updates."
          : "HR/Admin access: full Staff Operations records, staff discipline, promotions, confidential investigations, exports, and Discord tests.";
    }
  }

  function switchTab(name) {
    $$('[data-staffops-tab]').forEach((button) => button.classList.toggle("is-active", button.dataset.staffopsTab === name));
    $$('[data-staffops-panel]').forEach((panel) => panel.classList.toggle("is-active", panel.dataset.staffopsPanel === name));
  }

  function filtered(collection) {
    const query = search.toLowerCase();
    return [...(state[collection] || [])].filter((item) => {
      if (!query) return true;
      return Object.values(item).some((value) => typeof value === "string" && value.toLowerCase().includes(query));
    });
  }

  function severityClass(collection, item) {
    const text = `${item.action || ""} ${item.priority || ""} ${item.status || ""}`.toLowerCase();
    if (collection === "infractions" || collection === "investigations" || /critical|termination|suspension|ban/.test(text)) return "is-critical";
    if (/pending|open|warning|high|appeal/.test(text)) return "is-warning";
    if (/approved|completed|resolved|served|promoted/.test(text)) return "is-success";
    return "";
  }

  function recordTitle(collection, item) {
    return item.subject || item.target || item.staffName || item.name || item.course || item.category || TITLES[collection] || "Staff Record";
  }

  function recordSummary(item) {
    return item.reason || item.details || item.allegation || item.notes || item.summary || item.outcome || item.description || "No additional details were entered.";
  }

  function actionButtons(collection, item) {
    const buttons = [];
    if (roleLevel() >= 2) {
      if (collection === "loa" && item.status === "Pending") {
        buttons.push(`<button data-staff-update="${collection}" data-id="${escape(item.id)}" data-status="Approved">Approve</button>`);
        buttons.push(`<button data-staff-update="${collection}" data-id="${escape(item.id)}" data-status="Denied">Deny</button>`);
      } else if (collection === "requests" && item.status !== "Resolved") {
        buttons.push(`<button data-staff-update="${collection}" data-id="${escape(item.id)}" data-status="In Review">Review</button>`);
        buttons.push(`<button data-staff-update="${collection}" data-id="${escape(item.id)}" data-status="Resolved">Resolve</button>`);
      } else if (["moderation", "investigations", "training"].includes(collection) && !["Closed", "Completed", "Voided"].includes(item.status)) {
        buttons.push(`<button data-staff-update="${collection}" data-id="${escape(item.id)}" data-status="Closed">Close</button>`);
      }
      if (item.status !== "Voided") buttons.push(`<button data-staff-void="${collection}" data-id="${escape(item.id)}">Void</button>`);
    }
    return buttons.join("");
  }

  function renderList(collection) {
    const root = $(`#staffops-${collection}-list`);
    if (!root) return;
    const items = filtered(collection);
    root.innerHTML = items.map((item) => `
      <article class="staffops-record ${severityClass(collection, item)}">
        <div class="staffops-record-head">
          <div><h4>${escape(recordTitle(collection, item))}</h4><div class="staffops-record-meta"><span>${escape(item.caseId || "NO CASE")}</span><span>${escape(item.status || "Open")}</span><span>${escape(item.action || item.type || item.category || TITLES[collection])}</span></div></div>
          <span class="badge">${escape(formatDate(item.updatedAt || item.createdAt, false))}</span>
        </div>
        <p>${escape(recordSummary(item))}</p>
        <div class="staffops-record-meta"><span>Created by ${escape(item.createdBy || item.staffName || "Staff")}</span>${item.updatedBy ? `<span>Updated by ${escape(item.updatedBy)}</span>` : ""}${item.points ? `<span>${escape(item.points)} point(s)</span>` : ""}${item.duration ? `<span>${escape(item.duration)}</span>` : ""}</div>
        ${item.evidenceUrl ? `<div class="staffops-evidence"><img src="${escape(item.evidenceUrl)}" alt="Evidence preview"><a href="${escape(item.evidenceUrl)}" target="_blank" rel="noopener">Open evidence screenshot</a></div>` : ""}
        <div class="staffops-record-actions">${actionButtons(collection, item)}</div>
      </article>`).join("") || `<div class="staffops-empty">No ${escape(TITLES[collection] || collection)} records match this view.</div>`;
  }

  function renderShifts() {
    const shift = currentShift();
    const stateNode = $("#staffops-shift-state");
    const clock = $("#staffops-shift-clock");
    const start = $("#staffops-shift-start");
    const breakButton = $("#staffops-shift-break");
    const resume = $("#staffops-shift-resume");
    const end = $("#staffops-shift-end");
    if (stateNode) {
      stateNode.className = `staffops-shift-state ${shift?.status === "Active" ? "is-live" : shift?.status === "Break" ? "is-break" : ""}`;
      stateNode.innerHTML = `<i></i><span>${escape(shift ? shift.status : "Off Duty")}</span>`;
    }
    if (clock) clock.textContent = formatMinutes(liveShiftMinutes(shift));
    if (start) start.hidden = Boolean(shift);
    if (breakButton) breakButton.hidden = !shift || shift.status !== "Active";
    if (resume) resume.hidden = !shift || shift.status !== "Break";
    if (end) end.hidden = !shift;
    const list = $("#staffops-shifts-list");
    if (list) {
      list.innerHTML = filtered("shifts").slice(0, 50).map((item) => `<article class="staffops-record ${item.status === "Active" ? "is-success" : item.status === "Break" ? "is-warning" : ""}"><div class="staffops-record-head"><div><h4>${escape(item.staffName || "Staff Member")}</h4><div class="staffops-record-meta"><span>${escape(item.caseId || "SHIFT")}</span><span>${escape(item.status)}</span><span>${escape(item.department || "Staff Team")}</span></div></div><strong>${formatMinutes(item.minutes ?? liveShiftMinutes(item))}</strong></div><p>${escape(item.summary || `${formatDate(item.startedAt)}${item.endedAt ? ` — ${formatDate(item.endedAt)}` : ""}`)}</p></article>`).join("") || '<div class="staffops-empty">No staff shifts have been recorded.</div>';
    }
    window.clearTimeout(shiftTimer);
    if (shift && !document.hidden) shiftTimer = window.setTimeout(renderShifts, 1000);
  }

  function renderMetrics() {
    const activeShifts = state.shifts.filter((item) => ["Active", "Break"].includes(item.status)).length;
    const openModeration = state.moderation.filter((item) => !["Closed", "Voided"].includes(item.status)).length;
    const activeInfractions = state.infractions.filter((item) => !["Served", "Closed", "Voided"].includes(item.status)).length;
    const investigations = state.investigations.filter((item) => !["Closed", "Voided"].includes(item.status)).length;
    if ($("#staffops-metric-shifts")) $("#staffops-metric-shifts").textContent = activeShifts;
    if ($("#staffops-metric-moderation")) $("#staffops-metric-moderation").textContent = openModeration;
    if ($("#staffops-metric-infractions")) $("#staffops-metric-infractions").textContent = activeInfractions;
    if ($("#staffops-metric-investigations")) $("#staffops-metric-investigations").textContent = investigations;
  }

  function renderOverview() {
    const activity = $("#staffops-overview-activity");
    if (activity) activity.innerHTML = state.audit.slice(0, 10).map((item) => `<article class="staffops-record"><div class="staffops-record-head"><div><h4>${escape(item.action)}</h4><div class="staffops-record-meta"><span>${escape(item.collection)}</span><span>${escape(item.caseId || "")}</span></div></div><span class="badge">${escape(formatDate(item.createdAt, false))}</span></div><p>${escape(item.detail || item.subject || "Staff Operations activity")}</p><div class="staffops-record-meta"><span>${escape(item.actor || "Staff")}</span><span>${escape(item.actorRole || "staff")}</span></div></article>`).join("") || '<div class="staffops-empty">No Staff Operations activity has been recorded.</div>';
    const pending = $("#staffops-overview-pending");
    if (pending) {
      const items = [...state.loa.filter((item) => item.status === "Pending"), ...state.requests.filter((item) => ["Open", "In Review"].includes(item.status)), ...state.investigations.filter((item) => !["Closed", "Voided"].includes(item.status))].slice(0, 10);
      pending.innerHTML = items.map((item) => `<article class="staffops-record is-warning"><div class="staffops-record-head"><div><h4>${escape(recordTitle(item.caseId?.startsWith("LOA") ? "loa" : item.caseId?.startsWith("INV") ? "investigations" : "requests", item))}</h4><div class="staffops-record-meta"><span>${escape(item.caseId)}</span><span>${escape(item.status)}</span></div></div></div><p>${escape(recordSummary(item))}</p></article>`).join("") || '<div class="staffops-empty">Nothing is waiting for review.</div>';
    }
  }

  function renderAudit() {
    const root = $("#staffops-audit-list");
    if (!root) return;
    root.innerHTML = filtered("audit").map((item) => `<article class="staffops-record"><div class="staffops-record-head"><div><h4>${escape(item.action)}</h4><div class="staffops-record-meta"><span>${escape(item.collection)}</span><span>${escape(item.caseId || "")}</span></div></div><span class="badge">${escape(formatDate(item.createdAt))}</span></div><p>${escape(item.detail || item.subject || "Audit event")}</p><div class="staffops-record-meta"><span>${escape(item.actor || "Staff")}</span><span>${escape(item.actorRole || "staff")}</span></div></article>`).join("") || '<div class="staffops-empty">No audit events are visible to this account.</div>';
  }

  function renderReadiness() {
    const root = $("#staffops-readiness");
    if (!root || !readiness) return;
    const hooks = readiness.discordLogging || {};
    const items = [
      ["Staff access", readiness.staffOpsReady, readiness.configuredRoles?.length ? readiness.configuredRoles.join(", ") : "No roles configured"],
      ["KV storage", readiness.storageReady, readiness.storageBinding || "Missing"],
      ["Session signing", readiness.sessionSigningReady, readiness.sessionSigningReady ? "Secure sessions ready" : "Missing secret"],
      ["Evidence uploads", readiness.mediaReady, readiness.mediaReady ? "MEDIA_BUCKET connected" : "R2 optional / missing"],
      ["Discord fallback", hooks.fallback, hooks.fallback ? "DISCORD_STAFF_WEBHOOK ready" : "Optional / missing"],
      ["Moderation logs", hooks.moderation, hooks.moderation ? "Webhook route ready" : "Uses fallback if set"],
      ["Infraction logs", hooks.infractions, hooks.infractions ? "Webhook route ready" : "Uses fallback if set"],
      ["Investigation logs", hooks.investigations, hooks.investigations ? "Webhook route ready" : "Uses fallback if set"]
    ];
    root.innerHTML = items.map(([label, ok, detail]) => `<div class="staffops-ready-item ${ok ? "ok" : "bad"}"><strong>${ok ? "READY" : "SETUP"} · ${escape(label)}</strong><span>${escape(detail)}</span></div>`).join("");
  }

  function render() {
    if (!user) return;
    applyPermissions();
    renderMetrics();
    renderShifts();
    renderOverview();
    ["moderation", "infractions", "investigations", "loa", "training", "promotions", "requests", "notes"].forEach(renderList);
    renderAudit();
    renderReadiness();
  }

  async function shift(mode) {
    try {
      const data = await api("shift", { mode, callsign: user.callsign, department: "Staff Team", summary: mode === "end" ? prompt("Optional shift summary:") || "" : "" });
      state = normalizeState(data.state);
      render();
      toast(`Shift ${mode} completed${data.discord?.delivered ? " · Discord logged" : ""}`);
    } catch (error) { toast(error.message); }
  }

  function serializeForm(form) {
    const data = {};
    new FormData(form).forEach((value, key) => {
      if (value instanceof File) return;
      if (key === "points") data[key] = Number(value) || 0;
      else if (key === "confidential") data[key] = value === "true";
      else data[key] = String(value).trim();
    });
    return data;
  }

  async function submitForm(form) {
    const collection = form.dataset.staffopsForm;
    const button = form.querySelector('button[type="submit"]');
    const original = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "Saving…"; }
    try {
      const item = serializeForm(form);
      const data = await api("create", { collection, item });
      state = normalizeState(data.state);
      form.reset();
      const preview = form.querySelector(".staffops-upload-preview");
      if (preview) preview.innerHTML = "";
      render();
      toast(`${data.item.caseId} created${data.discord?.delivered ? " · sent to Discord" : data.discord?.configured ? " · Discord delivery failed" : ""}`);
    } catch (error) { toast(error.message); }
    finally { if (button) { button.disabled = false; button.textContent = original; } }
  }

  async function uploadEvidence(input) {
    const file = input.files?.[0];
    if (!file) return;
    const form = input.closest("form");
    const hidden = form?.querySelector('[name="evidenceUrl"]');
    const preview = form?.querySelector(".staffops-upload-preview");
    if (!hidden || !preview) return;
    preview.innerHTML = `<span class="muted">Uploading ${escape(file.name)}…</span>`;
    const payload = new FormData();
    payload.append("file", file);
    try {
      const response = await fetch("/api/staff-media", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: payload });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Evidence upload failed.");
      hidden.value = data.url;
      preview.innerHTML = `<img src="${escape(data.url)}" alt="Evidence preview"><span><strong>Evidence ready</strong><br><small>${escape(data.name)}</small></span>`;
      toast("Evidence uploaded securely");
    } catch (error) {
      hidden.value = "";
      preview.innerHTML = `<span class="muted">${escape(error.message)}</span>`;
      toast(error.message);
    }
  }

  async function updateRecord(collection, id, patch) {
    try {
      const data = await api("update", { collection, id, patch });
      state = normalizeState(data.state);
      render();
      toast(`${data.item.caseId} updated${data.discord?.delivered ? " · Discord logged" : ""}`);
    } catch (error) { toast(error.message); }
  }

  async function voidRecord(collection, id) {
    const reason = prompt("Reason for voiding this record:");
    if (!reason) return;
    try {
      const data = await api("void", { collection, id, reason });
      state = normalizeState(data.state);
      render();
      toast(`${data.item.caseId} voided`);
    } catch (error) { toast(error.message); }
  }

  function exportData(format) {
    const stamp = new Date().toISOString().slice(0, 10);
    let blob;
    let filename;
    if (format === "csv") {
      const rows = [["Collection", "Case ID", "Status", "Subject", "Action/Type", "Created By", "Created At", "Details"]];
      for (const collection of ["moderation", "infractions", "investigations", "loa", "training", "promotions", "requests", "notes"]) {
        for (const item of state[collection] || []) rows.push([collection, item.caseId, item.status, recordTitle(collection, item), item.action || item.type || item.category || "", item.createdBy || "", formatDate(item.createdAt), recordSummary(item)]);
      }
      const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
      blob = new Blob([csv], { type: "text/csv" });
      filename = `FSRP-Staff-Operations-${stamp}.csv`;
    } else {
      blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), exportedBy: user, state }, null, 2)], { type: "application/json" });
      filename = `FSRP-Staff-Operations-${stamp}.json`;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function testDiscord() {
    try {
      const collection = $("#staffops-discord-test-type")?.value || "requests";
      const data = await api("test-discord", { collection });
      toast(data.discord?.delivered ? "Discord test delivered" : data.discord?.configured ? "Discord webhook rejected the test" : "No webhook is configured for that route");
    } catch (error) { toast(error.message); }
  }

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-staffops-form]");
    if (!form) return;
    event.preventDefault();
    submitForm(form);
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-staffops-evidence]")) uploadEvidence(event.target);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button,a");
    if (!target) return;
    if (target.id === "staffops-login-btn") login();
    if (target.id === "staffops-logout") logout();
    if (target.id === "staffops-refresh") loadState();
    if (target.id === "staffops-shift-start") shift("start");
    if (target.id === "staffops-shift-break") shift("break");
    if (target.id === "staffops-shift-resume") shift("resume");
    if (target.id === "staffops-shift-end") shift("end");
    if (target.id === "staffops-export-json") exportData("json");
    if (target.id === "staffops-export-csv") exportData("csv");
    if (target.id === "staffops-discord-test") testDiscord();
    const tab = target.closest("[data-staffops-tab]");
    if (tab) switchTab(tab.dataset.staffopsTab);
    const update = target.closest("[data-staff-update]");
    if (update) updateRecord(update.dataset.staffUpdate, update.dataset.id, { status: update.dataset.status });
    const voidButton = target.closest("[data-staff-void]");
    if (voidButton) voidRecord(voidButton.dataset.staffVoid, voidButton.dataset.id);
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "staffops-global-search") {
      search = event.target.value.trim();
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "staffops-passcode") login();
  });

  document.addEventListener("visibilitychange", () => {
    window.clearTimeout(shiftTimer);
    if (!document.hidden && user) {
      renderShifts();
      loadState(true);
    }
  });

  document.addEventListener("fsrp:route", (event) => {
    if (event.detail === "staff-ops") {
      checkReadiness();
      if (token && user) loadState(true);
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    try { user = JSON.parse(sessionStorage.getItem("fsrpStaffOpsUser") || "null"); } catch { user = null; }
    checkReadiness();
    if (token && user) {
      unlock();
      loadState(true);
    }
  });
})();
