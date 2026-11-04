// Builds the folder you give to buyers: dist/my-discord-bot, with your SunLicense settings baked into
// sunlicense.json from the environment (SUNLICENSE_API_KEY, SUNLICENSE_PUBLIC_KEY, SUNLICENSE_URL).
// Zip it, or upload it to your store. Never commit the settings.
//
// Core unlock: with SUNLICENSE_PRODUCT (your product's code) and the sunlicense CLI signed in (or
// SUNLICENSE_TOKEN set), src/core.js is sealed into src/core.sealed and left out of the build, so your
// features only run after a valid license check. The SHA-256 of every other file in src/ and of
// package.json goes inside it: a changed copy is reported to Sentinel.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'my-discord-bot');
rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['src', 'package.json', 'package-lock.json', '.env.example', 'LICENSE']) cpSync(join(root, f), join(out, f), { recursive: true });

const settings = {
  url: process.env.SUNLICENSE_URL || 'https://api.sunlicense.com',
  apiKey: process.env.SUNLICENSE_API_KEY || '',
  publicKey: process.env.SUNLICENSE_PUBLIC_KEY || '',
};
writeFileSync(join(out, 'sunlicense.json'), JSON.stringify(settings, null, 2) + '\n');

const product = process.env.SUNLICENSE_PRODUCT || '';
if (product) {
  const digests = ['package.json', ...readdirSync(join(out, 'src')).filter((f) => f !== 'core.js').map((f) => `src/${f}`)];
  try {
    execFileSync('sunlicense', ['seal', 'src/core.js', '--product', product, '-o', 'src/core.sealed',
      ...digests.flatMap((d) => ['--digest', d])], { cwd: out, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (e) {
    console.error(e.code === 'ENOENT'
      ? "SUNLICENSE_PRODUCT is set but the sunlicense CLI isn't installed: https://docs.sunlicense.com/cli/"
      : 'sunlicense seal failed (signed in? SUNLICENSE_TOKEN in CI).');
    process.exit(1);
  }
  rmSync(join(out, 'src', 'core.js'));
  console.log('Sealed src/core.js into src/core.sealed (core unlock).');
} else {
  console.warn('Note: no SUNLICENSE_PRODUCT set: src/core.js ships as it is (no core unlock).');
}
console.log(`Built ${out}${settings.apiKey ? '' : ' (no SUNLICENSE_API_KEY set: licenses can\'t be checked)'}`);
console.log('Buyers run: npm ci --omit=dev, copy .env.example to .env and fill it in, then npm start.');
