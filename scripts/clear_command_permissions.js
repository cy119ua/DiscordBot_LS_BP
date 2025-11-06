require('dotenv').config();
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.APPLICATION_ID;
const GUILD_ID = process.env.DEV_GUILD_ID;
const CMD_ID = process.argv[2];

if (!TOKEN || !APP_ID || !GUILD_ID) {
  console.error('Set DISCORD_TOKEN, APPLICATION_ID and DEV_GUILD_ID in .env');
  process.exit(1);
}
if (!CMD_ID) {
  console.error('Usage: node clear_command_permissions.js <commandId>');
  process.exit(1);
}

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    // PUT empty permissions array to clear overrides
    await rest.put(Routes.applicationCommandPermissions(APP_ID, GUILD_ID, CMD_ID), { body: { permissions: [] } });
    console.log(`✅ Cleared permissions for command ${CMD_ID} in guild ${GUILD_ID}`);
  } catch (e) {
    console.error('Failed to clear permissions:', e);
    process.exit(1);
  }
})();
