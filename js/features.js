(function () {
  const $ = (selector) => document.querySelector(selector);
  const state = () => window.FSRP_STORE?.get?.() || window.FSRP_DEFAULTS || {};
  const escape = (value) => window.FSRP_UTILS?.escapeHTML?.(value) || String(value ?? "");
  let introDone = false;
  let partyRunning = false;
  let partyDeadline = 0;
  let partyTickTimer = null;
  let partyMusicTimer = null;
  let partyAudioContext = null;
  let waitingPlayer = null;
  let waitingContext = null;
  let waitingTimer = null;

  function fiveWords(value) {
    return String(value || "").trim().split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  }

  function renderTicker() {
    const track = $("#ticker-track");
    if (!track) return;
    const items = (state().ticker || [])
      .filter((item) => item.enabled !== false)
      .map((item) => fiveWords(item.text))
      .filter(Boolean)
      .slice(0, 12);
    const finalItems = items.length ? items : ["Florida State Roleplay Live"];
    track.replaceChildren();
    for (let copy = 0; copy < 2; copy += 1) {
      for (const text of finalItems) {
        const item = document.createElement("span");
        item.className = "ticker-item";
        item.textContent = text;
        track.append(item);
      }
    }
  }

  function showTakeover() {
    const takeover = state().takeover || {};
    const root = $("#announcement-takeover");
    if (!root || !takeover.enabled || !takeover.id) return;
    if (localStorage.getItem(`fsrpTakeoverSeen:${takeover.id}`)) return;
    $("#takeover-title").textContent = takeover.title || "Florida State Roleplay Update";
    $("#takeover-message").textContent = takeover.message || "";
    const button = $("#takeover-button");
    button.textContent = takeover.buttonLabel || "View Update";
    button.href = takeover.buttonUrl || "#community";
    root.hidden = false;
    window.setTimeout(closeTakeover, 3000);
  }

  function closeTakeover() {
    const takeover = state().takeover || {};
    if (takeover.id) localStorage.setItem(`fsrpTakeoverSeen:${takeover.id}`, "1");
    const root = $("#announcement-takeover");
    if (root) root.hidden = true;
  }

  function setupIntro() {
    const config = state().experience || {};
    const root = $("#opening-sequence");
    if (!root) return;
    const alreadySeen = sessionStorage.getItem("fsrpIntroSeen") === "1";
    if (!config.introEnabled || (!config.introEveryRefresh && alreadySeen)) {
      root.hidden = true;
      window.setTimeout(showTakeover, 350);
      return;
    }

    root.hidden = false;
    root.style.opacity = "1";
    document.body.classList.add("fsrp-screen-locked");
    const media = $("#intro-media");
    media.replaceChildren();
    if (config.introMediaUrl && config.introMediaType === "video") {
      const video = document.createElement("video");
      video.src = config.introMediaUrl;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-hidden", "true");
      media.append(video);
    } else if (config.introMediaUrl && config.introMediaType === "image") {
      const image = new Image();
      image.src = config.introMediaUrl;
      image.alt = "Florida State Roleplay intro media";
      media.append(image);
    }
    window.setTimeout(beginLoader, 4200);
  }

  function beginLoader() {
    if (introDone) return;
    introDone = true;
    const root = $("#opening-sequence");
    if (!root || root.hidden) return;
    root.classList.add("falling");
    window.setTimeout(() => {
      root.classList.add("loading");
      const bar = $("#intro-progress-bar");
      const number = $("#intro-progress-number");
      const message = $("#intro-loader-message");
      window.requestAnimationFrame(() => { if (bar) bar.style.width = "100%"; });
      const steps = [
        [250, 18, "Connecting to roleplay services"],
        [800, 42, "Loading departments and staff"],
        [1400, 68, "Opening live command systems"],
        [2050, 89, "Preparing the FSRP CAD"],
        [2550, 100, "Welcome to Florida State Roleplay"],
      ];
      for (const [delay, percent, text] of steps) {
        window.setTimeout(() => {
          if (number) number.textContent = `${percent}%`;
          if (message) message.textContent = text;
        }, delay);
      }
      window.setTimeout(closeIntro, 2920);
    }, 1050);
  }

  function closeIntro() {
    const root = $("#opening-sequence");
    if (!root) return;
    root.style.opacity = "0";
    root.style.transition = ".7s";
    document.body.classList.remove("fsrp-screen-locked");
    sessionStorage.setItem("fsrpIntroSeen", "1");
    window.setTimeout(() => { root.hidden = true; }, 720);
    window.setTimeout(showTakeover, 820);
  }

  function scheduleClock() {
    const time = $("#device-time");
    const date = $("#device-date");
    if (!time || !date) return;
    const now = new Date();
    time.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    date.textContent = `${now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"}`;
    window.setTimeout(scheduleClock, 1000);
  }

  let logoClicks = 0;
  let logoClickTimer = null;
  function logoClick() {
    logoClicks += 1;
    window.clearTimeout(logoClickTimer);
    if (logoClicks >= 4) {
      logoClicks = 0;
      startParty();
      return;
    }
    logoClickTimer = window.setTimeout(() => {
      if (logoClicks === 2) $("#lwktimmy-easter").hidden = false;
      logoClicks = 0;
    }, 1200);
  }

  function makeConfetti() {
    const root = $("#party-confetti");
    if (!root) return;
    root.replaceChildren();
    for (let index = 0; index < 180; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.setProperty("--hue", Math.floor(Math.random() * 360));
      piece.style.setProperty("--duration", `${3 + Math.random() * 6}s`);
      piece.style.setProperty("--drift", `${-100 + Math.random() * 200}px`);
      piece.style.animationDelay = `${Math.random() * 5}s`;
      root.append(piece);
    }
  }

  function schedulePartyNote(step = 0) {
    if (!partyAudioContext || !partyRunning) return;
    const notes = [110, 146.83, 164.81, 220, 196, 146.83, 130.81, 164.81];
    const now = partyAudioContext.currentTime;
    const master = partyAudioContext.createGain();
    master.gain.value = 0.09;
    master.connect(partyAudioContext.destination);
    const lead = partyAudioContext.createOscillator();
    const leadGain = partyAudioContext.createGain();
    const bass = partyAudioContext.createOscillator();
    const bassGain = partyAudioContext.createGain();
    lead.type = "sawtooth";
    lead.frequency.value = notes[step % notes.length] * 2;
    bass.type = "square";
    bass.frequency.value = notes[step % notes.length] / 2;
    leadGain.gain.setValueAtTime(0.0001, now);
    leadGain.gain.exponentialRampToValueAtTime(0.11, now + 0.015);
    leadGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    bassGain.gain.setValueAtTime(0.0001, now);
    bassGain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    lead.connect(leadGain).connect(master);
    bass.connect(bassGain).connect(master);
    lead.start(now); bass.start(now); lead.stop(now + 0.24); bass.stop(now + 0.14);
    partyMusicTimer = window.setTimeout(() => schedulePartyNote(step + 1), 250);
  }

  function partyTick() {
    if (!partyRunning) return;
    const seconds = Math.max(0, Math.ceil((partyDeadline - Date.now()) / 1000));
    const countdown = $("#party-countdown");
    if (countdown) countdown.textContent = seconds;
    if (seconds <= 0) return stopParty();
    partyTickTimer = window.setTimeout(partyTick, 250);
  }

  function startParty() {
    if (partyRunning) return;
    partyRunning = true;
    partyDeadline = Date.now() + 60_000;
    $("#party-mode").hidden = false;
    makeConfetti();
    try {
      partyAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      schedulePartyNote();
    } catch {}
    partyTick();
  }

  function stopParty() {
    partyRunning = false;
    window.clearTimeout(partyTickTimer);
    window.clearTimeout(partyMusicTimer);
    partyTickTimer = null;
    partyMusicTimer = null;
    if (partyAudioContext) partyAudioContext.close().catch(() => {});
    partyAudioContext = null;
    const root = $("#party-mode");
    if (root) root.hidden = true;
    const confetti = $("#party-confetti");
    if (confetti) confetti.replaceChildren();
  }

  function stopWaitingMusic() {
    window.clearTimeout(waitingTimer);
    waitingTimer = null;
    if (waitingPlayer) {
      waitingPlayer.pause();
      waitingPlayer.currentTime = 0;
      waitingPlayer = null;
    }
    if (waitingContext) waitingContext.close().catch(() => {});
    waitingContext = null;
    document.querySelectorAll("[data-waiting-music]").forEach((button) => {
      button.textContent = "Play Waiting Music";
      button.dataset.playing = "false";
    });
  }

  function waitingChord(step = 0) {
    if (!waitingContext) return;
    const config = state().maintenance || {};
    const gainValue = Math.min(0.35, Math.max(0.02, Number(config.musicVolume ?? 0.15)));
    const chords = [[130.81, 164.81, 196], [146.83, 174.61, 220], [110, 146.83, 174.61], [123.47, 155.56, 196]];
    const now = waitingContext.currentTime;
    const master = waitingContext.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(gainValue, now + 1.3);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 5.8);
    master.connect(waitingContext.destination);
    for (const frequency of chords[step % chords.length]) {
      const oscillator = waitingContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(master);
      oscillator.start(now);
      oscillator.stop(now + 6);
    }
    waitingTimer = window.setTimeout(() => waitingChord(step + 1), 5200);
  }

  async function startWaitingMusic(toggle = true) {
    const config = state().maintenance || {};
    if (waitingPlayer || waitingContext) {
      if (toggle) stopWaitingMusic();
      return;
    }
    localStorage.setItem("fsrpWaitingMusicConsent", "1");
    if (config.musicUrl) {
      waitingPlayer = new Audio(config.musicUrl);
      waitingPlayer.loop = true;
      waitingPlayer.volume = Math.min(1, Math.max(0, Number(config.musicVolume ?? 0.15)));
      try { await waitingPlayer.play(); } catch { waitingPlayer = null; }
    } else {
      try {
        waitingContext = new (window.AudioContext || window.webkitAudioContext)();
        waitingChord();
      } catch {}
    }
    document.querySelectorAll("[data-waiting-music]").forEach((button) => {
      button.textContent = "Stop Waiting Music";
      button.dataset.playing = "true";
    });
  }

  function syncMaintenanceMusic() {
    const maintenance = state().maintenance || {};
    const screenVisible = !$("#maintenance-screen")?.hidden || !$("#service-degraded")?.hidden;
    if (!screenVisible || maintenance.musicEnabled === false) return stopWaitingMusic();
    if (localStorage.getItem("fsrpWaitingMusicConsent") === "1") startWaitingMusic(false);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#takeover-close")) closeTakeover();
    if (event.target.closest("[data-logo-easter],.brand img,.footer-brand img")) logoClick();
    if (event.target.closest("[data-close-easter]")) $("#lwktimmy-easter").hidden = true;
    if (event.target.closest("#party-stop")) stopParty();
    if (event.target.closest("#intro-enter")) beginLoader();
    if (event.target.closest("[data-waiting-music]")) startWaitingMusic(true);
    if (event.target.closest("[data-maintenance-bypass]")) {
      sessionStorage.setItem("fsrpMaintenanceBypass", "1");
      const maintenance = $("#maintenance-screen");
      if (maintenance) maintenance.hidden = true;
      document.body.classList.remove("is-locked", "fsrp-screen-locked");
      stopWaitingMusic();
      document.dispatchEvent(new CustomEvent("fsrp:maintenance", { detail: { visible: false } }));
    }
  });

  document.addEventListener("fsrp:state", () => {
    renderTicker();
    syncMaintenanceMusic();
  });
  document.addEventListener("fsrp:maintenance", syncMaintenanceMusic);
  document.addEventListener("fsrp:ready", setupIntro, { once: true });
  document.addEventListener("DOMContentLoaded", () => {
    renderTicker();
    scheduleClock();
  });
})();
