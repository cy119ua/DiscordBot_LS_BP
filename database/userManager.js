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
async function addXP(userId, baseAmount, reason='generic', skipRewards=false){
  const u = await getUser(userId);
  // Прогресс до начисления
  const beforeXP = u.xp || 0;
  const oldLevel = calculateLevel(beforeXP);
  const oldXPProgress = calculateXPProgress(beforeXP);

  let gained = Number(baseAmount)||0;
  // Бонус 10% премиум-пользователям
  if (u.premium) gained = Math.floor(gained * 1.1);

  u.xp = (u.xp || 0) + gained;
  const newLevel = calculateLevel(u.xp);
  const newXPProgress = calculateXPProgress(u.xp);

  // Если пользователь перешёл на новые уровни и награды не пропущены, выдаём награды за каждый новый уровень
  if (!skipRewards && newLevel > oldLevel) {
    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      await applyLevelRewards(u, lvl);
    }
  }

  // Сохраняем обновлённые данные пользователя
  await setUser(userId, u);

  return { xpGained: gained, oldLevel, newLevel, reason, oldXPProgress, newXPProgress };
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

    // Функция применения конкретного набора наград к пользователю
    async function applyRewardSet(rew) {
      for (const [key, value] of Object.entries(rew || {})) {
        const amt = Number(value);
        if (!amt || isNaN(amt)) continue;
        if (key === 'doubleTokens') {
          let add = amt;
          // Премиум даёт +10% к жетонам, округляем вверх для улучшенной отдачи
          if (u.premium) {
            add = Math.max(1, Math.ceil(add * 1.1));
          }
          u.doubleTokens = Number(u.doubleTokens || 0) + add;
        } else if (key === 'rafflePoints') {
          u.rafflePoints = Number(u.rafflePoints || 0) + amt;
        } else if (key === 'invites') {
          u.invites = Number(u.invites || 0) + amt;
        } else if (key === 'xp') {
          // Для XP-наград используем addXP c skipRewards=true, чтобы избежать рекурсии
          await addXP(u.id, amt, 'reward', true);
        } else if (key === 'cardPacks') {
          // Хранить количество паков карт у пользователя. Заводим новое поле cardPacks, если не было
          u.cardPacks = Number(u.cardPacks || 0) + amt;
        }
      }
    }

    // Награды бесплатного уровня
    if (freeRewards[level]) {
      await applyRewardSet(freeRewards[level]);
    }
    // Награды премиального уровня выдаются только премиум-пользователю
    if (u.premium && premRewards[level]) {
      await applyRewardSet(premRewards[level]);
    }
  } catch (e) {
    console.error('[applyLevelRewards]', e);
  }
}

module.exports = { getUser, setUser, addXP, calculateLevel, calculateXPProgress };
