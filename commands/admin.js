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
        description: 'Добавить 100 XP и +1 invite пользователю (с премиум-множителем)',
        adminOnly: true,
        async execute(message, args) {
        // !xpinvite @user   (без второго аргумента; по умолчанию +100)
         const { addXP, getUser, setUser } = require('../database/userManager');

         if (!args[0]) return message.reply('❌ Использование: `!xpinvite @user`');
         const userId = args[0].replace(/[<@!>]/g, '');

        const base = 100; // по ТЗ — фиксированные 100
        const res = await addXP(userId, base, 'invite'); // внутри addXP применится premium +10%

            // +1 к счётчику приглашений
        const u = await getUser(userId);
        u.invites = (u.invites || 0) + 1;
        await setUser(userId, u);
        return message.reply(`✅ <@${userId}> получил +${res.xpGained} XP за приглашение (итого: ${u.xp}) и +1 invite.`);
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
    description: 'Set raffle points for a user',
      adminOnly: true,
      async execute(message, args, client) {
        if (args.length < 2) return message.reply('❌ Usage: `!gpset <@user> <points>`');
        const userId = args[0].replace(/[<@!>]/g, '');
        const points = parseInt(args[1]);
        if (isNaN(points) || points < 0) return message.reply('❌ Invalid points');
        const userData = await getUser(userId);
        userData.rafflePoints = points;
        await setUser(userId, userData);
        return message.reply(`✅ Raffle points set to **${points}** for <@${userId}>`);
    }
},

    ddset: {
        name: 'ddset', adminOnly: true, description: 'Set user DD tokens',
        async execute(message, args) {
            if (args.length < 2) return message.reply('❌ Usage: `!ddset <@user> <amount>`');
            const userId = args[0].replace(/[<@!>]/g, '');
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount < 0) return message.reply('❌ Invalid amount');
            const userData = await getUser(userId);
            userData.doubleTokens = amount;
            await setUser(userId, userData);
            await logAction('doubleStake', message.guild, { admin: message.author, enabled: true, amount, target: { toString:()=>`<@${userId}>` }});
            return message.reply(`✅ Set **${amount}** DD tokens for <@${userId}>`);
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
        description: 'Показать статистику БП для @user (или себя, если не указан)',
        adminOnly: true,
        async execute(message, args) {
            const { EmbedBuilder } = require('discord.js');
            const { getUser, calculateLevel, calculateXPProgress } = require('../database/userManager');
            const userId = args[0]?.replace(/[<@!>]/g, '') || message.author.id;
            const u = await getUser(userId);
            const lvl = calculateLevel(u.xp || 0);
            const prog = calculateXPProgress(u.xp || 0); // ожидается { current, next, progress: "xx%" }
            const embed = new EmbedBuilder()
            .setColor(0x9932cc)
            .setTitle('📊 Battle Pass — статистика')
            .addFields(
        { name: 'Пользователь', value: `<@${userId}>`, inline: true },
        { name: 'Уровень', value: String(lvl), inline: true },
        { name: 'XP', value: `${u.xp || 0} (${prog.progress})`, inline: true },
        { name: 'DD-жетоны', value: String(u.doubleTokens || 0), inline: true },
        { name: 'Очки розыгрыша', value: String(u.rafflePoints || 0), inline: true },
        { name: 'Инвайты', value: String(u.invites || 0), inline: true },
        { name: 'Премиум', value: u.premium ? '⭐ Активен' : '🆓 Нет', inline: true }
      )
      .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
},

    
    setcode: {
        name: 'setcode',
        description: 'Создать промокод: !setcode CODE TTL_MIN XP [MAX_USES]',
        adminOnly: true,
        async execute(message, args) {
            const { createPromoCode } = require('../database/promoManager');

            if (args.length < 3) {
                return message.reply('❌ Использование: `!setcode CODE TTL_MIN XP [MAX_USES]`');
            }
            const [raw, ttlStr, xpStr, maxStr] = args;
            const code = String(raw).toUpperCase();
            const ttlMin = parseInt(ttlStr, 10);
            const xp = parseInt(xpStr, 10);
            const maxUses = maxStr ? parseInt(maxStr, 10) : 0;
            if (!Number.isFinite(ttlMin) || ttlMin < 0 || !Number.isFinite(xp) || xp < 0) {
                return message.reply('❌ Неверные параметры. Пример: `!setcode 1234 60 100 15`');
            }
            const expiresAt = ttlMin ? new Date(Date.now() + ttlMin * 60_000) : null;
            await createPromoCode(code, { xp }, expiresAt, maxUses);
            return message.reply(`✅ Промокод **${code}**: +${xp} XP, TTL ${ttlMin} мин, лимит ${maxUses || '∞'}`);
        }
    },

    premiumon: {
        name: 'premiumon',
        description: 'Включить премиум пользователю',
        adminOnly: true,
        async execute(message, args) {
            const { getUser, setUser } = require('../database/userManager');
            if (!args[0]) return message.reply('❌ Использование: `!premiumon @user`');
            const userId = args[0].replace(/[<@!>]/g, '');
            const u = await getUser(userId);
            u.premium = true;
            u.premium_since = new Date().toISOString(); // пригодится, если будешь учитывать момент покупки
            await setUser(userId, u);
            return message.reply(`✅ Премиум включён для <@${userId}>`);
        }
    },
    premiumoff: {
        name: 'premiumoff',
        description: 'Выключить премиум пользователю',
        adminOnly: true,
        async execute(message, args) {
            const { getUser, setUser } = require('../database/userManager');
            if (!args[0]) return message.reply('❌ Использование: `!premiumoff @user`');
            const userId = args[0].replace(/[<@!>]/g, '');
            const u = await getUser(userId);
            u.premium = false;
            await setUser(userId, u);
            return message.reply(`✅ Премиум выключен для <@${userId}>`);
        }
    },

};

module.exports = adminCommands;
