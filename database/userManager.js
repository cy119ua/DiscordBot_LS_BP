// database/userManager.js
const config = require('../config');

function getDB(){ const db = global.db; if(!db) throw new Error('DB not initialized'); return db; }
const DEFAULT_USER = { xp:0, invites:0, rafflePoints:0, doubleTokens:0, cardPacks:0, premium:false, premium_since:null };
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

/**
 * Добавляет пользователю XP. Если skipRewards=false — выдаёт награды за
 * каждый пройденный новый уровень (по config.battlePass.rewards).
 */
async function addXP(userId, baseAmount, reason='generic', skipRewards=false){
  const u = await getUser(userId);
  const beforeXP = u.xp || 0;
  const oldLevel = calculateLevel(beforeXP);
  const oldXPProgress = calculateXPProgress(beforeXP);

  let gained = Number(baseAmount)||0;
  if (u.premium) gained = Math.floor(gained * 1.1);

  u.xp = (u.xp || 0) + gained;
  const newLevel = calculateLevel(u.xp);
  const newXPProgress = calculateXPProgress(u.xp);

  if (!skipRewards && newLevel > oldLevel) {
    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      await applyLevelRewards(u, lvl);
    }
  }
  await setUser(userId, u);

  return { xpGained: gained, oldLevel, newLevel, reason, oldXPProgress, newXPProgress };
}

/**
 * Выдаёт награды за конкретный уровень. Поддержка форматов:
 * - массив [{type, amount}]
 * - объект { doubleTokens:1, ... }
 */
async function applyLevelRewards(u, level){
  try {
    const bp = config?.battlePass || {};
    const rewards = bp.rewards || {};
    const freeRewards = rewards.free || {};
    const premRewards = rewards.premium || {};

    async function applyOneReward(type, amt) {
      const amount = Number(amt);
      if (!amount || isNaN(amount)) return;
      if (type === 'doubleTokens') {
        let add = amount;
        if (u.premium) add = Math.max(1, Math.ceil(add * 1.1));
        u.doubleTokens = Number(u.doubleTokens || 0) + add;
      } else if (type === 'rafflePoints') {
        u.rafflePoints = Number(u.rafflePoints || 0) + amount;
      } else if (type === 'invites') {
        u.invites = Number(u.invites || 0) + amount;
      } else if (type === 'xp') {
        // XP-награда: избегаем рекурсии
        await addXP(u.id, amount, 'reward', true);
      } else if (type === 'cardPacks') {
        u.cardPacks = Number(u.cardPacks || 0) + amount;
      }
    }

    async function applyRewardSet(rew) {
      if (!rew) return;
      if (Array.isArray(rew)) {
        for (const item of rew) {
          if (!item) continue;
          if (item.type) await applyOneReward(item.type, item.amount);
        }
      } else {
        for (const [key, value] of Object.entries(rew)) {
          await applyOneReward(key, value);
        }
      }
    }

    if (freeRewards[level]) await applyRewardSet(freeRewards[level]);
    if (u.premium && premRewards[level]) await applyRewardSet(premRewards[level]);
  } catch (e) {
    console.error('[applyLevelRewards]', e);
  }
}

/**
 * Считает «ожидаемые итоги наград» по конфигу на уровне L (включительно).
 * Возвращает суммарные значения по ключам (без XP — по умолчанию).
 */
function calculateExpectedRewardsTotals(level, premium, includeXP=false) {
  const out = { doubleTokens:0, rafflePoints:0, invites:0, cardPacks:0, xp:0 };
  const bp = config?.battlePass || {};
  const rw = bp.rewards || { free:{}, premium:{} };

  function addReward(rew) {
    if (!rew) return;
    const addOne = (type, amount) => {
      if (!includeXP && type === 'xp') return;
      if (out[type] == null) out[type] = 0;
      out[type] += Number(amount)||0;
    };
    if (Array.isArray(rew)) {
      for (const r of rew) if (r?.type) addOne(r.type, r.amount);
    } else {
      for (const [t, a] of Object.entries(rew)) addOne(t, a);
    }
  }

  for (let lvl = 1; lvl <= Math.max(1, Math.min(100, level)); lvl++) {
    if (rw.free?.[lvl]) addReward(rw.free[lvl]);
    if (premium && rw.premium?.[lvl]) addReward(rw.premium[lvl]);
  }
  return out;
}

/**
 * Доначисляет недостающие награды пользователю (идемпотентно).
 * Считает, сколько «должно быть» на текущем уровне, сравнивает с тем,
 * что есть у пользователя, и докидывает нехватающее.
 * По умолчанию XP-награды при перерасчёте не добавляются (чтобы не
 * ломать баланс). Если нужно — можно включить includeXP=true.
 */
async function reapplyRewardsForUser(userId, includeXP=false) {
  const u = await getUser(userId);
  const level = calculateLevel(u.xp || 0);
  const exp = calculateExpectedRewardsTotals(level, !!u.premium, includeXP);

  const deltas = {
    doubleTokens: Math.max(0, (exp.doubleTokens||0) - (u.doubleTokens||0)),
    rafflePoints: Math.max(0, (exp.rafflePoints||0) - (u.rafflePoints||0)),
    invites:      Math.max(0, (exp.invites||0)      - (u.invites||0)),
    cardPacks:    Math.max(0, (exp.cardPacks||0)    - (u.cardPacks||0)),
    xp:           includeXP ? Math.max(0, (exp.xp||0) - (u.xpFromRewards||0||0)) : 0
  };

  if (deltas.doubleTokens) {
    let add = deltas.doubleTokens;
    if (u.premium) add = Math.max(1, Math.ceil(add * 1.1));
    u.doubleTokens = (u.doubleTokens||0) + add;
  }
  if (deltas.rafflePoints) u.rafflePoints = (u.rafflePoints||0) + deltas.rafflePoints;
  if (deltas.invites)      u.invites      = (u.invites||0)      + deltas.invites;
  if (deltas.cardPacks)    u.cardPacks    = (u.cardPacks||0)    + deltas.cardPacks;

  await setUser(userId, u);
  return { level, exp, deltas, after: await getUser(userId) };
}

module.exports = { 
  getUser, setUser, addXP, calculateLevel, calculateXPProgress,
  reapplyRewardsForUser, calculateExpectedRewardsTotals
};
