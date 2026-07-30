(function () {
  "use strict";

  const PREF_KEY = "fsrp_v3_sound_enabled";
  let enabled = false;
  let audioContext = null;

  function contentSettings() { return window.FSRP_STORE?.get("sound") || {}; }

  function readPref() {
    const saved = localStorage.getItem(PREF_KEY);
    if (saved !== null) return saved === "true";
    return String(contentSettings().defaultEnabled) === "true";
  }

  function setEnabled(value, announce = true) {
    enabled = Boolean(value);
    localStorage.setItem(PREF_KEY, String(enabled));
    document.getElementById("sound-toggle")?.classList.toggle("is-active", enabled);
    if (announce) window.FSRP_TOAST?.(`Interface sounds ${enabled ? "enabled" : "muted"}.`);
  }

  function tone(kind = "click") {
    if (!enabled) return;
    const settings = contentSettings();
    const url = settings.clickUrl;
    if (url && kind === "click") {
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, Number(settings.volume) || .25));
      audio.play().catch(() => {});
      return;
    }
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = kind === "success" ? 720 : kind === "open" ? 520 : 430;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(.005, (Number(settings.volume) || .25) * .045), audioContext.currentTime + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .09);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + .1);
    } catch (_) {}
  }

  function init() {
    setEnabled(readPref(), false);
    document.getElementById("sound-toggle")?.addEventListener("click", () => setEnabled(!enabled));
    document.addEventListener("click", (event) => {
      if (event.target.closest("button, .btn, [data-route]")) tone("click");
    });
  }

  window.FSRP_SOUND = { init, tone, setEnabled, get enabled() { return enabled; } };
})();
