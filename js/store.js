(function () {
  "use strict";

  const LOCAL_KEY = "fsrp_v3_content";
  const CLOUD_KEY = "fsrp_v3_content";
  const CLOUD_STATUS_KEY = "fsrp_v3_status";
  const listeners = new Set();
  let content = clone(window.FSRP_DEFAULT_CONTENT);
  let source = "defaults";
  let dirty = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  const LEGACY_KEYS = [
    "fsrp_website_content_preview_v2",
    "fsrp_website_manual_status_v1",
    "fsrp_announcements_v1",
    "fsrp_official_staff_roster_v1",
    "fsrp_social_command_v1",
  ];

  function parseLegacy(value, fallback = null) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
  }

  function validPublicUrl(value, allowImageData = false) {
    const url = String(value || "").trim();
    if (/^(https?:\/\/|\/)/i.test(url)) return url;
    if (allowImageData && /^data:image\//i.test(url)) return url;
    return "";
  }

  function legacyDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).slice(0, 40) : date.toISOString().slice(0, 10);
  }

  function legacyRankId(value) {
    const normalized = String(value || "").trim().toLowerCase();
    const map = {
      leadership: "leadership",
      directorship: "directorship",
      "senior management": "senior-management",
      management: "management",
      supervision: "supervision",
      administration: "administration",
      moderation: "moderation",
    };
    return map[normalized] || "moderation";
  }

  function migrateLegacySettings(settings = {}) {
    if (!settings || !LEGACY_KEYS.some((key) => settings[key] !== undefined && settings[key] !== null && settings[key] !== "")) return null;
    const next = clone(window.FSRP_DEFAULT_CONTENT);
    let changed = false;

    const oldContent = parseLegacy(settings.fsrp_website_content_preview_v2, {});
    if (isObject(oldContent)) {
      changed = true;
      if (oldContent.titleMain) next.hero.title1 = String(oldContent.titleMain).trim();
      if (oldContent.titleAccent) next.hero.title2 = String(oldContent.titleAccent).trim();
      if (oldContent.description) next.hero.subtitle = String(oldContent.description).trim();
      const heroImage = validPublicUrl(oldContent.heroImage, true);
      if (heroImage) next.hero.backgroundUrl = heroImage;
      const notice = String(oldContent.announcement || "").trim();
      if (notice) { next.notice.enabled = true; next.notice.label = "Community Notice"; next.notice.text = notice; }

      const linkMap = {
        discord: oldContent.discord,
        youtube: oldContent.youtube,
        roblox: oldContent.robloxGroup,
        tiktok: oldContent.tiktok,
        instagram: oldContent.instagram,
      };
      Object.entries(linkMap).forEach(([key, value]) => { const url = validPublicUrl(value); if (url) next.links[key] = url; });

      const migratedMedia = [
        ["legacy-main", oldContent.mainImage, "Official Community", "Community"],
        ["legacy-law", oldContent.lawImage, "Law Enforcement Operations", "Departments"],
        ["legacy-fire", oldContent.fireImage, "Emergency Operations", "Departments"],
      ].map(([id, url, title, category]) => ({ id, type: "image", url: validPublicUrl(url, true), title, category, featured: id === "legacy-main", published: true })).filter((item) => item.url);
      if (migratedMedia.length) next.gallery = migratedMedia;
    }

    const social = parseLegacy(settings.fsrp_social_command_v1, {});
    if (isObject(social)) {
      const socialLinks = {
        youtube: social.youtube?.link || social.youtube,
        roblox: social.roblox?.link || social.roblox,
        tiktok: social.tiktok?.link || social.tiktok,
        instagram: social.instagram?.link || social.instagram,
      };
      Object.entries(socialLinks).forEach(([key, value]) => { const url = validPublicUrl(value); if (url) { next.links[key] = url; changed = true; } });
    }

    const oldStatus = parseLegacy(settings.fsrp_website_manual_status_v1, null);
    if (isObject(oldStatus)) {
      changed = true;
      next.status.session = oldStatus.sessionStatus || next.status.session;
      next.status.players = Number.isFinite(oldStatus.playersInGame) ? String(oldStatus.playersInGame) : "";
      next.status.queue = Number.isFinite(oldStatus.queueCount) ? String(oldStatus.queueCount) : "";
      next.status.priority = oldStatus.priorityStatus || "Unavailable";
      next.status.code = oldStatus.serverCode && oldStatus.serverCode !== "Hidden" ? oldStatus.serverCode : "";
      next.status.updatedBy = oldStatus.updatedBy || next.status.updatedBy;
      next.status.updatedAt = oldStatus.lastUpdated || "";
      next.status.message = /offline/i.test(next.status.session) ? next.status.message : "Official session details were migrated from the previous FSRP website.";
    }

    const oldAnnouncements = parseLegacy(settings.fsrp_announcements_v1, []);
    if (Array.isArray(oldAnnouncements) && oldAnnouncements.length) {
      changed = true;
      next.announcements = oldAnnouncements.map((item, index) => ({
        id: String(item.id || `legacy-announcement-${index + 1}`),
        title: String(item.title || "Official update"),
        body: String(item.body || item.description || ""),
        category: String(item.category || "announcement"),
        priority: item.priority === "urgent" || item.priority === "high" || item.pinned ? "featured" : "normal",
        date: legacyDate(item.date || item.createdAt || item.publishDate),
        image: validPublicUrl(item.image, true),
        button1Label: String(item.button1Label || ""),
        button1Url: validPublicUrl(item.button1Url || item.button1Link),
        button2Label: String(item.button2Label || ""),
        button2Url: validPublicUrl(item.button2Url || item.button2Link),
        pinned: Boolean(item.pinned),
        published: item.published !== false,
      }));
    }

    const rosterRaw = parseLegacy(settings.fsrp_official_staff_roster_v1, "");
    const rosterText = Array.isArray(rosterRaw) ? rosterRaw.join("\n") : String(rosterRaw || "");
    const migratedStaff = rosterText.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const [username = "", rank = "Moderation", assignment = "Community Staff", image = "", description = ""] = line.split("|").map((part) => part.trim());
      return {
        id: `legacy-staff-${index + 1}`,
        discordUserId: "",
        username: username.startsWith("@") ? username : `@${username}`,
        displayName: username.replace(/^@/, "") || `Staff Member ${index + 1}`,
        avatarUrl: validPublicUrl(image, true),
        rankId: legacyRankId(rank),
        positionTitle: rank || "Staff",
        department: assignment || "Community Staff",
        callsign: "",
        bio: description || "Official Florida State Roleplay staff member.",
        presenceStatus: "unavailable",
        published: true,
        customOrder: index + 1,
      };
    });
    if (migratedStaff.length) { next.staff = migratedStaff; changed = true; }

    return changed ? next : null;
  }

  function readLegacyLocalSettings() {
    const settings = {};
    for (const key of LEGACY_KEYS) {
      try { const value = localStorage.getItem(key); if (value !== null && value !== "") settings[key] = value; } catch (_) {}
    }
    return settings;
  }

  function mergeDefaults(base, incoming) {
    if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : clone(base);
    if (!isObject(base)) return incoming === undefined ? base : incoming;
    const out = {};
    Object.keys(base).forEach((key) => {
      out[key] = mergeDefaults(base[key], incoming && incoming[key]);
    });
    if (isObject(incoming)) {
      Object.keys(incoming).forEach((key) => {
        if (!(key in out)) out[key] = incoming[key];
      });
    }
    return out;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        content = mergeDefaults(window.FSRP_DEFAULT_CONTENT, parsed);
        source = "local";
        return true;
      }
      const migrated = migrateLegacySettings(readLegacyLocalSettings());
      if (!migrated) return false;
      content = migrated;
      source = "legacy-local";
      saveLocal();
      return true;
    } catch (error) {
      console.warn("FSRP local content could not be loaded", error);
      return false;
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(content));
      return true;
    } catch (error) {
      console.warn("FSRP local content could not be saved", error);
      return false;
    }
  }

  function getPath(path) {
    if (!path) return content;
    return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), content);
  }

  function setPath(path, value, options = {}) {
    const parts = path.split(".");
    let target = content;
    parts.slice(0, -1).forEach((key) => {
      if (!isObject(target[key])) target[key] = {};
      target = target[key];
    });
    target[parts[parts.length - 1]] = value;
    dirty = true;
    if (options.persist !== false) saveLocal();
    notify(path);
  }

  function replace(next, options = {}) {
    content = mergeDefaults(window.FSRP_DEFAULT_CONTENT, next || {});
    dirty = Boolean(options.dirty);
    source = options.source || source;
    if (options.persist !== false) saveLocal();
    notify("*");
  }

  function notify(path) {
    listeners.forEach((listener) => {
      try { listener(content, path); } catch (error) { console.error(error); }
    });
    window.dispatchEvent(new CustomEvent("fsrp:content", { detail: { content, path } }));
  }

  async function fetchWithTimeout(url, options = {}, timeout = 3500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function hydrateCloud() {
    try {
      const response = await fetchWithTimeout("/api/settings", { headers: { accept: "application/json" } }, 3200);
      if (!response.ok) throw new Error(`Settings API ${response.status}`);
      const payload = await response.json();
      const raw = payload?.settings?.[CLOUD_KEY];
      const statusRaw = payload?.settings?.[CLOUD_STATUS_KEY];
      if (!raw && !statusRaw) {
        const migrated = migrateLegacySettings(payload?.settings || {});
        if (!migrated) return { ok: true, found: false };
        content = migrated;
        source = "legacy-cloud";
        dirty = true;
        saveLocal();
        notify("*");
        return { ok: true, found: true, migrated: true };
      }
      const parsed = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
      content = mergeDefaults(window.FSRP_DEFAULT_CONTENT, parsed);
      if (statusRaw) {
        const parsedStatus = typeof statusRaw === "string" ? JSON.parse(statusRaw) : statusRaw;
        content.status = mergeDefaults(window.FSRP_DEFAULT_CONTENT.status, parsedStatus);
      }
      source = "cloud";
      dirty = false;
      saveLocal();
      notify("*");
      return { ok: true, found: true };
    } catch (error) {
      return { ok: false, error: error.message || "Cloud settings unavailable" };
    }
  }

  function containsDataUrl(value) {
    if (typeof value === "string") return /^data:/i.test(value.trim());
    if (Array.isArray(value)) return value.some(containsDataUrl);
    if (isObject(value)) return Object.values(value).some(containsDataUrl);
    return false;
  }

  async function publish(token, role = "admin") {
    if (!token) throw new Error("Manager token is required to publish.");
    if (role !== "operations" && containsDataUrl(content)) {
      throw new Error("Embedded local preview media cannot be published to KV. Upload it to R2 first, then replace every data URL with the R2 URL.");
    }
    const settings = role === "operations"
      ? { [CLOUD_STATUS_KEY]: JSON.stringify(content.status || {}) }
      : { [CLOUD_KEY]: JSON.stringify(content), [CLOUD_STATUS_KEY]: JSON.stringify(content.status || {}) };
    const response = await fetchWithTimeout("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ settings }),
    }, 9000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Publish failed (${response.status})`);
    dirty = false;
    source = "cloud";
    return payload;
  }

  function exportJson() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), product: "FSRP Community Hub V3", content }, null, 2);
  }

  function importJson(raw) {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const next = parsed && parsed.content ? parsed.content : parsed;
    if (!next || typeof next !== "object") throw new Error("Invalid FSRP backup.");
    replace(next, { source: "import", dirty: true });
  }

  loadLocal();

  window.FSRP_STORE = {
    get content() { return content; },
    get source() { return source; },
    get dirty() { return dirty; },
    get: getPath,
    set: setPath,
    replace,
    saveLocal,
    hydrateCloud,
    publish,
    exportJson,
    importJson,
    reset() { replace(window.FSRP_DEFAULT_CONTENT, { source: "defaults", dirty: true }); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
})();
