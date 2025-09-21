// sfth/sfth/utils/rewardsReapply.js
// Нормализованный «пересчёт наград» на основе текущего уровня и премиума.
// Использует карту наград из battlepass.js (или из config там, где у тебя она лежит).

const { getUser, setUser } = require('../database/userManager');
const { calculateLevel } = require('../utils/xp');
const bp = require('../commands/battlepass');

/**
 * Проходит уровни с 1 по текущий и суммирует награды так, будто выдаём их с нуля.
 * Возвращает объект с дельтой, а в пользователя пишет актуальные итоговые значения.
 */
async function reapplyRewardsForUser(userId) {
  const u = await getUser(userId) || {};
  const level = calculateLevel(u.xp || 0);
  const isPremium = !!u.premium;

  // 1) Считаем «сколько должно быть» по всем уровням с 1..level
  // Предполагаем, что в battlepass есть экспорт getRewardsForLevel(level, isPremium)
  // Если у тебя другой экспорт — переименуй здесь.
  let expected = { rafflePoints: 0, doubleTokens: 0, cardPacks: 0, invites: (u.invites || 0) };
  for (let L = 1; L <= level; L++) {
    const rw = bp.getRewardsForLevel(L, isPremium); // <- см. нижний блок «B» в battlepass.js
    if (!rw) continue;
    expected.rafflePoints += (rw.rafflePoints || 0);
    expected.doubleTokens += (rw.doubleTokens || 0);
    expected.cardPacks   += (rw.cardPacks   || 0);
    // приглашения правило — как в твоём проекте: обычно за уровни не дают, оставим как есть
  }

  // 2) Текущее (что хранится у юзера)
  const current = {
    rafflePoints: u.rafflePoints || 0,
    doubleTokens: u.doubleTokens || 0,
    cardPacks:    u.cardPacks    || 0,
    invites:      u.invites      || 0,
  };

  // 3) Дельты (для лога) и запись «как должно быть»
  const delta = {
    rafflePoints: expected.rafflePoints - current.rafflePoints,
    doubleTokens: expected.doubleTokens - current.doubleTokens,
    cardPacks:    expected.cardPacks    - current.cardPacks,
  };

  u.rafflePoints = expected.rafflePoints;
  u.doubleTokens = expected.doubleTokens;
  u.cardPacks    = expected.cardPacks;
  await setUser(userId, u);

  return { level, isPremium, before: current, after: expected, delta };
}

module.exports = { reapplyRewardsForUser };
