(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const peers = new Map();
  const peerMeta = new Map();
  const remoteAudio = new Map();
  const remoteVideo = new Map();
  let ws = null;
  let localStream = null;
  let localTrack = null;
  let localVideoStream = null;
  let localVideoTrack = null;
  let selfId = "";
  let currentChannel = "";
  let currentCallsign = "";
  let currentAgency = "";
  let currentRole = "";
  let channelLocked = false;
  let emergencyMode = false;
  let iceServers = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
  let pendingPTT = null;
  let connected = false;
  let transmitting = false;
  let deafen = false;
  let overlayWindow = null;
  let heartbeat = null;
  let reconnectTimer = null;
  let manualDisconnect = false;

  function status(text, mode = "idle") {
    const label = $("#cad-live-radio-status");
    if (label) label.textContent = text;
    const badge = $("#cad-live-radio-badge");
    if (badge) badge.dataset.mode = mode;
    broadcastOverlay();
  }

  function setPeers(count) {
    const label = $("#cad-live-radio-peers");
    if (label) label.textContent = `${count} live unit${count === 1 ? "" : "s"}`;
    broadcastOverlay();
  }

  function setSpeaker(callsign = "") {
    const label = $("#cad-live-radio-speaker");
    if (label) label.textContent = callsign || "Channel clear";
    broadcastOverlay();
  }

  function tone(frequency, duration = 0.08) {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      const ctx = new Context();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
      oscillator.addEventListener("ended", () => ctx.close());
    } catch {}
  }

  function injectUI() {
    const consolePanel = $(".radio-console-pro");
    if (!consolePanel || $("#cad-live-radio-control")) return;
    const block = document.createElement("section");
    block.id = "cad-live-radio-control";
    block.className = "live-radio-control";
    block.innerHTML = `
      <div class="live-radio-head">
        <span><i id="cad-live-radio-badge" data-mode="idle"></i><strong>FSRP LIVE VOICE</strong></span>
        <small id="cad-live-radio-peers">0 live units</small>
      </div>
      <div class="live-radio-readout">
        <span id="cad-live-radio-status">Not connected</span>
        <strong id="cad-live-radio-speaker">Channel clear</strong>
      </div>
      <div class="live-radio-actions">
        <button class="btn btn-primary btn-small" id="cad-live-radio-connect" type="button">Connect Live Voice</button>
        <button class="btn btn-ghost btn-small" id="cad-live-radio-deafen" type="button">Deafen Off</button>
        <button class="btn btn-ghost btn-small" id="cad-live-radio-popout" type="button">Open Radio Overlay</button>
        <button class="btn btn-secondary btn-small" id="cad-live-bodycam" type="button">Share Live Bodycam</button>
        <button class="btn btn-warning btn-small" id="cad-live-radio-priority" type="button" hidden>Priority PTT</button>
        <button class="btn btn-ghost btn-small" id="cad-live-radio-lock" type="button" hidden>Lock Channel</button>
      </div>
      <div class="live-bodycam-grid" id="cad-live-bodycam-grid" hidden></div>
      <small class="live-radio-note">Live WebRTC voice and optional bodycam video. Camera sharing is off until the officer clicks Share Live Bodycam. One normal unit transmits at a time; Staff Command can override or lock a channel.</small>`;
    const head = consolePanel.querySelector(".radio-device-head");
    head?.insertAdjacentElement("afterend", block);
    $("#cad-live-radio-connect")?.addEventListener("click", () => connected ? disconnect() : connect());
    $("#cad-live-radio-deafen")?.addEventListener("click", () => {
      deafen = !deafen;
      for (const audio of remoteAudio.values()) audio.muted = deafen;
      $("#cad-live-radio-deafen").textContent = deafen ? "Deafen On" : "Deafen Off";
      broadcastOverlay();
    });
    $("#cad-live-radio-popout")?.addEventListener("click", openOverlay);
    $("#cad-live-bodycam")?.addEventListener("click", () => localVideoTrack ? stopBodycam() : startBodycam());
    $("#cad-live-radio-priority")?.addEventListener("pointerdown", (event) => { event.preventDefault(); requestPriorityPTT(); });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => $("#cad-live-radio-priority")?.addEventListener(name, releasePTT));
    $("#cad-live-radio-lock")?.addEventListener("click", () => {
      const command = channelLocked ? "unlock" : "lock";
      send({ type: "control", command, reason: "Priority traffic only" });
    });
  }

  async function getMicrophone() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Live radio requires HTTPS and microphone permission.");
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false
    });
    localTrack = localStream.getAudioTracks()[0] || null;
    if (!localTrack) throw new Error("No microphone audio track was available.");
    localTrack.enabled = false;
    return localStream;
  }

  async function renegotiate(peerId, pc) {
    if (!pc || pc.signalingState !== "stable") return;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    send({ type: "offer", target: peerId, sdp: pc.localDescription });
  }

  async function startBodycam() {
    if (!connected) throw new Error("Connect live radio before sharing a bodycam.");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Live bodycam requires HTTPS and camera permission.");
    try {
      localVideoStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 }, facingMode: "environment" }, audio: false });
      localVideoTrack = localVideoStream.getVideoTracks()[0] || null;
      if (!localVideoTrack) throw new Error("No camera track was available.");
      for (const [peerId, pc] of peers) {
        const sender = pc.getSenders().find((item) => item.track?.kind === "video" || (!item.track && item._fsrpVideo));
        if (sender) {
          const transceiver = pc.getTransceivers().find((item) => item.sender === sender);
          if (transceiver) transceiver.direction = "sendrecv";
          await sender.replaceTrack(localVideoTrack);
        } else pc.addTrack(localVideoTrack, localVideoStream);
        await renegotiate(peerId, pc).catch(() => undefined);
      }
      attachLocalVideo();
      const button = $("#cad-live-bodycam");
      if (button) button.textContent = "Stop Live Bodycam";
      send({ type: "text", text: `${currentCallsign} enabled live bodycam` });
    } catch (error) {
      stopBodycam();
      window.alert(error.message);
    }
  }

  function stopBodycam() {
    for (const pc of peers.values()) {
      for (const transceiver of pc.getTransceivers().filter((item) => item.sender?.track?.kind === "video" || item.sender?._fsrpVideo)) {
        transceiver.sender.replaceTrack(null).catch(() => undefined);
        transceiver.direction = "recvonly";
      }
    }
    localVideoStream?.getTracks().forEach((track) => track.stop());
    localVideoStream = null;
    localVideoTrack = null;
    $("#cad-live-bodycam-local")?.remove();
    const button = $("#cad-live-bodycam");
    if (button) button.textContent = "Share Live Bodycam";
    updateBodycamGrid();
  }

  function attachLocalVideo() {
    const grid = $("#cad-live-bodycam-grid");
    if (!grid || !localVideoStream) return;
    let card = $("#cad-live-bodycam-local");
    if (!card) {
      card = document.createElement("article");
      card.id = "cad-live-bodycam-local";
      card.className = "live-bodycam-card is-local";
      card.innerHTML = `<video autoplay muted playsinline></video><span>MY BODYCAM · LIVE</span>`;
      grid.prepend(card);
    }
    card.querySelector("video").srcObject = localVideoStream;
    updateBodycamGrid();
  }

  function attachRemoteVideo(peerId, stream) {
    const grid = $("#cad-live-bodycam-grid");
    if (!grid) return;
    let card = remoteVideo.get(peerId);
    if (!card) {
      card = document.createElement("article");
      card.className = "live-bodycam-card";
      card.dataset.peer = peerId;
      card.innerHTML = `<video autoplay muted playsinline></video><span></span>`;
      grid.appendChild(card);
      remoteVideo.set(peerId, card);
    }
    card.querySelector("video").srcObject = stream;
    card.querySelector("span").textContent = `${peerMeta.get(peerId)?.callsign || "REMOTE UNIT"} · BODYCAM`;
    updateBodycamGrid();
  }

  function updateBodycamGrid() {
    const grid = $("#cad-live-bodycam-grid");
    if (grid) grid.hidden = !localVideoTrack && remoteVideo.size === 0;
  }

  function radioToken() {
    return sessionStorage.getItem("fsrpCadToken") || "";
  }

  function selectedChannel() {
    return String($("#cad-radio-channel-select")?.value || "STATEWIDE").trim().toUpperCase();
  }

  function callsign() {
    const agency = sessionStorage.getItem("fsrpCadAgency") || "FSRP";
    return String($("#cad-unit-callsign")?.value || localStorage.getItem(`fsrpCadCallsign:${agency}`) || "").trim();
  }

  async function connect() {
    if (connected || ws) return;
    manualDisconnect = false;
    clearTimeout(reconnectTimer);
    const cadToken = radioToken();
    currentChannel = selectedChannel();
    currentCallsign = callsign();
    if (!cadToken) throw new Error("Sign into CAD before connecting live radio.");
    if (!currentCallsign) throw new Error("Update your callsign before connecting live radio.");
    status("Requesting secure radio access…", "connecting");
    try {
      await getMicrophone();
      const response = await fetch("/api/radio-token", {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ cadToken, callsign: currentCallsign, channel: currentChannel })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Live radio authorization failed.");
      currentAgency = data.agency;
      currentRole = data.role || "";
      const controller = currentRole === "staff" || currentAgency === "Staff Team";
      if ($("#cad-live-radio-priority")) $("#cad-live-radio-priority").hidden = !controller;
      if ($("#cad-live-radio-lock")) $("#cad-live-radio-lock").hidden = !controller;
      iceServers = Array.isArray(data.iceServers) ? data.iceServers : iceServers;
      const socketUrl = new URL(data.workerUrl.replace(/^http/, "ws") + "/radio");
      socketUrl.searchParams.set("room", currentChannel);
      socketUrl.searchParams.set("token", data.token);
      ws = new WebSocket(socketUrl);
      ws.addEventListener("open", () => {
        connected = true;
        status(`Connected · ${currentChannel}`, "connected");
        $("#cad-live-radio-connect").textContent = "Disconnect Live Voice";
        scheduleHeartbeat();
      });
      ws.addEventListener("message", (event) => { try { handleMessage(JSON.parse(event.data)); } catch {} });
      ws.addEventListener("close", () => {
        const reconnect = !manualDisconnect && Boolean(radioToken()) && Boolean(currentCallsign);
        cleanupSocket(reconnect ? "Reconnecting…" : "Disconnected");
        if (reconnect) scheduleReconnect();
      });
      ws.addEventListener("error", () => status("Radio connection error", "error"));
    } catch (error) {
      cleanupSocket("Not connected");
      window.alert(error.message);
      throw error;
    }
  }

  function send(payload) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  function scheduleHeartbeat() {
    clearTimeout(heartbeat);
    heartbeat = setTimeout(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        send({ type: "ping" });
        scheduleHeartbeat();
      }
    }, 15000);
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect().catch(() => scheduleReconnect()), 3500);
  }

  function updateControlState(message = {}) {
    channelLocked = Boolean(message.channelLocked);
    emergencyMode = Boolean(message.emergencyMode);
    const lock = $("#cad-live-radio-lock");
    if (lock) lock.textContent = channelLocked ? "Unlock Channel" : "Lock Channel";
    const label = message.lockReason || (emergencyMode ? "Emergency traffic only" : channelLocked ? "Channel locked" : "");
    if (label && !transmitting) setSpeaker(label);
    const control = $("#cad-live-radio-control");
    control?.classList.toggle("is-locked", channelLocked);
    control?.classList.toggle("is-emergency", emergencyMode);
  }

  async function createPeer(peerId, initiator = false) {
    if (!peerId || peerId === selfId || peers.has(peerId)) return peers.get(peerId);
    const pc = new RTCPeerConnection({ iceServers });
    peers.set(peerId, pc);
    if (localTrack && localStream) pc.addTrack(localTrack, localStream);
    if (localVideoTrack && localVideoStream) pc.addTrack(localVideoTrack, localVideoStream);
    else {
      const videoTransceiver = pc.addTransceiver("video", { direction: "recvonly" });
      if (videoTransceiver?.sender) videoTransceiver.sender._fsrpVideo = true;
    }
    pc.addEventListener("icecandidate", (event) => { if (event.candidate) send({ type: "ice", target: peerId, candidate: event.candidate }); });
    pc.addEventListener("track", (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      if (event.track.kind === "video") attachRemoteVideo(peerId, stream);
      else attachRemoteAudio(peerId, stream);
    });
    pc.addEventListener("connectionstatechange", () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) removePeer(peerId);
    });
    if (initiator) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      send({ type: "offer", target: peerId, sdp: pc.localDescription });
    }
    return pc;
  }

  function attachRemoteAudio(peerId, stream) {
    let audio = remoteAudio.get(peerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.radioPeer = peerId;
      audio.style.display = "none";
      document.body.appendChild(audio);
      remoteAudio.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.muted = deafen;
    audio.play().catch(() => {});
  }

  function removePeer(peerId) {
    peers.get(peerId)?.close();
    peers.delete(peerId);
    const audio = remoteAudio.get(peerId);
    if (audio) { audio.srcObject = null; audio.remove(); }
    remoteAudio.delete(peerId);
    const video = remoteVideo.get(peerId);
    if (video) { video.querySelector("video").srcObject = null; video.remove(); }
    remoteVideo.delete(peerId);
    peerMeta.delete(peerId);
    updateBodycamGrid();
    setPeers(peers.size + (connected ? 1 : 0));
  }

  async function handleMessage(message) {
    if (message.type === "welcome") {
      selfId = message.self.id;
      for (const peer of message.peers || []) { peerMeta.set(peer.id, peer); await createPeer(peer.id, true); }
      setPeers((message.peers?.length || 0) + 1);
      if (message.activeTransmitter) setSpeaker("Channel busy");
      return;
    }
    if (message.type === "peer-joined") { peerMeta.set(message.peer.id, message.peer); setPeers(peers.size + 2); return; }
    if (message.type === "peer-left") { removePeer(message.id); if (!message.activeTransmitter) setSpeaker(""); return; }
    if (message.type === "room-state") { setPeers(message.peers?.length || 0); updateControlState(message); return; }
    if (message.type === "offer") {
      const pc = await createPeer(message.from, false);
      await pc.setRemoteDescription(message.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "answer", target: message.from, sdp: pc.localDescription });
      return;
    }
    if (message.type === "answer") { const pc = peers.get(message.from); if (pc) await pc.setRemoteDescription(message.sdp); return; }
    if (message.type === "ice") { const pc = await createPeer(message.from, false); if (message.candidate) await pc.addIceCandidate(message.candidate).catch(() => {}); return; }
    if (message.type === "ptt-granted") {
      transmitting = true;
      if (localTrack) localTrack.enabled = true;
      tone(1080, 0.06);
      setSpeaker(`${currentCallsign} · TRANSMITTING`);
      pendingPTT?.resolve(true);
      pendingPTT = null;
      return;
    }
    if (message.type === "ptt-denied") {
      tone(240, 0.12);
      setSpeaker(message.reason || `${message.callsign || "Another unit"} has the channel`);
      pendingPTT?.resolve(false);
      pendingPTT = null;
      return;
    }
    if (message.type === "ptt-state") {
      if (!transmitting) setSpeaker(message.callsign ? `${message.callsign} · ${message.priority ? "PRIORITY RX" : "RECEIVING"}` : channelLocked ? "Channel locked" : "Channel clear");
      return;
    }
    if (message.type === "ptt-preempted") {
      if (localTrack) localTrack.enabled = false;
      transmitting = false;
      tone(210, 0.16);
      setSpeaker(`Preempted by ${message.callsign || "Staff Command"}`);
      pendingPTT?.resolve(false);
      pendingPTT = null;
      return;
    }
    if (message.type === "panic") {
      setSpeaker(message.active ? `PANIC · ${message.callsign}` : "Channel clear");
      if (message.active) [880, 660, 880].forEach((frequency, index) => setTimeout(() => tone(frequency, 0.14), index * 170));
      return;
    }
  }

  function requestPTT(priority = false) {
    if (!connected || ws?.readyState !== WebSocket.OPEN) return Promise.resolve(true);
    if (transmitting) return Promise.resolve(true);
    if (pendingPTT) return pendingPTT.promise;
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    pendingPTT = { promise, resolve };
    send({ type: "ptt-request", priority });
    setTimeout(() => { if (pendingPTT) { pendingPTT.resolve(false); pendingPTT = null; } }, 1800);
    return promise;
  }

  function requestPriorityPTT() {
    return requestPTT(true);
  }

  function releasePTT() {
    if (localTrack) localTrack.enabled = false;
    if (transmitting) tone(520, 0.08);
    transmitting = false;
    send({ type: "ptt-release" });
    setSpeaker("");
  }

  async function changeChannel(channel) {
    const next = String(channel || "").trim().toUpperCase();
    if (!connected || next === currentChannel) return;
    disconnect();
    currentChannel = next;
    manualDisconnect = false;
    await connect();
  }

  function cleanupSocket(label) {
    clearTimeout(heartbeat);
    clearTimeout(reconnectTimer);
    heartbeat = null;
    reconnectTimer = null;
    connected = false;
    transmitting = false;
    if (localTrack) localTrack.enabled = false;
    ws = null;
    selfId = "";
    for (const id of [...peers.keys()]) removePeer(id);
    setPeers(0);
    setSpeaker("");
    status(label, "idle");
    const button = $("#cad-live-radio-connect");
    if (button) button.textContent = "Connect Live Voice";
  }

  function disconnect() {
    manualDisconnect = true;
    stopBodycam();
    try { send({ type: "ptt-release" }); ws?.close(1000, "Client disconnect"); } catch {}
    cleanupSocket("Disconnected");
  }

  function panic(active = true) { if (connected) send({ type: "panic", active }); }

  function openOverlay() {
    if (overlayWindow && !overlayWindow.closed) return overlayWindow.focus();
    overlayWindow = window.open("", "FSRPLiveRadio", "width=420,height=560,resizable=yes");
    if (!overlayWindow) return window.alert("Allow pop-ups to open the FSRP radio overlay.");
    overlayWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>FSRP Live Radio</title><style>body{margin:0;background:#03070d;color:#fff;font-family:Arial,sans-serif}main{min-height:100vh;padding:18px;box-sizing:border-box;background:radial-gradient(circle at 80% 0,rgba(61,190,255,.22),transparent 42%),#050a11}.eyebrow{color:#65d3ff;font-size:10px;font-weight:900;letter-spacing:.14em}.screen{margin:18px 0;padding:20px;border:1px solid rgba(81,255,165,.25);border-radius:16px;background:#04150d;color:#8affba}.screen strong{display:block;font-size:24px;margin-top:8px}.ptt{width:190px;height:190px;border:10px solid #17283a;border-radius:50%;display:grid;place-content:center;margin:24px auto;background:radial-gradient(circle,#2dafe9,#0a4774);color:#fff;font-size:34px;font-weight:1000;user-select:none}.ptt:active{background:radial-gradient(circle,#ff7180,#86172a)}button{border:1px solid #33465c;background:#0b1724;color:#fff;border-radius:10px;padding:10px 14px}.row{display:flex;gap:8px;justify-content:center}</style></head><body><main><div class="eyebrow">FSRP EXTERNAL COMPANION</div><h2>${currentChannel || "Live Radio"}</h2><div class="screen"><span id="status">${connected ? "CONNECTED" : "OFFLINE"}</span><strong id="speaker">Channel clear</strong><small id="peers">${peers.size + (connected ? 1 : 0)} live units</small></div><div class="ptt" id="ptt">PTT</div><div class="row"><button id="connect">${connected ? "Disconnect" : "Connect"}</button><button id="close">Close</button></div></main><script>const ptt=document.getElementById('ptt');ptt.onpointerdown=e=>{e.preventDefault();opener.FSRP_LIVE_RADIO.requestPTT()};['pointerup','pointercancel','pointerleave'].forEach(n=>ptt.addEventListener(n,()=>opener.FSRP_LIVE_RADIO.releasePTT()));document.getElementById('connect').onclick=()=>opener.FSRP_LIVE_RADIO.isConnected()?opener.FSRP_LIVE_RADIO.disconnect():opener.FSRP_LIVE_RADIO.connect();document.getElementById('close').onclick=()=>close();</script></body></html>`);
    overlayWindow.document.close();
  }

  function broadcastOverlay() {
    if (!overlayWindow || overlayWindow.closed) return;
    try {
      overlayWindow.document.getElementById("status").textContent = connected ? (transmitting ? "TRANSMITTING" : "CONNECTED") : "OFFLINE";
      overlayWindow.document.getElementById("speaker").textContent = $("#cad-live-radio-speaker")?.textContent || "Channel clear";
      overlayWindow.document.getElementById("peers").textContent = `${peers.size + (connected ? 1 : 0)} live units`;
      overlayWindow.document.getElementById("connect").textContent = connected ? "Disconnect" : "Connect";
    } catch {}
  }

  window.FSRP_LIVE_RADIO = {
    connect,
    disconnect,
    requestPTT,
    requestPriorityPTT,
    releasePTT,
    control: (command, reason = "") => send({ type: "control", command, reason }),
    changeChannel,
    panic,
    isConnected: () => connected,
    openOverlay
  };

  document.addEventListener("DOMContentLoaded", injectUI);
  document.addEventListener("fsrp:route", (event) => { if (event.detail === "cad") injectUI(); });
  window.addEventListener("beforeunload", () => { disconnect(); localStream?.getTracks().forEach((track) => track.stop()); });
})();
