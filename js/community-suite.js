(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  let token = sessionStorage.getItem("fsrpStaffOpsToken") || "";
  let user = null;
  let catalog = { forms: [], giveaways: [], highlights: [] };
  let state = null;
  let staffMetrics = { weeklyMinutes: 0, activeStaff: 0, leaderboard: [] };
  let erlc = { configured: false };
  let activeTab = "public";

  try { user = JSON.parse(sessionStorage.getItem("fsrpStaffOpsUser") || "null"); } catch { user = null; }

  const root = () => $("#community-suite-root");

  function toast(message, error = false) {
    const node = $("#community-suite-toast");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("is-error", error);
    node.classList.add("is-visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("is-visible"), 3800);
  }

  async function api(action, payload = {}, authenticated = false) {
    const response = await fetch("/api/community-suite", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authenticated && token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Community Suite request failed.");
    return data;
  }

  function fieldValue(form, id) {
    const field = form.elements.namedItem(id);
    if (!field) return "";
    if (field.type === "checkbox") return field.checked;
    return field.value;
  }

  function modal(title, body, actions = "") {
    const layer = $("#community-suite-modal");
    if (!layer) return;
    $("#community-suite-modal-title").textContent = title;
    $("#community-suite-modal-body").innerHTML = body;
    $("#community-suite-modal-actions").innerHTML = actions;
    layer.hidden = false;
  }

  function closeModal() {
    const layer = $("#community-suite-modal");
    if (layer) layer.hidden = true;
  }

  function renderField(field) {
    const required = field.required ? "required" : "";
    const label = `<label for="community-field-${esc(field.id)}">${esc(field.label)}${field.required ? " *" : ""}</label>`;
    if (field.type === "textarea") return `<div class="field">${label}<textarea id="community-field-${esc(field.id)}" name="${esc(field.id)}" ${required}></textarea></div>`;
    if (field.type === "select") return `<div class="field">${label}<select id="community-field-${esc(field.id)}" name="${esc(field.id)}" ${required}><option value="">Choose an option</option>${(field.options || []).map((option) => `<option>${esc(option)}</option>`).join("")}</select></div>`;
    if (field.type === "checkbox") return `<label class="badge"><input id="community-field-${esc(field.id)}" name="${esc(field.id)}" type="checkbox" ${required}> ${esc(field.label)}</label>`;
    return `<div class="field">${label}<input id="community-field-${esc(field.id)}" name="${esc(field.id)}" type="${esc(field.type || "text")}" ${required}></div>`;
  }

  function openPublicForm(form) {
    modal(form.title, `
      <p class="section-copy">${esc(form.description || "Complete the form below.")}</p>
      <form id="community-public-form" class="community-form-grid">
        ${(form.fields || []).map(renderField).join("")}
      </form>
    `, `<button class="btn btn-ghost" data-community-close>Cancel</button><button class="btn btn-primary" id="community-submit-public">Submit Form</button>`);
    $("#community-submit-public")?.addEventListener("click", async () => {
      const formElement = $("#community-public-form");
      if (!formElement.reportValidity()) return;
      const answers = {};
      for (const field of form.fields || []) answers[field.id] = fieldValue(formElement, field.id);
      try {
        const data = await api("submit", { formId: form.id, answers });
        closeModal();
        toast(`Submitted successfully. Tracking ID: ${data.caseId}`);
        await loadCatalog();
      } catch (error) { toast(error.message, true); }
    });
  }

  function openGiveaway(giveaway) {
    modal(giveaway.title, `
      <p class="section-copy">${esc(giveaway.description || "")}</p>
      <div class="community-help"><strong>Prize:</strong> ${esc(giveaway.prize || "FSRP prize")}<br><strong>Requirements:</strong> ${esc(giveaway.requirements || "Follow the published rules.")}</div>
      <form id="community-giveaway-form" class="community-form-grid" style="margin-top:15px">
        <div class="field"><label>Discord user ID</label><input name="discordId"></div>
        <div class="field"><label>Roblox username</label><input name="roblox"></div>
      </form>
    `, `<button class="btn btn-ghost" data-community-close>Cancel</button><button class="btn btn-primary" id="community-enter-giveaway">Enter Giveaway</button>`);
    $("#community-enter-giveaway")?.addEventListener("click", async () => {
      const form = $("#community-giveaway-form");
      try {
        await api("giveaway-enter", { giveawayId: giveaway.id, discordId: form.discordId.value, roblox: form.roblox.value });
        closeModal();
        toast("Giveaway entry recorded.");
      } catch (error) { toast(error.message, true); }
    });
  }

  function publicPanel() {
    return `
      <section class="community-suite-panel glass-card ${activeTab === "public" ? "is-active" : ""}" data-community-panel="public">
        <div class="section-head"><div><span class="eyebrow">Open now</span><h2 class="section-title">Applications, appeals & <span class="title-accent">community tools.</span></h2></div><p class="section-copy">Submit applications, department requests, ban appeals, verification requests, and feedback from one official FSRP dashboard.</p></div><div class="community-help community-oauth"><strong>Official Roblox verification:</strong> Use Roblox OAuth to prove which Roblox account you own. For automatic Discord linking and roles, start with the Discord bot <code>/verify</code> command.<div class="community-actions"><button class="btn btn-secondary btn-small" id="community-roblox-oauth" type="button">Verify with Roblox</button></div></div>
        <div class="community-public-forms">${catalog.forms.map((form) => `
          <article class="community-form-card">
            <div class="community-form-meta"><span class="community-form-type">${esc(form.type)} · ${esc(form.department)}</span><span class="community-status-pill" data-status="${esc(form.status)}">${esc(form.status)}</span></div>
            <h3>${esc(form.title)}</h3><p>${esc(form.description)}</p>
            <button class="btn btn-primary btn-small" data-open-public-form="${esc(form.id)}">Open Form</button>
          </article>`).join("") || '<div class="community-empty">No public forms are open right now.</div>'}</div>
        <div class="section-head" style="margin-top:42px"><div><span class="eyebrow">Community extras</span><h2 class="section-title">Giveaways & <span class="title-accent">highlights.</span></h2></div></div>
        <div class="community-suite-grid">
          <div class="community-span-6"><div class="community-compact-list">${catalog.giveaways.map((item) => `<article class="community-giveaway"><span class="eyebrow">Official Giveaway</span><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><div class="community-actions"><button class="btn btn-secondary btn-small" data-open-giveaway="${esc(item.id)}">Enter</button><span class="badge">${item.endsAt ? `Ends ${esc(new Date(item.endsAt).toLocaleString())}` : "No end date"}</span></div></article>`).join("") || '<div class="community-empty">No giveaways are open.</div>'}</div></div>
          <div class="community-span-6"><div class="community-compact-list">${catalog.highlights.map((item) => `<article class="community-suite-card glass-card"><span class="eyebrow">Reaction Board</span><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p>${item.imageUrl ? `<img class="command-evidence-preview" src="${esc(item.imageUrl)}" alt="">` : ""}</article>`).join("") || '<div class="community-empty">No community highlights have been published.</div>'}</div></div>
        </div>
      </section>`;
  }

  function statusBadge(status) {
    return `<span class="community-status-pill" data-status="${esc(status)}">${esc(status)}</span>`;
  }

  function answers(item) {
    return Object.entries(item.answers || {}).map(([key, value]) => `<div class="community-answer"><strong>${esc(key.replaceAll("-", " "))}</strong><span>${esc(String(value))}</span></div>`).join("");
  }

  function submissionCard(item) {
    return `<article class="community-submission">
      <div class="community-submission-head"><div><h4>${esc(item.caseId)} · ${esc(item.formTitle)}</h4><small>${esc(item.subject)} · ${new Date(item.createdAt).toLocaleString()}</small></div>${statusBadge(item.status)}</div>
      <div class="community-answer-grid">${answers(item)}</div>
      ${item.reviewNote ? `<div class="community-help" style="margin-top:10px"><strong>Review:</strong> ${esc(item.reviewNote)}</div>` : ""}
      <div class="community-actions">
        <button class="btn btn-primary btn-small" data-review-submission="${esc(item.id)}" data-review-status="Approved">Approve</button>
        <button class="btn btn-danger btn-small" data-review-submission="${esc(item.id)}" data-review-status="Denied">Deny</button>
        <button class="btn btn-secondary btn-small" data-review-submission="${esc(item.id)}" data-review-status="Needs Information">Needs Info</button>
      </div>
    </article>`;
  }

  function formFieldsText(form) {
    return (form.fields || []).map((field) => `${field.label}|${field.type}|${field.required ? "required" : "optional"}|${(field.options || []).join(",")}`).join("\n");
  }

  function openFormEditor(form = {}) {
    modal(form.id ? "Edit Form" : "Create Form", `
      <form id="community-form-editor" class="community-form-grid">
        <div class="field"><label>Form ID</label><input name="id" value="${esc(form.id || "")}" placeholder="ocso-application"></div>
        <div class="field"><label>Title</label><input name="title" value="${esc(form.title || "")}" required></div>
        <div class="field"><label>Type</label><select name="type">${["application","department","join","appeal","feedback","verification"].map((type) => `<option ${form.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></div>
        <div class="field"><label>Department</label><input name="department" value="${esc(form.department || "Community")}"></div>
        <div class="field"><label>Status</label><select name="status">${["Open","Closed","Draft"].map((status) => `<option ${form.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
        <div class="field"><label>Approved Discord role ID</label><input name="approvedRoleId" value="${esc(form.approvedRoleId || "")}"></div>
        <div class="field"><label>Opens at</label><input name="opensAt" type="datetime-local" value="${esc(form.opensAt || "")}"></div>
        <div class="field"><label>Closes at</label><input name="closesAt" type="datetime-local" value="${esc(form.closesAt || "")}"></div>
        <div class="field community-span-12"><label>Description</label><textarea name="description">${esc(form.description || "")}</textarea></div>
        <div class="field community-span-12"><label>Fields — one per line: Label | type | required/optional | options</label><textarea name="fields" rows="10">${esc(formFieldsText(form))}</textarea></div>
      </form>
    `, `<button class="btn btn-ghost" data-community-close>Cancel</button><button class="btn btn-primary" id="community-save-form">Save Form</button>`);
    $("#community-save-form")?.addEventListener("click", async () => {
      const editor = $("#community-form-editor");
      if (!editor.reportValidity()) return;
      const fields = editor.fields.value.split(/\n+/).map((line, index) => {
        const [label, type = "text", required = "optional", options = ""] = line.split("|").map((part) => part.trim());
        return label ? { id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `field-${index + 1}`, label, type, required: required.toLowerCase() === "required", options: options.split(",").map((item) => item.trim()).filter(Boolean) } : null;
      }).filter(Boolean);
      try {
        await api("form-save", { form: { id: editor.id.value, title: editor.title.value, type: editor.type.value, department: editor.department.value, status: editor.status.value, approvedRoleId: editor.approvedRoleId.value, opensAt: editor.opensAt.value, closesAt: editor.closesAt.value, description: editor.description.value, fields } }, true);
        closeModal(); toast("Form saved."); await loadStaffState();
      } catch (error) { toast(error.message, true); }
    });
  }

  function formsPanel() {
    const forms = state?.forms || [];
    return `<section class="community-suite-panel glass-card ${activeTab === "forms" ? "is-active" : ""}" data-community-panel="forms">
      <div class="section-head"><div><span class="eyebrow">Form Builder</span><h2 class="section-title">Build & publish <span class="title-accent">applications.</span></h2></div><button class="btn btn-primary" id="community-new-form">Create Form</button></div>
      <div class="community-compact-list">${forms.map((form) => `<article class="community-submission"><div class="community-submission-head"><div><h4>${esc(form.title)}</h4><small>${esc(form.type)} · ${esc(form.department)} · ${(form.fields || []).length} fields</small></div>${statusBadge(form.status)}</div><p>${esc(form.description)}</p><div class="community-actions"><button class="btn btn-secondary btn-small" data-edit-form="${esc(form.id)}">Edit</button><button class="btn btn-ghost btn-small" data-copy-form="${esc(form.id)}">Copy Public Link</button></div></article>`).join("")}</div>
    </section>`;
  }

  function submissionsPanel(filter, label) {
    const items = (state?.submissions || []).filter((item) => !filter || filter.includes(item.type));
    return `<section class="community-suite-panel glass-card ${activeTab === label.toLowerCase() ? "is-active" : ""}" data-community-panel="${label.toLowerCase()}">
      <div class="section-head"><div><span class="eyebrow">Review Center</span><h2 class="section-title">${esc(label)} <span class="title-accent">queue.</span></h2></div><span class="badge">${items.filter((item) => item.status === "Pending").length} pending</span></div>
      <div class="community-submission-list">${items.map(submissionCard).join("") || '<div class="community-empty">No submissions in this queue.</div>'}</div>
    </section>`;
  }

  function giveawaysPanel() {
    const giveaways = state?.giveaways || [];
    return `<section class="community-suite-panel glass-card ${activeTab === "giveaways" ? "is-active" : ""}" data-community-panel="giveaways">
      <div class="section-head"><div><span class="eyebrow">Community Engagement</span><h2 class="section-title">Giveaways & <span class="title-accent">reaction board.</span></h2></div><button class="btn btn-primary" id="community-new-giveaway">New Giveaway</button></div>
      <div class="community-suite-grid"><div class="community-span-6"><div class="community-compact-list">${giveaways.map((item) => `<article class="community-giveaway"><div class="community-submission-head"><div><h3>${esc(item.title)}</h3><small>${esc(item.prize || "No prize listed")}</small></div>${statusBadge(item.status)}</div><p>${esc(item.description)}</p><div class="community-actions"><button class="btn btn-secondary btn-small" data-edit-giveaway="${esc(item.id)}">Edit</button><button class="btn btn-primary btn-small" data-pick-winner="${esc(item.id)}">Pick Winner</button></div>${item.winner ? `<div class="community-help"><strong>Winner:</strong> ${esc(item.winner)}</div>` : ""}</article>`).join("") || '<div class="community-empty">No giveaways created.</div>'}</div></div>
      <div class="community-span-6"><div class="community-suite-card glass-card"><span class="eyebrow">Reaction Board</span><h3>Publish community highlights</h3><p>Add a message link, screenshot, reaction count, and description. Published highlights appear publicly.</p><button class="btn btn-secondary" id="community-new-highlight">Add Highlight</button></div><div class="community-compact-list" style="margin-top:12px">${(state?.highlights || []).map((item) => `<article class="community-submission"><div class="community-submission-head"><div><h4>${esc(item.title)}</h4><small>${esc(item.submittedBy || "Community")} · ${item.reactions || 0} reactions</small></div>${statusBadge(item.status)}</div><p>${esc(item.description)}</p><button class="btn btn-ghost btn-small" data-edit-highlight="${esc(item.id)}">Edit</button></article>`).join("")}</div></div></div>
    </section>`;
  }

  function automationPanel() {
    return `<section class="community-suite-panel glass-card ${activeTab === "automation" ? "is-active" : ""}" data-community-panel="automation">
      <div class="section-head"><div><span class="eyebrow">Workflow Engine</span><h2 class="section-title">Automate routine <span class="title-accent">community work.</span></h2></div><button class="btn btn-primary" id="community-new-rule">Create Rule</button></div>
      <div class="community-help"><strong>Available live actions:</strong> Discord webhook, Discord role assignment, Discord DM, and flag for staff review. Rules run when applications, appeals, feedback, verification, or giveaway events happen.</div>
      <div class="community-compact-list" style="margin-top:14px">${(state?.automationRules || []).map((rule) => `<article class="community-rule"><div class="community-submission-head"><div><h4>${esc(rule.name)}</h4><small><code>${esc(rule.trigger)}</code> → <code>${esc(rule.action)}</code></small></div>${statusBadge(rule.enabled === false ? "Closed" : "Open")}</div><button class="btn btn-ghost btn-small" data-edit-rule="${esc(rule.id)}">Edit</button></article>`).join("") || '<div class="community-empty">No automation rules created.</div>'}</div>
    </section>`;
  }

  function analyticsPanel() {
    const days = Object.entries(state?.analytics?.days || {}).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
    const maxViews = Math.max(1, ...days.map(([, value]) => value.views || 0));
    const maxPlayers = Math.max(1, ...days.map(([, value]) => value.erlcPeak || 0));
    const totalViews = days.reduce((sum, [, value]) => sum + Number(value.views || 0), 0);
    const unique = new Set(days.flatMap(([, value]) => value.visitors || [])).size;
    const submissions = days.reduce((sum, [, value]) => sum + Number(value.submissions || 0), 0);
    return `<section class="community-suite-panel glass-card ${activeTab === "analytics" ? "is-active" : ""}" data-community-panel="analytics">
      <div class="section-head"><div><span class="eyebrow">Performance Center</span><h2 class="section-title">Server & staff <span class="title-accent">analytics.</span></h2></div><span class="badge">Last 14 days</span></div>
      <div class="community-stat-grid"><article class="community-stat"><strong>${totalViews}</strong><span>Website views</span></article><article class="community-stat"><strong>${unique}</strong><span>Unique visitors</span></article><article class="community-stat"><strong>${submissions}</strong><span>Submissions</span></article><article class="community-stat"><strong>${Math.round((staffMetrics.weeklyMinutes || 0) / 60)}h</strong><span>Weekly staff hours</span></article></div>
      <div class="community-suite-grid" style="margin-top:14px"><article class="community-suite-card glass-card community-span-6"><h3>Website traffic</h3><div class="community-chart">${days.map(([date, value]) => `<div class="community-chart-row"><span>${esc(date.slice(5))}</span><div class="community-chart-track"><i style="width:${Math.max(2, Math.round((value.views || 0) / maxViews * 100))}%"></i></div><strong>${value.views || 0}</strong></div>`).join("") || '<div class="community-empty">Analytics will appear after visitors open the website.</div>'}</div></article>
      <article class="community-suite-card glass-card community-span-6"><h3>ER:LC player peaks</h3><div class="community-chart">${days.map(([date, value]) => `<div class="community-chart-row"><span>${esc(date.slice(5))}</span><div class="community-chart-track"><i style="width:${Math.max(2, Math.round((value.erlcPeak || 0) / maxPlayers * 100))}%"></i></div><strong>${value.erlcPeak || 0}</strong></div>`).join("") || '<div class="community-empty">Add ERLC_SERVER_KEY to collect live player traffic.</div>'}</div></article>
      <article class="community-suite-card glass-card community-span-6"><h3>Staff activity leaderboard</h3><div class="community-compact-list">${(staffMetrics.leaderboard || []).map((item, index) => `<div class="community-submission-head"><span>${index + 1}. ${esc(item.name)}</span><strong>${Math.round(item.minutes / 60 * 10) / 10}h</strong></div>`).join("") || '<p class="muted">No completed shifts this week.</p>'}</div></article>
      <article class="community-suite-card glass-card community-span-6"><h3>Live integration</h3><div class="command-rows"><div class="command-row"><span>ER:LC API</span><strong>${erlc.ready ? "Connected" : erlc.configured ? "Unavailable" : "Not configured"}</strong></div><div class="command-row"><span>Current players</span><strong>${erlc.currentPlayers ?? "—"}</strong></div><div class="command-row"><span>Queue</span><strong>${erlc.queue ?? "—"}</strong></div><div class="command-row"><span>Active staff this week</span><strong>${staffMetrics.activeStaff || 0}</strong></div></div></article></div>
    </section>`;
  }

  function departmentsPanel() {
    return `<section class="community-suite-panel glass-card ${activeTab === "departments" ? "is-active" : ""}" data-community-panel="departments">
      <div class="section-head"><div><span class="eyebrow">Access Control</span><h2 class="section-title">Department hierarchy & <span class="title-accent">tool permissions.</span></h2></div><button class="btn btn-primary" id="community-new-department">Add Department</button></div>
      <div class="community-compact-list">${(state?.departments || []).map((item) => `<article class="community-submission"><div class="community-submission-head"><div><h4>${esc(item.code)} · ${esc(item.name)}</h4><small>${(item.hierarchy || []).length} ranks · ${(item.access || []).length} tools</small></div><button class="btn btn-ghost btn-small" data-edit-department="${esc(item.id)}">Edit</button></div><div class="community-actions">${(item.access || []).map((entry) => `<span class="badge">${esc(entry)}</span>`).join("")}</div></article>`).join("") || '<div class="community-empty">Add department role IDs and permissions to control CAD, radio, and staff tools.</div>'}</div>
    </section>`;
  }

  function render() {
    if (!root()) return;
    const staffReady = Boolean(token && user && state);
    const tabs = [
      ["public", "Public Hub"],
      ...(staffReady ? [["forms", "Forms"], ["applications", "Applications"], ["appeals", "Ban Appeals"], ["verification", "Verification"], ["giveaways", "Giveaways"], ["automation", "Automation"], ["analytics", "Analytics"], ["departments", "Departments"]] : [])
    ];
    if (!tabs.some(([id]) => id === activeTab)) activeTab = "public";
    root().innerHTML = `
      <div class="community-suite-shell">
        <section class="community-suite-hero glass-card"><div><span class="eyebrow">FSRP Community Management</span><h2>Applications, verification, automation & analytics.</h2><p class="section-copy">One connected control center for community entry, department applications, ban appeals, staff review, Discord roles, giveaways, and performance tracking.</p></div><div class="community-suite-status"><span class="badge is-live">Public Forms Live</span><span class="badge">${staffReady ? `${esc(user.name)} · ${esc(user.role)}` : "Public Access"}</span></div></section>
        ${!staffReady ? `<div class="community-login-note"><span>🔐</span><div><strong>Staff controls are locked.</strong><p>Sign into Staff Operations, then return here to review applications, appeals, verification, analytics, and automation.</p><a class="btn btn-secondary btn-small" data-route="staff-ops" href="#staff-ops">Open Staff Operations</a></div></div>` : ""}
        <nav class="community-suite-tabs glass-card">${tabs.map(([id, label]) => `<button class="community-suite-tab ${activeTab === id ? "is-active" : ""}" data-community-tab="${id}">${label}</button>`).join("")}</nav>
        ${publicPanel()}
        ${staffReady ? `${formsPanel()}${submissionsPanel(["application","department","join"], "Applications")}${submissionsPanel(["appeal"], "Appeals")}${submissionsPanel(["verification","feedback"], "Verification")}${giveawaysPanel()}${automationPanel()}${analyticsPanel()}${departmentsPanel()}` : ""}
      </div>`;
    bind();
  }

  function reviewSubmission(id, status) {
    const note = window.prompt(`${status} note (optional):`, "") ?? "";
    return api("submission-review", { id, status, note }, true).then(async () => { toast(`Submission ${status.toLowerCase()}.`); await loadStaffState(); }).catch((error) => toast(error.message, true));
  }

  function openGiveawayEditor(item = {}) {
    modal(item.id ? "Edit Giveaway" : "Create Giveaway", `<form id="community-giveaway-editor" class="community-form-grid">
      <input name="id" type="hidden" value="${esc(item.id || "")}"><div class="field"><label>Title</label><input name="title" value="${esc(item.title || "")}" required></div><div class="field"><label>Prize</label><input name="prize" value="${esc(item.prize || "")}"></div><div class="field"><label>Status</label><select name="status">${["Open","Closed","Draft"].map((value) => `<option ${item.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div class="field"><label>Ends at</label><input name="endsAt" type="datetime-local" value="${esc(item.endsAt || "")}"></div><div class="field community-span-12"><label>Description</label><textarea name="description">${esc(item.description || "")}</textarea></div><div class="field community-span-12"><label>Requirements</label><textarea name="requirements">${esc(item.requirements || "")}</textarea></div></form>`, `<button class="btn btn-ghost" data-community-close>Cancel</button><button class="btn btn-primary" id="community-save-giveaway">Save Giveaway</button>`);
    $("#community-save-giveaway")?.addEventListener("click", async () => {
      const form = $("#community-giveaway-editor"); if (!form.reportValidity()) return;
      try { await api("giveaway-save", { item: Object.fromEntries(new FormData(form)) }, true); closeModal(); toast("Giveaway saved."); await loadStaffState(); } catch (error) { toast(error.message, true); }
    });
  }

  function openHighlightEditor(item = {}) {
    modal(item.id ? "Edit Highlight" : "Add Highlight", `<form id="community-highlight-editor" class="community-form-grid">
      <input name="id" type="hidden" value="${esc(item.id || "")}"><div class="field"><label>Title</label><input name="title" value="${esc(item.title || "")}" required></div><div class="field"><label>Submitted by</label><input name="submittedBy" value="${esc(item.submittedBy || "")}"></div><div class="field"><label>Message link</label><input name="messageUrl" type="url" value="${esc(item.messageUrl || "")}"></div><div class="field"><label>Image URL</label><input name="imageUrl" type="url" value="${esc(item.imageUrl || "")}"></div><div class="field"><label>Reaction count</label><input name="reactions" type="number" value="${esc(item.reactions || 0)}"></div><div class="field"><label>Status</label><select name="status">${["Pending","Published","Hidden"].map((value) => `<option ${item.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div class="field community-span-12"><label>Description</label><textarea name="description">${esc(item.description || "")}</textarea></div></form>`, `<button class="btn btn-ghost" data-community-close>Cancel</button><button class="btn btn-primary" id="community-save-highlight">Save Highlight</button>`);
    $("#community-save-highlight")?.addEventListener("click", async () => {
      const form = $("#community-highlight-editor"); if (!form.reportValidity()) return;
      try { await api("highlight-save", { item: Object.fromEntries(new FormData(form)) }, true); closeModal(); toast("Highlight saved."); await loadStaffState(); } catch (error) { toast(error.message, true); }
    });
  }

  function openRuleEditor(item = {}) {
    const triggers = ["application_received","application_approved","application_denied","department_received","department_approved","join_received","join_approved","appeal_received","appeal_approved","appeal_denied","feedback_received","verification_received","verification_approved","verification_denied"];
    const actions = ["discord_webhook","discord_role_add","discord_dm","flag_review"];
    modal(item.id ? "Edit Automation Rule" : "Create Automation Rule", `<form id="community-rule-editor" class="community-form-grid">
      <input name="id" type="hidden" value="${esc(item.id || "")}"><div class="field"><label>Name</label><input name="name" value="${esc(item.name || "")}" required></div><div class="field"><label>Enabled</label><select name="enabled"><option value="true" ${item.enabled !== false ? "selected" : ""}>On</option><option value="false" ${item.enabled === false ? "selected" : ""}>Off</option></select></div><div class="field"><label>Trigger</label><select name="trigger">${triggers.map((value) => `<option ${item.trigger === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div class="field"><label>Action</label><select name="action">${actions.map((value) => `<option ${item.action === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div class="field"><label>Discord role ID</label><input name="roleId" value="${esc(item.roleId || "")}"></div><div class="field"><label>Condition field</label><input name="conditionField" value="${esc(item.conditions?.[0]?.field || "")}" placeholder="department"></div><div class="field"><label>Condition operator</label><select name="conditionOperator"><option>equals</option><option>not_equals</option><option>contains</option></select></div><div class="field"><label>Condition value</label><input name="conditionValue" value="${esc(item.conditions?.[0]?.value || "")}"></div><div class="field community-span-12"><label>Message</label><textarea name="message">${esc(item.message || "")}</textarea></div></form>`, `<button class="btn btn-ghost" data-community-close>Cancel</button><button class="btn btn-primary" id="community-save-rule">Save Rule</button>`);
    $("#community-save-rule")?.addEventListener("click", async () => {
      const form = $("#community-rule-editor"); if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      try { await api("automation-save", { rule: { ...values, enabled: values.enabled === "true", conditions: values.conditionField ? [{ field: values.conditionField, operator: values.conditionOperator, value: values.conditionValue }] : [] } }, true); closeModal(); toast("Automation rule saved."); await loadStaffState(); } catch (error) { toast(error.message, true); }
    });
  }

  function openDepartmentEditor(item = {}) {
    modal(item.id ? "Edit Department Access" : "Add Department Access", `<form id="community-department-editor" class="community-form-grid">
      <div class="field"><label>ID</label><input name="id" value="${esc(item.id || "")}" required></div><div class="field"><label>Code</label><input name="code" value="${esc(item.code || "")}" required></div><div class="field"><label>Name</label><input name="name" value="${esc(item.name || "")}" required></div><div class="field"><label>Application form ID</label><input name="applicationFormId" value="${esc(item.applicationFormId || "")}"></div><div class="field"><label>Discord member role ID</label><input name="discordRoleId" value="${esc(item.discordRoleId || "")}"></div><div class="field"><label>Leadership role ID</label><input name="leadershipRoleId" value="${esc(item.leadershipRoleId || "")}"></div><div class="field community-span-12"><label>Hierarchy — one rank per line</label><textarea name="hierarchy">${esc((item.hierarchy || []).join("\n"))}</textarea></div><div class="field community-span-12"><label>Tool access — one permission per line</label><textarea name="access">${esc((item.access || []).join("\n"))}</textarea></div></form>`, `<button class="btn btn-ghost" data-community-close>Cancel</button><button class="btn btn-primary" id="community-save-department">Save Department</button>`);
    $("#community-save-department")?.addEventListener("click", async () => {
      const form = $("#community-department-editor"); if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form)); values.hierarchy = values.hierarchy.split(/\n+/).map((v) => v.trim()).filter(Boolean); values.access = values.access.split(/\n+/).map((v) => v.trim()).filter(Boolean);
      try { await api("department-save", { item: values }, true); closeModal(); toast("Department access saved."); await loadStaffState(); } catch (error) { toast(error.message, true); }
    });
  }

  function bind() {
    $("#community-roblox-oauth")?.addEventListener("click", () => { window.location.href = "/api/roblox-oauth?action=start"; });
    $$('[data-community-tab]').forEach((button) => button.addEventListener("click", () => { activeTab = button.dataset.communityTab; render(); }));
    $$('[data-open-public-form]').forEach((button) => button.addEventListener("click", () => openPublicForm(catalog.forms.find((form) => form.id === button.dataset.openPublicForm))));
    $$('[data-open-giveaway]').forEach((button) => button.addEventListener("click", () => openGiveaway(catalog.giveaways.find((item) => item.id === button.dataset.openGiveaway))));
    $("#community-new-form")?.addEventListener("click", () => openFormEditor());
    $$('[data-edit-form]').forEach((button) => button.addEventListener("click", () => openFormEditor(state.forms.find((form) => form.id === button.dataset.editForm))));
    $$('[data-copy-form]').forEach((button) => button.addEventListener("click", async () => { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#community-suite?form=${button.dataset.copyForm}`); toast("Public form link copied."); }));
    $$('[data-review-submission]').forEach((button) => button.addEventListener("click", () => reviewSubmission(button.dataset.reviewSubmission, button.dataset.reviewStatus)));
    $("#community-new-giveaway")?.addEventListener("click", () => openGiveawayEditor());
    $$('[data-edit-giveaway]').forEach((button) => button.addEventListener("click", () => openGiveawayEditor(state.giveaways.find((item) => item.id === button.dataset.editGiveaway))));
    $$('[data-pick-winner]').forEach((button) => button.addEventListener("click", async () => { if (!confirm("Randomly select and close this giveaway?")) return; try { const data = await api("giveaway-pick", { id: button.dataset.pickWinner }, true); toast(`Winner: ${data.giveaway.winner}`); await loadStaffState(); } catch (error) { toast(error.message, true); } }));
    $("#community-new-highlight")?.addEventListener("click", () => openHighlightEditor());
    $$('[data-edit-highlight]').forEach((button) => button.addEventListener("click", () => openHighlightEditor(state.highlights.find((item) => item.id === button.dataset.editHighlight))));
    $("#community-new-rule")?.addEventListener("click", () => openRuleEditor());
    $$('[data-edit-rule]').forEach((button) => button.addEventListener("click", () => openRuleEditor(state.automationRules.find((item) => item.id === button.dataset.editRule))));
    $("#community-new-department")?.addEventListener("click", () => openDepartmentEditor());
    $$('[data-edit-department]').forEach((button) => button.addEventListener("click", () => openDepartmentEditor(state.departments.find((item) => item.id === button.dataset.editDepartment))));
  }

  async function loadCatalog() {
    try { const data = await api("catalog"); catalog = data.catalog || catalog; render(); }
    catch (error) { toast(error.message, true); }
  }

  async function loadStaffState() {
    token = sessionStorage.getItem("fsrpStaffOpsToken") || "";
    try { user = JSON.parse(sessionStorage.getItem("fsrpStaffOpsUser") || "null"); } catch { user = null; }
    if (!token || !user) { state = null; render(); return; }
    try {
      const data = await api("state", {}, true);
      state = data.state;
      user = data.user;
      staffMetrics = data.staffMetrics || staffMetrics;
      erlc = data.erlc || erlc;
      sessionStorage.setItem("fsrpStaffOpsUser", JSON.stringify(user));
      render();
    } catch (error) {
      if (/expired|invalid/i.test(error.message)) { token = ""; user = null; state = null; }
      toast(error.message, true); render();
    }
  }

  function analyticsPing(route) {
    let visitorId = localStorage.getItem("fsrpAnonymousVisitor");
    if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem("fsrpAnonymousVisitor", visitorId); }
    api("analytics-ping", { visitorId, route }).catch(() => {});
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-community-close]")) closeModal();
    if (event.target.id === "community-suite-modal" && event.target === $("#community-suite-modal")) closeModal();
  });

  document.addEventListener("fsrp:route", (event) => {
    analyticsPing(event.detail || "home");
    if (event.detail === "community-suite") { loadCatalog(); loadStaffState(); }
  });

  document.addEventListener("fsrp:staff-session", () => loadStaffState());

  document.addEventListener("DOMContentLoaded", () => {
    if (!root()) return;
    render(); loadCatalog(); if (token && user) loadStaffState();
    analyticsPing(location.hash.slice(1) || "home");
    const requestedForm = new URLSearchParams(location.hash.split("?")[1] || "").get("form");
    if (requestedForm) setTimeout(() => { const form = catalog.forms.find((item) => item.id === requestedForm); if (form) openPublicForm(form); }, 500);
  });
})();
