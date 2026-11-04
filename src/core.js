// The protected part of your bot: the features buyers pay for. `npm run build` seals this file
// (`sunlicense seal`, with SUNLICENSE_PRODUCT) into src/core.sealed for the build you sell and leaves this
// plain copy out, so it only runs after SunLicense confirms the license (core unlock). A copy with the
// license check cut out has no key to open it.
//
// The sealed core is loaded from memory, so it can't import packages itself: everything it needs comes
// in `bot` (the discord.js client and module, the license status). Keep imports out of this file.

/**
 * Registers your commands and event handlers. Runs once, after a valid check (or one in the last 7 days
 * when SunLicense can't be reached).
 * @param {{ client: import('discord.js').Client, discord: typeof import('discord.js'), commands: object[], log: (line: string) => void }} bot
 */
export function start(bot) {
  const { client, discord } = bot;
  bot.commands.push(new discord.SlashCommandBuilder().setName('ping').setDescription('Replies with pong').toJSON());
  client.on(discord.Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'ping') {
      await interaction.reply({ content: 'Pong!', flags: discord.MessageFlags.Ephemeral });
    }
  });
  bot.log('Features started.');
}
