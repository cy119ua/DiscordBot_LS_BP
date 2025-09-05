// database/settingsManager.js
const db = global.db;
if (!db) throw new Error('global.db не инициализирован');

function key(guildId) { return `settings_${guildId}`; }

async function getSettings(guildId) {
  const s = await db.get(key(guildId));
  return s || { logChannelId: null, ddEnabled: false, whitelistUsers: [], whitelistRoles: [] };
}

async function patchSettings(guildId, patch) {
  const s = await getSettings(guildId);
  const next = { ...s, ...patch };
  await db.set(key(guildId), next);
  return next;
}

module.exports = { getSettings, patchSettings };
