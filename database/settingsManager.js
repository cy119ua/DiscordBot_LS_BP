function getDB(){ const db = global.db; if(!db) throw new Error('DB not initialized'); return db; }
const skey = (g)=>`settings_${g}`;

async function getSettings(guildId){
  const db = getDB();
  const s = (await db.get(skey(guildId))) || {};
  return {
    logChannelId: s.logChannelId || null,
    ddEnabled: !!s.ddEnabled,
    // Состояние для специальных CUP-раундов (ddcup)
    cupEnabled: !!s.cupEnabled,
    cupRound: Number.isInteger(s.cupRound) ? s.cupRound : 0,
    // Список команд для текущего CUP (массив строк)
    cupTeams: Array.isArray(s.cupTeams) ? s.cupTeams : [],
    // ВАЖНО: добавили возврат текущего ID окна Double-Down
    ddWindowId: Number.isInteger(s.ddWindowId) ? s.ddWindowId : 0,
    whitelistUsers: Array.isArray(s.whitelistUsers) ? s.whitelistUsers : [],
    whitelistRoles: Array.isArray(s.whitelistRoles) ? s.whitelistRoles : []
  };
}
async function patchSettings(guildId, patch){
  const db = getDB();
  const curr = await getSettings(guildId);
  const next = { ...curr, ...patch };
  await db.set(skey(guildId), next);
  return next;
}

module.exports = { getSettings, patchSettings };
