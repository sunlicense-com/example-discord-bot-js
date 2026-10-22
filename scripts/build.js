// Builds the folder you give to buyers: dist/my-discord-bot, with your SunLicense settings baked into
// sunlicense.json from the environment (SUNLICENSE_API_KEY, SUNLICENSE_PUBLIC_KEY, SUNLICENSE_URL).
// Zip it, or upload it to your store. Never commit the settings.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
console.log(`Built ${out}${settings.apiKey ? '' : ' (no SUNLICENSE_API_KEY set: licenses can\'t be checked)'}`);
console.log('Buyers run: npm ci --omit=dev, copy .env.example to .env and fill it in, then npm start.');
