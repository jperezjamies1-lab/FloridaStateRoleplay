(function () {
  const CONTENT_KEY = "fsrp_v3_content";
  const PREVIEW_KEY = "fsrpPreviewStateV3";
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function merge(base, incoming) {
    if (Array.isArray(base) || Array.isArray(incoming)) {
      return incoming === undefined ? clone(base) : clone(incoming);
    }
    if (base && typeof base === "object" && incoming && typeof incoming === "object") {
      const output = { ...base };
      for (const key of Object.keys(incoming)) {
        output[key] = key in base ? merge(base[key], incoming[key]) : clone(incoming[key]);
      }
      return output;
    }
    return incoming === undefined ? base : incoming;
  }

  function containsDataUrl(value) {
    if (typeof value === "string") {
      return /^(data:|blob:)/i.test(value.trim());
    }
    if (Array.isArray(value)) return value.some(containsDataUrl);
    if (value && typeof value === "object") return Object.values(value).some(containsDataUrl);
    return false;
  }

  function validatePublishable(value) {
    if (containsDataUrl(value)) {
      throw new Error("Embedded local preview media cannot be published to KV. Upload it to R2 and use the permanent URL.");
    }
    return true;
  }

  function sanitizeMaintenance(value) {
    const output = clone(value || {});
    if (!output.maintenance || typeof output.maintenance !== "object") return output;

    const isCurrentSafetyVersion = Number(output.maintenance.safetyVersion) >= 2;
    if (!isCurrentSafetyVersion) {
      output.maintenance.enabled = false;
      output.maintenance.publicLockConfirmed = false;
      output.maintenance.safetyVersion = 2;
    }

    if (output.maintenance.enabled === true && output.maintenance.publicLockConfirmed !== true) {
      output.maintenance.enabled = false;
    }
    return output;
  }

  function loadPreview() {
    try {
      return sanitizeMaintenance(JSON.parse(localStorage.getItem(PREVIEW_KEY) || "{}"));
    } catch {
      return {};
    }
  }

  let state = merge(window.FSRP_DEFAULTS, loadPreview());
  const listeners = new Set();

  const api = {
    contentKey: CONTENT_KEY,
    get: () => state,
    clone: () => clone(state),
    validatePublishable,
    set(next, { persist = true } = {}) {
      state = merge(window.FSRP_DEFAULTS, next || {});
      if (persist) localStorage.setItem(PREVIEW_KEY, JSON.stringify(state));
      for (const listener of listeners) listener(state);
      document.dispatchEvent(new CustomEvent("fsrp:state", { detail: state }));
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
        const response = await fetch("/api/settings", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Settings API returned ${response.status}`);
        const data = await response.json();
        const cloudContent = sanitizeMaintenance(data.content || data.settings || null);
        const cloudStatus = data.status || null;
        if (cloudContent || cloudStatus) {
          const next = merge(state, cloudContent || {});
          if (cloudStatus) next.status = merge(next.status || {}, cloudStatus);
          api.set(next, { persist: false });
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
      localStorage.removeItem("fsrpPreviewState");
      api.set(clone(window.FSRP_DEFAULTS), { persist: false });
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
