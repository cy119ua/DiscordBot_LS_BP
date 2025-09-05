const { getUser, setUser, calculateLevel, calculateXPProgress, addXP } = require('../database/userManager');
const { getPromoCode, isCodeExpired, hasUserUsedPromo, markPromoCodeUsed } = require('../database/promoManager');
const { logAction } = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');
const { getSettings } = require('../database/settingsManager');
const { isWhitelisted } = require('../utils/permissions');

const userCommands = {
  // Проверка прав пользователя (whitelist/admin)
  checkperms: {
    name: 'checkperms',
    description: 'Проверить свои права',
    async execute(message) {
      const allowed = await isWhitelisted(message.member);
      const embed = new EmbedBuilder()
        .setColor(allowed ? 0x00ff99 : 0xff5555)
        .setTitle('Permissions')
        .setDescription(allowed ? '✅ У вас есть права администратора/whitelist' : '❌ У вас нет админ-прав / вы не в whitelist')
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
  },

  // Профиль пользователя
  profile: {
    name: 'profile',
    description: 'Показать профиль (уровень, прогресс, статусы)',
    async execute(message) {
      const userId = message.author.id;
      const u = await getUser(userId);
      const level = calculateLevel(u.xp || 0);
      const progress = calculateXPProgress(u.xp || 0);

      const embed = new EmbedBuilder()
        .setColor(u.premium ? 0xffd700 : 0x0099ff)
        .setTitle(`${message.author.username} — профиль`)
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
          { name: 'Уровень', value: String(level), inline: true },
          { name: 'Прогресс XP', value: progress.progress, inline: true },
          { name: 'Всего XP', value: String(u.xp || 0), inline: true },
          { name: 'Премиум', value: u.premium ? '⭐ Premium' : '🆓 Free', inline: true },
          { name: 'DD-жетоны', value: String(u.doubleTokens || 0), inline: true },
          { name: 'Очки розыгрыша', value: String(u.rafflePoints || 0), inline: true },
          { name: 'Инвайты', value: String(u.invites || 0), inline: true }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },

  // Активация промокода
  code: {
    name: 'code',
    description: 'Активировать промокод: !code ABC123',
    async execute(message, args) {
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
      const oldLevel = calculateLevel(before.xp || 0);

      let gained = 0;
      if (promo.rewards && Number.isFinite(promo.rewards.xp)) {
        const res = await addXP(userId, promo.rewards.xp, 'promo'); // применит премиум +10%
        gained = res.xpGained || 0;
      }

      await markPromoCodeUsed(code, userId);

      const after = await getUser(userId);
      const newLevel = calculateLevel(after.xp || (before.xp + gained));

      await logAction('promo', message.guild, {
        user: { id: message.author.id, tag: message.author.tag },
        code, gainedXp: gained, oldLevel, newLevel
      });

      return message.reply(`✅ Код принят: +${gained} XP`);
    }
  },

  // Использование Double-Down жетонов
  usedd: {
    name: 'usedd',
    description: 'Активировать 1 или 2 жетона Double-Down',
    async execute(message, args) {
      if (!message.guild) return message.reply('❌ Команда доступна только на сервере.');

      const raw = (args?.[0] || '').trim();
      const amount = Number.parseInt(raw, 10);
      if (![1, 2].includes(amount)) return message.reply('❌ Использование: `!usedd 1` или `!usedd 2`');

      const s = await getSettings(message.guild.id);
      if (!s.ddEnabled) return message.reply('❌ Double-Down сейчас недоступен.');

      const userId = message.author.id;
      const u = await getUser(userId);
      const before = Number(u.doubleTokens || 0);
      if (before < amount) return message.reply(`❌ Недостаточно жетонов (есть: ${before}, нужно: ${amount}).`);

      const after = before - amount;
      u.doubleTokens = after;
      await setUser(userId, u);

      const multiplier = amount === 2 ? 3 : 2;

      await logAction('doubleStake', message.guild, {
        user: { id: message.author.id, tag: message.author.tag },
        amount, multiplier, beforeTokens: before, afterTokens: after
      });

      return message.reply(`✅ Активировано: **x${multiplier}**. Списано ${amount} жетон(а). Осталось: ${after}.`);
    }
  }
};

module.exports = userCommands;
