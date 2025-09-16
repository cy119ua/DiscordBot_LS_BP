// utils/permissions.js
const config = require('../config');

async function isWhitelisted(memberOrUser) {
  try {
    if (!memberOrUser) return false;

    // Забираем ID надёжно: из interaction.user, из member.user, либо member.id
    const uid =
      memberOrUser.user?.id ??
      memberOrUser.id ??
      null;

    if (!uid) return false;

    // Сравнение строками на всякий случай
    const wl = Array.isArray(config.adminUsers) ? config.adminUsers.map(String) : [];
    return wl.includes(String(uid));
  } catch {
    return false;
  }
}

module.exports = { isWhitelisted };
