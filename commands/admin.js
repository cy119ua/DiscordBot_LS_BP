const { addXP, getUser, setUser } = require('../database/userManager');
const { createPromoCode, deletePromoCode } = require('../database/promoManager');
const { setDoubleStake, getDoubleStake } = require('../database/globalManager');
const { logAction, findOrCreateLogChannel } = require('../utils/logger');
const { checkLevelMilestone } = require('../utils/xpUtils');
const { EmbedBuilder } = require('discord.js');

const adminCommands = {
    xp: {
        name: 'xp',
        description: 'Add XP to a user',
        adminOnly: true,
        async execute(message, args, client) {
            if (args.length < 2) {
                return message.reply('❌ Usage: `!xp <@user> <amount>`');
            }
            
            const userMention = args[0];
            const amount = parseInt(args[1]);
            
            if (isNaN(amount) || amount <= 0) {
                return message.reply('❌ Please provide a valid XP amount.');
            }
            
            // Extract user ID from mention
            const userId = userMention.replace(/[<@!>]/g, '');
            const targetUser = await client.users.fetch(userId).catch(() => null);
            
            if (!targetUser) {
                return message.reply('❌ User not found.');
            }
            
            try {
                const result = await addXP(userId, amount, 'manual_admin');
                
                // Check for level milestone
                await checkLevelMilestone(result.oldLevel, result.newLevel, targetUser, message.guild);
                
                // Log the action
                await logAction('xpAdd', message.guild, {
                    admin: message.author,
                    target: targetUser,
                    amount: result.xpGained,
                    oldLevel: result.oldLevel,
                    newLevel: result.newLevel
                });
                
                const embed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ XP Added')
                    .setDescription(`Added **${result.xpGained} XP** to ${targetUser}`)
                    .addFields(
                        { name: 'Level Progress', value: `${result.oldLevel} → ${result.newLevel}`, inline: true },
                        { name: 'Total XP', value: result.totalXP.toString(), inline: true }
                    )
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('XP add error:', error);
                message.reply('❌ There was an error adding XP.');
            }
        }
    },
    
    xpinvite: {
        name: 'xpinvite',
        description: 'Add invite XP to a user',
        adminOnly: true,
        async execute(message, args, client) {
            if (args.length < 2) {
                return message.reply('❌ Usage: `!xpinvite <@user> <amount>`');
            }
            
            const userMention = args[0];
            const amount = parseInt(args[1]);
            
            if (isNaN(amount) || amount <= 0) {
                return message.reply('❌ Please provide a valid XP amount.');
            }
            
            const userId = userMention.replace(/[<@!>]/g, '');
            const targetUser = await client.users.fetch(userId).catch(() => null);
            
            if (!targetUser) {
                return message.reply('❌ User not found.');
            }
            
            try {
                const result = await addXP(userId, amount, 'invite');
                
                // Update invite count
                const userData = await getUser(userId);
                userData.invites += 1;
                await setUser(userId, userData);
                
                // Check for level milestone
                await checkLevelMilestone(result.oldLevel, result.newLevel, targetUser, message.guild);
                
                // Log the action
                await logAction('xpInvite', message.guild, {
                    admin: message.author,
                    target: targetUser,
                    amount: result.xpGained,
                    oldLevel: result.oldLevel,
                    newLevel: result.newLevel
                });
                
                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('✅ Invite XP Added')
                    .setDescription(`Added **${result.xpGained} XP** to ${targetUser} for inviting`)
                    .addFields(
                        { name: 'Level Progress', value: `${result.oldLevel} → ${result.newLevel}`, inline: true },
                        { name: 'Total Invites', value: userData.invites.toString(), inline: true }
                    )
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Invite XP add error:', error);
                message.reply('❌ There was an error adding invite XP.');
            }
        }
    },
    
    xpset: {
        name: 'xpset',
        description: 'Set user XP to specific amount',
        adminOnly: true,
        async execute(message, args, client) {
            if (args.length < 2) {
                return message.reply('❌ Usage: `!xpset <@user> <amount>`');
            }
            
            const userMention = args[0];
            const amount = parseInt(args[1]);
            
            if (isNaN(amount) || amount < 0) {
                return message.reply('❌ Please provide a valid XP amount.');
            }
            
            const userId = userMention.replace(/[<@!>]/g, '');
            const targetUser = await client.users.fetch(userId).catch(() => null);
            
            if (!targetUser) {
                return message.reply('❌ User not found.');
            }
            
            try {
                const userData = await getUser(userId);
                const oldXP = userData.xp;
                const oldLevel = require('../database/userManager').calculateLevel(oldXP);
                
                userData.xp = amount;
                await setUser(userId, userData);
                
                const newLevel = require('../database/userManager').calculateLevel(amount);
                
                // Check for level milestone
                await checkLevelMilestone(oldLevel, newLevel, targetUser, message.guild);
                
                const embed = new EmbedBuilder()
                    .setColor(0xff9900)
                    .setTitle('✅ XP Set')
                    .setDescription(`Set ${targetUser}'s XP to **${amount}**`)
                    .addFields(
                        { name: 'Previous XP', value: oldXP.toString(), inline: true },
                        { name: 'Level Progress', value: `${oldLevel} → ${newLevel}`, inline: true }
                    )
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('XP set error:', error);
                message.reply('❌ There was an error setting XP.');
            }
        }
    },
    
    gpset: {
        name: 'gpset',
        description: 'Set user to premium status',
        adminOnly: true,
        async execute(message, args, client) {
            if (args.length < 1) {
                return message.reply('❌ Usage: `!gpset <@user>`');
            }
            
            const userMention = args[0];
            const userId = userMention.replace(/[<@!>]/g, '');
            const targetUser = await client.users.fetch(userId).catch(() => null);
            
            if (!targetUser) {
                return message.reply('❌ User not found.');
            }
            
            try {
                const userData = await getUser(userId);
                userData.premium = true;
                await setUser(userId, userData);
                
                const embed = new EmbedBuilder()
                    .setColor(0xffd700)
                    .setTitle('✅ Premium Status Set')
                    .setDescription(`${targetUser} now has premium status!`)
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Premium set error:', error);
                message.reply('❌ There was an error setting premium status.');
            }
        }
    },
    
    ddset: {
        name: 'ddset',
        description: 'Set global double stake status',
        adminOnly: true,
        async execute(message, args, client) {
            if (args.length < 1) {
                return message.reply('❌ Usage: `!ddset <on|off>`');
            }
            
            const status = args[0].toLowerCase();
            
            if (status !== 'on' && status !== 'off') {
                return message.reply('❌ Please specify "on" or "off".');
            }
            
            try {
                const enabled = status === 'on';
                await setDoubleStake(enabled);
                
                // Log the action
                await logAction('doubleStake', message.guild, {
                    admin: message.author,
                    enabled
                });
                
                const embed = new EmbedBuilder()
                    .setColor(enabled ? 0x00ff00 : 0xff0000)
                    .setTitle('✅ Double Stake Updated')
                    .setDescription(`Global double stake is now **${enabled ? 'ENABLED' : 'DISABLED'}**`)
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Double stake set error:', error);
                message.reply('❌ There was an error updating double stake status.');
            }
        }
    },
    
    ddstart: {
        name: 'ddstart',
        description: 'Start global double stake',
        adminOnly: true,
        async execute(message, args, client) {
            try {
                await setDoubleStake(true);
                
                await logAction('doubleStake', message.guild, {
                    admin: message.author,
                    enabled: true
                });
                
                const embed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ Double Stake Started')
                    .setDescription('Global double stake is now **ACTIVE**!')
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Double stake start error:', error);
                message.reply('❌ There was an error starting double stake.');
            }
        }
    },
    
    ddstop: {
        name: 'ddstop',
        description: 'Stop global double stake',
        adminOnly: true,
        async execute(message, args, client) {
            try {
                await setDoubleStake(false);
                
                await logAction('doubleStake', message.guild, {
                    admin: message.author,
                    enabled: false
                });
                
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('✅ Double Stake Stopped')
                    .setDescription('Global double stake is now **INACTIVE**.')
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Double stake stop error:', error);
                message.reply('❌ There was an error stopping double stake.');
            }
        }
    },
    
    bpstat: {
        name: 'bpstat',
        description: 'View battle pass statistics',
        adminOnly: true,
        async execute(message, args, client) {
            try {
                const doubleStake = await getDoubleStake();
                
                const embed = new EmbedBuilder()
                    .setColor(0x9932cc)
                    .setTitle('📊 Battle Pass Statistics')
                    .addFields(
                        { name: 'Global Double Stake', value: doubleStake ? '🟢 Active' : '🔴 Inactive', inline: true },
                        { name: 'Max Level', value: '100', inline: true },
                        { name: 'Premium Multiplier', value: '1.1x', inline: true }
                    )
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Battle pass stats error:', error);
                message.reply('❌ There was an error getting battle pass statistics.');
            }
        }
    },
    
    promocreate: {
        name: 'promocreate',
        description: 'Create a new promo code',
        adminOnly: true,
        async execute(message, args, client) {
            if (args.length < 4) {
                return message.reply('❌ Usage: `!promocreate <code> <xp> <tokens> <days>`');
            }
            
            const code = args[0].toUpperCase();
            const xp = parseInt(args[1]);
            const tokens = parseInt(args[2]);
            const days = parseInt(args[3]);
            
            if (isNaN(xp) || isNaN(tokens) || isNaN(days) || xp < 0 || tokens < 0 || days <= 0) {
                return message.reply('❌ Please provide valid numbers for XP, tokens, and days.');
            }
            
            try {
                const expirationDate = new Date();
                expirationDate.setDate(expirationDate.getDate() + days);
                
                const success = await createPromoCode(code, { xp, tokens }, expirationDate);
                
                if (success) {
                    const embed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle('✅ Promo Code Created')
                        .addFields(
                            { name: 'Code', value: code, inline: true },
                            { name: 'XP Reward', value: xp.toString(), inline: true },
                            { name: 'Token Reward', value: tokens.toString(), inline: true },
                            { name: 'Expires', value: expirationDate.toDateString(), inline: false }
                        )
                        .setTimestamp();
                    
                    message.reply({ embeds: [embed] });
                } else {
                    message.reply('❌ There was an error creating the promo code.');
                }
            } catch (error) {
                console.error('Promo create error:', error);
                message.reply('❌ There was an error creating the promo code.');
            }
        }
    }
};

module.exports = adminCommands;
