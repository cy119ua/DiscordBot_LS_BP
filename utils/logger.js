const { EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../config');

/**
 * Find or create the logging channel
 * @param {Guild} guild - Discord guild
 * @returns {TextChannel} Logging channel
 */
async function findOrCreateLogChannel(guild) {
    try {
        console.log(`🔍 Looking for log channel "${config.logging.channelName}" in guild: ${guild.name}`);
        
        // Try to find existing channel
        let channel = guild.channels.cache.find(ch => 
            ch.name === config.logging.channelName && ch.type === ChannelType.GuildText
        );
        
        if (channel) {
            console.log(`✅ Found existing log channel: ${channel.name}`);
            return channel;
        }
        
        // Create channel if it doesn't exist
        console.log(`📝 Creating new log channel: ${config.logging.channelName}`);
        channel = await guild.channels.create({
            name: config.logging.channelName,
            type: ChannelType.GuildText,
            topic: 'Battle Pass Bot Logs - Automatic logging of bot activities'
        });
        console.log(`✅ Successfully created log channel: ${channel.name}`);
        
        return channel;
    } catch (error) {
        console.error('❌ Error finding/creating log channel:', error);
        console.error('Error details:', error.message);
        return null;
    }
}

/**
 * Log an action to the logging channel
 * @param {string} type - Action type (xpAdd, xpInvite, promo, doubleStake, milestone)
 * @param {Guild} guild - Discord guild
 * @param {Object} data - Action data
 */
async function logAction(type, guild, data) {
    try {
        const channel = await findOrCreateLogChannel(guild);
        if (!channel) return;
        
        let embed;
        
        switch (type) {
            case 'xpAdd':
                embed = new EmbedBuilder()
                    .setColor(config.logging.colors.xpAdd)
                    .setTitle('📈 Manual XP Addition')
                    .addFields(
                        { name: 'Admin', value: data.admin.toString(), inline: true },
                        { name: 'Target User', value: data.target.toString(), inline: true },
                        { name: 'XP Added', value: data.amount.toString(), inline: true },
                        { name: 'Level Change', value: `${data.oldLevel} → ${data.newLevel}`, inline: true }
                    )
                    .setTimestamp();
                break;
                
            case 'xpInvite':
                embed = new EmbedBuilder()
                    .setColor(config.logging.colors.xpInvite)
                    .setTitle('👥 Invite XP Gained')
                    .addFields(
                        { name: 'Admin', value: data.admin.toString(), inline: true },
                        { name: 'Target User', value: data.target.toString(), inline: true },
                        { name: 'XP Added', value: data.amount.toString(), inline: true },
                        { name: 'Level Change', value: `${data.oldLevel} → ${data.newLevel}`, inline: true }
                    )
                    .setTimestamp();
                break;
                
            case 'promo':
                embed = new EmbedBuilder()
                    .setColor(config.logging.colors.promo)
                    .setTitle('🎟️ Promo Code Redeemed')
                    .addFields(
                        { name: 'User', value: data.user.toString(), inline: true },
                        { name: 'Code', value: data.code, inline: true },
                        { name: 'Level Change', value: `${data.oldLevel} → ${data.newLevel}`, inline: true }
                    )
                    .setTimestamp();
                
                // Add reward details
                const rewardText = [];
                if (data.rewards.xp) rewardText.push(`${data.rewards.xp} XP`);
                if (data.rewards.tokens) rewardText.push(`${data.rewards.tokens} Tokens`);
                if (data.rewards.rafflePoints) rewardText.push(`${data.rewards.rafflePoints} Raffle Points`);
                if (data.rewards.premium) rewardText.push('Premium Status');
                
                if (rewardText.length > 0) {
                    embed.addFields({ name: 'Rewards', value: rewardText.join(', '), inline: false });
                }
                break;
                
            case 'doubleStake':
                embed = new EmbedBuilder()
                    .setColor(config.logging.colors.doubleStake)
                    .setTitle('🎲 Double Stake State Changed')
                    .addFields(
                        { name: 'Admin', value: data.admin.toString(), inline: true },
                        { name: 'Status', value: data.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true }
                    )
                    .setTimestamp();
                break;
                
            case 'milestone':
                embed = new EmbedBuilder()
                    .setColor(config.logging.colors.milestone)
                    .setTitle('🏆 Level Milestone Reached')
                    .addFields(
                        { name: 'User', value: data.user.toString(), inline: true },
                        { name: 'Level Reached', value: data.level.toString(), inline: true },
                        { name: 'Total XP', value: data.totalXP.toString(), inline: true }
                    )
                    .setTimestamp();
                break;
                
            default:
                return; // Unknown log type
        }
        
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging action:', error);
    }
}

module.exports = {
    findOrCreateLogChannel,
    logAction
};
