const config = require('../config');

function getDB(){ const db = global.db; if(!db) throw new Error('DB not initialized'); return db; }
// Добавляем cardPacks по умолчанию, чтобы отслеживать количество паков карт
// Расширяем модель пользователя, добавляя статистику по сыгранным турам,
// победным сериям и достижениям. Эти поля будут использоваться для
// начисления бонусных очков Боевого пропуска за участие и победы в матчах.
const DEFAULT_USER = {
  xp: 0,
  invites: 0,
  rafflePoints: 0,
  doubleTokens: 0,
  cardPacks: 0,
  premium: false,
  premium_since: null,
  // Сколько туров сыграл участник (обновляется при команде /teamresult)
  matchesPlayed: 0,
  // Сколько побед подряд на текущий момент
  winsInRow: 0,
  // Флаги для достижений: чтобы бонус выдавался один раз
  achievements: {
    ninePlayed: false,
    twelvePlayed: false,
    fourWinsStreak: false
  }
};
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

  // Выдаём награду за 1-й уровень при первом получении опыта
  if (!skipRewards && beforeXP < 1 && u.xp >= 1) {
    await applyLevelRewards(u, 1);
  }
  // Переходы с 2-го уровня и выше
  if (!skipRewards && newLevel > oldLevel) {
    let from = Math.max(2, oldLevel + 1);
    let to = newLevel;
    for (let lvl = from; lvl <= to; lvl++) {
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
        // Для жетонов Double‑Down не применяется 10% бонус за премиум.
        // Независимо от статуса премиума, выдаём только базовое количество.
        const add = amount;
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

/**
 * Пересчитывает награды для пользователя в зависимости от его уровня и премиума
 * и доначисляет недостающие награды. XP-награды не пересчитываются.
 *
 * @param {string} userId ID пользователя
 * @param {boolean} includeXP Пересчитывать XP-награды (в текущей реализации не используется)
 * @returns {Promise<{level:number,deltas:Object}>}
 */
async function reapplyRewardsForUser(userId, includeXP = false) {
  const u = await getUser(userId);
  const lvl = calculateLevel(u.xp || 0);
  const isPrem = !!u.premium;
  const expected = { doubleTokens: 0, rafflePoints: 0, invites: 0, cardPacks: 0 };
  let expectedXP = 0;
  // Загружаем таблицу наград из конфига
  let bpRewards = {};
  try {
    const cfg = require('../config');
    bpRewards = (cfg && cfg.battlePass && cfg.battlePass.rewards) || {};
  } catch (e) {
    bpRewards = {};
  }
  const freeRewards = bpRewards.free || {};
  const premRewards = bpRewards.premium || {};
  // Не начислять награды за уровни, если lvl < 1
  if (lvl >= 1) {
    // Проходим уровни от 1 до lvl
    for (let i = 1; i <= lvl; i++) {
      // Награда за 1-й уровень только если XP >= 1
      if (i === 1 && u.xp < 1) continue;
      const fr = freeRewards[i] || [];
      for (const item of fr) {
        if (!item || typeof item !== 'object') continue;
        const type = item.type;
        const amt = Number(item.amount) || 0;
        if (!amt) continue;
        if (type === 'doubleTokens') {
          expected.doubleTokens += amt;
        } else if (type === 'rafflePoints') {
          expected.rafflePoints += amt;
        } else if (type === 'invites') {
          expected.invites += amt;
        } else if (type === 'cardPacks') {
          expected.cardPacks += amt;
        } else if (type === 'xp') {
          expectedXP += amt;
        }
      }
      if (isPrem) {
        const pr = premRewards[i] || [];
        for (const item of pr) {
          if (!item || typeof item !== 'object') continue;
          const type = item.type;
          const amt = Number(item.amount) || 0;
          if (!amt) continue;
          if (type === 'doubleTokens') {
            expected.doubleTokens += amt;
          } else if (type === 'rafflePoints') {
            expected.rafflePoints += amt;
          } else if (type === 'invites') {
            expected.invites += amt;
          } else if (type === 'cardPacks') {
            expected.cardPacks += amt;
          } else if (type === 'xp') {
            expectedXP += amt;
          }
        }
      }
    }
  }
  // Текущие значения
  const curr = {
    doubleTokens: Number(u.doubleTokens || 0),
    rafflePoints: Number(u.rafflePoints || 0),
    invites: Number(u.invites || 0),
    cardPacks: Number(u.cardPacks || 0)
  };
  // Дельта: сколько нужно доначислить
  const deltas = {
    doubleTokens: expected.doubleTokens - curr.doubleTokens,
    rafflePoints: expected.rafflePoints - curr.rafflePoints,
    invites: expected.invites - curr.invites,
    cardPacks: expected.cardPacks - curr.cardPacks
  };
  // Начисляем недостающие награды
  if (deltas.doubleTokens > 0) u.doubleTokens = curr.doubleTokens + deltas.doubleTokens;
  if (deltas.rafflePoints > 0) u.rafflePoints = curr.rafflePoints + deltas.rafflePoints;
  if (deltas.invites > 0) u.invites = curr.invites + deltas.invites;
  if (deltas.cardPacks > 0) u.cardPacks = curr.cardPacks + deltas.cardPacks;
  await setUser(userId, u);
  return { level: lvl, deltas };
}

module.exports = { getUser, setUser, addXP, calculateLevel, calculateXPProgress, reapplyRewardsForUser };
