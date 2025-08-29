const config = require('../config');

/**
 * Get user data from database
 * @param {string} userId - Discord user ID
 * @returns {Object} User data object
 */
async function getUser(userId) {
    try {
        const userData = await global.db.get(`user_${userId}`);
        
        // Return default user data if not found
        if (!userData) {
            return {
                xp: 0,
                premium: false,
                doubleTokens: 0,
                rafflePoints: 0,
                invites: 0,
                collectedRewards: {
                    free: [],
                    premium: []
                }
            };
        }
        
        // Ensure all required fields exist
        return {
            xp: userData.xp || 0,
            premium: userData.premium || false,
            doubleTokens: userData.doubleTokens || 0,
            rafflePoints: userData.rafflePoints || 0,
            invites: userData.invites || 0,
            collectedRewards: userData.collectedRewards || { free: [], premium: [] }
        };
    } catch (error) {
        console.error('Error getting user data:', error);
        throw error;
    }
}

/**
 * Save user data to database
 * @param {string} userId - Discord user ID
 * @param {Object} data - User data to save
 */
async function setUser(userId, data) {
    try {
        await global.db.set(`user_${userId}`, data);
    } catch (error) {
        console.error('Error setting user data:', error);
        throw error;
    }
}

/**
 * Add XP to user with premium multiplier
 * @param {string} userId - Discord user ID
 * @param {number} amount - Base XP amount
 * @param {string} reason - Reason for XP gain
 * @returns {Object} Result with old level, new level, and XP gained
 */
async function addXP(userId, amount, reason = 'manual') {
    try {
        const userData = await getUser(userId);
        const oldLevel = calculateLevel(userData.xp);
        
        // Apply premium multiplier if user has premium
        const finalAmount = userData.premium ? Math.floor(amount * config.xp.premiumMultiplier) : amount;
        
        userData.xp += finalAmount;
        const newLevel = calculateLevel(userData.xp);
        
        await setUser(userId, userData);
        
        return {
            oldLevel,
            newLevel,
            xpGained: finalAmount,
            totalXP: userData.xp,
            reason
        };
    } catch (error) {
        console.error('Error adding XP:', error);
        throw error;
    }
}

/**
 * Calculate user level from XP
 * @param {number} xp - Total XP
 * @returns {number} User level
 */
function calculateLevel(xp) {
    for (let level = 1; level <= config.battlePass.maxLevel; level++) {
        if (xp < config.battlePass.xpThresholds[level - 1]) {
            return level - 1;
        }
    }
    return config.battlePass.maxLevel;
}

/**
 * Calculate XP progress for current level
 * @param {number} xp - Total XP
 * @returns {Object} Current XP and XP needed for next level
 */
function calculateXPProgress(xp) {
    const currentLevel = calculateLevel(xp);
    
    if (currentLevel >= config.battlePass.maxLevel) {
        return {
            currentXP: xp,
            neededXP: 0,
            progress: '100%'
        };
    }
    
    const currentLevelXP = currentLevel > 0 ? config.battlePass.xpThresholds[currentLevel - 1] : 0;
    const nextLevelXP = config.battlePass.xpThresholds[currentLevel];
    const currentXP = xp - currentLevelXP;
    const neededXP = nextLevelXP - currentLevelXP;
    
    return {
        currentXP,
        neededXP,
        progress: `${currentXP}/${neededXP}`
    };
}

/**
 * Get summary of user's collected rewards
 * @param {string} userId - Discord user ID
 * @returns {Object} Collected rewards summary
 */
async function getCollectedRewards(userId) {
    try {
        const userData = await getUser(userId);
        const collected = userData.collectedRewards || { free: [], premium: [] };
        
        // Count different reward types
        const summary = {
            packs: 0,
            tokens: 0,
            rafflePoints: 0,
            bonuses: 0
        };
        
        // Count free rewards
        collected.free.forEach(level => {
            const reward = config.battlePass.rewards.free[level];
            if (reward) {
                if (reward.type === 'pack') summary.packs += reward.amount;
                else if (reward.type === 'tokens') summary.tokens += reward.amount;
                else if (reward.type === 'rafflePoints') summary.rafflePoints += reward.amount;
                else summary.bonuses += 1;
            }
        });
        
        // Count premium rewards if user has premium
        if (userData.premium) {
            collected.premium.forEach(level => {
                const reward = config.battlePass.rewards.premium[level];
                if (reward) {
                    if (reward.type === 'pack') summary.packs += reward.amount;
                    else if (reward.type === 'tokens') summary.tokens += reward.amount;
                    else if (reward.type === 'rafflePoints') summary.rafflePoints += reward.amount;
                    else summary.bonuses += 1;
                }
            });
        }
        
        return summary;
    } catch (error) {
        console.error('Error getting collected rewards:', error);
        throw error;
    }
}

module.exports = {
    getUser,
    setUser,
    addXP,
    calculateLevel,
    calculateXPProgress,
    getCollectedRewards
};
