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
import { loadState as loadStateFromStore, saveState as saveStateToStore, backupDatabase, listBackups, getDataDir } from './lib/stateStore.js';
import { initializePassport, isGoogleConfigured, isOIDCConfigured, AUTH_ERRORS } from './lib/passportConfig.js';
import {
  parseTrustProxy,
  normalizeClientIp,
  hashToken,
  generateToken,
  safeEqual,
  isValidPrinterHost,
  isValidPort,
  createRateLimiter,
} from './lib/security.js';
import { hashPassword, verifyPassword, passwordPolicy, migrateUsers, generatePassword } from './lib/users.js';
import { viewForRole } from './lib/stateViews.js';
import { printTicket } from './lib/printer.js';

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
app.use(express.json({ limit: '1mb' }));
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
  // The first admin is created on first boot (see bootstrapAdmin below).
  users: [],
  tickets: [],
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
    brandLogoUrl: ''
  },
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
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || 14);
const BACKUP_DIR = join(DATA_DIR, 'backups');
const BACKUP_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const SLOW_REQUEST_MS = 1200;
const WAITING_ALERT_THRESHOLD = 50;
const WAITING_ALERT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_WAITING_TICKETS = Number(process.env.MAX_WAITING_TICKETS || 500);
const MAX_KIOSKS = 100;
const MAX_COUNTER_DISPLAYS = 200;
const OAUTH_CODE_TTL_MS = 60 * 1000;
// Bumped when a release needs a one-time migration of security-relevant data.
const SECURITY_VERSION = 1;
let lastQueueAlertAt = 0;

const cleanText = (val = '', max = 80) => {
  if (typeof val !== 'string') return '';
  return val.replace(/\s+/g, ' ').trim().slice(0, max);
};

const isSafeId = (val) => typeof val === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(val);
const randomId = () => crypto.randomBytes(6).toString('hex');

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

  // Check if currently blocked
  if (entry.blocked && entry.blockExpiry > now) {
    return { allowed: false, remaining: 0, blockExpiry: entry.blockExpiry };
  }

  // Unblock if block period expired
  if (entry.blocked && entry.blockExpiry <= now) {
    entry = { timestamps: [], blocked: false, blockExpiry: 0 };
  }

  // Clean old timestamps
  const recent = entry.timestamps.filter((t) => now - t < API_RATE_WINDOW_MS);

  // Check if limit exceeded
  if (recent.length >= MAX_API_REQUESTS) {
    entry.blocked = true;
    entry.blockExpiry = now + API_BLOCK_DURATION_MS;
    entry.timestamps = recent;
    apiRateLimits.set(ip, entry);
    return { allowed: false, remaining: 0, blockExpiry: entry.blockExpiry };
  }

  // Add current request
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

// Middleware: General API rate limiting
const apiRateLimiter = (req, res, next) => {
  // Skip rate limiting for health endpoint
  if (req.path === '/health') return next();

  // Apply rate limiting to API endpoints only
  if (!req.path.startsWith('/api/')) return next();

  const ip = getClientIp(req);
  const check = checkApiRateLimit(ip);

  // Set rate limit headers
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
  if (ALLOWED_API_IPS.length === 0) return true; // No whitelist = allow all

  const normalizedIp = normalizeClientIp(ip);
  if (!normalizedIp) return false;
  for (const allowed of ALLOWED_API_IPS) {
    const normalizedAllowed = normalizeClientIp(allowed);
    if (normalizedAllowed === normalizedIp) return true;

    // Basic CIDR support (e.g., 192.168.1.0/24)
    if (allowed.includes('/') && isIPv4(normalizedIp)) {
      const [network, bitsRaw] = allowed.split('/');
      const normalizedNetwork = normalizeClientIp(network);
      const bits = Number(bitsRaw);
      if (!Number.isInteger(bits) || bits < 0 || bits > 32 || !isIPv4(normalizedNetwork)) continue;
      const mask = bits === 0 ? 0 : (-1 << (32 - bits));
      const networkInt = ipToInt(normalizedNetwork);
      const ipInt = ipToInt(normalizedIp);
      if ((ipInt & mask) === (networkInt & mask)) return true;
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

// Middleware: Validate IP whitelist
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

const addLog = (message, type = 'INFO') => {
  const log = {
    id: crypto.randomBytes(5).toString('hex'),
    timestamp: Date.now(),
    message,
    type
  };
  if (state) state.logs = [log, ...(state.logs || [])].slice(0, LOG_LIMIT);
  try {
    console.log(JSON.stringify({ level: type, msg: message, ts: log.timestamp }));
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date(log.timestamp).toISOString().slice(0, 10);
    fs.appendFileSync(join(LOG_DIR, `app-${day}.log`), JSON.stringify({ level: type, msg: message, ts: log.timestamp }) + '\n');
    io.to([ROOMS.OPERATOR, ROOMS.ADMIN]).emit('log-event', log);
  } catch (e) {
    // fallback noop
  }
  return log;
};

// --- Load and migrate state ---

state = loadStateFromStore(DEFAULT_STATE);
state = { ...DEFAULT_STATE, ...state };

if (!state.kioskPrinterAssignments) state.kioskPrinterAssignments = {};
if (!state.counterDisplays) state.counterDisplays = [];
if (!state.kiosks) state.kiosks = [];
if (!state.printers) state.printers = [];
if (!state.tickets) state.tickets = [];
if (!state.logs) state.logs = [];
if (state.isClosed === undefined) state.isClosed = false;
if (!state.branding) state.branding = { brandText: 'Q-Flow Pro', brandLogoUrl: '' };
if (!state.sessions || typeof state.sessions !== 'object') state.sessions = {};
if (!state.devices || typeof state.devices !== 'object') state.devices = {};
if (!state.authProviders) state.authProviders = DEFAULT_STATE.authProviders;
if (state.authProviders.oidc && state.authProviders.oidc.requireVerifiedEmail === undefined) {
  state.authProviders.oidc.requireVerifiedEmail = true;
}

if ((state.securityVersion || 0) < SECURITY_VERSION) {
  // Earlier versions broadcast the whole state (including session tokens and password hashes)
  // to every connected client, and shipped a db.json with long-lived admin sessions.
  // Treat every existing session as compromised and clean up credentials derived from it.
  const { users } = migrateUsers(state.users, { checkPasswords: true });
  state.users = users;
  const hadSessions = Object.keys(state.sessions).length;
  state.sessions = {};
  state.devices = {};
  if (typeof state.kioskExitPin === 'string' && state.kioskExitPin) {
    state.kioskExitPinHash = hashPassword(state.kioskExitPin);
  }
  state.securityVersion = SECURITY_VERSION;
  addLog(`Sikkerhetsmigrering ${SECURITY_VERSION} fullført: ${hadSessions} gamle innlogginger ugyldiggjort`, 'ALERT');
} else {
  state.users = migrateUsers(state.users, { checkPasswords: false }).users;
}
delete state.kioskExitPin;
if (typeof state.kioskExitPinHash !== 'string') state.kioskExitPinHash = '';

// Drop sessions that are expired or have no expiry (legacy sessions never expired).
Object.entries(state.sessions).forEach(([key, sess]) => {
  if (!sess?.expiresAt || sess.expiresAt < Date.now()) delete state.sessions[key];
});

// Create the first admin on a fresh install. The password comes from QFLOW_ADMIN_PASSWORD,
// or is generated and printed once to the console (docker logs / journalctl).
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

// Ensure kiosk printer assignments survive restarts by seeding map from kiosks
state.kiosks.forEach(k => {
  if (k.assignedPrinterId && !state.kioskPrinterAssignments[k.id]) {
    state.kioskPrinterAssignments[k.id] = k.assignedPrinterId;
  }
});

saveState();

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

// Initialize Passport strategies after createSession and addLog are defined
initializePassport(state, createSession, addLog);

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
  broadcastStaffState();
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
  broadcastState();
}, 15_000);

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
    broadcastStaffState();
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
    broadcastStaffState();
  }
})();

// HTTP request logging (path only: query strings may carry codes and must not end up in logs)
app.use((req, res, next) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (path === '/health' || path.startsWith('/assets/')) return next();
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const slowTag = duration > SLOW_REQUEST_MS ? ' SLOW' : '';
    const level = status >= 500 ? 'ALERT' : status >= 400 ? 'ACTION' : (duration > SLOW_REQUEST_MS ? 'ACTION' : 'INFO');
    addLog(`${req.method} ${path} -> ${status} (${duration}ms)${slowTag}`, level);
  });
  next();
});

// Apply API rate limiting before routes
app.use(apiRateLimiter);

const ticketWaitTime = (service) => {
  const serviceWaitingCount = state.tickets.filter(t => t.serviceId === service.id && t.status === 'WAITING').length;
  return serviceWaitingCount * (service.estimatedTimePerPersonMinutes || 1);
};

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
    waitTime: service ? ticketWaitTime(service) : undefined,
    language,
    brandText: state.branding?.brandText,
    brandLogoUrl: state.branding?.brandLogoUrl,
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

// Get available auth providers (for login page)
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
    // Persist linked/provisioned users
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

const actorLabel = (socket) => {
  const role = socket?.data?.authRole || 'PUBLIC';
  const uid = socket?.data?.userId;
  const user = uid ? (state.users || []).find((u) => u.id === uid) : null;
  const name = user?.name || user?.username || (socket?.data?.kioskId ? `Kiosk ${socket.data.kioskId}` : 'Ukjent');
  return `${name} [${role}${uid ? `:${uid}` : ''}]`;
};

const pruneOldFiles = (dir, extension, retentionDays, label) => {
  const started = Date.now();
  try {
    if (!fs.existsSync(dir)) return;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(extension));
    let removed = 0;
    files.forEach((f) => {
      const full = join(dir, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed += 1;
      }
    });
    const duration = Date.now() - started;
    if (removed > 0 || duration > 500) {
      addLog(`Prunet ${removed} gamle ${label} (${duration}ms)`, 'INFO');
    }
  } catch (e) {
    console.warn(`Failed to prune ${label}`, e);
  }
};

const pruneOldLogs = () => pruneOldFiles(LOG_DIR, '.log', LOG_RETENTION_DAYS, 'loggfiler');
const pruneOldBackups = () => pruneOldFiles(BACKUP_DIR, '.db', BACKUP_RETENTION_DAYS, 'backups');

// Periodic log pruning
pruneOldLogs();
setInterval(pruneOldLogs, 12 * 60 * 60 * 1000); // every 12h

// Periodic backup pruning
pruneOldBackups();
setInterval(pruneOldBackups, 12 * 60 * 60 * 1000);

// --- Settings validation ---

const VALID_TICKET_STATUSES = new Set(['WAITING', 'SERVING', 'COMPLETED', 'CANCELLED']);
const SOUND_KEYS = ['kioskEffects', 'adminEffects', 'callChime', 'callVoice'];
const ROLE_OF = (role) => (role === 'ADMIN' ? 'ADMIN' : 'OPERATOR');

const isAllowedLogoUrl = (url) => url === ''
  || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(url)
  || /^https?:\/\/[^\s]+$/i.test(url);

// Returns { users, removedIds, credentialChangedIds } or { error }.
const buildUsersUpdate = (incoming) => {
  const seen = new Set();
  const credentialChangedIds = [];
  const nextUsers = [];
  for (const u of incoming) {
    if (!u || typeof u !== 'object') return { error: 'invalid_user' };
    const existing = typeof u.id === 'string' ? state.users.find(x => x.id === u.id) : null;
    const username = cleanText(u.username || existing?.username || '', 64);
    if (!username) return { error: 'missing_username' };
    if (seen.has(username.toLowerCase())) return { error: 'duplicate_username' };
    seen.add(username.toLowerCase());
    const name = cleanText(u.name || '', 80) || existing?.name || username;

    // Hashes are never accepted from clients; only a new plaintext password can change them.
    let passwordHash = existing?.passwordHash || '';
    let mustChangePassword = !!existing?.mustChangePassword;
    if (u.password) {
      const policy = passwordPolicy(u.password);
      if (!policy.ok) return { error: policy.error };
      passwordHash = hashPassword(u.password);
      mustChangePassword = u.mustChangePassword === true;
      if (existing) credentialChangedIds.push(existing.id);
    }
    if (!existing && !passwordHash) return { error: 'password_required' };

    nextUsers.push({
      id: existing?.id || (isSafeId(u.id) ? u.id : `u_${randomId()}`),
      name,
      username,
      role: ROLE_OF(u.role),
      provider: existing?.provider || 'local',
      email: existing?.email,
      externalId: existing?.externalId,
      passwordHash,
      mustChangePassword,
    });
  }
  if (!nextUsers.some(u => u.role === 'ADMIN')) return { error: 'must_have_admin' };
  const keptIds = new Set(nextUsers.map(u => u.id));
  const removedIds = state.users.filter(u => !keptIds.has(u.id)).map(u => u.id);
  // A demoted user must not keep an admin session.
  nextUsers.forEach((u) => {
    const before = state.users.find(x => x.id === u.id);
    if (before && before.role !== u.role) credentialChangedIds.push(u.id);
  });
  return { users: nextUsers, removedIds, credentialChangedIds };
};

const buildPrintersUpdate = (incoming) => {
  const printers = [];
  for (const p of incoming) {
    if (!p || typeof p !== 'object') return { error: 'invalid_printer' };
    const ipAddress = typeof p.ipAddress === 'string' ? p.ipAddress.trim() : '';
    const port = Number(p.port) || 9100;
    if (!isValidPrinterHost(ipAddress) || !isValidPort(port)) return { error: 'invalid_printer' };
    const existing = typeof p.id === 'string' ? state.printers.find(x => x.id === p.id) : null;
    printers.push({
      id: existing?.id || (isSafeId(p.id) ? p.id : randomId()),
      name: cleanText(p.name, 80) || ipAddress,
      ipAddress,
      port,
      type: p.type === 'GENERIC_NETWORK' ? 'GENERIC_NETWORK' : 'EPSON_IP',
      status: existing?.status || 'OFFLINE',
    });
  }
  return { printers };
};

const mergeProvider = (current = {}, incoming = {}, extraBooleans = []) => {
  const next = { ...current };
  if (typeof incoming.enabled === 'boolean') next.enabled = incoming.enabled;
  if (typeof incoming.clientId === 'string') next.clientId = cleanText(incoming.clientId, 512);
  // Secrets are write-only: an empty value means "keep the stored secret".
  if (typeof incoming.clientSecret === 'string' && incoming.clientSecret.trim()) next.clientSecret = incoming.clientSecret.trim().slice(0, 1024);
  if (typeof incoming.autoProvision === 'boolean') next.autoProvision = incoming.autoProvision;
  if (incoming.defaultRole !== undefined) next.defaultRole = ROLE_OF(incoming.defaultRole);
  extraBooleans.forEach((key) => {
    if (typeof incoming[key] === 'boolean') next[key] = incoming[key];
  });
  return next;
};

// --- Socket.IO Logic ---

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
  addLog(`Socket connected ${socket.id} role=${socket.data.authRole} ip=${socket.data.ip}`, 'INFO');

  // Rejected packets surface as 'error' events; without a listener they would crash the process.
  socket.on('error', (err) => {
    if (err?.message === 'rate_limited' && !socket.data.rateLimitLogged) {
      socket.data.rateLimitLogged = true;
      addLog(`Socket ${socket.id} fra ${socket.data.ip} struper (for mange hendelser)`, 'ALERT');
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
    addLog(`Socket disconnected ${socket.id} (${reason})`, 'INFO');
  });

  // Allow clients to request state again (e.g., if initial emit was missed)
  socket.on('request-state', () => {
    refreshSocket(socket);
    sendState(socket);
  });

  // --- Ticket Handlers ---

  socket.on('add-ticket', async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const deny = (error) => {
      socket.emit('add-ticket-denied', { error });
      reply({ ok: false, error });
    };
    refreshSocket(socket);
    const { serviceId, language } = payload || {};

    if (state.isClosed) {
      addLog('Forsøk på å trekke billett mens systemet er stengt', 'ALERT');
      return deny('closed');
    }
    const service = typeof serviceId === 'string' ? state.services.find(s => s.id === serviceId && s.isOpen !== false) : null;
    if (!service) {
      addLog(`Forsøk på å trekke billett for utilgjengelig tjeneste (${cleanText(String(serviceId ?? ''), 40)})`, 'ALERT');
      return deny('service_unavailable');
    }
    if (socket.data.authRole === 'PUBLIC') {
      if (!publicTicketsBySocket.hit(socket.id) || !publicTicketsByIp.hit(socket.data.ip)) {
        addLog(`Billett avvist for ${socket.data.ip}: for mange billetter på kort tid`, 'ALERT');
        return deny('rate_limited');
      }
    }
    const waitingCount = state.tickets.filter(t => t.status === 'WAITING').length;
    if (waitingCount >= MAX_WAITING_TICKETS) {
      addLog(`Billett avvist: køen er full (${waitingCount} ventende)`, 'ALERT');
      return deny('queue_full');
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
      id: crypto.randomBytes(6).toString('hex'),
      number: `${service.prefix}${nextNum}`,
      serviceId,
      status: 'WAITING',
      createdAt: Date.now(),
    };

    state.tickets.push(newTicket);
    addLog(`Ny billett trukket: ${newTicket.number} (${service.name})`, 'ACTION');

    if (waitingCount + 1 >= WAITING_ALERT_THRESHOLD && Date.now() - lastQueueAlertAt > WAITING_ALERT_INTERVAL_MS) {
      lastQueueAlertAt = Date.now();
      addLog(`Kø over terskel ${WAITING_ALERT_THRESHOLD}: ${waitingCount + 1} ventende`, 'ALERT');
    }

    saveState();
    broadcastState();

    // Only an activated kiosk device can make the server print, and only on its own printer.
    const kioskKey = socket.data.kioskId;
    const assignedPrinterId = kioskKey
      ? (state.kiosks.find(k => k.id === kioskKey)?.assignedPrinterId || state.kioskPrinterAssignments?.[kioskKey])
      : null;
    const printer = assignedPrinterId ? state.printers.find(p => p.id === assignedPrinterId) : null;
    if (kioskKey && !printer) {
      addLog(`Ingen skriver tilordnet kiosk ${kioskKey} ved utskrift av ${newTicket.number}`, 'INFO');
    }
    reply({ ok: true, ticket: newTicket, printing: !!printer });
    if (!printer) return;

    const result = await printTicket({
      printer,
      ticket: newTicket,
      serviceName: service.name,
      waitTime: ticketWaitTime(service),
      language: language === 'en' ? 'en' : 'no',
      brandText: state.branding?.brandText,
      brandLogoUrl: state.branding?.brandLogoUrl,
      log: addLog,
    }).catch((err) => ({ ok: false, error: err?.message || String(err) }));
    if (!result.ok) {
      addLog(`Kiosk-utskrift feilet for ${newTicket.number} via ${printer.ipAddress}:${printer.port || 9100} (${result.error})`, 'ALERT');
    }
  });

  socket.on('update-ticket-status', (payload) => {
    const { ticketId, status, counterId } = payload || {};
    if (!requireRole(socket, ['ADMIN', 'OPERATOR'])) {
      addLog(`Avvist statusendring for ${cleanText(String(ticketId ?? ''), 40)} av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    if (!VALID_TICKET_STATUSES.has(status)) return;
    if (counterId !== undefined && counterId !== null && !state.counters.some(c => c.id === counterId)) return;
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
          state.counters[counterIndex].currentTicketId = ticketId;
        } else if (status === 'COMPLETED' && state.counters[counterIndex].currentTicketId === ticketId) {
          state.counters[counterIndex].currentTicketId = undefined;
        }
      }
    }

    if (status === 'SERVING') {
      const counter = state.counters.find(c => c.id === counterId);
      const counterName = counter?.name || 'skranken';
      addLog(`Skranke ${counter?.name || '?'} kaller inn ${ticket.number}`, 'ACTION');
      io.emit('play-sound', {
        type: 'ding',
        textNo: `Nummer ${ticket.number}, til ${counterName}`,
        textEn: `Ticket ${ticket.number}, go to ${counterName}`
      });
    }

    addLog(`Statusendring ${ticket.number}: ${oldStatus} -> ${status} av ${actorLabel(socket)}`, 'ACTION');

    saveState();
    broadcastState();
  });

  socket.on('delete-ticket', (payload) => {
    const { ticketId } = payload || {};
    if (!requireRole(socket, ['ADMIN', 'OPERATOR'])) {
      addLog(`Avvist sletting av billett av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    state.tickets = state.tickets.filter(t => t.id !== ticketId);
    addLog(`Billett slettet manuelt: ${ticket.number} av ${actorLabel(socket)}`, 'ALERT');
    saveState();
    broadcastState();
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
    broadcastState();
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
    const rejectSettings = (error) => {
      addLog(`Innstillinger avvist for ${actor}: ${error}`, 'ALERT');
      socket.emit('settings-error', { error });
    };

    // Validate everything before applying anything, so a bad field cannot leave a half-applied update.
    let usersUpdate = null;
    if (Array.isArray(next.users)) {
      usersUpdate = buildUsersUpdate(next.users);
      if (usersUpdate.error) {
        addLog(`Brukeroppdatering avvist: ${actor} (${usersUpdate.error})`, 'ALERT');
        socket.emit('update-users-error', { error: usersUpdate.error });
        return;
      }
    }
    let printersUpdate = null;
    if (Array.isArray(next.printers)) {
      printersUpdate = buildPrintersUpdate(next.printers);
      if (printersUpdate.error) return rejectSettings(printersUpdate.error);
    }
    let pinHash = null;
    if (Object.prototype.hasOwnProperty.call(next, 'kioskExitPin')) {
      const pin = typeof next.kioskExitPin === 'string' ? next.kioskExitPin.trim() : '';
      if (pin && !/^\d{4,12}$/.test(pin)) return rejectSettings('invalid_pin');
      pinHash = pin ? hashPassword(pin) : '';
    }
    if (next.branding && typeof next.branding.brandLogoUrl === 'string' && !isAllowedLogoUrl(next.branding.brandLogoUrl)) {
      return rejectSettings('invalid_logo');
    }
    const incomingIssuer = next.authProviders?.oidc?.issuerUrl;
    if (typeof incomingIssuer === 'string' && incomingIssuer.trim() && !/^https?:\/\/[^\s]+$/i.test(incomingIssuer.trim())) {
      return rejectSettings('invalid_issuer_url');
    }

    if (Array.isArray(next.services)) {
      state.services = next.services.filter((s) => s && typeof s === 'object').map((s) => ({
        id: isSafeId(s.id) ? s.id : randomId(),
        name: cleanText(s.name, 80) || 'Tjeneste',
        prefix: (cleanText(s.prefix, 2).toUpperCase() || 'X'),
        color: typeof s.color === 'string' && /^bg-[a-z]+-\d{3}$/.test(s.color) ? s.color : 'bg-gray-500',
        estimatedTimePerPersonMinutes: Number(s.estimatedTimePerPersonMinutes) || 5,
        isOpen: s.isOpen !== false,
        priority: Number.isFinite(Number(s.priority)) ? Number(s.priority) : 1,
      }));
      changes.push(`tjenester=${state.services.length}`);
    }
    if (Array.isArray(next.counters)) {
      state.counters = next.counters.filter((c) => c && typeof c === 'object').map((c) => ({
        id: isSafeId(c.id) ? c.id : randomId(),
        name: cleanText(c.name, 80) || 'Skranke',
        activeServiceIds: Array.isArray(c.activeServiceIds) ? c.activeServiceIds.filter((id) => typeof id === 'string' && id.length > 0) : [],
        isOnline: c.isOnline !== false,
        currentTicketId: typeof c.currentTicketId === 'string' ? c.currentTicketId : undefined,
      }));
      changes.push(`skranker=${state.counters.length}`);
    }
    if (usersUpdate) {
      state.users = usersUpdate.users;
      // Sign out removed users and users whose password or role changed (except the acting admin's own session).
      [...usersUpdate.removedIds, ...usersUpdate.credentialChangedIds].forEach((id) => deleteUserSessions(id, socket.data.sessionKey));
      changes.push(`brukere=${state.users.length}`);
    }
    if (printersUpdate) {
      state.printers = printersUpdate.printers;
      changes.push(`skrivere=${state.printers.length}`);
    }
    if (next.isClosed !== undefined) state.isClosed = !!next.isClosed;
    if (next.soundSettings && typeof next.soundSettings === 'object') {
      const sound = { ...state.soundSettings };
      SOUND_KEYS.forEach((key) => {
        if (typeof next.soundSettings[key] === 'boolean') sound[key] = next.soundSettings[key];
      });
      state.soundSettings = sound;
    }
    if (next.publicMessage !== undefined) state.publicMessage = String(next.publicMessage || '').slice(0, 500);
    if (next.branding && typeof next.branding === 'object') {
      const branding = { ...state.branding };
      if (typeof next.branding.brandText === 'string') branding.brandText = next.branding.brandText.slice(0, 60);
      if (typeof next.branding.brandLogoUrl === 'string') branding.brandLogoUrl = next.branding.brandLogoUrl;
      state.branding = branding;
    }
    if (pinHash !== null) {
      state.kioskExitPinHash = pinHash;
      changes.push('kiosk-pin');
    }
    if (next.authProviders && typeof next.authProviders === 'object') {
      const before = JSON.stringify(state.authProviders);
      const incomingGoogle = safe(next.authProviders.google);
      const google = mergeProvider(state.authProviders.google, incomingGoogle);
      if (Array.isArray(incomingGoogle.allowedDomains)) {
        google.allowedDomains = incomingGoogle.allowedDomains
          .filter(d => typeof d === 'string' && d.trim().length > 0)
          .map(d => d.trim().toLowerCase().slice(0, 253));
      }
      const incomingOidc = safe(next.authProviders.oidc);
      const oidc = mergeProvider(state.authProviders.oidc, incomingOidc, ['requireVerifiedEmail']);
      if (typeof incomingOidc.issuerUrl === 'string') oidc.issuerUrl = incomingOidc.issuerUrl.trim();
      state.authProviders = { ...state.authProviders, google, oidc };
      if (JSON.stringify(state.authProviders) !== before) {
        // Reinitialize passport with new configuration
        initializePassport(state, createSession, addLog);
        changes.push('auth-providers');
      }
    }

    saveState();
    if (usersUpdate) refreshAllSockets();
    broadcastState();
    addLog(`Innstillinger oppdatert av ${actor}${changes.length ? ` (${changes.join(', ')})` : ''}`, 'ACTION');
  });

  // --- Kiosk devices ---

  // An admin turns the current browser into a kiosk. The kiosk gets its own device token,
  // so no admin session has to stay on a public device.
  socket.on('activate-kiosk', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist kioskaktivering av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return reply({ ok: false, error: 'unauthorized' });
    }
    const requested = payload?.kioskId;
    const kioskId = typeof requested === 'string' && /^kiosk_[a-z0-9]{4,32}$/.test(requested) ? requested : `kiosk_${randomId()}`;
    const name = cleanText(payload?.name, 80) || `Kiosk ${kioskId.slice(-4).toUpperCase()}`;
    revokeKioskDevices(kioskId);
    const deviceToken = generateToken(32);
    state.devices[hashToken(deviceToken)] = { kioskId, name, createdAt: Date.now(), createdBy: socket.data.userId };
    saveState();
    addLog(`Kiosk ${name} (${kioskId}) aktivert av ${actorLabel(socket)}`, 'ACTION');
    reply({ ok: true, deviceToken, kioskId });
  });

  socket.on('register-kiosk', () => {
    refreshSocket(socket);
    const kioskId = socket.data.kioskId;
    if (!kioskId) return;
    const device = getDevice(socket.data.deviceToken);
    const name = device?.name || `Kiosk ${kioskId.slice(-4).toUpperCase()}`;
    const rememberedPrinter = state.kioskPrinterAssignments[kioskId];
    const existingIdx = state.kiosks.findIndex(k => k.id === kioskId);
    if (existingIdx !== -1) {
      const existing = state.kiosks[existingIdx];
      state.kiosks[existingIdx] = {
        ...existing,
        name,
        assignedPrinterId: existing.assignedPrinterId || rememberedPrinter,
        lastSeen: Date.now(),
      };
    } else {
      if (state.kiosks.length >= MAX_KIOSKS) return;
      state.kiosks.push({ id: kioskId, name, lastSeen: Date.now(), assignedPrinterId: rememberedPrinter });
      addLog(`Kiosk online: ${name}`, 'INFO');
    }
    // Heartbeats are not persisted to save IO; only staff see kiosk status.
    broadcastStaffState();
  });

  socket.on('verify-kiosk-pin', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    refreshSocket(socket);
    const kioskId = socket.data.kioskId;
    if (!kioskId) return reply({ ok: false, error: 'not_a_kiosk' });
    if (!kioskPinAttempts.hit(kioskId)) {
      addLog(`For mange PIN-forsøk på kiosk ${kioskId}`, 'ALERT');
      return reply({ ok: false, error: 'rate_limited' });
    }
    const pin = typeof payload?.pin === 'string' ? payload.pin.trim() : '';
    if (!state.kioskExitPinHash || !verifyPassword(pin, state.kioskExitPinHash)) {
      addLog(`Feil PIN ved avslutning av kiosk ${kioskId}`, 'ALERT');
      return reply({ ok: false, error: state.kioskExitPinHash ? 'invalid_pin' : 'pin_not_set' });
    }
    kioskPinAttempts.reset(kioskId);
    // Leaving kiosk mode deactivates the device; an admin has to activate it again.
    revokeKioskDevices(kioskId);
    state.kiosks = state.kiosks.filter(k => k.id !== kioskId);
    saveState();
    addLog(`Kiosk ${kioskId} avsluttet med PIN`, 'ACTION');
    reply({ ok: true });
    refreshAllSockets();
    broadcastStaffState();
  });

  socket.on('register-counter-display', (payload) => {
    const { id, name, counterId } = payload || {};
    if (!isSafeId(id)) return;
    const displayName = cleanText(name, 80);
    if (!displayName) return;
    const idx = state.counterDisplays.findIndex(d => d.id === id);
    const now = Date.now();
    if (idx !== -1) {
      // Heartbeat: assignment and message are controlled from the admin panel only.
      state.counterDisplays[idx] = { ...state.counterDisplays[idx], name: displayName, lastSeen: now };
      broadcastStaffState();
      return;
    }
    if (state.counterDisplays.length >= MAX_COUNTER_DISPLAYS || !counterDisplayRegistrations.hit(socket.data.ip)) {
      addLog(`Ny skrankeskjerm avvist fra ${socket.data.ip} (grense nådd)`, 'ALERT');
      return;
    }
    const validCounterId = typeof counterId === 'string' && state.counters.some(c => c.id === counterId) ? counterId : undefined;
    state.counterDisplays.push({ id, name: displayName, counterId: validCounterId, message: '', lastSeen: now });
    addLog(`Ny skrankeskjerm: ${displayName}`, 'INFO');
    saveState();
    broadcastState();
  });

  socket.on('assign-counter-display', (payload) => {
    const { displayId, counterId } = payload || {};
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist kobling av skrankeskjerm av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const idx = state.counterDisplays.findIndex(d => d.id === displayId);
    if (idx === -1) return;
    const validCounterId = typeof counterId === 'string' && state.counters.some(c => c.id === counterId) ? counterId : undefined;
    state.counterDisplays[idx] = { ...state.counterDisplays[idx], counterId: validCounterId, lastSeen: Date.now() };
    saveState();
    addLog(`Skrankeskjerm ${displayId} koblet til skranke ${validCounterId || 'ingen'} av ${actorLabel(socket)}`, 'ACTION');
    broadcastState();
  });

  socket.on('set-counter-display-message', (payload) => {
    const { displayId, message } = payload || {};
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist endring av skjermmelding av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const idx = state.counterDisplays.findIndex(d => d.id === displayId);
    if (idx === -1) return;
    state.counterDisplays[idx] = { ...state.counterDisplays[idx], message: typeof message === 'string' ? message.slice(0, 300) : '', lastSeen: Date.now() };
    saveState();
    addLog(`Oppdatert melding for skrankeskjerm ${displayId} av ${actorLabel(socket)}`, 'ACTION');
    broadcastState();
  });

  socket.on('delete-counter-display', (payload) => {
    const { displayId } = payload || {};
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist fjerning av skrankeskjerm av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const before = state.counterDisplays.length;
    state.counterDisplays = state.counterDisplays.filter(d => d.id !== displayId);
    if (state.counterDisplays.length !== before) {
      addLog(`Skrankeskjerm fjernet: ${displayId} av ${actorLabel(socket)}`, 'ACTION');
      saveState();
      broadcastState();
    }
  });

  socket.on('assign-printer', (payload) => {
    const { kioskId, printerId } = payload || {};
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist skriver-tilkobling av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    if (!isSafeId(kioskId)) return;
    if (printerId && !state.printers.some(p => p.id === printerId)) return;
    // Persist mapping even if kiosk is currently offline/removed
    state.kioskPrinterAssignments[kioskId] = printerId || undefined;

    const kIndex = state.kiosks.findIndex(k => k.id === kioskId);
    if (kIndex !== -1) {
      state.kiosks[kIndex].assignedPrinterId = printerId || undefined;
    }
    saveState();
    addLog(`Skriver ${printerId || 'ingen'} tilordnet kiosk ${kioskId} av ${actorLabel(socket)}`, 'ACTION');
    broadcastStaffState();
  });

  socket.on('play-sound', (payload) => {
    if (!requireRole(socket, ['ADMIN', 'OPERATOR'])) {
      addLog(`Avvist lydkommando av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const type = ['ding', 'print', 'alert'].includes(payload?.type) ? payload.type : 'ding';
    const sound = { type };
    ['text', 'textNo', 'textEn'].forEach((key) => {
      if (typeof payload?.[key] === 'string') sound[key] = cleanText(payload[key], 200);
    });
    // Broadcast play-sound requests (e.g., manual call-again)
    addLog(`Lydkommando trigget av ${actorLabel(socket)} (${type})`, 'INFO');
    io.emit('play-sound', sound);
  });

  socket.on('delete-kiosk', (payload) => {
    const { kioskId } = payload || {};
    if (!requireRole(socket, ['ADMIN'])) {
      addLog(`Avvist fjerning av kiosk av ${actorLabel(socket)} (mangler rolle)`, 'ALERT');
      return;
    }
    const before = state.kiosks.length;
    state.kiosks = state.kiosks.filter(k => k.id !== kioskId);
    const revoked = revokeKioskDevices(kioskId);
    if (state.kiosks.length !== before || revoked > 0) {
      addLog(`Kiosk fjernet: ${kioskId} av ${actorLabel(socket)}${revoked ? ' (enheten er deaktivert)' : ''}`, 'ACTION');
      saveState();
      refreshAllSockets();
      broadcastStaffState();
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

// Admin-triggered backup
app.post('/api/admin/backup', requireAllowedIP, requireAuth(['ADMIN']), (req, res) => {
  try {
    const file = backupDatabase();
    addLog(`Backup opprettet: ${file} av ${req.auth.user.username}`, 'ACTION');
    return res.json({ ok: true, file });
  } catch (err) {
    console.error('Backup failed', err);
    return res.status(500).json({ error: 'backup_failed' });
  }
});

app.get('/api/admin/backups', requireAllowedIP, requireAuth(['ADMIN']), (req, res) => {
  try {
    const items = listBackups();
    addLog(`Backup-liste hentet av ${req.auth.user.username}`, 'INFO');
    return res.json({ ok: true, backups: items });
  } catch (err) {
    console.error('List backups failed', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

app.get('/api/admin/backup/:file', requireAllowedIP, requireAuth(['ADMIN']), (req, res) => {
  const requested = req.params.file || '';
  if (!/^[A-Za-z0-9._-]+\.db$/.test(requested) || requested.includes('..')) {
    return res.status(400).json({ error: 'invalid_file' });
  }

  const target = join(BACKUP_DIR, requested);
  if (!target.startsWith(BACKUP_DIR)) return res.status(400).json({ error: 'invalid_path' });
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'not_found' });
  addLog(`Backup lastet ned: ${requested} av ${req.auth.user.username}`, 'ACTION');
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
