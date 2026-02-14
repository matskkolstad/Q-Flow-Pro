import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import net from 'net';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import helmet from 'helmet';
import { loadState as loadStateFromStore, saveState as saveStateToStore, backupDatabase, listBackups } from './lib/stateStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALLOWED_ORIGINS = (() => {
  const env = process.env.ALLOWED_ORIGINS;
  if (!env) return ['http://localhost:5173', 'http://localhost:3000'];
  return env.split(',').map(o => o.trim()).filter(Boolean);
})();
const ENABLE_CSP = process.env.ENABLE_CSP === '1';
const ALLOWED_WS_ORIGINS = ALLOWED_ORIGINS.map((o) => o.replace(/^http/, 'ws'));

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Security headers (CSP can be toggled via ENABLE_CSP=1 once assets are compatible)
app.use(helmet({
  contentSecurityPolicy: ENABLE_CSP ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS, ...ALLOWED_WS_ORIGINS],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
    }
  } : false,
  crossOriginEmbedderPolicy: false,
}));

io.engine.on('connection_error', (err) => {
  addLog(`Socket handshake feilet: ${err?.code || err?.message || 'ukjent'} (${err?.context || ''})`, 'ALERT');
});

// Database file path
const saveState = () => saveStateToStore(state);

// Initial State defaults
const DEFAULT_STATE = {
  services: [
    { id: 's1', name: 'Kundeservice', prefix: 'K', color: 'bg-blue-600', estimatedTimePerPersonMinutes: 5, isOpen: true, priority: 1 },
    { id: 's2', name: 'Teknisk Support', prefix: 'T', color: 'bg-purple-600', estimatedTimePerPersonMinutes: 15, isOpen: true, priority: 1 },
    { id: 's3', name: 'Levering & Retur', prefix: 'L', color: 'bg-emerald-600', estimatedTimePerPersonMinutes: 3, isOpen: true, priority: 1 },
  ],
  counters: [
    { id: 'c1', name: 'Skranke 1', activeServiceIds: ['s1', 's3'], isOnline: true },
    { id: 'c2', name: 'Skranke 2', activeServiceIds: ['s1', 's2', 's3'], isOnline: true },
    { id: 'c3', name: 'VIP Skranke', activeServiceIds: ['s2'], isOnline: false },
  ],
  isClosed: false,
  users: [
    { id: 'u1', name: 'Admin Bruker', username: 'admin', role: 'ADMIN', passwordHash: '' },
    { id: 'u2', name: 'Operatør Kari', username: 'operator', role: 'OPERATOR', passwordHash: '' },
  ],
  tickets: [],
  printers: [],
  kiosks: [],
  kioskPrinterAssignments: {},
  counterDisplays: [],
  soundSettings: {
    kioskEffects: true,
    adminEffects: true,
    callChime: true,
    callVoice: true
  },
  branding: {
    brandText: 'Q-Flow Pro',
    brandLogoUrl: ''
  },
  kioskExitPin: '1234',
  logs: [],
  publicMessage: ""
};

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;
const LOG_LIMIT = 500;
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_REQUIREMENTS = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).+$/;
const LOG_DIR = join(__dirname, 'data', 'logs');
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || 14);
const BACKUP_DIR = join(__dirname, 'data', 'backups');
const BACKUP_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const SLOW_REQUEST_MS = 1200;
const WAITING_ALERT_THRESHOLD = 50;
const WAITING_ALERT_INTERVAL_MS = 5 * 60 * 1000;
let lastQueueAlertAt = 0;
const isSha256 = (hash = '') => /^[a-f0-9]{64}$/i.test(hash);
const hashPassword = (pw = '') => bcrypt.hashSync(pw, BCRYPT_ROUNDS);
const verifyPassword = (pw = '', stored = '') => {
  if (!stored) return false;
  if (stored.startsWith('$2')) return bcrypt.compareSync(pw, stored);
  if (isSha256(stored)) {
    const sha = crypto.createHash('sha256').update(pw).digest('hex');
    return sha === stored;
  }
  const fallback = crypto.createHash('sha256').update(pw).digest('hex');
  return fallback === stored;
};

const passwordPolicy = (pw = '') => {
  if (!pw || pw.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'password_too_short' };
  if (!PASSWORD_REQUIREMENTS.test(pw)) return { ok: false, error: 'password_needs_upper_lower_digit' };
  return { ok: true };
};

const cleanText = (val = '', max = 80) => {
  if (typeof val !== 'string') return '';
  return val.replace(/\s+/g, ' ').trim().slice(0, max);
};

const loginAttempts = new Map(); // ip -> timestamps
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const registerLoginAttempt = (ip) => {
  const now = Date.now();
  const list = loginAttempts.get(ip) || [];
  const recent = list.filter((t) => now - t < LOGIN_WINDOW_MS);
  recent.push(now);
  loginAttempts.set(ip, recent);
  return recent.length;
};
const isLoginBlocked = (ip) => {
  const now = Date.now();
  const list = loginAttempts.get(ip) || [];
  const recent = list.filter((t) => now - t < LOGIN_WINDOW_MS);
  loginAttempts.set(ip, recent);
  return recent.length >= MAX_LOGIN_ATTEMPTS;
};

// Load state from SQLite (migrates legacy db.json if present)
let state = loadStateFromStore(DEFAULT_STATE);
state = { ...DEFAULT_STATE, ...state };
saveState();

// Ensure kiosk printer assignments survive restarts by seeding map from kiosks
if (!state.kioskPrinterAssignments) {
  state.kioskPrinterAssignments = {};
}
if (!state.counterDisplays) {
  state.counterDisplays = [];
}
if (state.isClosed === undefined) {
  state.isClosed = false;
}
if (!state.branding) {
  state.branding = { brandText: 'Q-Flow Pro', brandLogoUrl: '' };
}
if (!Object.prototype.hasOwnProperty.call(state, 'kioskExitPin')) {
  state.kioskExitPin = '1234';
}

if (!state.sessions) state.sessions = {};

// Drop expired sessions on boot
Object.entries(state.sessions).forEach(([token, sess]) => {
  if (sess.expiresAt && sess.expiresAt < Date.now()) {
    delete state.sessions[token];
  }
});

// Ensure users have username and passwordHash (rehash legacy sha256 with bcrypt on startup)
state.users = (state.users || []).map((u, idx) => {
  const username = u.username || `user${idx + 1}`;
  let passwordHash = u.passwordHash;
  if (!passwordHash || passwordHash.length === 0) {
    passwordHash = hashPassword(u.pinCode || username);
  } else if (!passwordHash.startsWith('$2') && isSha256(passwordHash)) {
    // Keep sha256 for now; will upgrade on successful login
  }
  return { ...u, username, passwordHash };
});
const getSession = (token) => {
  if (!token || !state.sessions) return null;
  const session = state.sessions[token];
  if (!session) return null;
  if (session.expiresAt && session.expiresAt < Date.now()) {
    delete state.sessions[token];
    saveState();
    return null;
  }
  const user = (state.users || []).find(u => u.id === session.userId);
  if (!user) return null;
  return { user, token, role: user.role };
};

const createSession = (userId) => {
  const token = crypto.randomBytes(16).toString('hex');
  state.sessions[token] = { userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  saveState();
  return token;
};

const requireRole = (socket, roles = []) => {
  if (socket.data?.token) {
    const session = getSession(socket.data.token);
    if (!session) {
      socket.data.authRole = 'PUBLIC';
    } else {
      socket.data.authRole = session.role;
      socket.data.userId = session.user.id;
    }
  }
  if (roles.includes(socket.data.authRole)) return true;
  socket.emit('action-denied', { error: 'unauthorized' });
  return false;
};
state.kiosks.forEach(k => {
  if (k.assignedPrinterId && !state.kioskPrinterAssignments[k.id]) {
    state.kioskPrinterAssignments[k.id] = k.assignedPrinterId;
  }
});

// Persist any newly added default keys (like kioskPrinterAssignments) immediately
saveState();

// Remove kiosker that have been offline for a while to keep the list tidy
const KIOSK_STALE_MS = 180_000; // 3 minute inactivity window
const DISPLAY_STALE_MS = 180_000;
const PRINTER_CHECK_MS = 30_000; // health-check interval
const PRINTER_TIMEOUT_MS = 2000;
setInterval(() => {
  const cutoff = Date.now() - KIOSK_STALE_MS;
  const stale = state.kiosks.filter(k => k.lastSeen < cutoff);
  if (stale.length === 0) return;
  const before = state.kiosks.length;
  const oldest = Math.min(...stale.map(k => k.lastSeen || 0));
  const ageMs = Date.now() - oldest;
  state.kiosks = state.kiosks.filter(k => k.lastSeen >= cutoff);
  addLog(`Fjernet ${stale.length} inaktive kiosker etter inaktivitet (før:${before} nå:${state.kiosks.length}, cutoff ${KIOSK_STALE_MS}ms, eldste ${ageMs}ms)`, 'INFO');
  saveState();
  io.emit('state-update', state);
}, 15_000);

setInterval(() => {
  const cutoff = Date.now() - DISPLAY_STALE_MS;
  const stale = state.counterDisplays.filter(d => d.lastSeen < cutoff);
  if (stale.length === 0) return;
  const before = state.counterDisplays.length;
  const oldest = Math.min(...stale.map(d => d.lastSeen || 0));
  const ageMs = Date.now() - oldest;
  state.counterDisplays = state.counterDisplays.filter(d => d.lastSeen >= cutoff);
  addLog(`Fjernet ${stale.length} inaktive skrankeskjermer etter inaktivitet (før:${before} nå:${state.counterDisplays.length}, cutoff ${DISPLAY_STALE_MS}ms, eldste ${ageMs}ms)`, 'INFO');
  saveState();
  io.emit('state-update', state);
}, 15_000);

// Lightweight printer reachability check
const checkPrinter = (ip, port) => new Promise((resolve) => {
  const sock = new net.Socket();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    sock.destroy();
    resolve(ok);
  };
  sock.setTimeout(PRINTER_TIMEOUT_MS);
  sock.once('error', () => finish(false));
  sock.once('timeout', () => finish(false));
  sock.connect(port, ip, () => finish(true));
});

setInterval(async () => {
  const started = Date.now();
  if (!state.printers || state.printers.length === 0) return;
  let changed = false;
  for (let i = 0; i < state.printers.length; i++) {
    const p = state.printers[i];
    const ok = await checkPrinter(p.ipAddress, p.port || 9100);
    const nextStatus = ok ? 'ONLINE' : 'OFFLINE';
    if (p.status !== nextStatus) {
      state.printers[i] = { ...p, status: nextStatus };
      addLog(`Skriver ${p.name || p.id} ${p.ipAddress}:${p.port || 9100} status ${p.status || 'UKJENT'} -> ${nextStatus}`, nextStatus === 'ONLINE' ? 'INFO' : 'ALERT');
      changed = true;
    }
  }
  if (changed) {
    saveState();
    io.emit('state-update', state);
  }
  const duration = Date.now() - started;
  if (duration > 2000) {
    addLog(`Printer health-sjekk tok ${duration}ms for ${state.printers.length} skrivere`, 'INFO');
  }
}, PRINTER_CHECK_MS);
// Kick off an initial health-check at startup
(async () => {
  if (state.printers && state.printers.length > 0) {
    for (let i = 0; i < state.printers.length; i++) {
      const p = state.printers[i];
      const ok = await checkPrinter(p.ipAddress, p.port || 9100);
      state.printers[i] = { ...p, status: ok ? 'ONLINE' : 'OFFLINE' };
      addLog(`Skriver ${p.name || p.id} initial status: ${state.printers[i].status}`, ok ? 'INFO' : 'ALERT');
    }
    saveState();
    io.emit('state-update', state);
  }
})();

// --- REST: server-side printing to avoid browser CORS/mixed-content ---
app.post('/api/print-ticket', async (req, res) => {
  const { ipAddress, port = 9100, ticket, serviceName, waitTime } = req.body || {};
  if (!ipAddress || !ticket?.number) {
    return res.status(400).json({ ok: false, error: 'Missing printer or ticket' });
  }

  const date = new Date().toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });

  const buildEscPos = () => {
    const ESC = '\x1b';
    const GS = '\x1d';
    const reset = ESC + '@';
    const cp1252 = ESC + 't' + '\x10'; // Codepage Windows-1252 for å/ø/æ
    const center = ESC + 'a' + '\x01';
    const left = ESC + 'a' + '\x00';
    const boldOn = ESC + 'E' + '\x01';
    const boldOff = ESC + 'E' + '\x00';
    const doubleOn = GS + '!' + '\x11'; // double height & width
    const doubleOff = GS + '!' + '\x00';
    const cut = GS + 'V' + '\x00';

    // Tight top padding; use CP1252 to render å/ø/æ correctly
    const text =
      reset + cp1252 +
      center + boldOn + 'Q-Flow Pro\n' + boldOff + 'Velkommen\n\n' +
      boldOn + 'Nummer:\n' + boldOff + doubleOn + `${ticket.number}\n` + doubleOff + '\n' +
      (serviceName ? serviceName + '\n\n' : '\n') +
      left + `Tid: ${date}\n` + `Est. ventetid: ${waitTime ?? ''} min\n\n` +
      center + 'Vennligst vent på din tur.\n\n' +
      cut + '\n';

    return Buffer.from(text, 'latin1');
  };

  const sendRaw9100 = () => new Promise((resolve, reject) => {
    const sock = new net.Socket();
    const payload = buildEscPos();
    let settled = false;

    const done = (err) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      err ? reject(err) : resolve(true);
    };

    sock.setTimeout(8000);
    sock.once('error', done);
    sock.once('timeout', () => done(new Error('timeout')));
    sock.connect(port, ipAddress, () => {
      sock.write(payload, (err) => {
        if (err) return done(err);
        // small delay before closing to ensure flush
        setTimeout(() => done(null), 200);
      });
    });
  });

  try {
    await sendRaw9100();
    addLog(`Sendte billett ${ticket.number} til skriver ${ipAddress}:${port}`, 'INFO');
    return res.json({ ok: true, method: 'raw9100' });
  } catch (rawErr) {
    console.error('Raw 9100 print failed, will try HTTP ePOS if available:', rawErr);
    addLog(`Utskrift feilet (raw9100) til ${ipAddress}:${port}: ${rawErr?.message || rawErr}`, 'ALERT');

    // Fallback: try HTTP ePOS (if enabled on printer)
    const xml = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Body>
          <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
            <text lang="en"/>
            <text align="center"/>
            <text smooth="true"/>
            <text font="font_a" width="1" height="1"/>
            <text>Velkommen til\n</text>
            <text font="font_a" width="2" height="2"/>
            <text>Q-Flow Pro\n</text>
            <feed line="1"/>
            <text font="font_a" width="1" height="1"/>
            <text>Ditt nummer:\n</text>
            <text font="font_b" width="4" height="4"/>
            <text>${ticket.number}\n</text>
            <feed line="1"/>
            <text font="font_a" width="1" height="1"/>
            <text>${serviceName || ''}\n</text>
            <feed line="1"/>
            <text align="left"/>
            <text font="font_a" width="1" height="1"/>
            <text>Tid: ${date}\n</text>
            <text>Est. ventetid: ${waitTime ?? ''} min\n</text>
            <feed line="2"/>
            <text align="center"/>
            <text>Vennligst vent pa din tur.\n</text>
            <feed line="1"/>
            <cut type="feed"/>
          </epos-print>
        </s:Body>
      </s:Envelope>
    `;

    const url = `http://${ipAddress}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=8000`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""' },
        body: xml,
      });

      if (!response.ok) {
        return res.status(502).json({ ok: false, method: 'raw9100+epos', status: response.status });
      }

      addLog(`Sendte billett ${ticket.number} via ePOS til ${ipAddress}`, 'INFO');
      return res.json({ ok: true, method: 'epos-http' });
    } catch (httpErr) {
      console.error('HTTP ePOS fallback failed:', httpErr);
      addLog(`Utskrift feilet (epos-http) til ${ipAddress}: ${httpErr?.message || httpErr}`, 'ALERT');
      return res.status(502).json({ ok: false, method: 'raw9100+epos', error: 'printer_unreachable' });
    }
  }
});

// --- Auth Endpoints ---

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    addLog('Innlogging feilet: mangler brukernavn eller passord', 'ALERT');
    return res.status(400).json({ error: 'missing_credentials' });
  }
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  if (isLoginBlocked(ip)) {
    addLog(`Innlogging blokkert for ${username} fra ${ip} (for mange forsøk)`, 'ALERT');
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const user = (state.users || []).find(u => u.username === username);
  const attempts = registerLoginAttempt(ip);
  if (!user) {
    addLog(`Innlogging feilet for ${username} fra ${ip}`, 'ALERT');
    return res.status(401).json({ error: 'invalid_credentials', attempts });
  }

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) {
    addLog(`Innlogging feilet for ${username} fra ${ip}`, 'ALERT');
    return res.status(401).json({ error: 'invalid_credentials', attempts });
  }

  // If legacy hash, upgrade to bcrypt
  if (!user.passwordHash.startsWith('$2')) {
    const idx = state.users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      state.users[idx] = { ...user, passwordHash: hashPassword(password) };
      saveState();
    }
  }

  const token = createSession(user.id);
  addLog(`Innlogging vellykket for ${username} (${user.role}) fra ${ip}`, 'ACTION');
  return res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
});

app.post('/api/logout', (req, res) => {
  const { token } = req.body || {};
  if (token && state.sessions[token]) {
    const session = getSession(token);
    delete state.sessions[token];
    saveState();
    if (session?.user) {
      addLog(`Bruker logget ut: ${session.user.username} (${session.user.role})`, 'INFO');
    }
  }
  return res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = getSession(token);
  if (!session?.user) return res.status(401).json({ error: 'unauthorized' });
  const { user } = session;
  return res.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role } });
});

app.post('/api/user/password', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = getSession(token);
  if (!session?.user) return res.status(401).json({ error: 'unauthorized' });
  const userIdx = (state.users || []).findIndex(u => u.id === session.user.id);
  if (userIdx === -1) return res.status(401).json({ error: 'unauthorized' });
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword) return res.status(400).json({ error: 'missing_new_password' });
  const policy = passwordPolicy(newPassword);
  if (!policy.ok) return res.status(400).json({ error: policy.error });
  const user = state.users[userIdx];
  if (user.passwordHash && (!oldPassword || !verifyPassword(oldPassword, user.passwordHash))) {
    addLog(`Passordendring feilet for ${user.username}: ugyldig gammelt passord`, 'ALERT');
    return res.status(401).json({ error: 'invalid_old_password' });
  }
  state.users[userIdx] = { ...user, passwordHash: hashPassword(newPassword) };
  saveState();
  addLog(`Passord endret for ${user.username}`, 'ACTION');
  return res.json({ ok: true });
});

// Helper: Add log
const addLog = (message, type = 'INFO') => {
  const log = {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
    message,
    type
  };
  state.logs = [log, ...state.logs].slice(0, LOG_LIMIT);
  try {
    console.log(JSON.stringify({ level: type, msg: message, ts: log.timestamp }));
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date(log.timestamp).toISOString().slice(0, 10);
    fs.appendFileSync(join(LOG_DIR, `app-${day}.log`), JSON.stringify({ level: type, msg: message, ts: log.timestamp }) + '\n');
    io.emit('log-event', log);
  } catch (e) {
    // fallback noop
  }
  return log;
};

const actorLabel = (socket) => {
  const role = socket?.data?.authRole || 'PUBLIC';
  const uid = socket?.data?.userId;
  const user = uid ? (state.users || []).find((u) => u.id === uid) : null;
  const name = user?.name || user?.username || 'Ukjent';
  return `${name} [${role}${uid ? `:${uid}` : ''}]`;
};

const pruneOldLogs = () => {
  const started = Date.now();
  try {
    if (!fs.existsSync(LOG_DIR)) return;
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
    let removed = 0;
    files.forEach((f) => {
      const full = join(LOG_DIR, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed += 1;
      }
    });
    const duration = Date.now() - started;
    if (removed > 0 || duration > 500) {
      addLog(`Prunet ${removed} gamle loggfiler (${duration}ms)`, 'INFO');
    }
  } catch (e) {
    console.warn('Failed to prune logs', e);
  }
};

const pruneOldBackups = () => {
  const started = Date.now();
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));
    let removed = 0;
    files.forEach((f) => {
      const full = join(BACKUP_DIR, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed += 1;
      }
    });
    const duration = Date.now() - started;
    if (removed > 0 || duration > 500) {
      addLog(`Prunet ${removed} gamle backups (${duration}ms)`, 'INFO');
    }
  } catch (e) {
    console.warn('Failed to prune backups', e);
  }
};

// HTTP request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const path = req.originalUrl || req.url;
    const status = res.statusCode;
    const slowTag = duration > SLOW_REQUEST_MS ? ' SLOW' : '';
    const level = status >= 500 ? 'ALERT' : status >= 400 ? 'ACTION' : (duration > SLOW_REQUEST_MS ? 'ACTION' : 'INFO');
    addLog(`${req.method} ${path} -> ${status} (${duration}ms)${slowTag}`, level);
  });
  next();
});

// Periodic log pruning
pruneOldLogs();
setInterval(pruneOldLogs, 12 * 60 * 60 * 1000); // every 12h

// Periodic backup pruning
pruneOldBackups();
setInterval(pruneOldBackups, 12 * 60 * 60 * 1000);

// --- Socket.IO Logic ---

io.use((socket, next) => {
  const authHeader = socket.handshake.headers?.authorization || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = socket.handshake.auth?.token || tokenFromHeader || socket.handshake.query?.token;
  const session = getSession(token);
  socket.data.authRole = session?.role || 'PUBLIC';
  socket.data.userId = session?.user?.id;
  socket.data.token = session?.token;
  return next();
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  addLog(`Socket connected ${socket.id} role=${socket.data.authRole || 'PUBLIC'}`, 'INFO');
  
  // Send current state to newly connected client
  socket.emit('init-state', state);

  socket.on('disconnect', (reason) => {
    addLog(`Socket disconnected ${socket.id} (${reason})`, 'INFO');
  });

  // Allow clients to request state again (e.g., if initial emit was missed)
  socket.on('request-state', () => {
    socket.emit('init-state', state);
  });

  // --- Ticket Handlers ---

  socket.on('add-ticket', ({ serviceId }) => {
    if (state.isClosed) {
      addLog('Forsøk på å trekke billett mens systemet er stengt', 'ALERT');
      socket.emit('add-ticket-denied', { error: 'closed' });
      return;
    }
    const service = state.services.find(s => s.id === serviceId && s.isOpen !== false);
    if (!service) {
      addLog(`Forsøk på å trekke billett for utilgjengelig tjeneste (${serviceId})`, 'ALERT');
      socket.emit('add-ticket-denied', { error: 'service_unavailable' });
      return;
    }

    // Calculate number
    const serviceTickets = state.tickets.filter(t => t.serviceId === serviceId);
    let maxNum = 0;
    serviceTickets.forEach(t => {
        const num = parseInt(t.number.replace(service.prefix, ''));
        if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    const nextNum = (maxNum + 1).toString().padStart(3, '0');

    const newTicket = {
      id: Math.random().toString(36).substr(2, 9),
      number: `${service.prefix}${nextNum}`,
      serviceId,
      status: 'WAITING',
      createdAt: Date.now(),
    };

    state.tickets.push(newTicket);
    addLog(`Ny billett trukket: ${newTicket.number} (${service.name})`, 'ACTION');

    const waitingCount = state.tickets.filter(t => t.status === 'WAITING').length;
    if (waitingCount >= WAITING_ALERT_THRESHOLD && Date.now() - lastQueueAlertAt > WAITING_ALERT_INTERVAL_MS) {
      lastQueueAlertAt = Date.now();
      addLog(`Kø over terskel ${WAITING_ALERT_THRESHOLD}: ${waitingCount} ventende`, 'ALERT');
    }
    
    saveState();
    io.emit('state-update', state); // Broadcast to all
  });

  socket.on('update-ticket-status', ({ ticketId, status, counterId }) => {
    if (!requireRole(socket, ['ADMIN', 'OPERATOR'])) {
      addLog(`Avvist statusendring for ${ticketId} av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const ticketIndex = state.tickets.findIndex(t => t.id === ticketId);
    if (ticketIndex === -1) return;

    const ticket = state.tickets[ticketIndex];
    const oldStatus = ticket.status;

    // Update ticket
    state.tickets[ticketIndex] = {
      ...ticket,
      status,
      counterId: counterId || ticket.counterId,
      completedAt: status === 'COMPLETED' ? Date.now() : ticket.completedAt,
      calledAt: status === 'SERVING' ? Date.now() : ticket.calledAt
    };

    // Update counter currentTicketId if necessary
    if (counterId) {
       const counterIndex = state.counters.findIndex(c => c.id === counterId);
       if (counterIndex !== -1) {
          if (status === 'SERVING') {
              // If we are serving this ticket, update counter to point to it
              state.counters[counterIndex].currentTicketId = ticketId;
              
              // If there was another ticket being served, complete it? 
              // (Logic handled by frontend usually, but good to be safe)
          } else if (status === 'COMPLETED' && state.counters[counterIndex].currentTicketId === ticketId) {
              state.counters[counterIndex].currentTicketId = undefined;
          }
       }
    }

    if (status === 'SERVING') {
        const counter = state.counters.find(c => c.id === counterId);
        addLog(`Skranke ${counter?.name || '?'} kaller inn ${ticket.number}`, 'ACTION');
        io.emit('play-sound', { type: 'ding', text: `Nummer ${ticket.number}, til ${counter?.name}` });
    }

    addLog(`Statusendring ${ticket.number}: ${oldStatus} -> ${status} av ${actorLabel(socket)}`, 'ACTION');

    saveState();
    io.emit('state-update', state);
  });

  socket.on('delete-ticket', ({ ticketId }) => {
    if (!requireRole(socket, ['ADMIN', 'OPERATOR'])) {
      addLog(`Avvist sletting av billett ${ticketId} av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const ticket = state.tickets.find(t => t.id === ticketId);
    state.tickets = state.tickets.filter(t => t.id !== ticketId);
    addLog(`Billett slettet manuelt: ${ticket?.number || ticketId} av ${actorLabel(socket)}`, 'ALERT');
    saveState();
    io.emit('state-update', state);
  });

  socket.on('reset-system', () => {
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist nullstilling av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    state.tickets = [];
    state.counters = state.counters.map(c => ({...c, currentTicketId: undefined}));
    state.logs = [];
    addLog(`Systemet ble nullstilt av ${actorLabel(socket)}`, 'ALERT');
    saveState();
    io.emit('state-update', state);
  });

  // --- Admin/Config Handlers ---

  socket.on('update-settings', (updates) => {
      if (!requireRole(socket, ['ADMIN'])) {
        addLog(`Avvist innstillinger fra ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
        return;
      }
      const actor = actorLabel(socket);
      const safe = (obj) => (obj && typeof obj === 'object' ? obj : {});
      const next = safe(updates);
      const changes = [];
      if (Array.isArray(next.services)) {
        state.services = next.services.map((s) => ({
          id: s.id || Math.random().toString(36).substr(2, 9),
          name: cleanText(s.name, 80) || 'Tjeneste',
          prefix: (cleanText(s.prefix, 2).toUpperCase() || 'X'),
          color: s.color || 'bg-gray-500',
          estimatedTimePerPersonMinutes: Number(s.estimatedTimePerPersonMinutes) || 5,
          isOpen: s.isOpen !== false,
          priority: Number.isFinite(Number(s.priority)) ? Number(s.priority) : 1,
        }));
        changes.push(`tjenester=${state.services.length}`);
      }
      if (Array.isArray(next.counters)) {
        state.counters = next.counters.map((c) => ({
          id: c.id || Math.random().toString(36).substr(2, 9),
          name: cleanText(c.name, 80) || 'Skranke',
          activeServiceIds: Array.isArray(c.activeServiceIds) ? c.activeServiceIds.filter((id) => typeof id === 'string' && id.length > 0) : [],
          isOnline: c.isOnline !== false,
          currentTicketId: c.currentTicketId,
        }));
        changes.push(`skranker=${state.counters.length}`);
      }
      if (Array.isArray(next.users)) {
        const nextUsers = next.users.map((u) => {
          const existing = state.users.find(x => x.id === u.id);
          const username = cleanText(u.username || existing?.username || '', 64);
          const name = cleanText(u.name || username || existing?.name || '', 80);
          if (!username) {
            addLog(`Brukeroppdatering avvist: ${actor} mangler brukernavn`, 'ALERT');
            return null;
          }
          let passwordHash = u.passwordHash || existing?.passwordHash || '';
          if (u.password) {
            const policy = passwordPolicy(u.password);
            if (!policy.ok) {
              addLog(`Brukeroppdatering avvist: ${actor} brøt passordpolicy (${policy.error}) for ${u.username || u.name || 'ukjent'}`, 'ALERT');
              socket.emit('update-users-error', { error: policy.error });
              return null;
            }
            passwordHash = hashPassword(u.password);
          }
          const { password, ...rest } = u;
          return {
            ...rest,
            id: u.id || Math.random().toString(36).substr(2, 9),
            passwordHash: passwordHash || hashPassword('Changeme1'),
            role: u.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
            username: username,
            name: name || username,
          };
        });
        const sanitizedUsers = nextUsers.filter(Boolean);
        const adminCount = sanitizedUsers.filter(u => u.role === 'ADMIN').length;
        if (adminCount < 1) {
          addLog(`Brukeroppdatering avvist: ${actor} ville fjernet siste admin`, 'ALERT');
          socket.emit('update-users-error', { error: 'must_have_admin' });
          return;
        }
        if (sanitizedUsers.length !== nextUsers.length) {
          addLog(`Brukeroppdatering avvist: ${actor} har ugyldige brukere i payload`, 'ALERT');
          return; // abort update; client already notified
        }
        state.users = sanitizedUsers;
        changes.push(`brukere=${state.users.length}`);
      }
      if (Array.isArray(next.printers)) {
        state.printers = next.printers.map(p => ({
          ...p,
          status: p.status || 'OFFLINE',
          port: Number(p.port) || 9100,
          type: p.type === 'GENERIC_NETWORK' ? 'GENERIC_NETWORK' : 'EPSON_IP',
        }));
        changes.push(`skrivere=${state.printers.length}`);
      }
      if (next.isClosed !== undefined) state.isClosed = !!next.isClosed;
      if (next.soundSettings) {
        state.soundSettings = { ...state.soundSettings, ...safe(next.soundSettings) };
      }
      if (next.publicMessage !== undefined) state.publicMessage = String(next.publicMessage || '');
      if (next.branding) {
        state.branding = { ...state.branding, ...safe(next.branding) };
      }
      if (Object.prototype.hasOwnProperty.call(next, 'kioskExitPin')) {
        state.kioskExitPin = String(next.kioskExitPin || '');
      }

      saveState();
      io.emit('state-update', state);
      addLog(`Innstillinger oppdatert av ${actor}${changes.length ? ` (${changes.join(', ')})` : ''}`, 'ACTION');
  });

  socket.on('register-kiosk', (kioskData) => {
      const existingIdx = state.kiosks.findIndex(k => k.id === kioskData.id);
      const rememberedPrinter = state.kioskPrinterAssignments[kioskData.id];
      if (existingIdx !== -1) {
        const existing = state.kiosks[existingIdx];
        const withAssignment = !existing.assignedPrinterId && rememberedPrinter
        ? { ...existing, assignedPrinterId: rememberedPrinter }
        : existing;
        state.kiosks[existingIdx] = { ...withAssignment, lastSeen: Date.now() };
        if (withAssignment !== existing) {
          saveState();
          io.emit('state-update', state);
        }
      } else {
        state.kiosks.push({ ...kioskData, lastSeen: Date.now(), assignedPrinterId: rememberedPrinter });
          addLog(`Ny Kiosk registrert: ${kioskData.name}`, 'INFO');
      }
      // Don't save kiosk heartbeat to disk every few seconds to save IO
      // But broadcast it so Admin sees it
      io.emit('state-update', state); 
  });

  socket.on('register-counter-display', (payload) => {
    const { id, name, counterId, message } = payload || {};
    if (!id || !name) return;
    const idx = state.counterDisplays.findIndex(d => d.id === id);
    const now = Date.now();
    if (idx !== -1) {
      const existing = state.counterDisplays[idx];
      const nextCounterId = counterId !== undefined ? counterId : existing.counterId; // preserve assignment if not provided
      const nextMessage = message !== undefined ? message : existing.message;
      state.counterDisplays[idx] = { ...existing, name, counterId: nextCounterId, message: nextMessage, lastSeen: now };
      saveState();
    } else {
      state.counterDisplays.push({ id, name, counterId, message: message || '', lastSeen: now });
      addLog(`Ny skrankeskjerm: ${name}`, 'INFO');
      saveState();
    }
    io.emit('state-update', state);
  });

  socket.on('assign-counter-display', ({ displayId, counterId }) => {
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist kobling av skrankeskjerm ${displayId} av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const idx = state.counterDisplays.findIndex(d => d.id === displayId);
    if (idx === -1) return;
    state.counterDisplays[idx] = { ...state.counterDisplays[idx], counterId, lastSeen: Date.now() };
    saveState();
    addLog(`Skrankeskjerm ${displayId} koblet til skranke ${counterId || 'ingen'} av ${actorLabel(socket)}`, 'ACTION');
    io.emit('state-update', state);
  });

  socket.on('set-counter-display-message', ({ displayId, message }) => {
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist endring av skjermmelding for ${displayId} av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const idx = state.counterDisplays.findIndex(d => d.id === displayId);
    if (idx === -1) return;
    state.counterDisplays[idx] = { ...state.counterDisplays[idx], message: message || '', lastSeen: Date.now() };
    saveState();
    addLog(`Oppdatert melding for skrankeskjerm ${displayId} av ${actorLabel(socket)}`, 'ACTION');
    io.emit('state-update', state);
  });

  socket.on('delete-counter-display', ({ displayId }) => {
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist fjerning av skrankeskjerm ${displayId} av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const before = state.counterDisplays.length;
    state.counterDisplays = state.counterDisplays.filter(d => d.id !== displayId);
    if (state.counterDisplays.length !== before) {
      addLog(`Skrankeskjerm fjernet: ${displayId} av ${actorLabel(socket)}`, 'ACTION');
      saveState();
      io.emit('state-update', state);
    }
  });
  
  socket.on('assign-printer', ({ kioskId, printerId }) => {
      if (!requireRole(socket, ['ADMIN'])) {
        addLog(`Avvist skriver-tilkobling for kiosk ${kioskId} av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
        return;
      }
      // Persist mapping even if kiosk is currently offline/removed
      state.kioskPrinterAssignments[kioskId] = printerId;

      const kIndex = state.kiosks.findIndex(k => k.id === kioskId);
      if (kIndex !== -1) {
          state.kiosks[kIndex].assignedPrinterId = printerId;
      }
      saveState();
      addLog(`Skriver ${printerId || 'ukjent'} tilordnet kiosk ${kioskId} av ${actorLabel(socket)}`, 'ACTION');
      io.emit('state-update', state);
  });

      socket.on('play-sound', (payload) => {
        if (!requireRole(socket, ['ADMIN', 'OPERATOR'])) {
          addLog(`Avvist lydkommando av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
          return;
        }
        // Broadcast play-sound requests (e.g., manual call-again)
        addLog(`Lydkommando trigget av ${actorLabel(socket)} (${payload?.type || 'ukjent'})`, 'INFO');
        io.emit('play-sound', payload);
      });

    socket.on('delete-kiosk', ({ kioskId }) => {
      if (!requireRole(socket, ['ADMIN'])) {
        addLog(`Avvist fjerning av kiosk ${kioskId} av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
        return;
      }
      const before = state.kiosks.length;
      state.kiosks = state.kiosks.filter(k => k.id !== kioskId);
      if (state.kiosks.length !== before) {
        addLog(`Kiosk fjernet: ${kioskId} av ${actorLabel(socket)}`, 'ACTION');
        saveState();
        io.emit('state-update', state);
      }
    });

});

  // Health endpoint for monitoring
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      services: state.services?.length || 0,
      counters: state.counters?.length || 0,
      tickets: state.tickets?.length || 0,
      kiosks: state.kiosks?.length || 0,
      printers: state.printers?.length || 0,
      isClosed: !!state.isClosed,
    });
  });

// Admin-triggered backup (requires Bearer token for ADMIN)
app.post('/api/admin/backup', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = getSession(token);
  if (!session?.user || session.user.role !== 'ADMIN') return res.status(401).json({ error: 'unauthorized' });
  try {
    const file = backupDatabase();
    addLog(`Backup created at ${file}`, 'ACTION');
    return res.json({ ok: true, file });
  } catch (err) {
    console.error('Backup failed', err);
    return res.status(500).json({ error: 'backup_failed' });
  }
});

app.get('/api/admin/backups', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = getSession(token);
  if (!session?.user || session.user.role !== 'ADMIN') return res.status(401).json({ error: 'unauthorized' });
  try {
    const items = listBackups();
    addLog(`Backup-liste hentet av ${session.user.username}`, 'INFO');
    return res.json({ ok: true, backups: items });
  } catch (err) {
    console.error('List backups failed', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

app.get('/api/admin/backup/:file', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = getSession(token);
  if (!session?.user || session.user.role !== 'ADMIN') return res.status(401).json({ error: 'unauthorized' });

  const requested = req.params.file || '';
  if (!requested.endsWith('.db') || requested.includes('..') || requested.includes('/') || requested.includes('\\')) {
    return res.status(400).json({ error: 'invalid_file' });
  }

  const target = join(BACKUP_DIR, requested);
  if (!target.startsWith(BACKUP_DIR)) return res.status(400).json({ error: 'invalid_path' });
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'not_found' });
  addLog(`Backup lastet ned: ${requested} av ${session.user.username}`, 'ACTION');
  return res.download(target, requested);
});

// Serve static files from the 'dist' directory (Vite build)
app.use(express.static(join(__dirname, 'dist')));

// Handle client-side routing, return all requests to index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});

// Global process error logging
process.on('unhandledRejection', (reason) => {
  addLog(`Unhandled rejection: ${reason}`, 'ALERT');
});

process.on('uncaughtException', (err) => {
  addLog(`Uncaught exception: ${err?.message || err}`, 'ALERT');
});