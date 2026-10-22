/** What to tell the bot's owner for each SunLicense result code. Edit the wording freely. */
export function forCode(code) {
  switch (code) {
    case 'VALID': return 'License is valid.';
    case 'NOT_FOUND': return "This license key doesn't exist. Check LICENSE_KEY in .env (no spaces), or download the bot again from the store you bought it on.";
    case 'EXPIRED': return 'This license has expired. Renew it where you bought the bot.';
    case 'REVOKED': return 'This license has been revoked. Contact the bot author if you think this is a mistake.';
    case 'SUSPENDED': return 'This license is suspended for now. Contact the bot author.';
    case 'TOO_MANY_MACHINES': return 'This license is already used on the maximum number of machines. Stop the bot on another machine, or ask the author to reset your machines.';
    case 'BLACKLISTED': return 'This machine or network has been blocked by the bot author. Contact them for help.';
    case null: case undefined: return 'The license was not accepted.';
    default: return `The license was not accepted (${code}).`;
  }
}

/** "AX8P-XXXX-XXXX-XXXX": never print a whole key to a console others may read. */
export function mask(key) {
  if (!key || !key.trim()) return '(none)';
  const groups = key.trim().split('-');
  if (groups.length === 1) return groups[0].slice(0, 4) + 'X'.repeat(Math.max(0, groups[0].length - 4));
  return [groups[0], ...groups.slice(1).map((g) => 'X'.repeat(g.length))].join('-');
}
