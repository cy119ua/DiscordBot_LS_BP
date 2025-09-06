const config = require('../config');

function getDB(){ const db = global.db; if(!db) throw new Error('DB not initialized'); return db; }
const DEFAULT_USER = { xp:0, invites:0, rafflePoints:0, doubleTokens:0, premium:false, premium_since:null };
const ukey = (id)=>`user_${id}`;

async function getUser(userId){
  const db = getDB();
  const u = (await db.get(ukey(userId))) || {};
  return { ...DEFAULT_USER, id:userId, ...u };
}
async function setUser(userId, data){
  const db = getDB();
  const merged = { ...DEFAULT_USER, id:userId, ...data };
  await db.set(ukey(userId), merged);
  return merged;
}

function xpForLevel(level){
  const th = config?.battlePass?.xpThresholds;
  if (Array.isArray(th) && th[level-1]!=null) return th[level-1];
  return (level-1)*100;
}
function calculateLevel(xp){
  const x = Number(xp)||0;
  return Math.max(1, Math.min(100, Math.floor(x/100)+1));
}
function calculateXPProgress(xp){
  const x = Number(xp)||0;
  const lvl = calculateLevel(x);
  const start = xpForLevel(lvl);
  const next = xpForLevel(Math.min(100, lvl+1));
  const seg = Math.max(100, next-start)||100;
  const within = Math.max(0, Math.min(seg, x-start));
  return { currentXP: within, neededXP: seg, progress: `${within}/${seg}` };
}

async function addXP(userId, baseAmount, reason='generic'){
  const u = await getUser(userId);
  const oldLevel = calculateLevel(u.xp);
  let gained = Number(baseAmount)||0;
  if (u.premium) gained = Math.floor(gained*1.1); // +10% только на будущие начисления
  u.xp = (u.xp||0) + gained;
  await setUser(userId, u);
  const newLevel = calculateLevel(u.xp);
  return { xpGained: gained, oldLevel, newLevel, reason };
}

module.exports = { getUser, setUser, addXP, calculateLevel, calculateXPProgress };
