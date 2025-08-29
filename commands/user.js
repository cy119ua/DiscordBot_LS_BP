const { getUser, calculateLevel, calculateXPProgress, setUser } = require('../database/userManager');
const { getPromoCode, isCodeExpired, hasUserUsedPromo, markPromoCodeUsed } = require('../database/promoManager');
const { logAction } = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');

const userCommands = {
    checkperms: {
        name: 'checkperms',
        description: 'Check your permissions',
        async execute(message, args, client) {
            const { isAdmin } = require('../utils/permissions');
            const hasAdmin = isAdmin(message.member);
            
            console.log(`🔍 Permission check for ${message.author.username}: ${hasAdmin ? 'ADMIN' : 'USER'}`);
            
            const embed = new EmbedBuilder()
                .setColor(hasAdmin ? 0x00ff00 : 0xff9900)
                .setTitle('🔐 Permission Check')
                .addFields(
                    { name: 'Administrator', value: hasAdmin ? '✅ Yes' : '❌ No', inline: true },
                    { name: 'Can Use Admin Commands', value: hasAdmin ? '✅ Yes' : '❌ No', inline: true }
                )
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        }
    },
    
    testlog: {
        name: 'testlog',
        description: 'Test log channel creation',
        async execute(message, args, client) {
            try {
                console.log(`🧪 Testing log channel creation for user ${message.author.username}`);
                await logAction('milestone', message.guild, {
                    user: message.author,
                    level: 1,
                    totalXP: 100
                });
                message.reply('✅ Log test completed! Check console logs and #bp-logs channel.');
            } catch (error) {
                console.error('Test log error:', error);
                message.reply('❌ Error during log test.');
            }
        }
    },
    
    promo: {
        name: 'promo',
        description: 'Redeem a promo code',
        async execute(message, args, client) {
            if (args.length < 1) {
                return message.reply('❌ Usage: `!promo <code>`');
            }
            
            const code = args[0].toUpperCase();
            const userId = message.author.id;
            
            try {
                console.log(`🎟️ User ${message.author.username} trying to redeem code: ${code}`);
                
                // Get promo code data
                const promoData = await getPromoCode(code);
                console.log(`📋 Promo data found:`, promoData ? 'YES' : 'NO');
                
                if (!promoData) {
                    console.log(`❌ Promo code ${code} not found in database`);
                    return message.reply('❌ Invalid promo code.');
                }
                
                console.log(`⏰ Checking expiration: expires ${promoData.expirationDate}, now ${new Date().toISOString()}`);
                
                // Check if expired
                if (isCodeExpired(promoData)) {
                    console.log(`❌ Promo code ${code} is expired`);
                    return message.reply('❌ This promo code has expired.');
                }
                
                console.log(`✅ Promo code ${code} is valid and not expired`);
                
                // Check if user already used this code
                if (await hasUserUsedPromo(code, userId)) {
                    return message.reply('❌ You have already used this promo code.');
                }
                
                // Get user data
                const userData = await getUser(userId);
                const oldLevel = calculateLevel(userData.xp);
                
                // Apply rewards
                if (promoData.rewards.xp) {
                    userData.xp += promoData.rewards.xp;
                }
                if (promoData.rewards.tokens) {
                    userData.doubleTokens += promoData.rewards.tokens;
                }
                if (promoData.rewards.rafflePoints) {
                    userData.rafflePoints += promoData.rewards.rafflePoints;
                }
                if (promoData.rewards.premium) {
                    userData.premium = true;
                }
                
                // Save user data
                await setUser(userId, userData);
                
                // Mark code as used
                await markPromoCodeUsed(code, userId);
                
                const newLevel = calculateLevel(userData.xp);
                
                // Log the action
                await logAction('promo', message.guild, {
                    user: message.author,
                    code,
                    rewards: promoData.rewards,
                    oldLevel,
                    newLevel
                });
                
                // Create response embed
                const embed = new EmbedBuilder()
                    .setColor(0xff9900)
                    .setTitle('🎉 Promo Code Redeemed!')
                    .setDescription(`Successfully redeemed code: **${code}**`)
                    .setTimestamp();
                
                const rewardFields = [];
                if (promoData.rewards.xp) {
                    rewardFields.push({ name: 'XP Gained', value: promoData.rewards.xp.toString(), inline: true });
                }
                if (promoData.rewards.tokens) {
                    rewardFields.push({ name: 'Tokens Gained', value: promoData.rewards.tokens.toString(), inline: true });
                }
                if (promoData.rewards.rafflePoints) {
                    rewardFields.push({ name: 'Raffle Points', value: promoData.rewards.rafflePoints.toString(), inline: true });
                }
                if (promoData.rewards.premium) {
                    rewardFields.push({ name: 'Premium Status', value: 'Granted!', inline: true });
                }
                
                if (oldLevel !== newLevel) {
                    rewardFields.push({ name: 'Level Up!', value: `${oldLevel} → ${newLevel}`, inline: false });
                }
                
                embed.addFields(rewardFields);
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Promo redeem error:', error);
                message.reply('❌ There was an error redeeming the promo code.');
            }
        }
    },
    
    profile: {
        name: 'profile',
        description: 'View your profile and stats',
        async execute(message, args, client) {
            try {
                const userId = message.author.id;
                const userData = await getUser(userId);
                const level = calculateLevel(userData.xp);
                const progress = calculateXPProgress(userData.xp);
                
                const embed = new EmbedBuilder()
                    .setColor(userData.premium ? 0xffd700 : 0x0099ff)
                    .setTitle(`${message.author.username}'s Profile`)
                    .setThumbnail(message.author.displayAvatarURL())
                    .addFields(
                        { name: 'Level', value: level.toString(), inline: true },
                        { name: 'XP Progress', value: progress.progress, inline: true },
                        { name: 'Total XP', value: userData.xp.toString(), inline: true },
                        { name: 'Premium Status', value: userData.premium ? '⭐ Premium' : '🆓 Free', inline: true },
                        { name: 'Double Tokens', value: userData.doubleTokens.toString(), inline: true },
                        { name: 'Raffle Points', value: userData.rafflePoints.toString(), inline: true },
                        { name: 'Invites', value: userData.invites.toString(), inline: true }
                    )
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Profile command error:', error);
                message.reply('❌ There was an error displaying your profile.');
            }
        }
    }
};

module.exports = userCommands;
