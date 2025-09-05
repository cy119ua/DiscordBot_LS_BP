// database/settingsManager.js
function getDB() {
  if (!global.db) throw new Error('global.db не инициализирован');
  return global.db;
}


function key(guildId) { return `settings_${guildId}`; }

async function getSettings(guildId) {
  const s = await getDB().get(key(guildId));
  return s || { logChannelId: null, ddEnabled: false, whitelistUsers: [], whitelistRoles: [] };
}

async function patchSettings(guildId, patch) {
  const s = await getSettings(guildId);
  const next = { ...s, ...patch };
  await getDB().set(key(guildId), next);
  return next;
}

module.exports = { getSettings, patchSettings };
