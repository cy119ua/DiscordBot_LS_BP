require('dotenv').config();
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.APPLICATION_ID;
const GUILD_ID = process.env.DEV_GUILD_ID;
if (!TOKEN || !APP_ID || !GUILD_ID) {
  console.error('Set DISCORD_TOKEN, APPLICATION_ID and DEV_GUILD_ID in .env');
  process.exit(1);
}

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const cmds = await rest.get(Routes.applicationGuildCommands(APP_ID, GUILD_ID));
    console.log(`Found ${cmds.length} commands in guild ${GUILD_ID}`);
    for (const c of cmds) {
      console.log('---');
      console.log(`name: ${c.name}`);
      console.log(`id: ${c.id}`);
      console.log(`description: ${c.description}`);
      console.log(`default_member_permissions: ${c.default_member_permissions}`);
      console.log(`dm_permission: ${c.dm_permission}`);
      console.log(`options: ${JSON.stringify(c.options || [])}`);
    }
  } catch (e) {
    console.error('Failed to list commands:', e);
    process.exit(1);
  }
})();
