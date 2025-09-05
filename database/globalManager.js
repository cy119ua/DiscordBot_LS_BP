/**
 * Get global settings
 * @returns {Object} Global settings object
 */
async function getGlobalSettings() {
    try {
        const settings = await global.db.get('global');
        return settings || {
            doubleStake: false
        };
    } catch (error) {
        console.error('Error getting global settings:', error);
        return { doubleStake: false };
    }
}

/**
 * Set global double stake status
 * @param {boolean} enabled - Double stake enabled status
 * @returns {boolean} Success status
 */
async function setDoubleStake(enabled) {
    try {
        const settings = await getGlobalSettings();
        settings.doubleStake = enabled;
        await global.db.set('global', settings);
        return true;
    } catch (error) {
        console.error('Error setting double stake:', error);
        return false;
    }
}

/**
 * Get double stake status
 * @returns {boolean} Double stake enabled status
 */
async function getDoubleStake() {
    try {
        const settings = await getGlobalSettings();
        return settings.doubleStake || false;
    } catch (error) {
        console.error('Error getting double stake status:', error);
        return false;
    }
}

module.exports = {
    getGlobalSettings,
    setDoubleStake,
    getDoubleStake
};
