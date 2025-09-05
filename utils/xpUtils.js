const config = require('../config');
const { logAction } = require('./logger');

/**
 * Проверка достижения контрольных уровней (50/96/100) и логирование
 * @param {number} oldLevel
 * @param {number} newLevel
 * @param {import('discord.js').User} user
 * @param {import('discord.js').Guild} guild
 */
async function checkLevelMilestone(oldLevel, newLevel, user, guild) {
  try {
    const milestones = Array.isArray(config.xp?.milestones) ? config.xp.milestones : [50, 96, 100];
    for (const milestone of milestones) {
      if (oldLevel < milestone && newLevel >= milestone) {
        const thresholds = config.battlePass?.xpThresholds || [];
        const totalXP = thresholds[Math.max(0, milestone - 1)] || milestone * 100; // фолбэк
        await logAction('milestone', guild, { user: { id: user.id, tag: user.tag }, level: milestone, totalXP });
      }
    }
  } catch (e) {
    console.error('Error checking level milestones:', e);
  }
}

module.exports = { checkLevelMilestone };
