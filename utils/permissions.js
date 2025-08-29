const { PermissionFlagsBits } = require('discord.js');

/**
 * Check if member has administrator permissions
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} True if member has admin permissions
 */
function isAdmin(member) {
    if (!member || !member.permissions) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

module.exports = {
    isAdmin
};
