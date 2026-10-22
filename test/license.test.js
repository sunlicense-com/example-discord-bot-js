import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { allowed, LicenseGuard } from '../src/license.js';
import { mask } from '../src/messages.js';

// The license check against a stub of SunLicense's validation API (no network, no real keys).
const KEY = 'AX8P-K7QX-M2PD-9HWT';
const NOW = new Date('2026-10-20T12:00:00Z');
let server;
let url;
let reply;
let seen;

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen = { path: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => {
  reply = { status: 200, body: { valid: true, status: 200, code: 'VALID' } };
  seen = null;
});

const dir = mkdtempSync(join(tmpdir(), 'bot-'));
const guard = (settings = {}, file = join(dir, 'none.lic')) =>
  new LicenseGuard({ url, apiKey: 'slk_test', publicKey: '', ...settings }, file, () => NOW);

describe('online', () => {
  test('valid: sends the key, the machine id and the API key', async () => {
    const s = await guard().check(` ${KEY} `, 'machine-1');
    assert.equal(s.state, 'VALID');
    assert.ok(allowed(s));
    assert.equal(seen.path, '/api/v2/license/validate');
    assert.equal(seen.auth, 'Bearer slk_test');
    assert.deepEqual(seen.body, { license: KEY, host: 'machine-1' });
  });

  for (const code of ['EXPIRED', 'REVOKED', 'SUSPENDED', 'TOO_MANY_MACHINES', 'NOT_FOUND', 'BLACKLISTED']) {
    test(`400 ${code} is a rejection with its own message`, async () => {
      reply = { status: 400, body: { valid: false, status: 400, code } };
      const s = await guard().check(KEY, 'm');
      assert.equal(s.state, 'REJECTED');
      assert.equal(s.code, code);
      assert.ok(!allowed(s));
      assert.ok(!s.message.includes('not accepted'), s.message);
    });
  }

  test('no key and no API key never call SunLicense', async () => {
    assert.equal((await guard().check('  ', 'm')).state, 'NOT_CONFIGURED');
    assert.equal((await guard({ apiKey: '' }).check(KEY, 'm')).state, 'UNREACHABLE');
    assert.equal(seen, null);
  });
});

describe('no answer', () => {
  test('5xx, 429 and a refused API key are not a no', async () => {
    for (const status of [500, 503, 429, 401]) {
      reply = { status, body: {} };
      assert.equal((await guard().check(KEY, 'm')).state, 'UNREACHABLE', `HTTP ${status}`);
    }
  });

  test('network error', async () => {
    const s = await guard({ url: 'http://127.0.0.1:1' }).check(KEY, 'm');
    assert.equal(s.state, 'UNREACHABLE');
    assert.match(s.message, /can't be reached/);
  });

  describe('offline license file', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const write = (payload, key = privateKey) => {
      const bytes = Buffer.from(JSON.stringify(payload));
      const file = join(dir, `${Math.random()}.lic`);
      writeFileSync(file, `${bytes.toString('base64url')}.${sign(null, bytes, key).toString('base64url')}`);
      return file;
    };
    const good = { licenseKey: KEY, issuedAt: '2026-10-01T00:00:00Z', refreshAfter: '2026-11-01T00:00:00Z', policy: { expiresAt: '2027-01-01T00:00:00Z' } };
    const offline = async (file) => guard({ url: 'http://127.0.0.1:1', publicKey: pub }, file).check(KEY, 'm');

    test('a valid file lets the bot run', async () => {
      assert.equal((await offline(write(good))).state, 'VALID_OFFLINE');
    });
    test('a file for another key, expired, stale, from the future or signed by someone else is refused', async () => {
      for (const [file, why] of [
        [write({ ...good, licenseKey: 'ZZZZ-0000-0000-0000' }), 'another license key'],
        [write({ ...good, policy: { expiresAt: '2026-10-01T00:00:00Z' } }), 'expired'],
        [write({ ...good, refreshAfter: '2026-10-10T00:00:00Z' }), 'refresh date'],
        [write({ ...good, issuedAt: '2026-12-01T00:00:00Z' }), 'future'],
        [write(good, generateKeyPairSync('ed25519').privateKey), "signature doesn't match"],
      ]) {
        const s = await offline(file);
        assert.equal(s.state, 'UNREACHABLE');
        assert.match(s.message, new RegExp(why));
      }
    });
  });
});

test('mask', () => {
  assert.equal(mask(KEY), 'AX8P-XXXX-XXXX-XXXX');
  assert.equal(mask('abcdefgh'), 'abcdXXXX');
  assert.equal(mask(''), '(none)');
});
