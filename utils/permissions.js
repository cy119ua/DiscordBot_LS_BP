const { getSettings } = require('../database/settingsManager');
const config = require('../config');

async function isWhitelisted(member) {
  try {
    if (!member) return false;
    const s = await getSettings(member.guild.id);
    // Глобальный список пользователей с полными правами
    if (Array.isArray(config.adminUsers) && config.adminUsers.includes(member.id)) return true;
    // Персональный белый список гильдии
    if (s.whitelistUsers?.includes(member.id)) return true;
    const roles = member.roles?.cache ? [...member.roles.cache.keys()] : [];
    if (roles.some(r => s.whitelistRoles?.includes(r))) return true;
    return member.permissions?.has?.('Administrator') || false;
  } catch { return false; }
}

module.exports = { isWhitelisted };
