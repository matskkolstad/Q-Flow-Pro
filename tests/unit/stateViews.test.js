import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicView, staffView, adminView, viewForRole } from '../../lib/stateViews.js';

const SECRET = 'very-secret-client-secret';

const fullState = () => ({
  services: [{ id: 's1', name: 'Kundeservice', prefix: 'K' }],
  counters: [{ id: 'c1', name: 'Skranke 1', activeServiceIds: ['s1'], isOnline: true }],
  tickets: [{ id: 't1', number: 'K001', serviceId: 's1', status: 'WAITING', createdAt: 1, internalNote: 'x' }],
  counterDisplays: [{ id: 'cd_1', name: 'Skjerm', counterId: 'c1', message: 'Hei', lastSeen: 1 }],
  users: [{ id: 'u1', name: 'Admin', username: 'admin', role: 'ADMIN', passwordHash: '$2a$10$abc', pinCode: '1234' }],
  sessions: { abc: { userId: 'u1', expiresAt: Date.now() + 1000 } },
  devices: { def: { kioskId: 'kiosk_1' } },
  printers: [{ id: 'p1', name: 'P', ipAddress: '10.0.0.5', port: 9100, type: 'EPSON_IP', status: 'ONLINE' }],
  kiosks: [{ id: 'kiosk_1', name: 'Kiosk', lastSeen: 1 }],
  kioskExitPinHash: '$2a$10$pin',
  kioskExitPin: '1234',
  logs: [{ id: 'l1', message: 'hei', type: 'INFO', timestamp: 1 }],
  isClosed: false,
  publicMessage: 'Velkommen',
  branding: { brandText: 'Q', brandLogoUrl: '' },
  soundSettings: { callChime: true },
  authProviders: {
    google: { enabled: true, clientId: 'id', clientSecret: SECRET, allowedDomains: [], autoProvision: false, defaultRole: 'OPERATOR' },
    oidc: { enabled: false, issuerUrl: '', clientId: '', clientSecret: SECRET, autoProvision: false, defaultRole: 'OPERATOR', requireVerifiedEmail: true },
  },
});

// JSON keys (quoted) and values that must never be sent to a client
const SENSITIVE = ['"passwordHash"', '"pinCode"', '"sessions"', '"devices"', '"kioskExitPin"', '"kioskExitPinHash"', '"clientSecret"', SECRET, '$2a$'];

const assertNoSecrets = (view) => {
  const json = JSON.stringify(view);
  SENSITIVE.forEach((needle) => assert.equal(json.includes(needle), false, `view leaks ${needle}`));
};

test('public view only contains what displays, kiosks and mobiles need', () => {
  const view = publicView(fullState());
  assert.deepEqual(Object.keys(view).sort(), [
    'branding', 'counterDisplays', 'counters', 'isClosed', 'publicMessage', 'services', 'soundSettings', 'tickets',
  ]);
  assert.equal('internalNote' in view.tickets[0], false);
  assertNoSecrets(view);
});

test('operator view adds devices and logs but no users or auth settings', () => {
  const view = staffView(fullState());
  assert.equal('users' in view, false);
  assert.equal('authProviders' in view, false);
  assert.equal(view.logs.length, 1);
  assert.equal(view.printers.length, 1);
  assertNoSecrets(view);
});

test('admin view has sanitized users and write-only secrets', () => {
  const view = adminView(fullState());
  assert.equal(view.users[0].username, 'admin');
  assert.equal(view.users[0].hasPassword, true);
  assert.equal(view.authProviders.google.clientSecretSet, true);
  assert.equal('clientSecret' in view.authProviders.google, false);
  assert.equal(view.kioskExitPinSet, true);
  assertNoSecrets(view);
});

test('viewForRole falls back to the public view', () => {
  assert.deepEqual(Object.keys(viewForRole(fullState(), 'KIOSK')), Object.keys(publicView(fullState())));
  assert.deepEqual(Object.keys(viewForRole(fullState(), undefined)), Object.keys(publicView(fullState())));
});
