(function () {
  const escape = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "");
  let timer = null;
  let lastResults = [];

  function platformLabel(value) {
    return value === "youtube" ? "YouTube" : value === "twitch" ? "Twitch" : value === "tiktok" ? "TikTok" : "Stream";
  }

  function mergeResults() {
    const configured = (FSRP_STORE.get().streamers || []).filter((item) => item.enabled !== false);
    const map = new Map(lastResults.map((item) => [item.id, item]));
    return configured.map((item) => ({
      ...item,
      ...(map.get(item.id) || {}),
      live: Boolean(map.get(item.id)?.live ?? item.manualLive),
      liveTitle: map.get(item.id)?.liveTitle || item.manualTitle || "",
    }));
  }

  function render() {
    const root = document.getElementById("streamer-live-grid");
    const summary = document.getElementById("streamer-live-summary");
    if (!root) return;
    const streamers = mergeResults();
    const liveCount = streamers.filter((item) => item.live).length;
    if (summary) summary.textContent = liveCount ? `${liveCount} creator${liveCount === 1 ? "" : "s"} live now` : "Official creators are currently offline";
    root.innerHTML = streamers.map((item) => {
      const status = item.live ? "LIVE" : item.checking ? "CHECKING" : "OFFLINE";
      const title = item.liveTitle || (item.live ? "Playing Florida State Roleplay" : "Waiting for the next FSRP stream");
      return `<article class="streamer-card glass-card ${item.live ? "is-live" : ""}">
        <div class="streamer-card-top"><img src="${escape(item.avatarUrl || "/assets/brand/fsrp-logo.png")}" alt=""><span class="stream-platform">${escape(platformLabel(item.platform))}</span><span class="stream-status">${status}</span></div>
        <h3>${escape(item.name)}</h3><p>${escape(title)}</p>
        <a class="btn ${item.live ? "btn-primary" : "btn-ghost"} btn-small" href="${escape(item.liveUrl || item.url || "#")}" target="_blank" rel="noopener">${item.live ? "Watch Live" : "View Channel"}</a>
      </article>`;
    }).join("") || '<article class="panel streamer-empty"><h3>No official streamers configured</h3><p>Add YouTube, Twitch, or TikTok creators from Website Manager.</p></article>';
  }

  async function refresh() {
    window.clearTimeout(timer);
    if (document.hidden) return;
    const defaults = (FSRP_STORE.get().streamers || []).filter((item) => item.enabled !== false).map((item) => ({ ...item, checking: true }));
    lastResults = defaults;
    render();
    try {
      const response = await fetch("/api/streamers", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        lastResults = data.streamers || [];
      } else lastResults = [];
    } catch {
      lastResults = [];
    }
    render();
    timer = window.setTimeout(refresh, 120000);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(timer);
    else refresh();
  });
  document.addEventListener("fsrp:state", render);
  document.addEventListener("fsrp:ready", refresh, { once: true });
  document.addEventListener("DOMContentLoaded", render);
})();
