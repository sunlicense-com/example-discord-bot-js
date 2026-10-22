import { existsSync, readFileSync } from 'node:fs';
import { SunLicense } from 'sunlicense';
import { forCode } from './messages.js';
import { offlineProblem } from './offline.js';

/**
 * The answer to "may this bot run?". state is VALID, VALID_OFFLINE (SunLicense unreachable but a signed
 * offline file says yes), REJECTED (SunLicense said no: stop), UNREACHABLE (no answer: retry later) or
 * NOT_CONFIGURED (no key). code is SunLicense's result code, or null when it didn't answer.
 */
export const allowed = (status) => status.state === 'VALID' || status.state === 'VALID_OFFLINE';

/**
 * Checks this bot's license with SunLicense. No Discord code, so it can be tested and reused.
 *
 * 1. Online: POST /api/v2/license/validate through the official SDK, with this machine's id as host, so
 *    each machine takes one of the license's slots.
 * 2. A 400 is SunLicense saying no: REJECTED with its code.
 * 3. No answer (network, 5xx, 429, the bot's API key refused): the signed offline license file, if there
 *    is one and a public key was built in; otherwise UNREACHABLE, and the bot decides
 *    (ALLOW_WHEN_UNREACHABLE in index.js).
 */
export class LicenseGuard {
  /** settings: { url, apiKey, publicKey } (see settings.js); offlineFile: path to license.lic. */
  constructor(settings, offlineFile, now = () => new Date()) {
    this.settings = settings;
    this.offlineFile = offlineFile;
    this.now = now;
    this.client = new SunLicense({ baseUrl: settings.url, token: settings.apiKey, timeoutMs: 10_000 });
  }

  async check(licenseKey, machineId) {
    if (!licenseKey || !licenseKey.trim()) {
      return { state: 'NOT_CONFIGURED', code: null, message: 'No license key. Put yours in .env (LICENSE_KEY) and restart the bot.' };
    }
    if (!this.settings.apiKey) {
      return { state: 'UNREACHABLE', code: null, message: "This build has no SunLicense API key (SUNLICENSE_API_KEY when you ran npm run build); the license can't be checked." };
    }
    let why;
    try {
      const r = await this.client.validate(licenseKey.trim(), { host: machineId });
      if (r.valid) return { state: 'VALID', code: 'VALID', message: forCode('VALID') };
      if (r.status === 400) {
        const code = typeof r.data?.code === 'string' ? r.data.code : null;
        return { state: 'REJECTED', code, message: forCode(code) };
      }
      why = r.status === 401 || r.status === 403
        ? `SunLicense refused this build's API key (HTTP ${r.status}): the bot author needs to update it.`
        : `SunLicense didn't answer (HTTP ${r.status}).`;
    } catch (e) {
      why = `SunLicense can't be reached (${e.cause?.code ?? e.name ?? e.message}).`;
    }
    return this.fallback(licenseKey, why);
  }

  fallback(licenseKey, why) {
    if (this.settings.publicKey && this.offlineFile && existsSync(this.offlineFile)) {
      let file;
      try {
        file = readFileSync(this.offlineFile, 'utf8');
      } catch (e) {
        return { state: 'UNREACHABLE', code: null, message: `${why} The offline license file can't be read: ${e.message}` };
      }
      const problem = offlineProblem(file, this.settings.publicKey, licenseKey, this.now());
      if (problem === null) return { state: 'VALID_OFFLINE', code: 'VALID', message: `${why} Using the offline license file.` };
      return { state: 'UNREACHABLE', code: null, message: `${why} The offline license file isn't usable: ${problem}.` };
    }
    return { state: 'UNREACHABLE', code: null, message: why };
  }
}
