(function () {
  "use strict";

  const CONTENT_KEY = "fsrp_v3_content";
  const STATUS_KEY = "fsrp_v3_status";
  const PREVIEW_KEY = "fsrpPreviewStateV3";
  const DISCORD_INVITE = "https://discord.gg/dNRXwCsS9Z";
  const listeners = new Set();

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

  function parse(value, fallback = null) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function merge(base, incoming) {
    if (Array.isArray(base) || Array.isArray(incoming)) {
      return incoming === undefined ? clone(base) : clone(incoming);
    }
    if (isObject(base) && isObject(incoming)) {
      const output = { ...base };
      for (const key of Object.keys(incoming)) {
        output[key] = key in base ? merge(base[key], incoming[key]) : clone(incoming[key]);
      }
      return output;
    }
    return incoming === undefined ? clone(base) : clone(incoming);
  }

  function replaceKnownDiscord(value) {
    const text = String(value || "");
    return /discord\.com\/fosrp|discord\.gg\/fosrp/i.test(text) ? DISCORD_INVITE : text;
  }

  function identityFor(item, index) {
    return String(item?.id || item?.question || item?.title || item?.name || item?.short || index).toLowerCase();
  }

  function preserveFoundation(array, key) {
    const incoming = Array.isArray(array) ? array : [];
    const defaults = Array.isArray(window.FSRP_DEFAULTS?.[key]) ? window.FSRP_DEFAULTS[key] : [];
    const seen = new Set(incoming.map(identityFor));
    return [...incoming, ...defaults.filter((item, index) => !seen.has(identityFor(item, index))).map(clone)];
  }

  function normalizeDepartment(item = {}) {
    const id = String(item.id || item.code || item.short || "department").toLowerCase();
    const short = String(item.short || item.code || id).toUpperCase();
    const rawStatus = String(item.status || "Open");
    const status = id === "civ" ? "Public" : rawStatus === "Active" ? "Open" : rawStatus === "Restricted" ? "Limited" : rawStatus;
    return {
      ...item,
      id,
      short,
      code: short,
      name: id === "civ" ? "CIV" : String(item.name || short),
      category: item.category || (id === "fbi" ? "federal" : id === "civ" ? "civilian" : "law"),
      description: id === "civ"
        ? "Public civilian roleplay, businesses, careers, vehicles, legal activity, criminal stories, and community-driven scenes. CIV is not a whitelisted department."
        : String(item.description || item.body || ""),
      requirements: String(item.requirements || ""),
      status,
      color: item.color || "rgba(67,159,224,.30)",
      image: item.image || "",
      link: replaceKnownDiscord(item.link || DISCORD_INVITE),
      published: item.published !== false,
    };
  }

  function normalizeStaff(item = {}, index = 0) {
    const name = String(item.name || item.displayName || item.username || `Staff Member ${index + 1}`).replace(/^@/, "");
    const rank = String(item.rank || item.rankId || "moderation");
    const rawPresence = String(item.status || item.presenceStatus || "Status Unavailable").toLowerCase();
    const status = rawPresence === "online" ? "Online" : rawPresence === "offline" ? "Offline" : "Status Unavailable";
    return {
      ...item,
      id: item.id || `staff-${index + 1}`,
      name,
      displayName: item.displayName || name,
      username: item.username || `@${name}`,
      rank,
      rankId: item.rankId || rank,
      title: item.title || item.positionTitle || item.department || "Staff Member",
      positionTitle: item.positionTitle || item.title || "",
      department: item.department || "Community Staff",
      initials: item.initials || name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "FS",
      avatarUrl: item.avatarUrl || "",
      discordUserId: item.discordUserId || "",
      callsign: item.callsign || "",
      bio: item.bio || "",
      status,
      presenceStatus: item.presenceStatus || (status === "Online" ? "online" : status === "Offline" ? "offline" : "unavailable"),
      statusMessage: item.statusMessage || "",
      published: item.published !== false,
      customOrder: Number(item.customOrder ?? index + 1),
    };
  }

  function sanitizeMaintenance(value) {
    const output = value && typeof value === "object" ? value : {};
    output.maintenance ??= {};
    const isCurrentSafetyVersion = Number(output.maintenance.safetyVersion) >= 3;
    if (!isCurrentSafetyVersion) {
      output.maintenance.enabled = false;
      output.maintenance.publicLockConfirmed = false;
      output.maintenance.safetyVersion = 3;
    }
    if (output.maintenance.enabled === true && output.maintenance.publicLockConfirmed !== true) {
      output.maintenance.enabled = false;
    }
    return output;
  }

  function normalizeContent(value) {
    const source = parse(value, value);
    if (!isObject(source)) return {};
    const output = clone(source);
    const sourceVersion = Number(source.schemaVersion || source.version || 0);
    const isLegacySchema = sourceVersion < 4;
    const isEnhancedLegacy = sourceVersion === 0 && Boolean(source.experience || source.ticker || source.takeover || source.streamers);

    output.links ??= {};
    output.links.discord = replaceKnownDiscord(output.links.discord || DISCORD_INVITE);
    if (output.hero) output.hero.primaryUrl = replaceKnownDiscord(output.hero.primaryUrl || output.links.discord);

    if (Array.isArray(output.departments)) output.departments = output.departments.filter((item) => item?.id !== "fd" && item?.id !== "fire").map(normalizeDepartment);
    if (Array.isArray(output.staff)) output.staff = output.staff.map(normalizeStaff);
    if (Array.isArray(output.announcements)) output.announcements = output.announcements.map((item) => ({
      ...item,
      body: item.body || item.description || "",
      featured: item.featured === true || item.priority === "featured" || item.pinned === true,
      published: item.published !== false,
    }));
    if (Array.isArray(output.timeline)) output.timeline = output.timeline.map((item) => ({ ...item, description: item.description || item.body || "", body: item.body || item.description || "", published: item.published !== false }));
    if (Array.isArray(output.systems)) output.systems = output.systems.map((item) => ({ ...item, description: String(item.description || item.body || "").replace("law-enforcement, fire, civilian, and justice scenes", "law-enforcement, civilian, federal, and justice scenes"), body: item.body || item.description || "", published: item.published !== false }));
    if (Array.isArray(output.joinSteps)) output.joinSteps = output.joinSteps.map((item) => ({ ...item, description: String(item.description || item.body || "").replaceAll("Civilian Operations", "CIV"), body: item.body || item.description || "", published: item.published !== false }));
    if (Array.isArray(output.support)) output.support = output.support.map((item) => ({ ...item, description: item.description || item.body || "", body: item.body || item.description || "", label: item.label || "Open Support", url: replaceKnownDiscord(item.url || output.links.discord), published: item.published !== false }));
    if (Array.isArray(output.marketplace)) output.marketplace = output.marketplace.map((item) => ({ ...item, title: item.title || item.name || "Marketplace Item", name: item.name || item.title || "Marketplace Item", url: replaceKnownDiscord(item.url || item.buttonUrl || output.links.discord), buttonUrl: replaceKnownDiscord(item.buttonUrl || item.url || output.links.discord), buttonLabel: item.buttonLabel || "View in Discord", benefits: Array.isArray(item.benefits) ? item.benefits : [], published: item.published !== false }));
    if (Array.isArray(output.gallery)) output.gallery = output.gallery.map((item) => ({ ...item, published: item.published !== false }));
    if (Array.isArray(output.rules)) output.rules = output.rules.map((item) => ({ ...item, items: Array.isArray(item.items) ? item.items : [], published: item.published !== false }));
    if (Array.isArray(output.faqs)) output.faqs = output.faqs.map((item) => ({ ...item, question: String(item.question || "").replaceAll("Civilian Operations", "CIV"), answer: String(item.answer || "").replaceAll("Civilian Operations", "CIV"), published: item.published !== false }));

    if (isEnhancedLegacy) {
      for (const key of ["departments", "ranks", "timeline", "marketplace", "rules", "gallery", "systems", "joinSteps", "faqs", "support"]) {
        output[key] = clone(window.FSRP_DEFAULTS[key] || []);
      }
      output.announcements = preserveFoundation(output.announcements, "announcements");
      if (!Array.isArray(output.staff) || output.staff.length === 0) output.staff = clone(window.FSRP_DEFAULTS.staff || []);
    } else if (isLegacySchema) {
      for (const key of ["departments", "ranks", "announcements", "timeline", "marketplace", "rules", "gallery", "systems", "joinSteps", "faqs", "support"]) {
        output[key] = preserveFoundation(output[key], key);
      }
      if (!Array.isArray(output.staff) || output.staff.length === 0) output.staff = clone(window.FSRP_DEFAULTS.staff || []);
    }
    output.schemaVersion = 4;
    output.version = 4;

    return sanitizeMaintenance(output);
  }

  function containsDataUrl(value) {
    if (typeof value === "string") return /^(data:|blob:)/i.test(value.trim());
    if (Array.isArray(value)) return value.some(containsDataUrl);
    if (isObject(value)) return Object.values(value).some(containsDataUrl);
    return false;
  }

  function validatePublishable(value) {
    if (containsDataUrl(value)) throw new Error("Embedded local preview media cannot be published to KV. Upload it to R2 and use the permanent URL.");
    return true;
  }

  function loadLocal() {
    for (const key of [PREVIEW_KEY, CONTENT_KEY]) {
      try {
        const parsed = parse(localStorage.getItem(key), null);
        if (isObject(parsed)) return normalizeContent(parsed);
      } catch (_) {}
    }
    return {};
  }

  let state = merge(window.FSRP_DEFAULTS, loadLocal());

  function notify() {
    for (const listener of listeners) listener(state);
    document.dispatchEvent(new CustomEvent("fsrp:state", { detail: state }));
  }

  function extractCloud(payload) {
    if (!isObject(payload)) return { content: null, status: null };
    if (payload.content || payload.status) return { content: parse(payload.content, payload.content), status: parse(payload.status, payload.status) };
    const settings = payload.settings || {};
    return {
      content: parse(settings[CONTENT_KEY], null),
      status: parse(settings[STATUS_KEY], null),
    };
  }

  const api = {
    contentKey: CONTENT_KEY,
    statusKey: STATUS_KEY,
    get: () => state,
    clone: () => clone(state),
    normalize: normalizeContent,
    validatePublishable,
    set(next, { persist = true } = {}) {
      state = merge(window.FSRP_DEFAULTS, normalizeContent(next || {}));
      if (persist) {
        localStorage.setItem(PREVIEW_KEY, JSON.stringify(state));
        localStorage.setItem(CONTENT_KEY, JSON.stringify(state));
      }
      notify();
    },
    patch(path, value) {
      const parts = path.split(".");
      const next = clone(state);
      let cursor = next;
      for (const key of parts.slice(0, -1)) cursor = cursor[key] ?? (cursor[key] = {});
      cursor[parts.at(-1)] = value;
      api.set(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async loadCloud() {
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 4500);
        let response;
        try {
          response = await fetch("/api/settings", { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
        } finally {
          window.clearTimeout(timer);
        }
        if (!response.ok) throw new Error(`Settings API returned ${response.status}`);
        const cloud = extractCloud(await response.json());
        if (cloud.content || cloud.status) {
          const next = merge(state, normalizeContent(cloud.content || {}));
          if (cloud.status) next.status = merge(next.status || {}, cloud.status);
          api.set(next, { persist: true });
        }
        document.dispatchEvent(new CustomEvent("fsrp:cloud", { detail: { ok: true } }));
        return { ok: true };
      } catch (error) {
        document.dispatchEvent(new CustomEvent("fsrp:cloud", { detail: { ok: false, error } }));
        return { ok: false, error };
      }
    },
    reset() {
      localStorage.removeItem(PREVIEW_KEY);
      localStorage.removeItem(CONTENT_KEY);
      localStorage.removeItem("fsrpPreviewState");
      state = clone(window.FSRP_DEFAULTS);
      notify();
    },
  };

  window.FSRP_STORE = api;
  window.FSRP_UTILS = {
    clone,
    merge,
    containsDataUrl,
    escapeHTML(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    },
  };
})();
