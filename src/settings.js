import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/**
 * SunLicense settings. `npm run build` writes them into dist/.../sunlicense.json from the SUNLICENSE_*
 * environment variables, so buyers never configure them. While developing, the same variables are read
 * directly (put them in .env). Keep real values out of git.
 */
export function loadSettings(file) {
  const built = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return {
    url: built.url || process.env.SUNLICENSE_URL || 'https://api.sunlicense.com',
    apiKey: built.apiKey || process.env.SUNLICENSE_API_KEY || '',
    publicKey: built.publicKey || process.env.SUNLICENSE_PUBLIC_KEY || '',
    ...OWNERSHIP,
  };
}

/**
 * The ownership notice the bot logs at start-up: "<product> is licensed software by <owner>. License
 * AX8P-XXXX-…". Edit these: they're your product's name, your name and (optional) a link to your terms.
 */
export const OWNERSHIP = { product: 'My Discord Bot', owner: 'You', terms: '' };

/**
 * A random id for this machine, kept next to the bot, so restarts count as the same machine. Copying
 * the folder to another machine copies the id too; the license's machine limit still applies to each id.
 */
export function machineId(file) {
  if (existsSync(file)) {
    const id = readFileSync(file, 'utf8').trim();
    if (id) return id;
  }
  const id = `discord-bot-${randomUUID()}`;
  writeFileSync(file, id);
  return id;
}

/**
 * The buyer's switch for anonymous usage statistics: ANALYTICS=false in .env turns them off
 * (SUNLICENSE_ANALYTICS=off does too, for every SunLicense product on the machine).
 */
export function analyticsEnabled(env = process.env) {
  return !['false', 'off', '0', 'no'].includes(String(env.ANALYTICS ?? 'true').trim().toLowerCase());
}

/** This bot's version, from package.json (sent with the usage statistics). */
export function botVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}
