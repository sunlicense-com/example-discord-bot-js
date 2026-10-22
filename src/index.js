import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Events, GatewayIntentBits, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { allowed, LicenseGuard } from './license.js';
import { mask } from './messages.js';
import { loadSettings, machineId } from './settings.js';

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
const guard = new LicenseGuard(loadSettings(join(root, 'sunlicense.json')), join(root, 'license.lic'));
const licenseKey = process.env.LICENSE_KEY ?? '';
const machine = machineId(join(root, '.machine-id'));
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
      if (ALLOW_WHEN_UNREACHABLE && !client) await startFeatures();
      else if (!client) console.error('The bot needs a license check to start; it will start once SunLicense answers.');
      if (!retry) retry = setTimeout(() => { retry = null; check(); }, RETRY_MS);
      break;
  }
}

/** Your bot's features: commands and event handlers go here, so nothing runs without a license. */
async function startFeatures() {
  client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const license = new SlashCommandBuilder().setName('license').setDescription("Shows this bot's license status");

  client.once(Events.ClientReady, async (c) => {
    await c.application.commands.set([license.toJSON()]);
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
}

async function stopFeatures() {
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
