const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, calculateLevel, calculateXPProgress, getCollectedRewards } = require('../database/userManager');
const config = require('../config');

/**
 * Get battle pass image URL for a specific page
 * @param {number} page - Page number (1-10)
 * @returns {string} Image URL
 */
function getBattlePassImageURL(page) {
    const ranges = {
        1: '1-10',
        2: '11-20',
        3: '21-30',
        4: '31-40',
        5: '41-50',
        6: '51-60',
        7: '61-70',
        8: '71-80',
        9: '81-90',
        10: '91-100'
    };
    
    return config.battlePass.imageUrls[ranges[page]] || config.battlePass.imageUrls['1-10'];
}

/**
 * Generate battle pass embed for a user
 * @param {string} userId - Discord user ID
 * @param {number} page - Page number (1-10)
 * @returns {EmbedBuilder} Battle pass embed
 */
async function generateBattlePassEmbed(userId, page = 1) {
    try {
        const userData = await getUser(userId);
        const level = calculateLevel(userData.xp);
        const progress = calculateXPProgress(userData.xp);
        const collectedRewards = await getCollectedRewards(userId);
        
        // Calculate level ranges for this page
        const startLevel = (page - 1) * 10 + 1;
        const endLevel = page * 10;
        
        // Get image URL for this page
        const imageUrl = getBattlePassImageURL(page);
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(userData.premium ? 0xffd700 : 0x0099ff)
            .setTitle(`Battle Pass – Levels ${startLevel}–${endLevel}`)
            .setImage(imageUrl)
            .addFields(
                { name: 'Current Level', value: level.toString(), inline: true },
                { name: 'XP Progress', value: progress.progress, inline: true },
                { name: 'Premium Status', value: userData.premium ? '⭐ Premium' : '🆓 Free', inline: true }
            );
        
        // Add collected rewards summary
        const rewardSummary = [
            `📦 Packs: ${collectedRewards.packs}`,
            `🪙 Tokens: ${collectedRewards.tokens}`,
            `🎯 Raffle Points: ${collectedRewards.rafflePoints}`,
            `⭐ Bonuses: ${collectedRewards.bonuses}`
        ].join(' • ');
        
        embed.addFields({ name: 'Collected Rewards', value: rewardSummary, inline: false });
        
        // Add footer with page info
        embed.setFooter({ text: `Page ${page}/10 • Use buttons to navigate` });
        embed.setTimestamp();
        
        return embed;
    } catch (error) {
        console.error('Error generating battle pass embed:', error);
        throw error;
    }
}

/**
 * Create battle pass navigation buttons
 * @param {number} currentPage - Current page number
 * @returns {Array} Array of action rows with buttons
 */
function createBattlePassButtons(currentPage = 1) {
    const buttons1 = new ActionRowBuilder();
    const buttons2 = new ActionRowBuilder();
    
    // First row: Pages 1-5
    for (let i = 1; i <= 5; i++) {
        const button = new ButtonBuilder()
            .setCustomId(`bp_page_${i}`)
            .setLabel(`${i * 10 - 9}-${i * 10}`)
            .setStyle(i === currentPage ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(i === currentPage);
        
        buttons1.addComponents(button);
    }
    
    // Second row: Pages 6-10
    for (let i = 6; i <= 10; i++) {
        const button = new ButtonBuilder()
            .setCustomId(`bp_page_${i}`)
            .setLabel(`${i * 10 - 9}-${i * 10}`)
            .setStyle(i === currentPage ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(i === currentPage);
        
        buttons2.addComponents(button);
    }
    
    return [buttons1, buttons2];
}

/**
 * Handle battle pass button interactions
 * @param {ButtonInteraction} interaction - Discord button interaction
 */
async function handleBattlePassInteraction(interaction) {
    try {
        // Extract page number from custom ID
        const pageMatch = interaction.customId.match(/bp_page_(\d+)/);
        if (!pageMatch) return;
        
       const userData = await getUser(userId);
       const level = calculateLevel(userData.xp);
       const defaultPage = Math.max(1, Math.min(10, Math.ceil(Math.max(1, level) / 10)));
       const page = Number.isFinite(parseInt(args[0])) ? parseInt(args[0]) : defaultPage;
       const userId = interaction.user.id;
        
        // Generate new embed and buttons
        const embed = await generateBattlePassEmbed(userId, page);
        const buttons = createBattlePassButtons(page);
        
        // Update the message
        await interaction.update({
            embeds: [embed],
            components: buttons
        });
    } catch (error) {
        console.error('Error handling battle pass interaction:', error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: '❌ There was an error updating the battle pass display.', 
                ephemeral: true 
            });
        }
    }
}

module.exports = {
    getBattlePassImageURL,
    generateBattlePassEmbed,
    createBattlePassButtons,
    handleBattlePassInteraction
};
