(function () {
  let token = "";
  let role = "preview";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
  const setPath = (object, path, value) => {
    const keys = path.split(".");
    let cursor = object;
    for (const key of keys.slice(0, -1)) cursor = cursor[key] ?? (cursor[key] = {});
    cursor[keys.at(-1)] = value;
  };
  const escape = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "");

  const schemas = {
    announcements: ["title", "body", "date", "category"],
    events: ["title", "description", "date"],
    timeline: ["date", "title", "description"],
    gallery: ["title", "type", "url"],
    departments: ["name", "short", "category", "description", "status"],
    ranks: ["id", "name"],
    staff: ["name", "rank", "title", "initials", "discordUserId", "status"],
    recognition: ["title", "name", "description"],
    systems: ["title", "description"],
    joinSteps: ["title", "description"],
    faqs: ["question", "answer"],
    rules: ["title", "items"],
    marketplace: ["title", "description", "url"],
    support: ["title", "description", "url"],
    ticker: ["text", "enabled"],
    streamers: ["id", "name", "platform", "channelId", "username", "url", "avatarUrl", "enabled", "manualLive", "manualTitle"],
  };

  const editorIds = {
    announcements: "announcement-editor",
    events: "event-editor",
    timeline: "timeline-editor",
    gallery: "gallery-editor",
    departments: "department-editor",
    ranks: "rank-editor",
    staff: "staff-editor",
    recognition: "recognition-editor",
    systems: "systems-editor",
    joinSteps: "join-steps-editor",
    faqs: "faq-editor",
    rules: "rules-editor",
    marketplace: "marketplace-editor",
    support: "support-editor",
    ticker: "ticker-editor",
    streamers: "streamer-editor",
  };

  function toast(message) {
    const element = document.getElementById("toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    window.setTimeout(() => element.classList.remove("show"), 2600);
  }

  function markDirty() {
    const state = document.getElementById("save-state");
    if (state) state.textContent = role === "operations" ? "Status has unpublished changes." : "Preview has unpublished changes.";
  }

  function applyRoleAccess() {
    const allowedForOperations = new Set(["overview", "status"]);
    document.querySelectorAll("[data-manager-tab]").forEach((button) => {
      const allowed = role !== "operations" || allowedForOperations.has(button.dataset.managerTab);
      button.hidden = !allowed;
      button.disabled = !allowed;
    });
    if (role === "operations") {
      document.querySelector('[data-manager-tab="status"]')?.click();
      const publish = document.getElementById("publish-btn");
      if (publish) publish.textContent = "Publish Status";
    }
  }

  function unlock(mode = "preview") {
    role = mode;
    document.getElementById("manager-login").hidden = true;
    document.getElementById("manager-app").hidden = false;
    document.getElementById("manager-role-label").textContent = mode === "preview" ? "Local Preview" : mode === "operations" ? "Operations Manager" : "Website Administrator";
    document.getElementById("manager-mode-label").textContent = mode;
    document.getElementById("manager-connection-badge").innerHTML = '<i class="status-dot online"></i>Connected';
    applyRoleAccess();
    bindFields();
    renderEditors();
    updateOverview();
  }

  async function login() {
    const code = document.getElementById("manager-passcode").value;
    const message = document.getElementById("manager-login-message");
    message.textContent = "Checking authorization…";
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Authorization failed");
      token = data.token;
      unlock(data.role || "admin");
      message.textContent = "";
    } catch (error) {
      message.textContent = error.message;
    }
  }

  function coerceInput(element, value) {
    if (element.type === "checkbox") return element.checked;
    if (element.type === "number") return value === "" ? "" : Number(value);
    if (element.tagName === "SELECT" && (value === "true" || value === "false")) return value === "true";
    return value;
  }

  function bindFields() {
    const site = FSRP_STORE.get();
    document.querySelectorAll("[data-bind]").forEach((element) => {
      const value = getPath(site, element.dataset.bind);
      if (element.type === "checkbox") element.checked = Boolean(value);
      else if (element.tagName === "SELECT" && typeof value === "boolean") element.value = String(value);
      else element.value = value ?? "";
      element.onchange = () => {
        const next = clone(FSRP_STORE.get());
        setPath(next, element.dataset.bind, coerceInput(element, element.value));
        FSRP_STORE.set(next);
        markDirty();
      };
    });
    const keywords = document.getElementById("streamer-keywords");
    if (keywords) {
      keywords.value = (site.streamerKeywords || []).join(", ");
      keywords.onchange = () => {
        const next = clone(FSRP_STORE.get());
        next.streamerKeywords = keywords.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
        FSRP_STORE.set(next);
        markDirty();
      };
    }
  }

  function fieldControl(key, item, index, field) {
    let value = item[field];
    if (Array.isArray(value)) value = value.join("\n");
    const label = field.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
    if (typeof value === "boolean" || ["enabled", "manualLive"].includes(field)) {
      const checked = value === true;
      return `<div class="field"><label>${escape(label)}</label><select data-edit-item="${key}" data-index="${index}" data-field="${field}"><option value="true" ${checked ? "selected" : ""}>Enabled / Live</option><option value="false" ${!checked ? "selected" : ""}>Disabled / Offline</option></select></div>`;
    }
    if (field === "platform") {
      return `<div class="field"><label>Platform</label><select data-edit-item="${key}" data-index="${index}" data-field="platform"><option value="youtube" ${value === "youtube" ? "selected" : ""}>YouTube</option><option value="twitch" ${value === "twitch" ? "selected" : ""}>Twitch</option><option value="tiktok" ${value === "tiktok" ? "selected" : ""}>TikTok</option></select></div>`;
    }
    const textarea = ["description", "body", "answer", "items"].includes(field);
    const counter = key === "ticker" && field === "text" ? '<small class="ticker-word-hint">Maximum five words</small>' : "";
    return `<div class="field"><label>${escape(label)}</label>${textarea ? `<textarea data-edit-item="${key}" data-index="${index}" data-field="${field}">${escape(value ?? "")}</textarea>` : `<input data-edit-item="${key}" data-index="${index}" data-field="${field}" value="${escape(value ?? "")}" ${key === "ticker" && field === "text" ? 'data-five-word-input maxlength="80"' : ""}>`}${counter}</div>`;
  }

  function renderEditors() {
    const site = FSRP_STORE.get();
    for (const [key, id] of Object.entries(editorIds)) {
      const root = document.getElementById(id);
      if (!root) continue;
      root.innerHTML = (site[key] || []).map((item, index) => `<div class="editor-item glass-card"><div class="editor-item-head"><strong>${escape(item.name || item.title || item.question || item.text || `${key} ${index + 1}`)}</strong><button class="btn btn-danger btn-small" data-remove-item="${key}" data-index="${index}">Remove</button></div><div class="field-grid">${schemas[key].map((field) => fieldControl(key, item, index, field)).join("")}</div></div>`).join("");
    }
  }

  function normalizeTicker(value) {
    return String(value || "").trim().split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  }

  function updateArray(element) {
    const next = clone(FSRP_STORE.get());
    const key = element.dataset.editItem;
    const index = Number(element.dataset.index);
    const field = element.dataset.field;
    let value = element.value;
    if (value === "true" || value === "false") value = value === "true";
    if (field === "items") value = String(value).split("\n").map((item) => item.trim()).filter(Boolean);
    if (key === "ticker" && field === "text") {
      const normalized = normalizeTicker(value);
      if (normalized !== value.trim()) toast("Ticker messages are limited to five words.");
      value = normalized;
      element.value = normalized;
    }
    next[key][index][field] = value;
    FSRP_STORE.set(next);
    markDirty();
    updateOverview();
  }

  async function publish() {
    if (role === "preview") return toast("Local preview is saved in this browser. Sign in to publish to Cloudflare.");
    try {
      const current = FSRP_STORE.get();
      FSRP_STORE.validatePublishable(current);
      const payload = role === "operations" ? { status: current.status } : { content: current };
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Publish failed");
      document.getElementById("save-state").textContent = role === "operations" ? "Server status published." : "Website published to Cloudflare.";
      toast(role === "operations" ? "Status published" : "Website published");
    } catch (error) {
      toast(error.message);
    }
  }

  async function uploadAsset() {
    const file = document.getElementById("asset-file")?.files?.[0];
    if (!file) return toast("Choose a file first.");
    if (role !== "admin") return toast("Admin sign-in is required for permanent uploads.");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("/api/media", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");
      showAsset({ label: document.getElementById("asset-label")?.value || file.name, url: data.url, type: file.type });
      await navigator.clipboard?.writeText(data.url);
      toast("Uploaded to R2. URL copied.");
    } catch (error) {
      toast(error.message);
    }
  }

  function showAsset(asset) {
    const root = document.getElementById("asset-grid");
    if (!root) return;
    const card = document.createElement("article");
    card.className = "asset-card glass-card";
    const isVideo = String(asset.type).startsWith("video/");
    const isAudio = String(asset.type).startsWith("audio/");
    card.innerHTML = `${isVideo ? `<video controls src="${escape(asset.url)}"></video>` : isAudio ? `<audio controls src="${escape(asset.url)}"></audio>` : `<img src="${escape(asset.url)}" alt="${escape(asset.label)}">`}<strong>${escape(asset.label)}</strong><div class="field"><label>Asset URL</label><input readonly value="${escape(asset.url)}"></div><button class="btn btn-ghost btn-small" type="button">Copy URL</button>`;
    card.querySelector("button").onclick = async () => {
      await navigator.clipboard?.writeText(asset.url);
      toast("Asset URL copied");
    };
    root.prepend(card);
  }

  function updateOverview() {
    const site = FSRP_STORE.get();
    const count = ["announcements", "events", "timeline", "gallery", "departments", "ranks", "staff", "recognition", "systems", "joinSteps", "faqs", "rules", "marketplace", "support", "ticker", "streamers"].reduce((sum, key) => sum + (site[key]?.length || 0), 0);
    const contentCount = document.getElementById("manager-content-count");
    if (contentCount) contentCount.textContent = `${count} editable records`;
    const storage = document.getElementById("manager-storage-status");
    if (storage) storage.textContent = role === "preview" ? "Local preview" : "Cloud publishing ready";
  }

  document.addEventListener("click", (event) => {
    if (event.target.id === "manager-login-btn") login();
    if (event.target.id === "manager-local-preview-btn") unlock();
    const tab = event.target.closest("[data-manager-tab]");
    if (tab && !tab.disabled) {
      document.querySelectorAll("[data-manager-tab]").forEach((item) => item.classList.toggle("is-active", item === tab));
      document.querySelectorAll("[data-manager-panel]").forEach((item) => item.classList.toggle("is-active", item.dataset.managerPanel === tab.dataset.managerTab));
    }
    const add = event.target.closest("[data-add-item]");
    if (add) {
      const key = add.dataset.addItem;
      const next = clone(FSRP_STORE.get());
      next[key] ??= [];
      const blank = Object.fromEntries((schemas[key] || ["title"]).map((field) => [field, ["enabled"].includes(field) ? true : ["manualLive"].includes(field) ? false : ""]));
      if (key === "streamers") {
        blank.id = `streamer-${Date.now()}`;
        blank.platform = "youtube";
        blank.avatarUrl = "/assets/brand/fsrp-logo.png";
        blank.enabled = true;
      }
      next[key].push(blank);
      FSRP_STORE.set(next);
      renderEditors();
      markDirty();
      updateOverview();
    }
    const remove = event.target.closest("[data-remove-item]");
    if (remove) {
      const next = clone(FSRP_STORE.get());
      next[remove.dataset.removeItem].splice(Number(remove.dataset.index), 1);
      FSRP_STORE.set(next);
      renderEditors();
      markDirty();
      updateOverview();
    }
    if (event.target.id === "publish-btn") publish();
    if (event.target.id === "preview-refresh-btn") {
      bindFields(); renderEditors(); updateOverview(); toast("Preview refreshed");
    }
    if (event.target.id === "reset-preview-btn") {
      FSRP_STORE.reset(); bindFields(); renderEditors(); updateOverview(); toast("Preview reset");
    }
    if (event.target.id === "asset-local-preview-btn") {
      const file = document.getElementById("asset-file")?.files?.[0];
      if (!file) toast("Choose an image, video, or audio file first.");
      else {
        showAsset({ label: document.getElementById("asset-label")?.value || file.name, url: URL.createObjectURL(file), type: file.type, local: true });
        toast("Local asset preview created");
      }
    }
    if (event.target.id === "asset-upload-btn") uploadAsset();
    if (event.target.id === "export-btn") {
      const blob = new Blob([JSON.stringify(FSRP_STORE.get(), null, 2)], { type: "application/json" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = "FSRP-website-backup.json";
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    }
    if (event.target.id === "status-publish-btn") {
      const next = clone(FSRP_STORE.get());
      next.status.updatedAt = new Date().toLocaleString();
      FSRP_STORE.set(next);
      bindFields();
      markDirty();
      toast("Status timestamp updated");
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-edit-item]")) updateArray(event.target);
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-edit-item]")) updateArray(event.target);
    if (event.target.id === "intro-local-file" && event.target.files[0]) {
      const file = event.target.files[0];
      const next = clone(FSRP_STORE.get());
      next.experience.introMediaType = file.type.startsWith("video/") ? "video" : "image";
      next.experience.introMediaUrl = URL.createObjectURL(file);
      FSRP_STORE.set(next);
      bindFields();
      markDirty();
      toast("Local intro media preview ready");
    }
  });
  document.getElementById("import-file")?.addEventListener("change", async (event) => {
    try {
      FSRP_STORE.set(JSON.parse(await event.target.files[0].text()));
      bindFields(); renderEditors(); updateOverview(); toast("Backup imported into preview");
    } catch {
      toast("Invalid JSON backup");
    }
  });
})();
