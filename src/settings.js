import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

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
  };
}

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
