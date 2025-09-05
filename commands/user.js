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
    
    code: {
        name: 'code',
        description: 'Активировать промокод: !code ABC123',
        async execute(message, args) {
            const { getPromoCode, hasUserUsedPromo, isCodeExpired, markPromoCodeUsed } = require('../database/promoManager');
            const { addXP, getUser, calculateLevel } = require('../database/userManager');
            const { logAction } = require('../utils/logger');
            if (!args[0]) return message.reply('❌ Укажи код: `!code ABC123`');
            const code = String(args[0]).toUpperCase();
            const promo = await getPromoCode(code);
            if (!promo) return message.reply('❌ Неверный код'); // по ТЗ
            const userId = message.author.id;
            if (await hasUserUsedPromo(code, userId)) {
                return message.reply('❌ Вы уже использовали этот код');
            }
            if (isCodeExpired(promo)) {
                return message.reply('❌ Промокод недействителен'); // по ТЗ
                }
                const before = await getUser(userId);
                const oldLevel = calculateLevel(before.xp);
                let gained = 0;
                if (promo.rewards && Number.isFinite(promo.rewards.xp)) {
                    const res = await addXP(userId, promo.rewards.xp, 'promo'); // применит премиум +10%
                    gained = res.xpGained || 0;
                }
                await markPromoCodeUsed(code, userId);
                const afterLevel = calculateLevel(before.xp + gained);
                await logAction('promo', message.guild, {
                    user: message.author,
                    code,
                    gainedXp: gained,
                    oldLevel,
                    newLevel: afterLevel
                });
                return message.reply(`✅ Код принят: +${gained} XP`);
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
    },

    usedd: {
  name: 'usedd',
  description: 'Активировать 1 или 2 жетона Double-Down',
  async execute(message, args) {
    try {
      if (!message.guild) {
        return message.reply('❌ Команда доступна только на сервере.');
      }

      const raw = (args?.[0] || '').trim();
      const amount = Number.parseInt(raw, 10);
      if (![1, 2].includes(amount)) {
        return message.reply('❌ Использование: `!usedd 1` или `!usedd 2`');
      }

      // Проверка окна активности DD через settingsManager (вместо globalManager)
      const { getSettings } = require('../database/settingsManager');
      const s = await getSettings(message.guild.id);
      if (!s.ddEnabled) {
        return message.reply('❌ Double-Down сейчас недоступен.');
      }

      // Списываем жетоны пользователя
      const userId = message.author.id;
      const u = await getUser(userId);
      const before = Number(u.doubleTokens || 0);
      if (before < amount) {
        return message.reply(`❌ Недостаточно жетонов (есть: ${before}, нужно: ${amount}).`);
      }

      const after = before - amount;
      u.doubleTokens = after;
      await setUser(userId, u);

      // 1 жетон → x2, 2 жетона → x3
      const multiplier = amount === 2 ? 3 : 2;

      // Лог
      await logAction('doubleStake', message.guild, {
        user: { id: message.author.id, tag: message.author.tag },
        amount,
        multiplier,
        beforeTokens: before,
        afterTokens: after
      });

      return message.reply(`✅ Активировано: **x${multiplier}**. Списано ${amount} жетон(а). Осталось: ${after}.`);
    } catch (e) {
      console.error('usedd error:', e);
      return message.reply('❌ Ошибка при активации Double-Down.');
    }
  }
}


};

module.exports = userCommands;
