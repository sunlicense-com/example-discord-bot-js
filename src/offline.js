import { createPublicKey, verify } from 'node:crypto';

/** Clock difference tolerated between SunLicense and this machine. */
const SKEW_MS = 10 * 60 * 1000;

/**
 * Checks a SunLicense offline license file (license.lic, downloaded from the license's page in the
 * dashboard) with your organization's public key, without any network access. The file is
 * base64url(payload JSON) + "." + base64url(Ed25519 signature); the signature is checked over the raw
 * payload bytes before anything in it is trusted. Returns null when the file is good for licenseKey
 * now, otherwise why not.
 */
export function offlineProblem(file, publicKeyBase64, licenseKey, now = new Date()) {
  if (!file || !publicKeyBase64) return 'no offline license';
  const parts = file.trim().split('.');
  if (parts.length !== 2) return 'not a SunLicense offline license file';
  let payload;
  try {
    payload = Buffer.from(parts[0], 'base64url');
    const key = createPublicKey({ key: Buffer.from(publicKeyBase64.trim(), 'base64'), format: 'der', type: 'spki' });
    if (!verify(null, payload, key, Buffer.from(parts[1], 'base64url'))) {
      return "signature doesn't match (tampered, or signed for another organization)";
    }
  } catch (e) {
    return `unreadable: ${e.message}`;
  }
  let json;
  try {
    json = JSON.parse(payload.toString('utf8'));
  } catch {
    return "signed content isn't JSON";
  }
  if (String(json.licenseKey ?? '').toUpperCase() !== licenseKey.trim().toUpperCase()) return "it's for another license key";
  const issued = instant(json.issuedAt);
  if (issued && issued.getTime() > now.getTime() + SKEW_MS) return "issued in the future (is this machine's clock right?)";
  const expires = instant(json.policy?.expiresAt);
  if (expires && now >= expires) return `the license expired at ${expires.toISOString()}`;
  const refresh = instant(json.refreshAfter);
  if (refresh && now >= refresh) return `older than its refresh date (${refresh.toISOString()}); download a new one`;
  return null;
}

function instant(v) {
  if (v === undefined || v === null) return null;
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v); // ISO text, or epoch seconds as Jackson can write them
  return Number.isNaN(d.getTime()) ? null : d;
}
