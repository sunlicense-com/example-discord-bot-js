import assert from 'node:assert/strict';
import { createCipheriv, createHash, generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { LicenseGuard } from '../src/license.js';
import { OWNERSHIP } from '../src/settings.js';

// Core unlock, tamper reports and the ownership notice, with a stand-in for SunLicense (no network). These
// tests seal src/core.js with a made-up product key, the way `sunlicense seal` does on SunLicense's servers.
const KEY = 'AX8P-K7QX-M2PD-9HWT';
const NOW = new Date('2026-10-20T12:00:00Z');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const productKey = createHash('sha256').update('a product key for the tests').digest();
const sha = (b) => createHash('sha256').update(b).digest('hex');

function seal(data, digests, key = productKey) {
  const plain = JSON.stringify({ v: 1, digests, data: Buffer.from(data).toString('base64') });
  const nonce = Buffer.alloc(12, 7);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(Buffer.from('SLS1'));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]);
  return 'SLS1.' + Buffer.concat([nonce, ct]).toString('base64url');
}

/** A built bot folder (what npm run build makes with SUNLICENSE_PRODUCT): src/ without core.js, core.sealed. */
function build(key = productKey) {
  const dir = mkdtempSync(join(tmpdir(), 'bot-build-'));
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(root, 'package.json'), join(dir, 'package.json'));
  const core = readFileSync(join(dir, 'src', 'core.js'));
  rmSync(join(dir, 'src', 'core.js'));
  const digests = { 'package.json': sha(readFileSync(join(dir, 'package.json'))), 'src/index.js': sha(readFileSync(join(dir, 'src', 'index.js'))) };
  writeFileSync(join(dir, 'src', 'core.sealed'), seal(core, digests, key));
  return dir;
}

/** A LicenseGuard whose SunLicense answers come from `answers` (a fake fetch on the SDK's client). */
function guard(answers, dir) {
  const g = new LicenseGuard({ url: 'https://api.example.test', apiKey: 'slk_test', publicKey: '', ...OWNERSHIP, cacheDirectory: dir }, join(dir, 'none.lic'), () => NOW);
  g.sent = [];
  const realFetch = globalThis.fetch;
  g.run = async (fn) => {
    globalThis.fetch = async (url, init) => {
      g.sent.push(JSON.parse(init.body));
      const a = answers.shift();
      if (a === 'down') throw new TypeError('fetch failed');
      return { ok: a.status < 300, status: a.status, json: async () => a.body };
    };
    try {
      return await fn();
    } finally {
      globalThis.fetch = realFetch;
    }
  };
  return g;
}

const VALID_UNLOCK = { status: 200, body: { valid: true, status: 200, code: 'VALID', unlock: productKey.toString('base64') } };
const bot = () => ({ client: { on() {} }, discord: { SlashCommandBuilder: class { setName() { return this; } setDescription() { return this; } toJSON() { return { name: 'ping' }; } }, Events: {}, MessageFlags: {} }, commands: [], log() {} });

describe('core unlock', () => {
  test('the notice names the product and owner and masks the key', () => {
    const g = guard([], mkdtempSync(join(tmpdir(), 'bot-')));
    assert.equal(g.notice(` ${KEY} `), `${OWNERSHIP.product} is licensed software by ${OWNERSHIP.owner}. License AX8P-XXXX-XXXX-XXXX.`);
  });

  test('while developing (no core.sealed) the plain core loads', async () => {
    const g = guard([], mkdtempSync(join(tmpdir(), 'bot-')));
    const core = await g.core(root);
    const b = bot();
    core.start(b);
    assert.deepEqual(b.commands, [{ name: 'ping' }]);
  });

  test('the sealed core opens only after a valid check with its unlock; integrity goes with the next check', async () => {
    const dir = build();
    const g = guard([VALID_UNLOCK, VALID_UNLOCK], dir);
    await assert.rejects(g.core(dir), /locked/);
    await g.run(() => g.check(KEY, 'machine-1'));
    const core = await g.core(dir);
    assert.equal(typeof core.start, 'function');
    await g.run(() => g.check(KEY, 'machine-1'));
    assert.equal(g.sent[0].integrity, undefined);
    assert.equal(g.sent[1].integrity, 'OK');
  });

  test('a changed bot is MODIFIED in the next check, and still runs (Sentinel decides)', async () => {
    const dir = build();
    writeFileSync(join(dir, 'src', 'index.js'), '// patched\n' + readFileSync(join(dir, 'src', 'index.js'), 'utf8'));
    const g = guard([VALID_UNLOCK, VALID_UNLOCK], dir);
    await g.run(() => g.check(KEY, 'machine-1'));
    await g.core(dir);
    await g.run(() => g.check(KEY, 'machine-1'));
    assert.equal(g.sent[1].integrity, 'MODIFIED');
    assert.equal(g.sent[1].integrityDetail, '1 changed: src/index.js');
  });

  test('an outage after a valid check opens the core from the 7-day cache; a rejection forgets it', async () => {
    const dir = build();
    const first = guard([VALID_UNLOCK], dir);
    await first.run(() => first.check(KEY, 'machine-1'));
    const restarted = guard(['down'], dir);
    assert.equal((await restarted.run(() => restarted.check(KEY, 'machine-1'))).state, 'UNREACHABLE');
    assert.ok(await restarted.core(dir));
    const refused = guard([{ status: 400, body: { valid: false, status: 400, code: 'REVOKED' } }], dir);
    await refused.run(() => refused.check(KEY, 'machine-1'));
    const later = guard(['down'], dir);
    await later.run(() => later.check(KEY, 'machine-1'));
    await assert.rejects(later.core(dir), /locked/);
  });

  test('a valid answer without the unlock, or data sealed for another product, never opens', async () => {
    const dir = build();
    const g = guard([{ status: 200, body: { valid: true, code: 'VALID' } }], dir);
    await g.run(() => g.check(KEY, 'machine-1'));
    await assert.rejects(g.core(dir), /locked/);
    const other = build(createHash('sha256').update('another product').digest());
    const h = guard([VALID_UNLOCK], other);
    await h.run(() => h.check(KEY, 'machine-1'));
    await assert.rejects(h.core(other), /sealed for another product/);
  });

  test('a valid offline license file carries the unlock through an outage', async () => {
    const dir = build();
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const payload = Buffer.from(JSON.stringify({ format: 'sunlicense-offline/1', licenseKey: KEY, issuedAt: '2026-10-01T00:00:00Z',
      refreshAfter: '2026-11-01T00:00:00Z', policy: { expiresAt: null }, unlock: productKey.toString('base64') }));
    const file = join(dir, 'license.lic');
    writeFileSync(file, payload.toString('base64url') + '.' + sign(null, payload, privateKey).toString('base64url'));
    const g = new LicenseGuard({ url: 'https://api.example.test', apiKey: 'slk_test', publicKey: pub, ...OWNERSHIP, cacheDirectory: null }, file, () => NOW);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    try {
      assert.equal((await g.check(KEY, 'machine-1')).state, 'VALID_OFFLINE');
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.ok(await g.core(dir));
  });
});
