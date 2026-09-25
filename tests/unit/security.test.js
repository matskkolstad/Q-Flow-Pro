import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTrustProxy,
  DEFAULT_TRUST_PROXY,
  normalizeClientIp,
  hashToken,
  generateToken,
  safeEqual,
  escapeXml,
  isValidPrinterHost,
  isValidPort,
  createRateLimiter,
} from '../../lib/security.js';

test('parseTrustProxy defaults to private networks and parses explicit values', () => {
  assert.equal(parseTrustProxy(undefined), DEFAULT_TRUST_PROXY);
  assert.equal(parseTrustProxy(''), DEFAULT_TRUST_PROXY);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('0'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('10.0.0.5, 10.0.0.6'), '10.0.0.5, 10.0.0.6');
});

test('normalizeClientIp handles IPv6-mapped, loopback and ports', () => {
  assert.equal(normalizeClientIp('::ffff:192.168.1.20'), '192.168.1.20');
  assert.equal(normalizeClientIp('::1'), '127.0.0.1');
  assert.equal(normalizeClientIp('10.0.0.1:5555'), '10.0.0.1');
  assert.equal(normalizeClientIp('[2001:db8::1]'), '2001:db8::1');
  assert.equal(normalizeClientIp(undefined), '');
});

test('tokens are random and only their hash is comparable', () => {
  const a = generateToken(32);
  const b = generateToken(32);
  assert.equal(a.length, 64);
  assert.notEqual(a, b);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), a);
});

test('safeEqual compares strings without type confusion', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('abc', undefined), false);
  assert.equal(safeEqual(['abc'], 'abc'), false);
});

test('escapeXml neutralises markup in ePOS payloads', () => {
  assert.equal(escapeXml('<text>&"\''), '&lt;text&gt;&amp;&quot;&apos;');
  assert.equal(escapeXml(undefined), '');
});

test('isValidPrinterHost accepts IPs and hostnames only', () => {
  assert.equal(isValidPrinterHost('192.168.1.50'), true);
  assert.equal(isValidPrinterHost('printer-1.local'), true);
  assert.equal(isValidPrinterHost('256.1.1.1'), false);
  assert.equal(isValidPrinterHost('http://evil.example'), false);
  assert.equal(isValidPrinterHost('10.0.0.1/admin'), false);
  assert.equal(isValidPrinterHost('host name'), false);
  assert.equal(isValidPrinterHost(''), false);
  assert.equal(isValidPort(9100), true);
  assert.equal(isValidPort(0), false);
  assert.equal(isValidPort(70000), false);
});

test('createRateLimiter blocks after the limit and can be reset', () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  assert.equal(limiter.hit('k'), true);
  assert.equal(limiter.hit('k'), true);
  assert.equal(limiter.hit('k'), true);
  assert.equal(limiter.hit('k'), false);
  assert.equal(limiter.isBlocked('k'), true);
  assert.equal(limiter.isBlocked('other'), false);
  limiter.reset('k');
  assert.equal(limiter.isBlocked('k'), false);
});
