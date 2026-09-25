import express from 'express';
import session from 'express-session';
import passport from 'passport';
import proxyaddr from 'proxy-addr';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import net from 'net';
import crypto from 'crypto';
import fs from 'fs';
import helmet from 'helmet';
import {
  loadState as loadStateFromStore,
  saveState as saveStateToStore,
  backupDatabase,
  listBackups,
  getDataDir,
  getBackupDir,
  backupPath,
  readBackup,
  replaceHistory,
  saveUploadedBackup,
  closeDb,
} from './lib/stateStore.js';
import { initializePassport, isGoogleConfigured, isOIDCConfigured, AUTH_ERRORS } from './lib/passportConfig.js';
import {
  parseTrustProxy,
  normalizeClientIp,
  hashToken,
  generateToken,
  safeEqual,
  createRateLimiter,
} from './lib/security.js';
import { hashPassword, verifyPassword, passwordPolicy, migrateUsers, generatePassword } from './lib/users.js';
import { viewForRole } from './lib/stateViews.js';
import { printTicket } from './lib/printer.js';
import { cleanText, randomId, parseLogoDataUrl, DEFAULT_SETTINGS, sanitizeSettings } from './lib/validators.js';
import { createQueueService } from './lib/queueService.js';
import { isOpenAt, isDailyJobDue, localDay, estimateWaitMinutes } from './lib/queue.js';
import { buildStats, historyCsv, isValidDay } from './lib/history.js';
import { registerSocketHandlers } from './lib/socketHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALLOWED_ORIGINS = (() => {
  const env = process.env.ALLOWED_ORIGINS;
  if (!env) return ['http://localhost:5173', 'http://localhost:3000'];
  return env.split(',').map(o => o.trim()).filter(Boolean);
})();
const ENABLE_CSP = process.env.ENABLE_CSP === '1';
const ALLOWED_WS_ORIGINS = ALLOWED_ORIGINS.map((o) => o.replace(/^http/, 'ws'));

// API Security Configuration
const API_KEYS = (() => {
  const env = process.env.API_KEYS;
  if (!env) return [];
  return env.split(',').map(k => k.trim()).filter(Boolean);
})();
const ALLOWED_API_IPS = (() => {
  const env = process.env.ALLOWED_API_IPS;
  if (!env) return [];
  return env.split(',').map(ip => ip.trim()).filter(Boolean);
})();

// Which proxies may set X-Forwarded-For. See .env.example (TRUST_PROXY).
const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY);

const app = express();
app.set('trust proxy', TRUST_PROXY);
const trustProxyFn = app.get('trust proxy fn');
const jsonBody = express.json({ limit: '1mb' });
app.use((req, res, next) => {
  // The logo upload has its own, larger limit.
  if (req.path === '/api/admin/branding/logo') return next();
  return jsonBody(req, res, next);
});
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
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
    }
  } : false,
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
}));

// The cookie session is only used to carry OAuth/OIDC state between the redirect and the callback.
// API and socket authentication use bearer tokens.
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  WARNING: SESSION_SECRET not set in environment. Using generated secret.');
  console.warn('⚠️  OAuth logins that are in progress during a restart will fail.');
  console.warn('⚠️  Set SESSION_SECRET in .env for production use.');
  return generated;
})();

app.use(session({
  name: 'qflow.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    // 'auto' marks the cookie Secure when the request arrived over HTTPS (directly or via a trusted proxy),
    // so plain-HTTP LAN installs keep working.
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

io.engine.on('connection_error', (err) => {
  addLog(`Socket handshake feilet: ${err?.code || err?.message || 'ukjent'} (${err?.context || ''})`, 'ALERT');
});

// Initial State defaults
const DEFAULT_STATE = {
  services: [
    { id: 's1', name: 'Kundeservice', prefix: 'K', color: '#2563eb', estimatedTimePerPersonMinutes: 5, isOpen: true, priority: 1 },
    { id: 's2', name: 'Teknisk Support', prefix: 'T', color: '#9333ea', estimatedTimePerPersonMinutes: 15, isOpen: true, priority: 1 },
    { id: 's3', name: 'Levering & Retur', prefix: 'L', color: '#059669', estimatedTimePerPersonMinutes: 3, isOpen: true, priority: 1 },
  ],
  counters: [
    { id: 'c1', name: 'Skranke 1', activeServiceIds: ['s1', 's3'], isOnline: true },
    { id: 'c2', name: 'Skranke 2', activeServiceIds: ['s1', 's2', 's3'], isOnline: true },
    { id: 'c3', name: 'VIP Skranke', activeServiceIds: ['s2'], isOnline: false },
  ],
  isClosed: false,
  // The first admin is created on first boot (see bootstrapAdmin below).
  users: [],
  tickets: [],
  ticketCounters: {},
  printers: [],
  kiosks: [],
  kioskPrinterAssignments: {},
  counterDisplays: [],
  devices: {},
  sessions: {},
  soundSettings: {
    kioskEffects: true,
    adminEffects: true,
    callChime: true,
    callVoice: true
  },
  branding: {
    brandText: 'Q-Flow Pro',
    brandLogoUrl: '',
    primaryColor: '',
    ticketFooter: '',
  },
  settings: DEFAULT_SETTINGS,
  jobs: {},
  kioskExitPinHash: '',
  logs: [],
  publicMessage: "",
  authProviders: {
    google: {
      enabled: false,
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowedDomains: [],
      autoProvision: false,
      defaultRole: 'OPERATOR'
    },
    oidc: {
      enabled: false,
      issuerUrl: process.env.OIDC_ISSUER_URL || '',
      clientId: process.env.OIDC_CLIENT_ID || '',
      clientSecret: process.env.OIDC_CLIENT_SECRET || '',
      autoProvision: false,
      defaultRole: 'OPERATOR',
      requireVerifiedEmail: true
    }
  }
};

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;
const LOG_LIMIT = 500;
const DATA_DIR = getDataDir();
const LOG_DIR = join(DATA_DIR, 'logs');
const PID_FILE = join(DATA_DIR, 'server.pid');
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || 14);
const BACKUP_DIR = getBackupDir();
const BACKUP_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const SLOW_REQUEST_MS = 1200;
const MAX_WAITING_TICKETS = Number(process.env.MAX_WAITING_TICKETS || 500);
const OAUTH_CODE_TTL_MS = 60 * 1000;
// Bumped when a release needs a one-time migration of security-relevant data.
const SECURITY_VERSION = 1;
// Bumped when the shape of the stored data changes.
const DATA_VERSION = 2;

// --- Rate limiting ---

// Failed logins per ip+username and per ip (password spraying).
const loginFailuresByUser = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
const loginFailuresByIp = createRateLimiter({ limit: 50, windowMs: 15 * 60 * 1000 });
// Tickets drawn by anonymous clients (mobile), per socket and per ip.
const publicTicketsBySocket = createRateLimiter({ limit: 5, windowMs: 60 * 1000 });
const publicTicketsByIp = createRateLimiter({ limit: 60, windowMs: 60 * 1000 });
// Any event from an unauthenticated or kiosk socket.
const socketEvents = createRateLimiter({ limit: 40, windowMs: 10 * 1000 });
const kioskPinAttempts = createRateLimiter({ limit: 5, windowMs: 5 * 60 * 1000 });
// New counter displays per ip (displays behind one proxy share an ip; MAX_COUNTER_DISPLAYS caps the total).
const counterDisplayRegistrations = createRateLimiter({ limit: 60, windowMs: 60 * 60 * 1000 });

const loginKey = (ip, username) => `${ip}|${String(username || '').toLowerCase()}`;

// General API rate limiting
const apiRateLimits = new Map(); // ip -> { timestamps: [], blocked: false, blockExpiry: 0 }
const MAX_API_REQUESTS = Number(process.env.API_RATE_LIMIT_PER_MINUTE || 100); // Max requests per window
const API_RATE_WINDOW_MS = 60 * 1000; // 1 minute window
const API_BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minute block
const checkApiRateLimit = (ip) => {
  const now = Date.now();
  let entry = apiRateLimits.get(ip) || { timestamps: [], blocked: false, blockExpiry: 0 };

  if (entry.blocked && entry.blockExpiry > now) {
    return { allowed: false, remaining: 0, blockExpiry: entry.blockExpiry };
  }
  if (entry.blocked && entry.blockExpiry <= now) {
    entry = { timestamps: [], blocked: false, blockExpiry: 0 };
  }

  const recent = entry.timestamps.filter((t) => now - t < API_RATE_WINDOW_MS);
  if (recent.length >= MAX_API_REQUESTS) {
    entry.blocked = true;
    entry.blockExpiry = now + API_BLOCK_DURATION_MS;
    entry.timestamps = recent;
    apiRateLimits.set(ip, entry);
    return { allowed: false, remaining: 0, blockExpiry: entry.blockExpiry };
  }

  recent.push(now);
  entry.timestamps = recent;
  apiRateLimits.set(ip, entry);
  return { allowed: true, remaining: MAX_API_REQUESTS - recent.length };
};

// Client address as resolved by Express using the TRUST_PROXY setting.
// X-Forwarded-For is only honoured when the direct peer is a trusted proxy.
const getClientIp = (req) => normalizeClientIp(req.ip || req.socket?.remoteAddress || '') || 'unknown';

const getSocketIp = (socket) => {
  try {
    return normalizeClientIp(proxyaddr(socket.request, trustProxyFn)) || 'unknown';
  } catch {
    return normalizeClientIp(socket.handshake?.address || '') || 'unknown';
  }
};

const isIPv4 = (ip) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip);

const apiRateLimiter = (req, res, next) => {
  if (req.path === '/health') return next();
  if (!req.path.startsWith('/api/')) return next();

  const ip = getClientIp(req);
  const check = checkApiRateLimit(ip);

  res.setHeader('X-RateLimit-Limit', MAX_API_REQUESTS.toString());
  res.setHeader('X-RateLimit-Remaining', check.remaining.toString());
  res.setHeader('X-RateLimit-Reset', new Date(Date.now() + API_RATE_WINDOW_MS).toISOString());

  if (!check.allowed) {
    const resetTime = new Date(check.blockExpiry).toISOString();
    res.setHeader('Retry-After', Math.ceil((check.blockExpiry - Date.now()) / 1000).toString());
    addLog(`API rate limit exceeded for ${ip}, blocked until ${resetTime}`, 'ALERT');
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: resetTime
    });
  }
  next();
};

const ipToInt = (ip) => {
  if (!ip || typeof ip !== 'string') return 0;
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  const nums = parts.map((octet) => Number(octet));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return 0;
  return nums.reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;
};

// IP whitelist validation (supports CIDR notation)
const isIPAllowed = (ip) => {
  if (ALLOWED_API_IPS.length === 0) return true;
  const normalizedIp = normalizeClientIp(ip);
  if (!normalizedIp) return false;
  for (const allowed of ALLOWED_API_IPS) {
    const normalizedAllowed = normalizeClientIp(allowed);
    if (normalizedAllowed === normalizedIp) return true;
    if (allowed.includes('/') && isIPv4(normalizedIp)) {
      const [network, bitsRaw] = allowed.split('/');
      const normalizedNetwork = normalizeClientIp(network);
      const bits = Number(bitsRaw);
      if (!Number.isInteger(bits) || bits < 0 || bits > 32 || !isIPv4(normalizedNetwork)) continue;
      const mask = bits === 0 ? 0 : (-1 << (32 - bits));
      if ((ipToInt(normalizedIp) & mask) === (ipToInt(normalizedNetwork) & mask)) return true;
    }
  }
  return false;
};

const hasValidApiKey = (req) => {
  if (API_KEYS.length === 0) return false;
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey !== 'string' || !apiKey) return false;
  return API_KEYS.some((k) => safeEqual(k, apiKey));
};

const requireAllowedIP = (req, res, next) => {
  const ip = getClientIp(req);
  if (!isIPAllowed(ip)) {
    addLog(`API access denied: IP ${ip} not in whitelist`, 'ALERT');
    return res.status(403).json({ error: 'ip_not_allowed' });
  }
  next();
};

// --- Logging ---
// Declared before state loading so migrations can log. Log events only go to staff clients.
const ROOMS = { PUBLIC: 'view:public', OPERATOR: 'view:operator', ADMIN: 'view:admin' };
let state = null;

const writeLogLine = (entry) => {
  try {
    // Debug lines only go to the log file, keeping the journal readable.
    if (entry.level !== 'DEBUG') console.log(JSON.stringify(entry));
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date(entry.ts).toISOString().slice(0, 10);
    fs.appendFileSync(join(LOG_DIR, `app-${day}.log`), JSON.stringify(entry) + '\n');
  } catch {
    // logging must never break the server
  }
};

// Events shown in the admin log (and written to the log files).
const addLog = (message, type = 'INFO') => {
  const log = { id: crypto.randomBytes(5).toString('hex'), timestamp: Date.now(), message, type };
  if (state) state.logs = [log, ...(state.logs || [])].slice(0, LOG_LIMIT);
  writeLogLine({ level: type, msg: message, ts: log.timestamp });
  try {
    io.to([ROOMS.OPERATOR, ROOMS.ADMIN]).emit('log-event', log);
  } catch {
    // io not ready yet
  }
  return log;
};

// Technical noise (connections, heartbeats) only goes to the log files / journal.
const debugLog = (message) => writeLogLine({ level: 'DEBUG', msg: message, ts: Date.now() });

// --- Persistence ---
// Changes are written in batches: many events in quick succession cause one write.
let saveTimer = null;
const saveNow = () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveStateToStore(state);
};
const saveState = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      saveStateToStore(state);
    } catch (err) {
      console.error('Saving state failed', err);
    }
  }, 200);
};

// --- Load and migrate state ---

// Brings a raw stored state (current or from an older version / backup) up to date.
const prepareState = (raw) => {
  const next = { ...DEFAULT_STATE, ...raw };
  ['kioskPrinterAssignments', 'devices', 'sessions', 'jobs', 'ticketCounters'].forEach((key) => {
    if (!next[key] || typeof next[key] !== 'object' || Array.isArray(next[key])) next[key] = {};
  });
  ['counterDisplays', 'kiosks', 'printers', 'tickets', 'logs', 'users', 'services', 'counters'].forEach((key) => {
    if (!Array.isArray(next[key])) next[key] = [];
  });
  if (next.isClosed === undefined) next.isClosed = false;
  // The first start of this version must not wipe today's queue with the daily reset.
  if (!next.jobs.lastResetDay) next.jobs.lastResetDay = localDay();
  next.branding = { ...DEFAULT_STATE.branding, ...(next.branding || {}) };
  next.soundSettings = { ...DEFAULT_STATE.soundSettings, ...(next.soundSettings || {}) };
  // Merge stored settings over the defaults (validated the same way as admin changes).
  const merged = sanitizeSettings(next.settings || {}, DEFAULT_SETTINGS);
  next.settings = merged.value || DEFAULT_SETTINGS;
  if (!next.authProviders) next.authProviders = DEFAULT_STATE.authProviders;
  if (next.authProviders.oidc && next.authProviders.oidc.requireVerifiedEmail === undefined) {
    next.authProviders.oidc.requireVerifiedEmail = true;
  }

  if ((next.securityVersion || 0) < SECURITY_VERSION) {
    // Earlier versions broadcast the whole state (including session tokens and password hashes)
    // to every connected client, and shipped a db.json with long-lived admin sessions.
    // Treat every existing session as compromised and clean up credentials derived from it.
    next.users = migrateUsers(next.users, { checkPasswords: true }).users;
    const hadSessions = Object.keys(next.sessions).length;
    next.sessions = {};
    next.devices = {};
    if (typeof next.kioskExitPin === 'string' && next.kioskExitPin) {
      next.kioskExitPinHash = hashPassword(next.kioskExitPin);
    }
    next.securityVersion = SECURITY_VERSION;
    addLog(`Sikkerhetsmigrering ${SECURITY_VERSION} fullført: ${hadSessions} gamle innlogginger ugyldiggjort`, 'ALERT');
  } else {
    next.users = migrateUsers(next.users, { checkPasswords: false }).users;
  }
  delete next.kioskExitPin;
  if (typeof next.kioskExitPinHash !== 'string') next.kioskExitPinHash = '';

  // Drop sessions that are expired or have no expiry (legacy sessions never expired).
  Object.entries(next.sessions).forEach(([key, sess]) => {
    if (!sess?.expiresAt || sess.expiresAt < Date.now()) delete next.sessions[key];
  });

  // Ensure kiosk printer assignments survive restarts by seeding map from kiosks
  next.kiosks.forEach(k => {
    if (k.assignedPrinterId && !next.kioskPrinterAssignments[k.id]) {
      next.kioskPrinterAssignments[k.id] = k.assignedPrinterId;
    }
  });
  return next;
};

state = prepareState(loadStateFromStore(DEFAULT_STATE));

// Create the first admin on a fresh install. The password comes from QFLOW_ADMIN_PASSWORD,
// or is generated and printed once to the console (journalctl).
const bootstrapAdmin = () => {
  if ((state.users || []).some((u) => u.role === 'ADMIN')) return;
  const envPassword = process.env.QFLOW_ADMIN_PASSWORD;
  let password = envPassword;
  let generated = false;
  if (password && !passwordPolicy(password).ok) {
    console.warn('⚠️  QFLOW_ADMIN_PASSWORD does not meet the password policy (min. 8 chars, upper, lower, digit). Generating one instead.');
    password = undefined;
  }
  if (!password) {
    password = generatePassword();
    generated = true;
  }
  let username = cleanText(process.env.QFLOW_ADMIN_USERNAME || 'admin', 64) || 'admin';
  if (state.users.some((u) => u.username === username)) username = `admin_${randomId()}`;
  state.users.push({
    id: `u_${randomId()}`,
    name: 'Administrator',
    username,
    role: 'ADMIN',
    provider: 'local',
    passwordHash: hashPassword(password),
    mustChangePassword: generated,
  });
  addLog(`Opprettet første administrator "${username}"`, 'ALERT');
  if (generated) {
    console.log('\n==================================================================');
    console.log(' Q-Flow Pro: first admin account created');
    console.log(`   username: ${username}`);
    console.log(`   password: ${password}`);
    console.log(' You will be asked to change this password after the first login.');
    console.log('==================================================================\n');
  }
};
bootstrapAdmin();

// --- Sessions & devices (only SHA-256 hashes of tokens are stored) ---

const getSession = (token) => {
  if (!token || typeof token !== 'string') return null;
  const key = hashToken(token);
  const sess = state.sessions[key];
  if (!sess) return null;
  if (!sess.expiresAt || sess.expiresAt < Date.now()) {
    delete state.sessions[key];
    saveState();
    return null;
  }
  const user = (state.users || []).find(u => u.id === sess.userId);
  if (!user) return null;
  return { user, key, role: user.role };
};

const createSession = (userId) => {
  const token = generateToken(32);
  state.sessions[hashToken(token)] = { userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  saveState();
  return token;
};

const deleteUserSessions = (userId, exceptKey = null) => {
  let removed = 0;
  Object.entries(state.sessions).forEach(([key, sess]) => {
    if (sess.userId === userId && key !== exceptKey) {
      delete state.sessions[key];
      removed += 1;
    }
  });
  return removed;
};

const getDevice = (token) => {
  if (!token || typeof token !== 'string') return null;
  const key = hashToken(token);
  const device = state.devices[key];
  return device ? { ...device, key } : null;
};

const revokeKioskDevices = (kioskId) => {
  let removed = 0;
  Object.entries(state.devices).forEach(([key, device]) => {
    if (device.kioskId === kioskId) {
      delete state.devices[key];
      removed += 1;
    }
  });
  return removed;
};

// Short-lived, single-use codes handed to the browser after OAuth/OIDC login.
// The session token itself is never put in a URL.
const oauthCodes = new Map(); // code -> { userId, expiresAt }
const issueLoginCode = (userId) => {
  const code = generateToken(24);
  oauthCodes.set(code, { userId, expiresAt: Date.now() + OAUTH_CODE_TTL_MS });
  return code;
};

const reinitPassport = () => initializePassport(state, createSession, addLog);
reinitPassport();

// --- State broadcasting (role-filtered) ---

const viewRoleForSocket = (socket) => {
  if (socket.data.viewRoom === ROOMS.ADMIN) return 'ADMIN';
  if (socket.data.viewRoom === ROOMS.OPERATOR) return 'OPERATOR';
  return 'PUBLIC';
};

const sendState = (socket, event = 'init-state') => {
  socket.emit(event, viewForRole(state, viewRoleForSocket(socket)));
};

const broadcastState = () => {
  io.to(ROOMS.PUBLIC).emit('state-update', viewForRole(state, 'PUBLIC'));
  io.to(ROOMS.OPERATOR).emit('state-update', viewForRole(state, 'OPERATOR'));
  io.to(ROOMS.ADMIN).emit('state-update', viewForRole(state, 'ADMIN'));
};

// For changes that only staff can see (device heartbeats, printer status).
const broadcastStaffState = () => {
  io.to(ROOMS.OPERATOR).emit('state-update', viewForRole(state, 'OPERATOR'));
  io.to(ROOMS.ADMIN).emit('state-update', viewForRole(state, 'ADMIN'));
};

// Re-evaluates who a socket belongs to (session/device may have changed or expired)
// and moves it to the matching broadcast room. Returns true when anything changed.
const applySocketAuth = (socket) => {
  const sess = getSession(socket.data.token);
  const device = getDevice(socket.data.deviceToken);
  const before = `${socket.data.authRole}|${socket.data.viewRoom}|${socket.data.kioskId}|${socket.data.mustChangePassword}`;

  let role = 'PUBLIC';
  if (sess) role = sess.role;
  else if (device) role = 'KIOSK';
  const mustChangePassword = !!sess?.user.mustChangePassword;

  socket.data.authRole = role;
  socket.data.userId = sess?.user.id;
  socket.data.sessionKey = sess?.key;
  socket.data.kioskId = device?.kioskId || null;
  socket.data.mustChangePassword = mustChangePassword;

  let room = ROOMS.PUBLIC;
  if (!mustChangePassword && role === 'ADMIN') room = ROOMS.ADMIN;
  else if (!mustChangePassword && role === 'OPERATOR') room = ROOMS.OPERATOR;
  if (socket.data.viewRoom !== room) {
    if (socket.data.viewRoom) socket.leave(socket.data.viewRoom);
    socket.join(room);
    socket.data.viewRoom = room;
  }

  const after = `${socket.data.authRole}|${socket.data.viewRoom}|${socket.data.kioskId}|${socket.data.mustChangePassword}`;
  return before !== after;
};

const sessionInfo = (socket) => ({
  role: socket.data.authRole,
  kioskId: socket.data.kioskId,
  mustChangePassword: !!socket.data.mustChangePassword,
});

const refreshSocket = (socket) => {
  if (applySocketAuth(socket)) {
    socket.emit('session-info', sessionInfo(socket));
    sendState(socket, 'state-update');
  }
};

const refreshAllSockets = () => {
  io.sockets.sockets.forEach((socket) => refreshSocket(socket));
};

const requireRole = (socket, roles = []) => {
  refreshSocket(socket);
  if (socket.data.mustChangePassword) {
    socket.emit('action-denied', { error: 'password_change_required' });
    return false;
  }
  if (roles.includes(socket.data.authRole)) return true;
  socket.emit('action-denied', { error: 'unauthorized' });
  return false;
};

const actorLabel = (socket) => {
  const role = socket?.data?.authRole || 'PUBLIC';
  const uid = socket?.data?.userId;
  const user = uid ? (state.users || []).find((u) => u.id === uid) : null;
  const name = user?.name || user?.username || (socket?.data?.kioskId ? `Kiosk ${socket.data.kioskId}` : 'Ukjent');
  return `${name} [${role}${uid ? `:${uid}` : ''}]`;
};

// --- HTTP authentication helpers ---

const bearerToken = (req) => {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
};

// Express middleware: requires a valid session; optionally restricted to roles.
// Accounts that must change their password can only use the endpoints that allow it.
const requireAuth = (roles = null, { allowPasswordChange = false } = {}) => (req, res, next) => {
  const sess = getSession(bearerToken(req));
  if (!sess) return res.status(401).json({ error: 'unauthorized' });
  if (roles && !roles.includes(sess.role)) return res.status(403).json({ error: 'forbidden' });
  if (sess.user.mustChangePassword && !allowPasswordChange) {
    return res.status(403).json({ error: 'password_change_required' });
  }
  req.auth = sess;
  next();
};

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role,
  mustChangePassword: !!user.mustChangePassword,
});

// --- Queue service ---

const ctx = {
  get state() { return state; },
  io,
  addLog,
  debugLog,
  save: saveState,
  saveNow,
  broadcastState,
  broadcastStaffState,
  requireRole,
  refreshSocket,
  refreshAllSockets,
  actorLabel,
  deleteUserSessions,
  revokeKioskDevices,
  getDevice,
  reinitPassport,
  maxWaitingTickets: MAX_WAITING_TICKETS,
  limits: { publicTicketsBySocket, publicTicketsByIp, kioskPinAttempts, counterDisplayRegistrations },
};
const queue = createQueueService(ctx);
ctx.queue = queue;

if ((state.dataVersion || 0) < DATA_VERSION) {
  queue.migrateLegacyTickets();
  state.dataVersion = DATA_VERSION;
}
queue.syncCounters();
queue.refreshTodaySummary();
saveNow();

// Prints a ticket on the printer assigned to a kiosk (errors are logged, never thrown).
const kioskPrinter = (kioskId) => {
  const assignedPrinterId = state.kiosks.find(k => k.id === kioskId)?.assignedPrinterId || state.kioskPrinterAssignments?.[kioskId];
  return assignedPrinterId ? state.printers.find(p => p.id === assignedPrinterId) || null : null;
};
ctx.kioskHasPrinter = (kioskId) => !!kioskPrinter(kioskId);
ctx.printForKiosk = async (kioskId, ticket, service, { language, qrUrl } = {}) => {
  const printer = kioskPrinter(kioskId);
  if (!printer) {
    addLog(`Ingen skriver tilordnet kiosk ${kioskId} ved utskrift av ${ticket.number}`, 'INFO');
    return false;
  }
  const peopleAhead = state.tickets.filter((t) => t.serviceId === service.id && t.status === 'WAITING' && t.id !== ticket.id).length;
  const result = await printTicket({
    printer,
    ticket,
    serviceName: service.name,
    waitTime: estimateWaitMinutes(state, service.id, peopleAhead),
    language,
    brandText: state.branding?.brandText,
    brandLogoUrl: state.branding?.brandLogoData || state.branding?.brandLogoUrl,
    qrUrl: state.settings?.kiosk?.printQr ? qrUrl : undefined,
    footer: state.branding?.ticketFooter,
    log: addLog,
  }).catch((err) => ({ ok: false, error: err?.message || String(err) }));
  if (!result.ok) {
    addLog(`Kiosk-utskrift feilet for ${ticket.number} via ${printer.ipAddress}:${printer.port || 9100} (${result.error})`, 'ALERT');
  }
  return result.ok;
};

// --- Background jobs ---

const PRINTER_CHECK_MS = 30_000;
const PRINTER_TIMEOUT_MS = 2000;
const DISPLAY_FORGET_MS = 7 * 24 * 60 * 60 * 1000;

const runBackup = async (label, actor) => {
  saveNow();
  const file = await backupDatabase(label);
  addLog(`Backup opprettet: ${file}${actor ? ` av ${actor}` : ''}`, 'ACTION');
  return file;
};

// Every 30 s: opening hours, daily reset, scheduled backup and cleanup of old finished tickets.
const runScheduler = async () => {
  const now = new Date();
  const settings = state.settings || DEFAULT_SETTINGS;
  state.jobs = state.jobs || {};

  const open = isOpenAt(settings.schedule, now);
  if (open !== null && open !== state.jobs.lastScheduleOpen) {
    // Only act on transitions, so a manual open/close stays until the next scheduled change.
    state.jobs.lastScheduleOpen = open;
    if (state.isClosed === open) {
      state.isClosed = !open;
      addLog(`Åpningstider: køen er nå ${open ? 'åpnet' : 'stengt'}`, 'ACTION');
      saveState();
      broadcastState();
    }
  }

  if (settings.autoReset?.enabled && isDailyJobDue(settings.autoReset.time, state.jobs.lastResetDay, now)) {
    queue.reset('automatisk daglig nullstilling');
  }

  if (settings.backup?.enabled && isDailyJobDue(settings.backup.time, state.jobs.lastBackupDay, now)) {
    state.jobs.lastBackupDay = localDay(now);
    saveState();
    runBackup('auto').catch((err) => addLog(`Automatisk backup feilet: ${err?.message || err}`, 'ALERT'));
  }

  queue.archiveFinished();

  const forgetBefore = Date.now() - DISPLAY_FORGET_MS;
  const displays = state.counterDisplays.length;
  state.counterDisplays = state.counterDisplays.filter((d) => (d.lastSeen || 0) >= forgetBefore);
  if (state.counterDisplays.length !== displays) {
    saveState();
    broadcastState();
  }
};
setInterval(() => { runScheduler().catch((err) => console.error('Scheduler failed', err)); }, 30_000);
setTimeout(() => { runScheduler().catch((err) => console.error('Scheduler failed', err)); }, 2_000);

// Housekeeping: expired sessions, OAuth codes and rate-limit buckets.
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  Object.entries(state.sessions).forEach(([key, sess]) => {
    if (!sess?.expiresAt || sess.expiresAt < now) {
      delete state.sessions[key];
      removed += 1;
    }
  });
  if (removed > 0) {
    saveState();
    refreshAllSockets();
  }
  oauthCodes.forEach((entry, code) => {
    if (entry.expiresAt < now) oauthCodes.delete(code);
  });
  apiRateLimits.forEach((entry, ip) => {
    const active = entry.blocked ? entry.blockExpiry > now : entry.timestamps.some((t) => now - t < API_RATE_WINDOW_MS);
    if (!active) apiRateLimits.delete(ip);
  });
  [loginFailuresByUser, loginFailuresByIp, publicTicketsBySocket, publicTicketsByIp, socketEvents, kioskPinAttempts, counterDisplayRegistrations]
    .forEach((limiter) => limiter.sweep());
}, 10 * 60 * 1000);

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

const checkPrinters = async ({ logAll = false } = {}) => {
  if (!state.printers || state.printers.length === 0) return;
  let changed = false;
  for (const p of [...state.printers]) {
    const ok = await checkPrinter(p.ipAddress, p.port || 9100);
    const nextStatus = ok ? 'ONLINE' : 'OFFLINE';
    const current = state.printers.find((x) => x.id === p.id);
    if (!current) continue;
    if (current.status !== nextStatus || logAll) {
      addLog(`Skriver ${p.name || p.id} ${p.ipAddress}:${p.port || 9100}: ${nextStatus}`, nextStatus === 'ONLINE' ? 'INFO' : 'ALERT');
    }
    if (current.status !== nextStatus) {
      current.status = nextStatus;
      changed = true;
    }
  }
  if (changed) {
    saveState();
    broadcastStaffState();
  }
};
ctx.checkPrinters = checkPrinters;
setInterval(() => { checkPrinters().catch(() => {}); }, PRINTER_CHECK_MS);
checkPrinters({ logAll: true }).catch(() => {});

const pruneOldFiles = (dir, extension, retentionDays, label) => {
  try {
    if (!fs.existsSync(dir)) return;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    fs.readdirSync(dir).filter(f => f.endsWith(extension)).forEach((f) => {
      const full = join(dir, f);
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed += 1;
      }
    });
    if (removed > 0) addLog(`Slettet ${removed} gamle ${label}`, 'INFO');
  } catch (e) {
    console.warn(`Failed to prune ${label}`, e);
  }
};
const pruneOldLogs = () => pruneOldFiles(LOG_DIR, '.log', LOG_RETENTION_DAYS, 'loggfiler');
const pruneOldBackups = () => pruneOldFiles(BACKUP_DIR, '.db', BACKUP_RETENTION_DAYS, 'backups');
pruneOldLogs();
pruneOldBackups();
setInterval(pruneOldLogs, 12 * 60 * 60 * 1000);
setInterval(pruneOldBackups, 12 * 60 * 60 * 1000);

// --- HTTP ---

// Request logging: API and auth calls plus errors; paths only (query strings may carry codes).
app.use((req, res, next) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const status = res.statusCode;
    const relevant = path.startsWith('/api/') || path.startsWith('/auth/') || status >= 400;
    if (!relevant) return;
    const duration = Date.now() - start;
    const slowTag = duration > SLOW_REQUEST_MS ? ' SLOW' : '';
    const message = `${req.method} ${path} -> ${status} (${duration}ms)${slowTag}`;
    if (status >= 400 || duration > SLOW_REQUEST_MS) addLog(message, status >= 500 ? 'ALERT' : 'ACTION');
    else debugLog(message);
  });
  next();
});

app.use(apiRateLimiter);

// --- REST: test print on a configured printer (admin session or API key) ---
app.post('/api/print-ticket', requireAllowedIP, (req, res) => {
  const sess = getSession(bearerToken(req));
  const isAdmin = sess && sess.role === 'ADMIN' && !sess.user.mustChangePassword;
  if (!isAdmin && !hasValidApiKey(req)) {
    addLog(`Utskrift avvist: mangler admin-innlogging eller API-nøkkel fra ${getClientIp(req)}`, 'ALERT');
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const { printerId, ticketNumber, serviceId, language } = req.body || {};
  const printer = typeof printerId === 'string' ? state.printers.find(p => p.id === printerId) : null;
  if (!printer) {
    return res.status(400).json({ ok: false, error: 'unknown_printer' });
  }
  const service = typeof serviceId === 'string' ? state.services.find(s => s.id === serviceId) : null;

  printTicket({
    printer,
    ticket: { number: cleanText(ticketNumber, 12) || 'TEST' },
    serviceName: service?.name,
    waitTime: service ? estimateWaitMinutes(state, service.id) : undefined,
    language,
    brandText: state.branding?.brandText,
    brandLogoUrl: state.branding?.brandLogoData || state.branding?.brandLogoUrl,
    footer: state.branding?.ticketFooter,
    log: addLog,
  }).then((result) => {
    res.status(result.ok ? 200 : 502).json(result);
  }).catch((err) => {
    addLog(`Utskrift feilet: ${err?.message || err}`, 'ALERT');
    res.status(500).json({ ok: false, error: 'print_failed' });
  });
});

// --- Auth Endpoints ---

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    addLog('Innlogging feilet: mangler brukernavn eller passord', 'ALERT');
    return res.status(400).json({ error: 'missing_credentials' });
  }
  const ip = getClientIp(req);
  const key = loginKey(ip, username);
  if (loginFailuresByUser.isBlocked(key) || loginFailuresByIp.isBlocked(ip)) {
    addLog(`Innlogging blokkert for ${cleanText(username, 64)} fra ${ip} (for mange forsøk)`, 'ALERT');
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  const user = (state.users || []).find(u => u.username === username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    loginFailuresByUser.hit(key);
    loginFailuresByIp.hit(ip);
    addLog(`Innlogging feilet for ${cleanText(username, 64)} fra ${ip}`, 'ALERT');
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  loginFailuresByUser.reset(key);

  // If legacy hash, upgrade to bcrypt
  if (!user.passwordHash.startsWith('$2')) {
    const idx = state.users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      state.users[idx] = { ...user, passwordHash: hashPassword(password) };
      saveState();
    }
  }

  const token = createSession(user.id);
  addLog(`Innlogging vellykket for ${user.username} (${user.role}) fra ${ip}`, 'ACTION');
  return res.json({ token, user: publicUser(state.users.find(u => u.id === user.id) || user) });
});

app.post('/api/logout', (req, res) => {
  const token = bearerToken(req) || (typeof req.body?.token === 'string' ? req.body.token : null);
  const sess = getSession(token);
  if (sess) {
    delete state.sessions[sess.key];
    saveState();
    addLog(`Bruker logget ut: ${sess.user.username} (${sess.user.role})`, 'INFO');
    refreshAllSockets();
  }
  return res.json({ ok: true });
});

app.get('/api/me', requireAuth(null, { allowPasswordChange: true }), (req, res) => {
  return res.json({ user: publicUser(req.auth.user) });
});

app.post('/api/user/password', requireAuth(null, { allowPasswordChange: true }), (req, res) => {
  const userIdx = (state.users || []).findIndex(u => u.id === req.auth.user.id);
  if (userIdx === -1) return res.status(401).json({ error: 'unauthorized' });
  const { oldPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || !newPassword) return res.status(400).json({ error: 'missing_new_password' });
  const policy = passwordPolicy(newPassword);
  if (!policy.ok) return res.status(400).json({ error: policy.error });
  const user = state.users[userIdx];
  if (user.passwordHash && (typeof oldPassword !== 'string' || !verifyPassword(oldPassword, user.passwordHash))) {
    addLog(`Passordendring feilet for ${user.username}: ugyldig gammelt passord`, 'ALERT');
    return res.status(401).json({ error: 'invalid_old_password' });
  }
  if (user.passwordHash && oldPassword === newPassword) {
    return res.status(400).json({ error: 'password_unchanged' });
  }
  state.users[userIdx] = { ...user, passwordHash: hashPassword(newPassword), mustChangePassword: false };
  // Sign out every other device of this user.
  deleteUserSessions(user.id, req.auth.key);
  saveState();
  addLog(`Passord endret for ${user.username}`, 'ACTION');
  refreshAllSockets();
  return res.json({ ok: true });
});

// --- OAuth / OIDC Authentication Routes ---

app.get('/api/auth/providers', (req, res) => {
  return res.json({
    local: true,
    google: isGoogleConfigured(state),
    oidc: isOIDCConfigured(state)
  });
});

const LOGIN_PAGE = '/#/login';
const KNOWN_AUTH_ERRORS = new Set(Object.values(AUTH_ERRORS));

const oauthCallback = (provider, label) => (req, res, next) => {
  const ip = getClientIp(req);
  const fail = (code) => {
    loginFailuresByIp.hit(ip);
    return res.redirect(`${LOGIN_PAGE}?error=${encodeURIComponent(code)}`);
  };
  const configured = provider === 'google' ? isGoogleConfigured(state) : isOIDCConfigured(state);
  if (!configured) return fail(`${provider}_not_configured`);

  passport.authenticate(provider, { session: false }, (err, user, info) => {
    if (err) {
      addLog(`${label} feil: ${err.message || err}`, 'ALERT');
      return fail(`${provider}_auth_failed`);
    }
    if (!user) {
      const code = KNOWN_AUTH_ERRORS.has(info?.message) ? info.message : `${provider}_auth_failed`;
      addLog(`${label} avvist fra ${ip}: ${code}`, 'ALERT');
      return fail(code);
    }
    saveState();
    const code = issueLoginCode(user.id);
    addLog(`${label} innlogging vellykket for ${user.username} (${user.role}) fra ${ip}`, 'ACTION');
    // The hash fragment never reaches the server or proxy logs.
    return res.redirect(`${LOGIN_PAGE}?code=${code}`);
  })(req, res, next);
};

const oauthStart = (provider, label, options) => (req, res, next) => {
  const ip = getClientIp(req);
  if (loginFailuresByIp.isBlocked(ip)) {
    addLog(`${label} blokkert for ${ip} (for mange forsøk)`, 'ALERT');
    return res.status(429).json({ error: 'too_many_attempts' });
  }
  const configured = provider === 'google' ? isGoogleConfigured(state) : isOIDCConfigured(state);
  if (!configured) {
    return res.status(400).json({ error: `${label} authentication not configured` });
  }
  passport.authenticate(provider, options)(req, res, next);
};

app.get('/auth/google', oauthStart('google', 'Google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', oauthCallback('google', 'Google OAuth'));
app.get('/auth/oidc', oauthStart('oidc', 'OIDC'));
app.get('/auth/oidc/callback', oauthCallback('oidc', 'OIDC'));

// Exchanges the single-use code from the OAuth redirect for a session token.
app.post('/api/auth/exchange', (req, res) => {
  const code = req.body?.code;
  const entry = typeof code === 'string' ? oauthCodes.get(code) : null;
  if (entry) oauthCodes.delete(code);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'invalid_code' });
  }
  const user = state.users.find(u => u.id === entry.userId);
  if (!user) return res.status(400).json({ error: 'invalid_code' });
  const token = createSession(user.id);
  return res.json({ token, user: publicUser(user) });
});

// --- Branding: uploaded logo ---

app.get('/api/branding/logo', (req, res) => {
  const data = state.branding?.brandLogoData;
  const parsed = data ? parseLogoDataUrl(data) : null;
  if (!parsed || parsed.error) return res.status(404).end();
  res.setHeader('Content-Type', parsed.mime);
  // The URL carries a version, so browsers may cache it.
  res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  // An SVG opened directly must not be able to run scripts on this origin.
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  return res.send(parsed.buffer);
});

app.post('/api/admin/branding/logo', requireAuth(['ADMIN']), express.json({ limit: '3mb' }), (req, res) => {
  const parsed = parseLogoDataUrl(req.body?.dataUrl);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  state.branding = {
    ...state.branding,
    brandLogoData: req.body.dataUrl,
    brandLogoUrl: '',
    logoVersion: crypto.createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 12),
  };
  saveState();
  broadcastState();
  addLog(`Logo lastet opp av ${req.auth.user.username} (${Math.round(parsed.buffer.length / 1024)} kB)`, 'ACTION');
  return res.json({ ok: true });
});

app.delete('/api/admin/branding/logo', requireAuth(['ADMIN']), (req, res) => {
  state.branding = { ...state.branding, brandLogoData: undefined, logoVersion: undefined, brandLogoUrl: '' };
  saveState();
  broadcastState();
  addLog(`Logo fjernet av ${req.auth.user.username}`, 'ACTION');
  return res.json({ ok: true });
});

// --- Statistics ---

const statsRange = (req) => {
  const today = localDay();
  const from = isValidDay(req.query.from) ? req.query.from : today;
  const to = isValidDay(req.query.to) ? req.query.to : from;
  return from <= to ? { from, to } : { from: to, to: from };
};

app.get('/api/stats', requireAuth(['ADMIN', 'OPERATOR']), (req, res) => {
  const { from, to } = statsRange(req);
  return res.json(buildStats(from, to, state.tickets));
});

app.get('/api/stats/export.csv', requireAuth(['ADMIN']), (req, res) => {
  const { from, to } = statsRange(req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="qflow-${from}_${to}.csv"`);
  // BOM so Excel opens UTF-8 (æøå) correctly
  return res.send(`\uFEFF${historyCsv(from, to)}`);
});

// --- Backups ---

app.post('/api/admin/backup', requireAllowedIP, requireAuth(['ADMIN']), async (req, res) => {
  try {
    const file = await runBackup('manual', req.auth.user.username);
    return res.json({ ok: true, file });
  } catch (err) {
    console.error('Backup failed', err);
    return res.status(500).json({ error: 'backup_failed' });
  }
});

app.get('/api/admin/backups', requireAllowedIP, requireAuth(['ADMIN']), (req, res) => {
  try {
    return res.json({ ok: true, backups: listBackups() });
  } catch (err) {
    console.error('List backups failed', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

app.get('/api/admin/backup/:file', requireAllowedIP, requireAuth(['ADMIN']), (req, res) => {
  const target = backupPath(req.params.file);
  if (!target) return res.status(404).json({ error: 'not_found' });
  addLog(`Backup lastet ned: ${req.params.file} av ${req.auth.user.username}`, 'ACTION');
  return res.download(target, req.params.file);
});

app.delete('/api/admin/backup/:file', requireAllowedIP, requireAuth(['ADMIN']), (req, res) => {
  const target = backupPath(req.params.file);
  if (!target) return res.status(404).json({ error: 'not_found' });
  fs.unlinkSync(target);
  addLog(`Backup slettet: ${req.params.file} av ${req.auth.user.username}`, 'ACTION');
  return res.json({ ok: true });
});

// Replaces the live data with a backup. Current sessions and kiosk devices are kept,
// so nobody is signed out; a safety backup is taken first.
const restoreBackup = async (file, actor) => {
  const { state: restored, history } = readBackup(file);
  const safety = await runBackup('pre-restore', actor);
  const keep = { sessions: state.sessions, devices: state.devices };
  const next = prepareState(restored);
  next.sessions = Object.fromEntries(Object.entries(keep.sessions).filter(([, s]) => next.users.some((u) => u.id === s.userId)));
  next.devices = keep.devices;
  state = next;
  bootstrapAdmin();
  replaceHistory(history);
  if ((state.dataVersion || 0) < DATA_VERSION) {
    queue.migrateLegacyTickets();
    state.dataVersion = DATA_VERSION;
  }
  queue.syncCounters();
  queue.refreshTodaySummary();
  reinitPassport();
  saveNow();
  refreshAllSockets();
  broadcastState();
  addLog(`Data gjenopprettet fra ${file.split(/[\\/]/).pop()} av ${actor} (sikkerhetskopi før gjenoppretting: ${safety})`, 'ALERT');
  return safety;
};

app.post('/api/admin/backup/:file/restore', requireAllowedIP, requireAuth(['ADMIN']), async (req, res) => {
  const target = backupPath(req.params.file);
  if (!target) return res.status(404).json({ error: 'not_found' });
  try {
    const safety = await restoreBackup(target, req.auth.user.username);
    return res.json({ ok: true, safetyBackup: safety });
  } catch (err) {
    addLog(`Gjenoppretting feilet: ${err?.message || err}`, 'ALERT');
    return res.status(400).json({ error: 'restore_failed' });
  }
});

app.post(
  '/api/admin/backups/upload',
  requireAllowedIP,
  requireAuth(['ADMIN']),
  express.raw({ type: 'application/octet-stream', limit: '200mb' }),
  (req, res) => {
    try {
      const file = saveUploadedBackup(req.body);
      addLog(`Backup lastet opp: ${file} av ${req.auth.user.username}`, 'ACTION');
      return res.json({ ok: true, file });
    } catch (err) {
      return res.status(400).json({ error: err?.message || 'invalid_backup' });
    }
  },
);

// --- Health ---

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

// --- Socket.IO ---

io.use((socket, next) => {
  const authHeader = socket.handshake.headers?.authorization || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = socket.handshake.auth?.token || tokenFromHeader;
  const deviceToken = socket.handshake.auth?.deviceToken;
  socket.data.token = typeof token === 'string' ? token : null;
  socket.data.deviceToken = typeof deviceToken === 'string' ? deviceToken : null;
  socket.data.ip = getSocketIp(socket);
  return next();
});

io.on('connection', (socket) => {
  applySocketAuth(socket);
  debugLog(`Socket connected ${socket.id} role=${socket.data.authRole} ip=${socket.data.ip}`);

  // Rejected packets surface as 'error' events; without a listener they would crash the process.
  socket.on('error', (err) => {
    if (err?.message === 'rate_limited' && !socket.data.rateLimitLogged) {
      socket.data.rateLimitLogged = true;
      addLog(`Socket ${socket.id} fra ${socket.data.ip} strupes (for mange hendelser)`, 'ALERT');
    }
  });

  // Unauthenticated and kiosk sockets get a per-socket event budget.
  socket.use(([event], next) => {
    if (socket.data.authRole === 'ADMIN' || socket.data.authRole === 'OPERATOR') return next();
    if (!socketEvents.hit(socket.id)) {
      socket.emit('action-denied', { error: 'rate_limited', event });
      return next(new Error('rate_limited'));
    }
    return next();
  });

  socket.emit('session-info', sessionInfo(socket));
  sendState(socket);

  socket.on('disconnect', (reason) => {
    socketEvents.reset(socket.id);
    publicTicketsBySocket.reset(socket.id);
    debugLog(`Socket disconnected ${socket.id} (${reason})`);
  });

  socket.on('request-state', () => {
    refreshSocket(socket);
    sendState(socket);
  });

  registerSocketHandlers(socket, ctx);
});

// Serve static files from the 'dist' directory (Vite build)
app.use(express.static(join(__dirname, 'dist')));

// Handle client-side routing, return all requests to index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// A server that cannot listen is useless: exit so systemd reports the failure (and retries).
httpServer.on('error', (err) => {
  console.error(`Cannot listen on ${HOST}:${PORT}: ${err.code || err.message}${err.code === 'EADDRINUSE' ? ' (another process is using the port)' : ''}`);
  process.exit(1);
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  try {
    // Lets the user CLI detect a running server (it must not edit the database underneath it).
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch {
    // not critical
  }
});

const shutdown = (signal) => {
  try {
    saveNow();
    closeDb();
  } catch (err) {
    console.error('Final save failed', err);
  }
  try {
    if (fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf8') === String(process.pid)) fs.unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
  console.log(`Received ${signal}, state saved. Bye.`);
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Global process error logging
process.on('unhandledRejection', (reason) => {
  addLog(`Unhandled rejection: ${reason}`, 'ALERT');
});

process.on('uncaughtException', (err) => {
  addLog(`Uncaught exception: ${err?.message || err}`, 'ALERT');
});
