const { getSettings } = require('../database/settingsManager');

async function isWhitelisted(member) {
  try {
    if (!member) return false;
    const s = await getSettings(member.guild.id);
    if (s.whitelistUsers?.includes(member.id)) return true;
    const roles = member.roles?.cache ? [...member.roles.cache.keys()] : [];
    if (roles.some(r => s.whitelistRoles?.includes(r))) return true;
    return member.permissions?.has?.('Administrator') || false;
  } catch { return false; }
}

module.exports = { isWhitelisted };
