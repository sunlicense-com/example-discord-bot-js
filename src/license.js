import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SunLicense } from 'sunlicense';
import { forCode } from './messages.js';
import { offlineProblem } from './offline.js';
import { Locked, SunLicenseProtection } from './protection.js';

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
 * 4. Core unlock: a valid answer (or the offline file) carries the key that opens src/core.sealed (your
 *    features, sealed by npm run build); it is kept for 7 days, bound to this machine, for outages, and
 *    forgotten on a rejection. core() opens it and checks the bot's files against the digests sealed with
 *    it; the result (OK / MODIFIED) goes with the next check, where Sentinel sees it.
 */
export class LicenseGuard {
  /**
   * settings: { url, apiKey, publicKey, product, owner, terms, cacheDirectory } (see settings.js);
   * offlineFile: path to license.lic.
   */
  constructor(settings, offlineFile, now = () => new Date()) {
    this.settings = settings;
    this.offlineFile = offlineFile;
    this.now = now;
    this.client = new SunLicense({ baseUrl: settings.url, token: settings.apiKey, timeoutMs: 10_000 });
    this.protection = new SunLicenseProtection({
      baseUrl: settings.url, apiKey: settings.apiKey, product: settings.product, owner: settings.owner,
      terms: settings.terms, cacheDirectory: settings.cacheDirectory ?? null, now: () => this.now().getTime(),
    });
  }

  /** One log line: product, owner and the masked key (never the full key, never the buyer's name). */
  notice(licenseKey) {
    this.protection.license(licenseKey?.trim(), this.protection.fingerprint);
    return this.protection.notice();
  }

  /**
   * The protected part of the bot (src/core.sealed, from src/core.js) as a module, or throws Locked with
   * why. Without core.sealed (while developing, or a build made without SUNLICENSE_PRODUCT) it imports
   * src/core.js as it is. root: the bot's folder.
   */
  async core(root) {
    const sealedFile = join(root, 'src', 'core.sealed');
    if (!existsSync(sealedFile)) return import(pathToFileURL(join(root, 'src', 'core.js')).href);
    const code = this.protection.unseal(readFileSync(sealedFile, 'utf8'));
    this.protection.integrity(root); // the bot's files vs the digests sealed with the core
    return import(`data:text/javascript;base64,${code.toString('base64')}`);
  }

  /** True when the core can open now: a valid check (or offline file) this run, or one cached in the last 7 days. */
  unlocked() {
    return this.protection.unlocked();
  }

  async check(licenseKey, machineId) {
    if (!licenseKey || !licenseKey.trim()) {
      return { state: 'NOT_CONFIGURED', code: null, message: 'No license key. Put yours in .env (LICENSE_KEY) and restart the bot.' };
    }
    if (!this.settings.apiKey) {
      return { state: 'UNREACHABLE', code: null, message: "This build has no SunLicense API key (SUNLICENSE_API_KEY when you ran npm run build); the license can't be checked." };
    }
    let why;
    this.protection.license(licenseKey.trim(), machineId);
    try {
      const r = await this.client.validate(licenseKey.trim(), { host: machineId, ...this.protection.validateFields() });
      this.protection.accept(r.data); // keeps (valid + unlock) or forgets (valid: false) the unlock
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
      if (problem === null) {
        this.protection.acceptOffline(file, this.settings.publicKey); // its unlock claim, if the product seals anything
        return { state: 'VALID_OFFLINE', code: 'VALID', message: `${why} Using the offline license file.` };
      }
      return { state: 'UNREACHABLE', code: null, message: `${why} The offline license file isn't usable: ${problem}.` };
    }
    return { state: 'UNREACHABLE', code: null, message: why };
  }
}

export { Locked };
