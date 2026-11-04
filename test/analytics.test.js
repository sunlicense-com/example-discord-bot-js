// The usage statistics: the buyer's switch, and what a report carries (src/analytics.js is the SDK's copy).
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SunLicenseAnalytics } from '../src/analytics.js';
import { analyticsEnabled, botVersion } from '../src/settings.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('ANALYTICS=false in .env turns usage statistics off; on by default', () => {
  assert.equal(analyticsEnabled({}), true);
  assert.equal(analyticsEnabled({ ANALYTICS: 'true' }), true);
  for (const off of ['false', 'FALSE', ' off ', '0', 'no']) assert.equal(analyticsEnabled({ ANALYTICS: off }), false);
});

test('a report carries the license, machine, bot version and discord.js version, and nothing is sent while off', async () => {
  const sent = [];
  const options = {
    baseUrl: 'http://sunlicense.test', apiKey: 'slk_test', licenseKey: 'AX8P-4Q2M-9KZL-7TBD', fingerprint: 'discord-bot-1',
    productVersion: botVersion(root), platform: { name: 'discord', version: '14.27.0' }, dataDirectory: mkdtempSync(join(tmpdir(), 'bot-')),
    _env: () => undefined,
    _fetch: async (url, init) => { sent.push({ url, init }); return { status: 204, headers: new Map() }; },
  };
  assert.equal(await SunLicenseAnalytics.create({ ...options, enabled: false }).sendNow(), 0);
  assert.equal(sent.length, 0);
  assert.equal(await SunLicenseAnalytics.create(options).sendNow(), 204);
  const body = JSON.parse(sent[0].init.body);
  assert.equal(sent[0].url, 'http://sunlicense.test/api/v2/analytics/report');
  assert.equal(sent[0].init.headers.authorization, 'Bearer slk_test');
  assert.equal(body.licenseKey, 'AX8P-4Q2M-9KZL-7TBD');
  assert.equal(body.fingerprint, 'discord-bot-1');
  assert.equal(body.metrics.productVersion, '1.0.0');
  assert.equal(body.metrics.platform, 'discord');
  assert.equal(body.metrics.platformVersion, '14.27.0');
  assert.equal(body.metrics.runtime, 'node');
});
