import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeService, sanitizeCounter, sanitizeUser, sanitizePrinter, sanitizeSettings, parseLogoDataUrl, DEFAULT_SETTINGS } from '../../lib/validators.js';
import { verifyPassword } from '../../lib/users.js';

test('services need a unique prefix and get safe defaults', () => {
  const services = [{ id: 's1', name: 'A', prefix: 'K' }];
  assert.equal(sanitizeService({ name: 'B', prefix: 'k' }, services).error, 'duplicate_prefix');
  assert.equal(sanitizeService({ name: '', prefix: 'X' }, services).error, 'missing_name');
  const ok = sanitizeService({ name: 'Ny', prefix: 'n', color: 'javascript:alert(1)', estimatedTimePerPersonMinutes: -3 }, services).value;
  assert.equal(ok.prefix, 'N');
  assert.equal(ok.color, '#2563eb');
  assert.equal(ok.estimatedTimePerPersonMinutes, 5);
  assert.equal(sanitizeService({ id: 's1', name: 'A2', prefix: 'K', color: '#123456' }, services).value.color, '#123456');
});

test('counters only keep services that exist', () => {
  const result = sanitizeCounter({ name: 'Skranke', activeServiceIds: ['s1', 'nope', 's1'] }, [], [{ id: 's1' }]).value;
  assert.deepEqual(result.activeServiceIds, ['s1']);
});

test('users: hashes from clients are ignored and passwords are validated', () => {
  const users = [{ id: 'u1', username: 'kari', role: 'OPERATOR', passwordHash: '$2a$10$existing' }];
  const update = sanitizeUser({ id: 'u1', username: 'kari', passwordHash: '$2a$10$injected' }, users).value;
  assert.equal(update.passwordHash, '$2a$10$existing');
  assert.equal(sanitizeUser({ username: 'KARI', password: 'Valid-Pass1' }, users).error, 'duplicate_username');
  assert.equal(sanitizeUser({ username: 'ola' }, users).error, 'password_required');
  assert.equal(sanitizeUser({ username: 'ola', password: 'weak' }, users).error, 'password_too_short');
  const created = sanitizeUser({ username: 'ola', password: 'Valid-Pass1', mustChangePassword: true, role: 'ADMIN' }, users);
  assert.equal(verifyPassword('Valid-Pass1', created.value.passwordHash), true);
  assert.equal(created.value.mustChangePassword, true);
  assert.equal(created.value.role, 'ADMIN');
  assert.equal(sanitizeUser({ id: 'u1', username: 'kari', role: 'ADMIN' }, users).credentialsChanged, true);
});

test('printers must be a host and port, nothing else', () => {
  assert.equal(sanitizePrinter({ ipAddress: 'http://evil/x' }, []).error, 'invalid_printer');
  assert.equal(sanitizePrinter({ ipAddress: '10.0.0.5', port: 70000 }, []).error, 'invalid_printer');
  assert.equal(sanitizePrinter({ ipAddress: '10.0.0.5' }, []).value.port, 9100);
});

test('settings validation merges partial updates', () => {
  const next = sanitizeSettings({ kiosk: { autoReturnSeconds: 30 }, schedule: { enabled: true, days: { mon: { open: '09:00' } } } }, DEFAULT_SETTINGS).value;
  assert.equal(next.kiosk.autoReturnSeconds, 30);
  assert.equal(next.kiosk.showQr, true);
  assert.equal(next.schedule.enabled, true);
  assert.equal(next.schedule.days.mon.open, '09:00');
  assert.equal(next.schedule.days.mon.close, '16:00');
  assert.equal(sanitizeSettings({ autoReset: { time: '25:00' } }, DEFAULT_SETTINGS).error, 'invalid_time');
  assert.equal(sanitizeSettings({ publicUrl: 'javascript:alert(1)' }, DEFAULT_SETTINGS).error, 'invalid_public_url');
  assert.equal(sanitizeSettings({ publicUrl: 'https://queue.example.com/' }, DEFAULT_SETTINGS).value.publicUrl, 'https://queue.example.com');
});

test('logo uploads must be real image data URLs of limited size', () => {
  assert.equal(parseLogoDataUrl('data:text/html;base64,PGgxPg==').error, 'invalid_logo');
  assert.equal(parseLogoDataUrl('https://x/logo.png').error, 'invalid_logo');
  const big = `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024).toString('base64')}`;
  assert.equal(parseLogoDataUrl(big).error, 'logo_too_large');
  assert.equal(parseLogoDataUrl('data:image/png;base64,iVBORw0KGgo=').mime, 'image/png');
});
