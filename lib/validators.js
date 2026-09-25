import crypto from 'crypto';
import { hashPassword, passwordPolicy } from './users.js';
import { isValidPrinterHost, isValidPort } from './security.js';
import { isValidTime, WEEKDAYS, DEFAULT_SCHEDULE, DEFAULT_ANNOUNCEMENTS } from './queue.js';

// Input validation for everything admins can change. Each sanitizer returns either
// { value } or { error } and never trusts fields it does not know.

export const cleanText = (val = '', max = 80) => {
  if (typeof val !== 'string') return '';
  return val.replace(/\s+/g, ' ').trim().slice(0, max);
};

export const isSafeId = (val) => typeof val === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(val);
export const randomId = () => crypto.randomBytes(6).toString('hex');

export const isHexColor = (val) => typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val);
// Service colours are either a hex colour or one of the legacy Tailwind classes (bg-blue-600 ...).
export const isServiceColor = (val) => isHexColor(val) || (typeof val === 'string' && /^bg-[a-z]+-\d{3}$/.test(val));

export const isHttpUrl = (val) => {
  if (typeof val !== 'string' || val.length > 500) return false;
  try {
    const url = new URL(val);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const LOGO_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};
export const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;

// Parses an uploaded logo (data URL). Returns { mime, buffer } or { error }.
export const parseLogoDataUrl = (dataUrl) => {
  const match = typeof dataUrl === 'string' ? /^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!match || !LOGO_TYPES[match[1]]) return { error: 'invalid_logo' };
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) return { error: 'invalid_logo' };
  if (buffer.length > MAX_LOGO_BYTES) return { error: 'logo_too_large' };
  return { mime: match[1], buffer };
};

export const sanitizeService = (input, services) => {
  if (!input || typeof input !== 'object') return { error: 'invalid_service' };
  const existing = isSafeId(input.id) ? services.find((s) => s.id === input.id) : null;
  const name = cleanText(input.name, 80);
  const prefix = cleanText(input.prefix, 3).toUpperCase().replace(/[^A-Z0-9ÆØÅ]/g, '');
  if (!name) return { error: 'missing_name' };
  if (!prefix) return { error: 'missing_prefix' };
  if (services.some((s) => s.prefix === prefix && s.id !== existing?.id)) return { error: 'duplicate_prefix' };
  const eta = Number(input.estimatedTimePerPersonMinutes);
  const priority = Number(input.priority);
  return {
    value: {
      id: existing?.id || (isSafeId(input.id) ? input.id : randomId()),
      name,
      prefix,
      color: isServiceColor(input.color) ? input.color : (existing?.color || '#2563eb'),
      estimatedTimePerPersonMinutes: Number.isFinite(eta) && eta > 0 ? Math.min(eta, 600) : 5,
      isOpen: input.isOpen !== false,
      priority: Number.isFinite(priority) ? Math.max(0, Math.min(priority, 100)) : 1,
    },
  };
};

export const sanitizeCounter = (input, counters, services) => {
  if (!input || typeof input !== 'object') return { error: 'invalid_counter' };
  const existing = isSafeId(input.id) ? counters.find((c) => c.id === input.id) : null;
  const name = cleanText(input.name, 80);
  if (!name) return { error: 'missing_name' };
  const serviceIds = Array.isArray(input.activeServiceIds)
    ? [...new Set(input.activeServiceIds.filter((id) => services.some((s) => s.id === id)))]
    : (existing?.activeServiceIds || []);
  return {
    value: {
      id: existing?.id || (isSafeId(input.id) ? input.id : randomId()),
      name,
      activeServiceIds: serviceIds,
      isOnline: input.isOnline !== undefined ? input.isOnline !== false : (existing?.isOnline ?? true),
      currentTicketId: existing?.currentTicketId,
    },
  };
};

/**
 * Validates a user create/update. Hashes are never accepted from clients; only a new
 * plaintext password can change the stored hash.
 * Returns { value, credentialsChanged } or { error }.
 */
export const sanitizeUser = (input, users) => {
  if (!input || typeof input !== 'object') return { error: 'invalid_user' };
  const existing = isSafeId(input.id) ? users.find((u) => u.id === input.id) : null;
  const username = cleanText(input.username ?? existing?.username ?? '', 64);
  if (!username) return { error: 'missing_username' };
  if (users.some((u) => u.id !== existing?.id && u.username.toLowerCase() === username.toLowerCase())) {
    return { error: 'duplicate_username' };
  }
  const name = cleanText(input.name ?? '', 80) || existing?.name || username;
  const role = input.role === 'ADMIN' ? 'ADMIN' : (input.role === 'OPERATOR' ? 'OPERATOR' : (existing?.role || 'OPERATOR'));

  let passwordHash = existing?.passwordHash || '';
  let mustChangePassword = !!existing?.mustChangePassword;
  let credentialsChanged = false;
  if (input.password) {
    const policy = passwordPolicy(input.password);
    if (!policy.ok) return { error: policy.error };
    passwordHash = hashPassword(input.password);
    mustChangePassword = input.mustChangePassword === true;
    credentialsChanged = !!existing;
  }
  if (!existing && !passwordHash) return { error: 'password_required' };
  if (existing && existing.role !== role) credentialsChanged = true;

  return {
    value: {
      id: existing?.id || `u_${randomId()}`,
      name,
      username,
      role,
      provider: existing?.provider || 'local',
      email: existing?.email,
      externalId: existing?.externalId,
      passwordHash,
      mustChangePassword,
    },
    credentialsChanged,
  };
};

export const sanitizePrinter = (input, printers) => {
  if (!input || typeof input !== 'object') return { error: 'invalid_printer' };
  const existing = isSafeId(input.id) ? printers.find((p) => p.id === input.id) : null;
  const ipAddress = typeof input.ipAddress === 'string' ? input.ipAddress.trim() : '';
  const port = input.port === undefined || input.port === '' ? 9100 : Number(input.port);
  if (!isValidPrinterHost(ipAddress) || !isValidPort(port)) return { error: 'invalid_printer' };
  return {
    value: {
      id: existing?.id || (isSafeId(input.id) ? input.id : randomId()),
      name: cleanText(input.name, 80) || ipAddress,
      ipAddress,
      port,
      type: input.type === 'GENERIC_NETWORK' ? 'GENERIC_NETWORK' : 'EPSON_IP',
      status: existing && existing.ipAddress === ipAddress && existing.port === port ? existing.status : 'OFFLINE',
    },
  };
};

const sanitizeDailyJob = (input, current) => {
  const next = { ...current };
  if (typeof input?.enabled === 'boolean') next.enabled = input.enabled;
  if (input?.time !== undefined) {
    if (!isValidTime(input.time)) return { error: 'invalid_time' };
    next.time = input.time;
  }
  return { value: next };
};

export const sanitizeSchedule = (input, current = DEFAULT_SCHEDULE) => {
  const next = { enabled: !!current.enabled, days: { ...DEFAULT_SCHEDULE.days, ...(current.days || {}) } };
  if (typeof input?.enabled === 'boolean') next.enabled = input.enabled;
  if (input?.days && typeof input.days === 'object') {
    for (const day of WEEKDAYS) {
      const d = input.days[day];
      if (!d) continue;
      const merged = { ...next.days[day] };
      if (typeof d.enabled === 'boolean') merged.enabled = d.enabled;
      if (d.open !== undefined) {
        if (!isValidTime(d.open)) return { error: 'invalid_time' };
        merged.open = d.open;
      }
      if (d.close !== undefined) {
        if (!isValidTime(d.close)) return { error: 'invalid_time' };
        merged.close = d.close;
      }
      next.days[day] = merged;
    }
  }
  return { value: next };
};

export const DEFAULT_SETTINGS = {
  schedule: DEFAULT_SCHEDULE,
  autoReset: { enabled: true, time: '04:00' },
  backup: { enabled: true, time: '02:30' },
  kiosk: { autoReturnSeconds: 15, showQr: true, printQr: false },
  announcements: DEFAULT_ANNOUNCEMENTS,
  publicUrl: '',
};

// Validates a partial settings update and merges it into the current settings.
export const sanitizeSettings = (input, current = DEFAULT_SETTINGS) => {
  if (!input || typeof input !== 'object') return { error: 'invalid_settings' };
  const next = {
    ...DEFAULT_SETTINGS,
    ...current,
    kiosk: { ...DEFAULT_SETTINGS.kiosk, ...(current.kiosk || {}) },
    announcements: { ...DEFAULT_ANNOUNCEMENTS, ...(current.announcements || {}) },
  };

  if (input.schedule) {
    const result = sanitizeSchedule(input.schedule, next.schedule);
    if (result.error) return result;
    next.schedule = result.value;
  }
  for (const key of ['autoReset', 'backup']) {
    if (input[key]) {
      const result = sanitizeDailyJob(input[key], next[key]);
      if (result.error) return result;
      next[key] = result.value;
    }
  }
  if (input.kiosk && typeof input.kiosk === 'object') {
    const seconds = Number(input.kiosk.autoReturnSeconds);
    if (input.kiosk.autoReturnSeconds !== undefined) {
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 600) return { error: 'invalid_kiosk_settings' };
      next.kiosk.autoReturnSeconds = seconds;
    }
    ['showQr', 'printQr'].forEach((key) => {
      if (typeof input.kiosk[key] === 'boolean') next.kiosk[key] = input.kiosk[key];
    });
  }
  if (input.announcements && typeof input.announcements === 'object') {
    ['no', 'en'].forEach((lang) => {
      if (typeof input.announcements[lang] === 'string') {
        next.announcements[lang] = cleanText(input.announcements[lang], 200) || DEFAULT_ANNOUNCEMENTS[lang];
      }
    });
  }
  if (input.publicUrl !== undefined) {
    const url = typeof input.publicUrl === 'string' ? input.publicUrl.trim().replace(/\/+$/, '') : '';
    if (url && !isHttpUrl(url)) return { error: 'invalid_public_url' };
    next.publicUrl = url;
  }
  return { value: next };
};
