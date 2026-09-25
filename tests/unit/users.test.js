import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  migrateUsers,
  sanitizeUser,
  verifyPassword,
  hashPassword,
  passwordPolicy,
  generatePassword,
} from '../../lib/users.js';

const hash = (pw) => bcrypt.hashSync(pw, 4);

test('external users lose passwords derived from username, e-mail or Changeme1', () => {
  const { users, changed } = migrateUsers([
    { id: 'g1', username: 'kari@example.com', email: 'kari@example.com', provider: 'google', role: 'ADMIN', passwordHash: hash('kari@example.com') },
    { id: 'o1', username: 'ola@example.com', email: 'ola@example.com', provider: 'oidc', role: 'OPERATOR', passwordHash: hash('Changeme1') },
    { id: 'g2', username: 'per@example.com', provider: 'google', role: 'OPERATOR', passwordHash: hash('Per-Own-Pass1') },
  ]);
  assert.equal(changed, true);
  assert.equal(users[0].passwordHash, '');
  assert.equal(users[1].passwordHash, '');
  // A password the user chose themselves is kept
  assert.equal(verifyPassword('Per-Own-Pass1', users[2].passwordHash), true);
  assert.equal(verifyPassword('kari@example.com', users[0].passwordHash), false);
});

test('legacy plaintext pinCode is hashed, removed and must be changed', () => {
  const { users } = migrateUsers([{ id: 'u1', username: 'admin', role: 'ADMIN', pinCode: 'Admin123!' }]);
  assert.equal('pinCode' in users[0], false);
  assert.equal(verifyPassword('Admin123!', users[0].passwordHash), true);
  assert.equal(users[0].mustChangePassword, true);
});

test('default accounts that still use a default password must change it', () => {
  const { users } = migrateUsers([
    { id: 'u1', username: 'admin', role: 'ADMIN', passwordHash: hash('admin') },
    { id: 'u2', username: 'operator', role: 'OPERATOR', passwordHash: hash('Operator123!') },
    { id: 'u3', username: 'lise', role: 'OPERATOR', passwordHash: hash('Changeme1') },
    { id: 'u4', username: 'admin2', role: 'ADMIN', passwordHash: hash('Strong-Pass-99') },
  ]);
  assert.deepEqual(users.map((u) => u.mustChangePassword), [true, true, true, false]);
});

test('checkPasswords=false skips the slow bcrypt checks', () => {
  const { users } = migrateUsers([
    { id: 'g1', username: 'kari@example.com', provider: 'google', role: 'OPERATOR', passwordHash: hash('kari@example.com') },
  ], { checkPasswords: false });
  assert.notEqual(users[0].passwordHash, '');
});

test('sanitizeUser never exposes hashes or PINs', () => {
  const safe = sanitizeUser({ id: 'u1', name: 'A', username: 'a', role: 'ADMIN', passwordHash: hash('x'), pinCode: '1234' });
  assert.equal('passwordHash' in safe, false);
  assert.equal('pinCode' in safe, false);
  assert.equal(safe.hasPassword, true);
});

test('verifyPassword handles bcrypt, legacy sha256 and rejects empty/unknown hashes', () => {
  assert.equal(verifyPassword('Secret123', hashPassword('Secret123')), true);
  const sha = crypto.createHash('sha256').update('Secret123').digest('hex');
  assert.equal(verifyPassword('Secret123', sha), true);
  assert.equal(verifyPassword('anything', ''), false);
  assert.equal(verifyPassword('', hashPassword('x')), false);
  assert.equal(verifyPassword('Secret123', 'plaintext'), false);
});

test('passwordPolicy and generated passwords', () => {
  assert.equal(passwordPolicy('short1A').ok, false);
  assert.equal(passwordPolicy('alllowercase1').ok, false);
  assert.equal(passwordPolicy('Good-Pass1').ok, true);
  const generated = generatePassword();
  assert.equal(passwordPolicy(generated).ok, true);
  assert.notEqual(generated, generatePassword());
});
