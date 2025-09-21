const config = require('../config');
const { logAction } = require('./logger');
const { getUser } = require('../database/userManager');

/**
 * Проверка достижения контрольных уровней (50/96/100) и логирование
 * @param {number} oldLevel
 * @param {number} newLevel
 * @param {import('discord.js').User} user
 * @param {import('discord.js').Guild} guild
 */
async function checkLevelMilestone(oldLevel, newLevel, user, guild) {
  try {
    // Список уровней, на которых необходимо уведомлять админа. Если не задано в конфиге,
    // используем 50, 98 и 100 как значения по умолчанию.
    const milestones = Array.isArray(config.xp?.milestones) ? config.xp.milestones : [50, 98, 100];
    for (const milestone of milestones) {
      // Проверяем переход через порог уровня
      if (oldLevel < milestone && newLevel >= milestone) {
        // Определяем, есть ли у пользователя премиум. Если нет — пропускаем уведомление.
        let hasPremium = false;
        try {
          const uRec = await getUser(user.id);
          hasPremium = !!uRec.premium;
        } catch {}
        if (!hasPremium) continue;
        // Расчитываем общий XP для данного уровня (фолбэк: уровень * 100)
        const thresholds = config.battlePass?.xpThresholds || [];
        const totalXP = thresholds[Math.max(0, milestone - 1)] || milestone * 100;
        // Логируем достижение уровня и указываем, что нужно оповестить админа
        await logAction('milestone', guild, {
          user: { id: user.id, tag: user.tag },
          level: milestone,
          totalXp: totalXP,
          pingAdmin: true
        });
      }
    }
  } catch (e) {
    console.error('Error checking level milestones:', e);
  }
}

module.exports = { checkLevelMilestone };
