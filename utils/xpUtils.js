const config = require('../config');
const { logAction } = require('./logger');

/**
 * Check if user reached a level milestone and handle notification
 * @param {number} oldLevel - Previous level
 * @param {number} newLevel - New level
 * @param {User} user - Discord user object
 * @param {Guild} guild - Discord guild object
 */
async function checkLevelMilestone(oldLevel, newLevel, user, guild) {
    try {
        // Check if any milestone was reached
        for (const milestone of config.xp.milestones) {
            if (oldLevel < milestone && newLevel >= milestone) {
                // Log milestone achievement
                await logAction('milestone', guild, {
                    user,
                    level: milestone,
                    totalXP: newLevel * 100 // Simplified calculation
                });
                
                console.log(`🏆 User ${user.username} reached level milestone: ${milestone}`);
            }
        }
    } catch (error) {
        console.error('Error checking level milestones:', error);
    }
}

module.exports = {
    checkLevelMilestone
};
