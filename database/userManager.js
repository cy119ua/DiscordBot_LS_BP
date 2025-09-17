const config = require('../config');

function getDB(){ const db = global.db; if(!db) throw new Error('DB not initialized'); return db; }
// Добавляем cardPacks по умолчанию, чтобы отслеживать количество паков карт
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
 * Добавляет пользователю XP. Возвращает количество полученного XP и уровень до/после.
 * Если пользователь имеет статус премиум, XP увеличивается на 10% (округляется вниз).
 * Параметр skipRewards позволяет пропустить выдачу наград за новые уровни (используется для наград, которые сами добавляют XP).
 *
 * @param {string} userId ID пользователя
 * @param {number} baseAmount Базовое количество XP
 * @param {string} reason Строка-описание причины начисления
 * @param {boolean} skipRewards Не начислять награды за уровень, default=false
 */
// ВЕРСИЯ addXP с возвратом xpBase и признаком премиума
async function addXP(userId, baseAmount, reason='generic', skipRewards=false){
  const u = await getUser(userId);
  const beforeXP = u.xp || 0;
  const oldLevel = calculateLevel(beforeXP);
  const oldXPProgress = calculateXPProgress(beforeXP);

  let xpBase = Number(baseAmount) || 0;            // сколько «по тарифу»
  let xpGained = xpBase;                            // сколько реально добавим
  let premiumApplied = false;

  if (u.premium) {
    premiumApplied = true;
    xpGained = Math.floor(xpBase * 1.10);          // +10%, округление как и раньше
  }

  u.xp = (u.xp || 0) + xpGained;
  const newLevel = calculateLevel(u.xp);
  const newXPProgress = calculateXPProgress(u.xp);

  // если стартовали с 0 XP — один раз награда за 1-й уровень
  if (!skipRewards && beforeXP === 0) {
    await applyLevelRewards(u, 1);
  }
  // переходы со 2го уровня и выше
  if (!skipRewards && newLevel > oldLevel) {
    const from = Math.max(2, oldLevel + 1);
    for (let lvl = from; lvl <= newLevel; lvl++) {
      await applyLevelRewards(u, lvl);
    }
  }

  await setUser(userId, u);

  return {
    xpBase,                 // <- базовое значение без премиума
    xpGained,               // <- фактически начислено (с премией)
    premiumApplied,         // <- флаг
    oldLevel, newLevel,
    reason,
    oldXPProgress, newXPProgress
  };
}

/**
 * Выдаёт награды за определённый уровень. Награды берутся из config.battlePass.rewards.
 * Для бесплатного пути (free) выдаются всем, для премиального (premium) — только премиум‑пользователям.
 * Поддерживаемые свойства наград: doubleTokens, rafflePoints, invites, xp, cardPacks. 
 * При выдаче жетонов (doubleTokens) премиум‑пользователь получает +10% дополнительно (округляется вверх).
 * При выдаче XP через награду вызывается addXP(..., skipRewards=true), чтобы избежать рекурсивной выдачи.
 *
 * @param {object} u Объект пользователя (будет модифицирован)
 * @param {number} level Номер уровня, за который выдаются награды
 */
async function applyLevelRewards(u, level){
  try {
    const bp = config?.battlePass || {};
    const rewards = bp.rewards || {};
    const freeRewards = rewards.free || {};
    const premRewards = rewards.premium || {};

    // Обновлённая функция выдачи награды. Поддерживает как объект
    // вида {cardPacks:1, doubleTokens:2}, так и массив элементов вида
    // { type:'cardPacks', amount:1 }
    async function applyOneReward(type, amt) {
      const amount = Number(amt);
      if (!amount || isNaN(amount)) return;
      if (type === 'doubleTokens') {
        let add = amount;
        if (u.premium) {
          // Премиум даёт +10% к жетонам, округляем вверх
          add = Math.max(1, Math.ceil(add * 1.1));
        }
        u.doubleTokens = Number(u.doubleTokens || 0) + add;
      } else if (type === 'rafflePoints') {
        u.rafflePoints = Number(u.rafflePoints || 0) + amount;
      } else if (type === 'invites') {
        u.invites = Number(u.invites || 0) + amount;
      } else if (type === 'xp') {
        // Для XP-наград используем addXP с skipRewards=true, чтобы избежать рекурсии
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
          const type = item.type;
          const amt = item.amount;
          if (type) await applyOneReward(type, amt);
        }
      } else {
        for (const [key, value] of Object.entries(rew)) {
          await applyOneReward(key, value);
        }
      }
    }

    // Награды бесплатного уровня
    if (freeRewards[level]) {
      await applyRewardSet(freeRewards[level]);
    }
    // Награды премиального уровня выдаются только премиум‑пользователю
    if (u.premium && premRewards[level]) {
      await applyRewardSet(premRewards[level]);
    }
  } catch (e) {
    console.error('[applyLevelRewards]', e);
  }
}

module.exports = { getUser, setUser, addXP, calculateLevel, calculateXPProgress };
