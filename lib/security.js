import crypto from 'crypto';

// Default: only trust X-Forwarded-For from proxies on loopback/private networks.
// A reverse proxy on a public address must be configured explicitly via TRUST_PROXY.
export const DEFAULT_TRUST_PROXY = 'loopback, linklocal, uniquelocal';

export const parseTrustProxy = (raw) => {
  if (raw === undefined || raw === null) return DEFAULT_TRUST_PROXY;
  const value = String(raw).trim();
  if (value === '') return DEFAULT_TRUST_PROXY;
  const lower = value.toLowerCase();
  if (lower === 'false' || lower === '0' || lower === 'none') return false;
  if (lower === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
};

const IPV6_MAPPED_IPV4_PREFIX = '::ffff:';

// Normalizes a single address (as resolved by Express/proxy-addr) for logging and rate-limit keys.
export const normalizeClientIp = (raw) => {
  if (typeof raw !== 'string') return '';
  let candidate = raw.trim();
  if (!candidate) return '';
  if (candidate === '::1') return '127.0.0.1';
  if (candidate.startsWith(IPV6_MAPPED_IPV4_PREFIX)) {
    candidate = candidate.slice(IPV6_MAPPED_IPV4_PREFIX.length);
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(':')[0];
  }
  if (candidate.startsWith('[')) {
    const closing = candidate.indexOf(']');
    if (closing > 0) candidate = candidate.slice(1, closing);
  }
  return candidate;
};

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export const generateToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

// Printer host: IPv4 or a plain DNS hostname. No schemes, paths, ports or whitespace.
export const isValidPrinterHost = (host) => {
  if (typeof host !== 'string') return false;
  const value = host.trim();
  if (!value || value.length > 253) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return value.split('.').every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
  }
  return /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(value);
};

export const isValidPort = (port) => Number.isInteger(port) && port >= 1 && port <= 65535;

// Sliding-window counter keyed by an arbitrary string (ip, ip|username, socket id ...).
export const createRateLimiter = ({ limit, windowMs }) => {
  const hits = new Map();
  const prune = (key, now) => {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return list;
  };
  return {
    // Records a hit and returns true while the key is within the limit.
    hit(key) {
      const now = Date.now();
      const list = prune(key, now);
      if (list.length >= limit) return false;
      list.push(now);
      hits.set(key, list);
      return true;
    },
    count(key) {
      return prune(key, Date.now()).length;
    },
    isBlocked(key) {
      return prune(key, Date.now()).length >= limit;
    },
    reset(key) {
      hits.delete(key);
    },
    sweep() {
      const now = Date.now();
      for (const key of [...hits.keys()]) prune(key, now);
    },
  };
};
