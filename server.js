'use strict';

const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const ERLC_API_BASE = String(process.env.ERLC_API_BASE || 'https://api.erlc.gg').replace(/\/$/, '');
const ERLC_SERVER_TOKEN = String(process.env.ERLC_SERVER_TOKEN || '').trim();
const ERLC_API_KEY = String(process.env.ERLC_API_KEY || '').trim();
const DASHBOARD_TOKEN = String(process.env.DASHBOARD_TOKEN || '').trim();
const POLL_INTERVAL_MS = Math.max(7000, Number(process.env.POLL_INTERVAL_MS || 10000));
const MAX_HISTORY = 300;
const WEBHOOK_PUBLIC_KEY_BASE64 = String(
  process.env.ERLC_WEBHOOK_PUBLIC_KEY ||
  'MCowBQYDK2VwAyEAjSICb9pp0kHizGQtdG8ySWsDChfGqi+gyFCttigBNOA='
).trim();

if (!ERLC_SERVER_TOKEN) console.warn('[FSRP] ERLC_SERVER_TOKEN is missing. Polling and game messages are disabled.');
if (!DASHBOARD_TOKEN) console.warn('[FSRP] DASHBOARD_TOKEN is missing. Dashboard sign-in will be disabled for safety.');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  serveClient: true,
  cors: { origin: false },
  maxHttpBufferSize: 200_000,
  pingTimeout: 20_000,
  pingInterval: 25_000
});

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const logs = [];
const seen = new Set();
let latestStatus = {
  connected: false,
  serverName: 'ER:LC server',
  currentPlayers: 0,
  maxPlayers: 0,
  queue: 0,
  lastUpdate: null,
  error: ERLC_SERVER_TOKEN ? null : 'ERLC_SERVER_TOKEN is missing.'
};
let lastCommandAt = 0;
let polling = false;
const recentWebhookSignatures = new Map();

function clean(value, max = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function authorizedToken(value) {
  return Boolean(DASHBOARD_TOKEN && safeEqual(clean(value, 500), DASHBOARD_TOKEN));
}

function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function requireDashboard(req, res, next) {
  if (!DASHBOARD_TOKEN) return res.status(503).json({ error: 'DASHBOARD_TOKEN is not configured on the server.' });
  if (!authorizedToken(bearer(req))) return res.status(401).json({ error: 'Invalid dashboard token.' });
  next();
}

function idFor(type, payload) {
  return crypto.createHash('sha256').update(`${type}:${JSON.stringify(payload)}`).digest('hex').slice(0, 24);
}

function pushLog(entry, broadcast = true) {
  const item = {
    id: entry.id || crypto.randomUUID(),
    type: clean(entry.type || 'event', 40),
    title: clean(entry.title || 'ER:LC Event', 120),
    message: clean(entry.message || '', 1000),
    player: clean(entry.player || '', 120),
    timestamp: Number(entry.timestamp || Date.now()),
    source: clean(entry.source || 'api', 30),
    severity: ['info', 'success', 'warning', 'danger'].includes(entry.severity) ? entry.severity : 'info'
  };
  if (seen.has(item.id)) return;
  seen.add(item.id);
  logs.unshift(item);
  if (logs.length > MAX_HISTORY) logs.length = MAX_HISTORY;
  if (seen.size > 2000) {
    const keep = new Set(logs.map((log) => log.id));
    for (const key of seen) if (!keep.has(key)) seen.delete(key);
  }
  if (broadcast) io.emit('log:new', item);
}

function apiHeaders() {
  const headers = { 'server-key': ERLC_SERVER_TOKEN, accept: 'application/json' };
  if (ERLC_API_KEY) headers.Authorization = ERLC_API_KEY;
  return headers;
}

async function erlcFetch(route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`${ERLC_API_BASE}${route}`, {
      ...options,
      headers: { ...apiHeaders(), ...(options.headers || {}) },
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `ER:LC API returned ${response.status}`);
      error.status = response.status;
      error.data = data;
      error.retryAfter = Number(data?.retry_after || response.headers.get('retry-after') || 0);
      throw error;
    }
    return { data, headers: response.headers };
  } finally {
    clearTimeout(timeout);
  }
}

function playerName(value) {
  const text = clean(value, 160);
  const index = text.lastIndexOf(':');
  return index > 0 ? text.slice(0, index) : text;
}

function addSnapshotLogs(data, initial = false) {
  const now = Date.now();
  for (const event of Array.isArray(data.JoinLogs) ? data.JoinLogs : []) {
    const entry = {
      type: event.Join ? 'player-join' : 'player-leave',
      title: event.Join ? 'Player Joined' : 'Player Left',
      message: `${playerName(event.Player)} ${event.Join ? 'joined' : 'left'} the private server.`,
      player: playerName(event.Player),
      timestamp: Number(event.Timestamp || now / 1000) * 1000,
      source: 'api',
      severity: event.Join ? 'success' : 'info'
    };
    entry.id = idFor(entry.type, event);
    pushLog(entry, !initial);
  }
  for (const event of Array.isArray(data.CommandLogs) ? data.CommandLogs : []) {
    const entry = {
      type: 'command', title: 'In-Game Command',
      message: clean(event.Command, 800), player: playerName(event.Player),
      timestamp: Number(event.Timestamp || now / 1000) * 1000,
      source: 'api', severity: 'warning'
    };
    entry.id = idFor(entry.type, event);
    pushLog(entry, !initial);
  }
  for (const event of Array.isArray(data.ModCalls) ? data.ModCalls : []) {
    const entry = {
      type: 'mod-call', title: 'Moderator Call',
      message: `${playerName(event.Caller)} requested staff assistance${event.Moderator ? ` · Claimed by ${playerName(event.Moderator)}` : ''}.`,
      player: playerName(event.Caller), timestamp: Number(event.Timestamp || now / 1000) * 1000,
      source: 'api', severity: 'warning'
    };
    entry.id = idFor(entry.type, event);
    pushLog(entry, !initial);
  }
  for (const event of Array.isArray(data.EmergencyCalls) ? data.EmergencyCalls : []) {
    const entry = {
      type: '911-call', title: `Emergency Call #${event.CallNumber ?? '—'}`,
      message: clean(`${event.Description || 'Emergency call'} · ${event.PositionDescriptor || 'Location unavailable'}`, 900),
      player: clean(event.Caller, 120), timestamp: Number(event.StartedAt || now / 1000) * 1000,
      source: 'api', severity: 'danger'
    };
    entry.id = idFor(entry.type, event);
    pushLog(entry, !initial);
  }
}

async function pollServer(initial = false) {
  if (!ERLC_SERVER_TOKEN || polling) return;
  polling = true;
  try {
    const query = '?Players=true&JoinLogs=true&Queue=true&CommandLogs=true&ModCalls=true&EmergencyCalls=true';
    const { data } = await erlcFetch(`/v2/server${query}`);
    latestStatus = {
      connected: true,
      serverName: clean(data.Name || 'ER:LC Server', 120),
      currentPlayers: Number(data.CurrentPlayers || 0),
      maxPlayers: Number(data.MaxPlayers || 0),
      queue: Array.isArray(data.Queue) ? data.Queue.length : Number(data.Queue || 0),
      joinKey: clean(data.JoinKey || '', 80),
      players: Array.isArray(data.Players) ? data.Players.map((player) => ({
        name: playerName(player.Player),
        callsign: clean(player.Callsign || 'CIV', 40),
        team: clean(player.Team || 'Civilian', 80),
        permission: clean(player.Permission || 'Normal', 80),
        location: player.Location ? clean(`${player.Location.StreetName || ''} ${player.Location.PostalCode || ''}`, 120) : ''
      })) : [],
      lastUpdate: Date.now(), error: null
    };
    addSnapshotLogs(data, initial);
    io.emit('server:status', latestStatus);
  } catch (error) {
    latestStatus = { ...latestStatus, connected: false, lastUpdate: Date.now(), error: clean(error.message, 300) };
    io.emit('server:status', latestStatus);
    if (error.status === 429 && error.retryAfter) {
      console.warn(`[FSRP] ER:LC rate limited; retry after ${error.retryAfter}s.`);
    } else {
      console.warn('[FSRP] Poll failed:', error.message);
    }
  } finally {
    polling = false;
  }
}

function webhookPublicKey() {
  return crypto.createPublicKey({ key: Buffer.from(WEBHOOK_PUBLIC_KEY_BASE64, 'base64'), format: 'der', type: 'spki' });
}

function verifyWebhook(req) {
  const signatureHex = String(req.headers['x-signature-ed25519'] || '');
  const timestamp = String(req.headers['x-signature-timestamp'] || '');
  if (!/^[a-f0-9]+$/i.test(signatureHex) || !timestamp || !Buffer.isBuffer(req.body)) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  const timestampMs = timestampNumber > 10_000_000_000 ? timestampNumber : timestampNumber * 1000;
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
  const replayKey = `${timestamp}:${signatureHex}`;
  if (recentWebhookSignatures.has(replayKey)) return false;
  const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), req.body]);
  const valid = crypto.verify(null, message, webhookPublicKey(), Buffer.from(signatureHex, 'hex'));
  if (valid) {
    recentWebhookSignatures.set(replayKey, Date.now());
    for (const [key, time] of recentWebhookSignatures) if (Date.now() - time > 10 * 60 * 1000) recentWebhookSignatures.delete(key);
  }
  return valid;
}

function webhookToLog(payload) {
  const typeRaw = clean(payload.EventType || payload.event || payload.Type || payload.type || payload.Event || 'webhook', 80);
  const data = payload.Data && typeof payload.Data === 'object' ? payload.Data : payload;
  const command = clean(data.Command || data.command || data.Message || data.message || '', 900);
  const caller = playerName(data.Player || data.player || data.Caller || data.caller || '');
  const emergency = /emergency|911/i.test(typeRaw) || data.CallNumber != null || data.Description != null;
  return {
    id: idFor(typeRaw, payload),
    type: emergency ? '911-call' : command.startsWith(';') ? 'channel-command' : 'webhook',
    title: emergency ? `Emergency Call #${data.CallNumber ?? '—'}` : command.startsWith(';') ? 'Channel Command' : typeRaw,
    message: emergency
      ? clean(`${data.Description || 'Emergency call'} · ${data.PositionDescriptor || data.Location || 'Location unavailable'}`, 900)
      : command || clean(JSON.stringify(data), 900),
    player: caller,
    timestamp: Date.now(), source: 'webhook', severity: emergency ? 'danger' : 'info'
  };
}

app.post('/webhooks/erlc', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
  if (!verifyWebhook(req)) return res.status(401).json({ error: 'Invalid ER:LC webhook signature.' });
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); }
  catch { return res.status(400).json({ error: 'Invalid JSON.' }); }
  pushLog(webhookToLog(payload));
  res.status(204).end();
});

app.use(express.json({ limit: '64kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_req, res) => res.json({ ok: true, erlcConfigured: Boolean(ERLC_SERVER_TOKEN), dashboardProtected: Boolean(DASHBOARD_TOKEN), connected: latestStatus.connected }));
app.get('/api/bootstrap', requireDashboard, (_req, res) => res.json({ ok: true, status: latestStatus, logs: logs.slice(0, 150) }));

app.post('/api/send', requireDashboard, async (req, res) => {
  if (!ERLC_SERVER_TOKEN) return res.status(503).json({ error: 'ERLC_SERVER_TOKEN is not configured.' });
  const mode = req.body?.mode === ':m' ? ':m' : ':h';
  const message = clean(req.body?.message, 180);
  if (!message) return res.status(400).json({ error: 'Enter a message.' });
  const remaining = 5200 - (Date.now() - lastCommandAt);
  if (remaining > 0) return res.status(429).json({ error: 'Wait before sending another ER:LC command.', retryAfterMs: remaining });
  lastCommandAt = Date.now();
  try {
    await erlcFetch('/v1/server/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: `${mode} ${message}` })
    });
    pushLog({ type: 'dispatch-message', title: mode === ':h' ? 'Global Header Sent' : 'Global Message Sent', message, player: 'Dispatch', source: 'dashboard', severity: 'success' });
    res.json({ ok: true, command: mode, message });
  } catch (error) {
    res.status(error.status || 502).json({ error: clean(error.message, 300), retryAfter: error.retryAfter || 0, details: error.data || null });
  }
});

io.use((socket, next) => {
  if (!DASHBOARD_TOKEN) return next(new Error('Dashboard token is not configured.'));
  if (!authorizedToken(socket.handshake.auth?.token)) return next(new Error('Unauthorized.'));
  next();
});

io.on('connection', (socket) => {
  socket.emit('bootstrap', { status: latestStatus, logs: logs.slice(0, 150) });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '5m' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, () => {
  console.log(`[FSRP] Dispatch Bridge listening on port ${PORT}`);
  pollServer(true).catch(console.error);
  setInterval(() => pollServer(false).catch(console.error), POLL_INTERVAL_MS).unref();
});
