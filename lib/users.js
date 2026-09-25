import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_REQUIREMENTS = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).+$/;

// Passwords that shipped with earlier versions or were assigned automatically.
const KNOWN_DEFAULT_PASSWORDS = ['Admin123!', 'Operator123!', 'Changeme1'];
export const DEFAULT_USERNAMES = ['admin', 'operator'];

const isSha256 = (hash = '') => /^[a-f0-9]{64}$/i.test(hash);

export const hashPassword = (pw = '') => bcrypt.hashSync(pw, BCRYPT_ROUNDS);

export const verifyPassword = (pw = '', stored = '') => {
  if (!stored || typeof pw !== 'string' || !pw) return false;
  if (stored.startsWith('$2')) return bcrypt.compareSync(pw, stored);
  if (isSha256(stored)) {
    const sha = crypto.createHash('sha256').update(pw).digest('hex');
    return sha === stored;
  }
  return false;
};

export const passwordPolicy = (pw = '') => {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'password_too_short' };
  if (!PASSWORD_REQUIREMENTS.test(pw)) return { ok: false, error: 'password_needs_upper_lower_digit' };
  return { ok: true };
};

export const isExternalUser = (u) => u?.provider === 'google' || u?.provider === 'oidc';

// Generates a password that satisfies passwordPolicy.
export const generatePassword = () => {
  const base = crypto.randomBytes(12).toString('base64url');
  return `${base}Aa1`;
};

/**
 * Normalizes stored users on boot:
 * - migrates legacy plaintext `pinCode` into a bcrypt hash and drops it
 * - never gives external (Google/OIDC) users a guessable local password; hashes that
 *   earlier versions derived from the username/e-mail or "Changeme1" are removed
 * - flags accounts that still use a known default/derived password so they must change it
 * The bcrypt-based checks are slow, so they only run when `checkPasswords` is set
 * (the server does this once per security migration).
 */
export const migrateUsers = (users = [], { checkPasswords = true } = {}) => {
  let changed = false;
  const result = (Array.isArray(users) ? users : []).map((u, idx) => {
    const { pinCode, ...rest } = u || {};
    const username = rest.username || `user${idx + 1}`;
    let passwordHash = typeof rest.passwordHash === 'string' ? rest.passwordHash : '';
    let mustChangePassword = !!rest.mustChangePassword;

    if (isExternalUser(rest)) {
      const derived = [username, rest.email, ...KNOWN_DEFAULT_PASSWORDS].filter(Boolean);
      if (checkPasswords && passwordHash && derived.some((pw) => verifyPassword(pw, passwordHash))) {
        passwordHash = '';
      }
      if (!passwordHash) mustChangePassword = false;
    } else {
      if (!passwordHash && pinCode) {
        // The legacy PIN was stored in plaintext, so it must be replaced after first login.
        passwordHash = hashPassword(String(pinCode));
        mustChangePassword = true;
      } else if (pinCode && verifyPassword(String(pinCode), passwordHash)) {
        mustChangePassword = true;
      } else if (checkPasswords && passwordHash) {
        const isDefaultUser = DEFAULT_USERNAMES.includes(username);
        const guesses = isDefaultUser ? [username, ...KNOWN_DEFAULT_PASSWORDS] : ['Changeme1'];
        if (guesses.filter(Boolean).some((pw) => verifyPassword(String(pw), passwordHash))) {
          mustChangePassword = true;
        }
      }
    }

    const next = { ...rest, username, passwordHash, mustChangePassword };
    if (
      pinCode !== undefined
      || next.username !== u?.username
      || next.passwordHash !== u?.passwordHash
      || next.mustChangePassword !== !!u?.mustChangePassword
    ) {
      changed = true;
    }
    return next;
  });
  return { users: result, changed };
};

// Shape of a user as sent to (admin) clients. Never includes hashes or legacy PINs.
export const sanitizeUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  email: u.email,
  provider: u.provider || 'local',
  mustChangePassword: !!u.mustChangePassword,
  hasPassword: !!u.passwordHash,
});
