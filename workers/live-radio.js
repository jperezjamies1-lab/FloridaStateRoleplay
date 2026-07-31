const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_CLIENTS_PER_TALKGROUP = 16;
const MAX_MESSAGE_BYTES = 64 * 1024;
const STATE_KEY = "room-control";

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function cleanRoom(value) {
  return normalize(value).toUpperCase().replace(/[^A-Z0-9 _-]/g, "").slice(0, 80);
}

function base64UrlToBytes(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(normalized + padding), (character) => character.charCodeAt(0));
}

async function importKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
}

async function verifyToken(token, secret) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const valid = await crypto.subtle.verify("HMAC", await importKey(secret), base64UrlToBytes(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
    if (!data?.sub || !data?.role || !data?.agency || !data?.callsign || Number(data.exp) <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function responseJson(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
  });
}

function websocketResponse(socket) {
  return new Response(null, { status: 101, webSocket: socket });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return responseJson({ ok: true, service: "FSRP Live Radio", version: "2.0.0", transport: "WebRTC mesh + Durable Object signaling" });
    }
    if (url.pathname !== "/radio") return responseJson({ error: "Not found." }, 404);
    const allowedOrigins = normalize(env.RADIO_ALLOWED_ORIGINS).split(",").map((item) => item.trim()).filter(Boolean);
    const origin = normalize(request.headers.get("Origin"));
    if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) return responseJson({ error: "Radio origin is not allowed." }, 403);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return responseJson({ error: "WebSocket upgrade required." }, 426);

    const room = cleanRoom(url.searchParams.get("room"));
    if (!room) return responseJson({ error: "Talkgroup is required." }, 400);
    const id = env.RADIO_ROOM.idFromName(room);
    return env.RADIO_ROOM.get(id).fetch(request);
  }
};

export class RadioRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.activeTransmitter = null;
    this.channelLocked = false;
    this.lockReason = "";
    this.emergencyMode = false;
    this.ready = state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get(STATE_KEY);
      if (saved && typeof saved === "object") {
        this.activeTransmitter = null;
        this.channelLocked = Boolean(saved.channelLocked);
        this.lockReason = normalize(saved.lockReason).slice(0, 180);
        this.emergencyMode = Boolean(saved.emergencyMode);
      }
    });
  }

  async persistControl() {
    await this.state.storage.put(STATE_KEY, {
      channelLocked: this.channelLocked,
      lockReason: this.lockReason,
      emergencyMode: this.emergencyMode,
      updatedAt: Date.now()
    });
  }

  members() {
    return this.state.getWebSockets().map((socket) => ({ socket, attachment: socket.deserializeAttachment() || {} }));
  }

  send(socket, payload) {
    try { socket.send(JSON.stringify(payload)); } catch {}
  }

  broadcast(payload, exceptId = "") {
    const encoded = JSON.stringify(payload);
    for (const { socket, attachment } of this.members()) {
      if (attachment.id === exceptId) continue;
      try { socket.send(encoded); } catch {}
    }
  }

  roomState() {
    const peers = this.members().map(({ attachment }) => ({
      id: attachment.id,
      callsign: attachment.callsign,
      agency: attachment.agency,
      role: attachment.role,
      joinedAt: attachment.joinedAt,
      transmitting: attachment.id === this.activeTransmitter
    }));
    return {
      peers,
      activeTransmitter: this.activeTransmitter,
      channelLocked: this.channelLocked,
      lockReason: this.lockReason,
      emergencyMode: this.emergencyMode
    };
  }

  findById(id) {
    return this.members().find(({ attachment }) => attachment.id === id) || null;
  }

  isController(attachment) {
    return attachment.role === "staff" || attachment.agency === "Staff Team";
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const room = cleanRoom(url.searchParams.get("room"));
    const token = url.searchParams.get("token");
    const user = await verifyToken(token, normalize(this.env.RADIO_SESSION_SECRET));
    if (!user) return responseJson({ error: "Invalid or expired radio token." }, 401);
    if (!Array.isArray(user.channels) || !user.channels.includes(room) || user.channel !== room) return responseJson({ error: "Talkgroup access denied." }, 403);
    if (this.state.getWebSockets().length >= MAX_CLIENTS_PER_TALKGROUP) return responseJson({ error: "This talkgroup is full." }, 429);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment = {
      id: crypto.randomUUID(),
      subject: user.sub,
      role: user.role,
      agency: user.agency,
      callsign: user.callsign,
      room,
      joinedAt: Date.now(),
      lastMessageAt: 0
    };
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server);

    const existingPeers = this.members()
      .filter(({ attachment: item }) => item.id !== attachment.id)
      .map(({ attachment: item }) => ({ id: item.id, callsign: item.callsign, agency: item.agency, role: item.role }));
    this.send(server, { type: "welcome", self: attachment, peers: existingPeers, ...this.roomState() });
    this.broadcast({ type: "peer-joined", peer: { id: attachment.id, callsign: attachment.callsign, agency: attachment.agency, role: attachment.role } }, attachment.id);
    this.broadcast({ type: "room-state", ...this.roomState() });
    return websocketResponse(client);
  }

  async webSocketMessage(socket, rawMessage) {
    await this.ready;
    const attachment = socket.deserializeAttachment() || {};
    const size = typeof rawMessage === "string" ? rawMessage.length : rawMessage.byteLength;
    if (size > MAX_MESSAGE_BYTES) return this.send(socket, { type: "error", message: "Radio message was too large." });

    let message;
    try { message = JSON.parse(typeof rawMessage === "string" ? rawMessage : decoder.decode(rawMessage)); }
    catch { return this.send(socket, { type: "error", message: "Invalid radio message." }); }

    const now = Date.now();
    if (now - Number(attachment.lastMessageAt || 0) < 10 && !["ice", "offer", "answer"].includes(message.type)) return;
    attachment.lastMessageAt = now;
    socket.serializeAttachment(attachment);

    if (["offer", "answer", "ice"].includes(message.type)) {
      const target = this.findById(normalize(message.target));
      if (!target) return;
      return this.send(target.socket, { type: message.type, from: attachment.id, sdp: message.sdp, candidate: message.candidate });
    }

    if (message.type === "ptt-request") {
      const priority = Boolean(message.priority) && this.isController(attachment);
      if (this.channelLocked && !this.isController(attachment)) {
        return this.send(socket, { type: "ptt-denied", reason: this.lockReason || "Channel locked by dispatch", callsign: "DISPATCH" });
      }
      if (priority && this.activeTransmitter && this.activeTransmitter !== attachment.id) {
        const previous = this.findById(this.activeTransmitter);
        if (previous) this.send(previous.socket, { type: "ptt-preempted", callsign: attachment.callsign });
        this.activeTransmitter = null;
      }
      if (!this.activeTransmitter || this.activeTransmitter === attachment.id) {
        this.activeTransmitter = attachment.id;
        this.send(socket, { type: "ptt-granted", transmitter: attachment.id, priority });
        this.broadcast({ type: "ptt-state", activeTransmitter: attachment.id, callsign: attachment.callsign, agency: attachment.agency, priority });
      } else {
        const current = this.findById(this.activeTransmitter)?.attachment;
        this.send(socket, { type: "ptt-denied", activeTransmitter: this.activeTransmitter, callsign: current?.callsign || "Another unit", reason: "Channel busy" });
      }
      return;
    }

    if (message.type === "ptt-release" && this.activeTransmitter === attachment.id) {
      this.activeTransmitter = null;
      this.broadcast({ type: "ptt-state", activeTransmitter: null, callsign: "", agency: "" });
      return;
    }

    if (message.type === "control") {
      if (!this.isController(attachment)) return this.send(socket, { type: "error", message: "Staff Command access is required." });
      const command = normalize(message.command).toLowerCase();
      if (command === "lock") {
        this.channelLocked = true;
        this.lockReason = normalize(message.reason || "Priority traffic only").slice(0, 180);
      } else if (command === "unlock") {
        this.channelLocked = false;
        this.lockReason = "";
      } else if (command === "emergency-on") {
        this.emergencyMode = true;
        this.channelLocked = true;
        this.lockReason = normalize(message.reason || "Emergency traffic only").slice(0, 180);
      } else if (command === "emergency-off") {
        this.emergencyMode = false;
        this.channelLocked = false;
        this.lockReason = "";
      } else if (command === "release") {
        const current = this.findById(this.activeTransmitter);
        if (current) this.send(current.socket, { type: "ptt-preempted", callsign: attachment.callsign });
        this.activeTransmitter = null;
      } else return this.send(socket, { type: "error", message: "Unknown radio control command." });
      await this.persistControl();
      this.broadcast({ type: "room-state", ...this.roomState(), controlledBy: attachment.callsign });
      return;
    }

    if (message.type === "panic") {
      this.broadcast({ type: "panic", from: attachment.id, callsign: attachment.callsign, agency: attachment.agency, active: Boolean(message.active), createdAt: Date.now() });
      return;
    }

    if (message.type === "text") {
      const text = normalize(message.text).slice(0, 500);
      if (text) this.broadcast({ type: "text", from: attachment.id, callsign: attachment.callsign, agency: attachment.agency, text, createdAt: Date.now() });
      return;
    }

    if (message.type === "ping") this.send(socket, { type: "pong", at: Date.now() });
  }

  async webSocketClose(socket) {
    await this.ready;
    const attachment = socket.deserializeAttachment() || {};
    if (this.activeTransmitter === attachment.id) this.activeTransmitter = null;
    this.broadcast({ type: "peer-left", id: attachment.id, activeTransmitter: this.activeTransmitter });
    this.broadcast({ type: "room-state", ...this.roomState() });
  }

  async webSocketError(socket) {
    return this.webSocketClose(socket);
  }
}
