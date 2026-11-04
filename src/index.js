import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as discord from 'discord.js';
import { SunLicenseAnalytics } from './analytics.js';
import { allowed, LicenseGuard } from './license.js';
import { mask } from './messages.js';
import { analyticsEnabled, botVersion, loadSettings, machineId } from './settings.js';

/**
 * A Discord bot protected by SunLicense. The license is checked at start-up and every RECHECK_HOURS;
 * the bot logs in to Discord only once it is valid (startFeatures) and logs out if SunLicense later says
 * no (stopFeatures).
 */

/**
 * When SunLicense can't be reached and there is no valid offline license file: keep running (true, the
 * default: an outage on our side shouldn't take your customers' bots down) or wait (false).
 */
const ALLOW_WHEN_UNREACHABLE = true;
/** How soon to try again after no answer. */
const RETRY_MS = 10 * 60 * 1000;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Client, Events, GatewayIntentBits, MessageFlags, SlashCommandBuilder, version: discordVersion } = discord;
const settings = { ...loadSettings(join(root, 'sunlicense.json')), cacheDirectory: root };
const guard = new LicenseGuard(settings, join(root, 'license.lic'));
const licenseKey = process.env.LICENSE_KEY ?? '';
console.log(guard.notice(licenseKey)); // who owns this bot: product, owner, masked key
const machine = machineId(join(root, '.machine-id'));
// Anonymous usage statistics for your Analytics tab, every 30 minutes in the background (.env: ANALYTICS=false).
const analytics = SunLicenseAnalytics.start({
  baseUrl: settings.url, apiKey: settings.apiKey, licenseKey, fingerprint: machine,
  productVersion: botVersion(root), platform: { name: 'discord', version: discordVersion },
  enabled: analyticsEnabled(), dataDirectory: root,
});
let client = null;
let status = null;
let retry = null;

async function check() {
  apply(await guard.check(licenseKey, machine));
}

async function apply(result) {
  status = result;
  switch (result.state) {
    case 'VALID':
    case 'VALID_OFFLINE':
      if (!client) {
        console.log(`License ${mask(licenseKey)}: ${result.message}`);
        await startFeatures();
      }
      break;
    case 'REJECTED':
    case 'NOT_CONFIGURED':
      console.error(`License ${mask(licenseKey)}: ${result.message}`);
      console.error('The bot is stopped until this is fixed.');
      await stopFeatures();
      process.exitCode = 1;
      clearInterval(recheck);
      clearTimeout(retry);
      break;
    case 'UNREACHABLE':
      console.warn(`${result.message} Trying again in 10 minutes.`);
      if (ALLOW_WHEN_UNREACHABLE && !client) {
        // the sealed core opens with the unlock cached from a valid check in the last 7 days
        if (!(await startFeatures())) console.error('Its protected part needs one valid license check first; it will start once SunLicense answers.');
      } else if (!client) console.error('The bot needs a license check to start; it will start once SunLicense answers.');
      if (!retry) retry = setTimeout(() => { retry = null; check(); }, RETRY_MS);
      break;
  }
}

/**
 * Logs in and starts your features. They live in src/core.js, which the build you sell carries only sealed
 * (npm run build), so they run only once SunLicense has confirmed the license. True when started.
 */
async function startFeatures() {
  let core;
  try {
    core = await guard.core(root);
  } catch (e) {
    console.error(`The protected part could not start: ${e.message}`);
    return false;
  }
  client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const commands = [new SlashCommandBuilder().setName('license').setDescription("Shows this bot's license status").toJSON()];
  core.start({ client, discord, commands, log: (line) => console.log(line) });

  client.once(Events.ClientReady, async (c) => {
    await c.application.commands.set(commands);
    console.log(`Logged in as ${c.user.tag}.`);
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'license') return;
    const s = status ?? { state: 'UNCHECKED', message: "The license hasn't been checked yet." };
    await interaction.reply({ content: `License ${mask(licenseKey)} (${s.state}): ${s.message}`, flags: MessageFlags.Ephemeral });
  });
  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (e) {
    console.error(`Discord refused DISCORD_TOKEN: ${e.message}`);
    process.exit(1);
  }
  return true;
}

async function stopFeatures() {
  analytics.close();
  if (client) await client.destroy();
  client = null;
}

if (!process.env.DISCORD_TOKEN) {
  console.error('Set DISCORD_TOKEN in .env (see .env.example).');
  process.exit(1);
}
const hours = Number(process.env.RECHECK_HOURS ?? 6);
const recheck = hours > 0 ? setInterval(check, hours * 60 * 60 * 1000) : null;
await check();
