// utils/permissions.js
async function isWhitelisted(member) {
  const { getSettings } = require('../database/settingsManager');
  const s = await getSettings(member.guild.id);

  // Явный список пользователей
  if (s.whitelistUsers?.includes(member.id)) return true;

  // Роли
  const roles = [...(member.roles?.cache?.keys?.() ? member.roles.cache.keys() : [])];
  if (roles.some(r => s.whitelistRoles?.includes(r))) return true;

  // Фолбэк: администратор
  return member.permissions?.has?.('Administrator') || member.permissions?.has?.('Admin') || false;
}

module.exports = { isWhitelisted };
