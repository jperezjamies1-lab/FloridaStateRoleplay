(function () {
  "use strict";

  let token = sessionStorage.getItem("fsrp_manager_token") || "";
  let role = sessionStorage.getItem("fsrp_manager_role") || "";
  let localPreview = false;

  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  function boolValue(value) { return value !== false && String(value) !== "false"; }
  function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

  function toast(message) { window.FSRP_TOAST?.(message); }

  function setLoginMessage(message, error = false) {
    const node = document.getElementById("manager-login-message");
    if (!node) return;
    node.textContent = message;
    node.style.color = error ? "#ff9dad" : "var(--muted)";
  }

  function showManager() {
    document.getElementById("manager-login").hidden = true;
    document.getElementById("manager-app").hidden = false;
    document.getElementById("manager-role-label").textContent = role === "operations" ? "Session Operations" : "Website Manager";
    document.getElementById("manager-mode-label").textContent = localPreview ? "Local preview mode" : "Cloud-authorized session";
    const badge = document.getElementById("manager-connection-badge");
    if (badge) badge.innerHTML = `<i class="status-dot ${localPreview ? "unavailable" : "online"}"></i>${localPreview ? "Local preview" : esc(role || "admin")}`;
    if (role === "operations") {
      document.querySelectorAll(".manager-nav button").forEach((button) => { button.hidden = !["overview", "status", "backup"].includes(button.dataset.managerTab); });
      switchTab("status");
    }
    bindSimpleFields();
    renderEditors();
    refreshAssets();
    updateSummary();
  }

  async function login() {
    const input = document.getElementById("manager-passcode");
    const passcode = input?.value.trim();
    if (!passcode) return setLoginMessage("Enter the Cloudflare manager passcode.", true);
    setLoginMessage("Checking authorization…");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Access denied.");
      token = passcode;
      role = payload.role || "admin";
      localPreview = false;
      sessionStorage.setItem("fsrp_manager_token", token);
      sessionStorage.setItem("fsrp_manager_role", role);
      input.value = "";
      showManager();
      toast("Manager unlocked.");
    } catch (error) {
      setLoginMessage(error.message || "Authorization failed.", true);
    }
  }

  function openLocalPreview() {
    localPreview = true;
    role = "admin";
    token = "";
    showManager();
    toast("Local preview mode enabled. Cloud publishing stays locked.");
  }

  function switchTab(name) {
    document.querySelectorAll("[data-manager-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.managerTab === name));
    document.querySelectorAll("[data-manager-panel]").forEach((section) => section.classList.toggle("is-active", section.dataset.managerPanel === name));
  }

  function bindSimpleFields() {
    document.querySelectorAll("[data-bind]").forEach((input) => {
      const path = input.dataset.bind;
      const current = window.FSRP_STORE.get(path);
      if (input.type === "checkbox") input.checked = boolValue(current);
      else input.value = current ?? "";
      if (input.dataset.bound === "true") return;
      input.dataset.bound = "true";
      input.addEventListener("input", () => {
        const value = input.type === "checkbox" ? input.checked : input.value;
        window.FSRP_STORE.set(path, value);
        setSaveState("Preview changed — publish when ready.");
      });
    });
  }

  function setSaveState(message) {
    const node = document.getElementById("save-state");
    if (node) node.textContent = message;
  }

  function itemShell(type, index, title, fields) {
    return `<article class="editor-item" data-editor-type="${type}" data-editor-index="${index}"><div class="editor-item-head"><strong>${esc(title)}</strong><div class="editor-item-actions"><button class="btn btn-ghost btn-small" data-move="up" title="Move up">↑</button><button class="btn btn-ghost btn-small" data-move="down" title="Move down">↓</button><button class="btn btn-danger btn-small" data-delete-item>Delete</button></div></div>${fields}</article>`;
  }

  function inputField(label, type, index, field, value, options = "") {
    if (type === "textarea") return `<div class="field"><label>${esc(label)}</label><textarea data-array-field="${field}">${esc(value)}</textarea></div>`;
    if (type === "select") return `<div class="field"><label>${esc(label)}</label><select data-array-field="${field}">${options}</select></div>`;
    if (type === "checkbox") return `<label class="badge"><input data-array-field="${field}" type="checkbox" ${boolValue(value) ? "checked" : ""}> ${esc(label)}</label>`;
    return `<div class="field"><label>${esc(label)}</label><input data-array-field="${field}" type="${type}" value="${esc(value)}"></div>`;
  }

  function selectOptions(values, selected) {
    return values.map((value) => {
      const pair = Array.isArray(value) ? value : [value, value];
      return `<option value="${esc(pair[0])}" ${String(pair[0]) === String(selected) ? "selected" : ""}>${esc(pair[1])}</option>`;
    }).join("");
  }

  function renderAnnouncements() {
    const list = window.FSRP_STORE.get("announcements") || [];
    document.getElementById("announcement-editor").innerHTML = list.map((x, i) => itemShell("announcements", i, x.title || `Announcement ${i + 1}`, `<div class="field-grid">${inputField("Title", "text", i, "title", x.title)}${inputField("Date", "date", i, "date", x.date)}${inputField("Category", "select", i, "category", x.category, selectOptions([["announcement", "Announcement"], ["session", "Session"], ["website", "Website"]], x.category))}${inputField("Priority", "select", i, "priority", x.priority, selectOptions([["normal", "Normal"], ["featured", "Featured"]], x.priority))}${inputField("Image URL", "url", i, "image", x.image)}${inputField("Button 1 label", "text", i, "button1Label", x.button1Label)}${inputField("Button 1 URL", "url", i, "button1Url", x.button1Url)}${inputField("Button 2 label", "text", i, "button2Label", x.button2Label)}${inputField("Button 2 URL", "url", i, "button2Url", x.button2Url)}</div><div class="field" style="margin-top:12px"><label>Body</label><textarea data-array-field="body">${esc(x.body)}</textarea></div><div class="checkbox-row" style="margin-top:12px">${inputField("Pinned", "checkbox", i, "pinned", x.pinned)}${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No announcements. Add one below.</div>`;
  }

  function renderEvents() {
    const list = window.FSRP_STORE.get("events") || [];
    document.getElementById("event-editor").innerHTML = list.map((x, i) => itemShell("events", i, x.title || `Event ${i + 1}`, `<div class="field-grid">${inputField("Title", "text", i, "title", x.title)}${inputField("Date / time", "text", i, "date", x.date)}${inputField("Type", "text", i, "type", x.type || "Community event")}</div><div class="field" style="margin-top:12px"><label>Description</label><textarea data-array-field="description">${esc(x.description)}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No events are scheduled. Add one only when the date is real.</div>`;
  }

  function renderTimeline() {
    const list = window.FSRP_STORE.get("timeline") || [];
    const host = document.getElementById("timeline-editor");
    if (!host) return;
    host.innerHTML = list.map((x, i) => itemShell("timeline", i, x.title || `Milestone ${i + 1}`, `<div class="field-grid">${inputField("Date label", "text", i, "date", x.date)}${inputField("Title", "text", i, "title", x.title)}</div><div class="field" style="margin-top:12px"><label>Milestone details</label><textarea data-array-field="body">${esc(x.body)}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No community milestones have been published.</div>`;
  }

  function renderMarketplace() {
    const list = window.FSRP_STORE.get("marketplace") || [];
    const host = document.getElementById("marketplace-editor");
    if (!host) return;
    host.innerHTML = list.map((x, i) => itemShell("marketplace", i, x.name || `Marketplace item ${i + 1}`, `<div class="field-grid">${inputField("Tag", "text", i, "tag", x.tag)}${inputField("Name", "text", i, "name", x.name)}${inputField("Button label", "text", i, "buttonLabel", x.buttonLabel)}${inputField("Button URL", "url", i, "buttonUrl", x.buttonUrl)}</div><div class="field" style="margin-top:12px"><label>Description</label><textarea data-array-field="description">${esc(x.description)}</textarea></div><div class="field" style="margin-top:12px"><label>Benefits — one item per line</label><textarea data-array-field="benefitsText">${esc((x.benefits || []).join("\n"))}</textarea></div><div class="checkbox-row" style="margin-top:12px">${inputField("Featured", "checkbox", i, "featured", x.featured)}${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No marketplace items are configured.</div>`;
  }

  function renderSupport() {
    const list = window.FSRP_STORE.get("support") || [];
    const host = document.getElementById("support-editor");
    if (!host) return;
    host.innerHTML = list.map((x, i) => itemShell("support", i, x.title || `Support path ${i + 1}`, `<div class="field-grid">${inputField("Icon / symbol", "text", i, "icon", x.icon)}${inputField("Title", "text", i, "title", x.title)}${inputField("Button label", "text", i, "label", x.label)}${inputField("Button URL", "url", i, "url", x.url)}</div><div class="field" style="margin-top:12px"><label>Description</label><textarea data-array-field="body">${esc(x.body)}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No support paths are configured.</div>`;
  }

  function renderGallery() {
    const list = window.FSRP_STORE.get("gallery") || [];
    const host = document.getElementById("gallery-editor");
    if (!host) return;
    host.innerHTML = list.map((x, i) => itemShell("gallery", i, x.title || `Media ${i + 1}`, `<div class="field-grid">${inputField("Type", "select", i, "type", x.type, selectOptions([["image", "Image"], ["video", "Video"]], x.type))}${inputField("Title", "text", i, "title", x.title)}${inputField("Category", "text", i, "category", x.category)}${inputField("Asset URL", "url", i, "url", x.url)}</div><div class="checkbox-row" style="margin-top:12px">${inputField("Featured", "checkbox", i, "featured", x.featured)}${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No media items are configured.</div>`;
  }

  function renderDepartments() {
    const list = window.FSRP_STORE.get("departments") || [];
    document.getElementById("department-editor").innerHTML = list.map((x, i) => itemShell("departments", i, `${x.code || "UNIT"} · ${x.name || "Department"}`, `<div class="field-grid">${inputField("Code", "text", i, "code", x.code)}${inputField("Name", "text", i, "name", x.name)}${inputField("Category", "select", i, "category", x.category, selectOptions([["law", "Law enforcement"], ["federal", "Federal"], ["civilian", "Civilian"]], x.category))}${inputField("Status", "text", i, "status", x.status)}${inputField("Emblem PNG / image URL", "text", i, "image", x.image)}${inputField("Department link", "url", i, "link", x.link)}</div><div class="field" style="margin-top:12px"><label>Description</label><textarea data-array-field="description">${esc(x.description)}</textarea></div><div class="field" style="margin-top:12px"><label>Requirements</label><textarea data-array-field="requirements">${esc(x.requirements)}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("");
  }

  function renderRanks() {
    const list = window.FSRP_STORE.get("ranks") || [];
    const host = document.getElementById("rank-editor");
    if (!host) return;
    host.innerHTML = list.map((x, i) => itemShell("ranks", i, `${String(x.order || i + 1).padStart(2, "0")} · ${x.name || "Rank"}`, `<div class="field-grid">${inputField("Rank ID", "text", i, "id", x.id)}${inputField("Display name", "text", i, "name", x.name)}${inputField("Order", "number", i, "order", x.order)}</div><div style="margin-top:12px">${inputField("Visible publicly", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No ranks are configured. Add at least one before publishing staff.</div>`;
  }

  function renderStaff() {
    const list = window.FSRP_STORE.get("staff") || [];
    const ranks = window.FSRP_STORE.get("ranks") || [];
    document.getElementById("staff-editor").innerHTML = list.map((x, i) => itemShell("staff", i, x.displayName || x.username || `Staff ${i + 1}`, `<div class="field-grid">${inputField("Display name", "text", i, "displayName", x.displayName)}${inputField("Discord username", "text", i, "username", x.username)}${inputField("Discord user ID", "text", i, "discordUserId", x.discordUserId)}${inputField("Avatar PNG / image URL", "url", i, "avatarUrl", x.avatarUrl)}${inputField("Rank", "select", i, "rankId", x.rankId, selectOptions(ranks.map((r) => [r.id, `${String(r.order).padStart(2, "0")} · ${r.name}`]), x.rankId))}${inputField("Position title", "text", i, "positionTitle", x.positionTitle)}${inputField("Department", "text", i, "department", x.department)}${inputField("Callsign", "text", i, "callsign", x.callsign)}${inputField("Presence", "select", i, "presenceStatus", x.presenceStatus, selectOptions([["unavailable", "Status Unavailable"], ["online", "Online"], ["idle", "Idle"], ["dnd", "Do Not Disturb"], ["offline", "Offline"]], x.presenceStatus))}${inputField("Display order", "number", i, "customOrder", x.customOrder)}</div><div class="field" style="margin-top:12px"><label>Biography</label><textarea data-array-field="bio">${esc(x.bio)}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No staff members are configured.</div>`;
  }

  function renderSystems() {
    const list = window.FSRP_STORE.get("systems") || [];
    const host = document.getElementById("systems-editor");
    if (!host) return;
    host.innerHTML = list.map((x, i) => itemShell("systems", i, x.title || `System ${i + 1}`, `<div class="field-grid">${inputField("Icon / short code", "text", i, "icon", x.icon)}${inputField("Title", "text", i, "title", x.title)}</div><div class="field" style="margin-top:12px"><label>Description</label><textarea data-array-field="body">${esc(x.body)}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No community systems are configured.</div>`;
  }

  function renderJoinSteps() {
    const list = window.FSRP_STORE.get("joinSteps") || [];
    const host = document.getElementById("join-steps-editor");
    if (!host) return;
    host.innerHTML = list.map((x, i) => itemShell("joinSteps", i, x.title || `Join step ${i + 1}`, `<div class="field-grid">${inputField("Number", "text", i, "number", x.number)}${inputField("Title", "text", i, "title", x.title)}</div><div class="field" style="margin-top:12px"><label>Description</label><textarea data-array-field="body">${esc(x.body)}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No join steps are configured.</div>`;
  }

  function renderFaqs() {
    const list = window.FSRP_STORE.get("faqs") || [];
    const host = document.getElementById("faq-editor");
    if (!host) return;
    host.innerHTML = list.map((x, i) => itemShell("faqs", i, x.question || `Question ${i + 1}`, `<div class="field"><label>Question</label><input data-array-field="question" type="text" value="${esc(x.question)}"></div><div class="field" style="margin-top:12px"><label>Answer</label><textarea data-array-field="answer">${esc(x.answer)}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("") || `<div class="empty-state">No frequently asked questions are configured.</div>`;
  }

  function renderRules() {
    const list = window.FSRP_STORE.get("rules") || [];
    document.getElementById("rules-editor").innerHTML = list.map((x, i) => itemShell("rules", i, `${x.number || ""} · ${x.title || "Rule category"}`, `<div class="field-grid">${inputField("Number", "text", i, "number", x.number)}${inputField("Title", "text", i, "title", x.title)}</div><div class="field" style="margin-top:12px"><label>Rules — one item per line</label><textarea data-array-field="itemsText">${esc((x.items || []).join("\n"))}</textarea></div><div style="margin-top:12px">${inputField("Published", "checkbox", i, "published", x.published)}</div>`)).join("");
  }

  function renderEditors() {
    renderAnnouncements();
    renderEvents();
    renderTimeline();
    renderGallery();
    renderDepartments();
    renderRanks();
    renderStaff();
    renderSystems();
    renderJoinSteps();
    renderFaqs();
    renderRules();
    renderMarketplace();
    renderSupport();
  }

  function defaultItem(type) {
    const defaults = {
      announcements: { id: uid("announcement"), title: "New announcement", body: "Add the official announcement details.", category: "announcement", priority: "normal", date: new Date().toISOString().slice(0, 10), image: "", button1Label: "", button1Url: "", button2Label: "", button2Url: "", pinned: false, published: false },
      events: { id: uid("event"), title: "New event", description: "Add the verified event details.", date: "", type: "Community event", published: false },
      timeline: { id: uid("milestone"), date: "", title: "New milestone", body: "Add the verified community milestone details.", published: false },
      gallery: { id: uid("media"), type: "image", url: "/assets/brand/fsrp-logo.png", title: "New media item", category: "Community", featured: false, published: false },
      departments: { id: uid("department"), code: "UNIT", name: "New Department", category: "law", status: "Unavailable", image: "/assets/brand/fsrp-logo.png", description: "Department description.", requirements: "Department requirements.", link: window.FSRP_STORE.get("links.discord"), published: false },
      ranks: { id: uid("rank"), order: (window.FSRP_STORE.get("ranks") || []).length + 1, name: "New Rank", published: false },
      staff: { id: uid("staff"), discordUserId: "", username: "@username", displayName: "New Staff Member", avatarUrl: "", rankId: (window.FSRP_STORE.get("ranks") || [])[0]?.id || "", positionTitle: "Staff", department: "Community Staff", callsign: "", bio: "Official Florida State Roleplay staff member.", presenceStatus: "unavailable", published: false, customOrder: 999 },
      systems: { id: uid("system"), icon: "FS", title: "New community system", body: "Explain how this system helps members.", published: false },
      joinSteps: { id: uid("step"), number: String((window.FSRP_STORE.get("joinSteps") || []).length + 1).padStart(2, "0"), title: "New join step", body: "Explain the next step for new members.", published: false },
      faqs: { id: uid("faq"), question: "New question", answer: "Add the official answer.", published: false },
      rules: { id: uid("rule"), number: "09", title: "New Rule Category", items: ["Add the official rule here."], published: false },
      marketplace: { id: uid("market"), tag: "Official", name: "New marketplace item", description: "Add the verified marketplace details.", benefits: ["Add an official benefit"], buttonLabel: "Open", buttonUrl: window.FSRP_STORE.get("links.discord"), featured: false, published: false },
      support: { id: uid("support"), icon: "?", title: "New support path", body: "Explain when members should use this support option.", label: "Open support", url: window.FSRP_STORE.get("links.discord"), published: false },
    };
    return defaults[type];
  }

  function updateArrayField(type, index, field, target) {
    const list = JSON.parse(JSON.stringify(window.FSRP_STORE.get(type) || []));
    if (!list[index]) return;
    let value = target.type === "checkbox" ? target.checked : target.value;
    if (field === "itemsText") { field = "items"; value = String(value).split(/\n+/).map((x) => x.trim()).filter(Boolean); }
    if (field === "benefitsText") { field = "benefits"; value = String(value).split(/\n+/).map((x) => x.trim()).filter(Boolean); }
    if (field === "customOrder") value = Number(value) || 999;
    if (field === "order") value = Number(value) || 1;
    list[index][field] = value;
    window.FSRP_STORE.set(type, list);
    setSaveState("Preview changed — publish when ready.");
  }

  function moveOrDelete(type, index, action) {
    const list = JSON.parse(JSON.stringify(window.FSRP_STORE.get(type) || []));
    if (!list[index]) return;
    if (action === "delete") list.splice(index, 1);
    if (action === "up" && index > 0) [list[index - 1], list[index]] = [list[index], list[index - 1]];
    if (action === "down" && index < list.length - 1) [list[index + 1], list[index]] = [list[index], list[index + 1]];
    window.FSRP_STORE.set(type, list);
    renderEditors();
    setSaveState("Preview changed — publish when ready.");
  }

  async function publish() {
    if (localPreview || !token) return toast("Cloud publishing is locked in Local Preview Mode. Sign in with the Cloudflare passcode first.");
    const button = document.getElementById("publish-btn");
    button.disabled = true; button.textContent = "Publishing…";
    setSaveState("Publishing changes to Cloudflare KV…");
    try {
      await window.FSRP_STORE.publish(token, role);
      setSaveState(`Published successfully at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
      toast("Website changes published.");
      window.FSRP_SOUND?.tone("success");
    } catch (error) {
      setSaveState(error.message || "Publish failed.");
      toast(error.message || "Publish failed.");
    } finally {
      button.disabled = false; button.textContent = "Publish to Cloud";
    }
  }

  function exportBackup() {
    const blob = new Blob([window.FSRP_STORE.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fsrp-v3-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      window.FSRP_STORE.importJson(await file.text());
      bindSimpleFields(); renderEditors(); updateSummary();
      toast("Backup imported into preview.");
      setSaveState("Imported backup is in preview — publish when ready.");
    } catch (error) { toast(error.message || "Backup import failed."); }
  }

  async function createLocalAsset(file, label) {
    if (!file) throw new Error("Choose a file first.");
    if (file.size > 700_000) throw new Error("Local preview is limited to 700 KB. Connect R2 for larger files.");
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const assets = JSON.parse(JSON.stringify(window.FSRP_STORE.get("assets") || []));
    assets.unshift({ id: uid("asset"), label: label || file.name, name: file.name, type: file.type, size: file.size, url: dataUrl, source: "local", createdAt: new Date().toISOString() });
    window.FSRP_STORE.set("assets", assets);
    refreshAssets();
  }

  async function uploadAsset() {
    const file = document.getElementById("asset-file")?.files?.[0];
    const label = document.getElementById("asset-label")?.value.trim() || file?.name;
    if (!file) return setAssetMessage("Choose a file first.", true);
    if (localPreview || !token) return setAssetMessage("Sign in with the Cloudflare manager passcode to upload to R2. Local Preview can still create a small browser-only preview.", true);
    const form = new FormData(); form.append("file", file); form.append("label", label || file.name);
    setAssetMessage("Uploading to Cloudflare R2…");
    try {
      const response = await fetch("/api/media", { method: "POST", headers: { "x-admin-token": token }, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Upload failed (${response.status})`);
      const assets = JSON.parse(JSON.stringify(window.FSRP_STORE.get("assets") || []));
      assets.unshift(payload.asset);
      window.FSRP_STORE.set("assets", assets);
      setAssetMessage("Upload complete. Copy the asset URL into an image field.");
      refreshAssets();
    } catch (error) { setAssetMessage(error.message || "Upload failed.", true); }
  }

  function setAssetMessage(message, error = false) { const node = document.getElementById("asset-message"); if (node) { node.textContent = message; node.style.color = error ? "#ff9dad" : "var(--muted)"; } }

  function refreshAssets() {
    const host = document.getElementById("asset-grid");
    if (!host) return;
    const assets = window.FSRP_STORE.get("assets") || [];
    if (!assets.length) { host.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No assets in the library yet.</div>`; return; }
    host.innerHTML = assets.map((asset) => `<article class="asset-card">${String(asset.type || "").startsWith("image/") ? `<img src="${esc(asset.url)}" alt="${esc(asset.label || asset.name)}">` : `<div class="asset-preview" style="display:grid;place-items:center">${String(asset.type || "").startsWith("audio/") ? "AUDIO" : "MEDIA"}</div>`}<div><strong>${esc(asset.label || asset.name)}</strong><small>${esc(asset.source || "r2")} · ${Math.round((Number(asset.size) || 0) / 1024)} KB</small><div class="manager-actions"><button class="btn btn-ghost btn-small" data-copy-asset="${esc(asset.url)}">Copy URL</button><button class="btn btn-danger btn-small" data-delete-asset="${esc(asset.id)}" data-asset-key="${esc(asset.key || "")}">Delete</button></div></div></article>`).join("");
  }

  async function deleteAsset(id, key) {
    const assets = JSON.parse(JSON.stringify(window.FSRP_STORE.get("assets") || []));
    const asset = assets.find((item) => String(item.id) === String(id));
    if (!asset || !confirm(`Delete ${asset.label || asset.name || "this asset"}?`)) return;
    if (asset.source === "r2" && key) {
      if (localPreview || !token) return toast("Sign in as Website Manager before deleting an R2 asset.");
      try {
        const response = await fetch(`/api/media?key=${encodeURIComponent(key)}`, { method: "DELETE", headers: { "x-admin-token": token } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Delete failed (${response.status})`);
      } catch (error) { return toast(error.message || "Asset delete failed."); }
    }
    window.FSRP_STORE.set("assets", assets.filter((item) => String(item.id) !== String(id)));
    refreshAssets();
    setSaveState("Asset removed from preview — publish the content update when ready.");
    toast("Asset removed.");
  }

  function updateSummary() {
    const c = window.FSRP_STORE.content;
    const count = (c.announcements?.length || 0) + (c.events?.length || 0) + (c.timeline?.length || 0) + (c.gallery?.length || 0) + (c.departments?.length || 0) + (c.ranks?.length || 0) + (c.staff?.length || 0) + (c.systems?.length || 0) + (c.joinSteps?.length || 0) + (c.faqs?.length || 0) + (c.rules?.length || 0) + (c.marketplace?.length || 0) + (c.support?.length || 0);
    const node = document.getElementById("manager-content-count"); if (node) node.textContent = `${count} editable records`;
    const storage = document.getElementById("manager-storage-status"); if (storage) storage.textContent = window.FSRP_STORE.source === "cloud" ? "Cloud connected" : "Local preview ready";
  }

  function init() {
    document.getElementById("manager-login-btn")?.addEventListener("click", login);
    document.getElementById("manager-passcode")?.addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
    document.getElementById("manager-local-preview-btn")?.addEventListener("click", openLocalPreview);
    document.querySelector(".manager-nav")?.addEventListener("click", (event) => { const button = event.target.closest("[data-manager-tab]"); if (button) switchTab(button.dataset.managerTab); });
    document.querySelector(".manager-main")?.addEventListener("input", (event) => {
      const field = event.target.closest("[data-array-field]");
      const item = event.target.closest("[data-editor-type]");
      if (field && item) updateArrayField(item.dataset.editorType, Number(item.dataset.editorIndex), field.dataset.arrayField, field);
    });
    document.querySelector(".manager-main")?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-editor-type]");
      if (item && event.target.closest("[data-delete-item]")) moveOrDelete(item.dataset.editorType, Number(item.dataset.editorIndex), "delete");
      const mover = event.target.closest("[data-move]"); if (item && mover) moveOrDelete(item.dataset.editorType, Number(item.dataset.editorIndex), mover.dataset.move);
      const add = event.target.closest("[data-add-item]"); if (add) { const type = add.dataset.addItem; const list = JSON.parse(JSON.stringify(window.FSRP_STORE.get(type) || [])); list.push(defaultItem(type)); window.FSRP_STORE.set(type, list); renderEditors(); }
      const copy = event.target.closest("[data-copy-asset]"); if (copy) navigator.clipboard?.writeText(copy.dataset.copyAsset).then(() => toast("Asset URL copied."));
      const assetDelete = event.target.closest("[data-delete-asset]"); if (assetDelete) deleteAsset(assetDelete.dataset.deleteAsset, assetDelete.dataset.assetKey);
    });
    document.getElementById("status-publish-btn")?.addEventListener("click", () => { window.FSRP_STORE.set("status.updatedAt", new Date().toISOString()); setSaveState("Status timestamp updated — publish when ready."); toast("Status preview updated."); });
    document.getElementById("publish-btn")?.addEventListener("click", publish);
    document.getElementById("preview-refresh-btn")?.addEventListener("click", () => { window.FSRP_DASHBOARD?.render(); window.FSRP_STAFF?.render(); renderEditors(); bindSimpleFields(); toast("Preview refreshed."); });
    document.getElementById("export-btn")?.addEventListener("click", exportBackup);
    document.getElementById("import-file")?.addEventListener("change", (event) => importBackup(event.target.files?.[0]));
    document.getElementById("reset-preview-btn")?.addEventListener("click", () => { if (confirm("Reset the browser preview to V3 defaults? This does not publish until you press Publish.")) { window.FSRP_STORE.reset(); bindSimpleFields(); renderEditors(); toast("Preview reset to defaults."); } });
    document.getElementById("asset-upload-btn")?.addEventListener("click", uploadAsset);
    document.getElementById("asset-local-preview-btn")?.addEventListener("click", async () => { try { await createLocalAsset(document.getElementById("asset-file")?.files?.[0], document.getElementById("asset-label")?.value.trim()); setAssetMessage("Local preview asset created. It remains browser-local until published or uploaded to R2."); } catch (error) { setAssetMessage(error.message, true); } });
    window.addEventListener("fsrp:content", () => { updateSummary(); refreshAssets(); });

    if (token && role) showManager();
  }

  window.FSRP_MANAGER = { init, showManager };
})();
