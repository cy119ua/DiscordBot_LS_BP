/**
 * Create a new promo code
 * @param {string} code - Promo code string
 * @param {Object} rewards - Rewards object { xp?, tokens?, rafflePoints?, premium? }
 * @param {Date} expirationDate - Expiration date
 * @returns {boolean} Success status
 */
async function createPromoCode(code, rewards, expirationDate) {
    try {
        const promoData = {
            code: code.toUpperCase(),
            rewards,
            expirationDate: expirationDate.toISOString(),
            usedBy: [],
            createdAt: new Date().toISOString()
        };
        
        console.log(`💾 Storing promo data:`, JSON.stringify(promoData, null, 2));
        await global.db.set(`promo_${code.toUpperCase()}`, promoData);
        
        // Verify it was stored correctly
        const verification = await global.db.get(`promo_${code.toUpperCase()}`);
        console.log(`🔍 Verification - stored data:`, JSON.stringify(verification, null, 2));
        
        return true;
    } catch (error) {
        console.error('Error creating promo code:', error);
        return false;
    }
}

/**
 * Get promo code data
 * @param {string} code - Promo code string
 * @returns {Object|null} Promo code data or null if not found
 */
async function getPromoCode(code) {
    try {
        const data = await global.db.get(`promo_${code.toUpperCase()}`);
        console.log(`🔍 Retrieved promo data for ${code}:`, JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error('Error getting promo code:', error);
        return null;
    }
}

/**
 * Delete a promo code
 * @param {string} code - Promo code string
 * @returns {boolean} Success status
 */
async function deletePromoCode(code) {
    try {
        await global.db.delete(`promo_${code.toUpperCase()}`);
        return true;
    } catch (error) {
        console.error('Error deleting promo code:', error);
        return false;
    }
}

/**
 * Check if promo code is expired
 * @param {Object} promoData - Promo code data
 * @returns {boolean} True if expired
 */
function isCodeExpired(promoData) {
    if (!promoData || !promoData.expirationDate) return true;
    return new Date() > new Date(promoData.expirationDate);
}

/**
 * Mark promo code as used by user
 * @param {string} code - Promo code string
 * @param {string} userId - Discord user ID
 * @returns {boolean} Success status
 */
async function markPromoCodeUsed(code, userId) {
    try {
        const promoData = await getPromoCode(code);
        if (!promoData) return false;
        
        if (!promoData.usedBy.includes(userId)) {
            promoData.usedBy.push(userId);
            await global.db.set(`promo_${code.toUpperCase()}`, promoData);
        }
        
        return true;
    } catch (error) {
        console.error('Error marking promo code as used:', error);
        return false;
    }
}

/**
 * Check if user has already used a promo code
 * @param {string} code - Promo code string
 * @param {string} userId - Discord user ID
 * @returns {boolean} True if already used
 */
async function hasUserUsedPromo(code, userId) {
    try {
        const promoData = await getPromoCode(code);
        if (!promoData) return false;
        return promoData.usedBy.includes(userId);
    } catch (error) {
        console.error('Error checking if user used promo:', error);
        return false;
    }
}

module.exports = {
    createPromoCode,
    getPromoCode,
    deletePromoCode,
    isCodeExpired,
    markPromoCodeUsed,
    hasUserUsedPromo
};
