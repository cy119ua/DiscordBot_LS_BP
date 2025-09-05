const { addXP, getUser, setUser, calculateLevel, calculateXPProgress } = require('../database/userManager');
const { createPromoCode } = require('../database/promoManager');
const { logAction } = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');
const { getSettings, patchSettings } = require('../database/settingsManager');
const { checkLevelMilestone } = require('../utils/xpUtils');

const adminCommands = {
  xp: {
    name: 'xp',
    description: 'Добавить XP пользователю: !xp @user amount',
    adminOnly: true,
    async execute(message, args, client) {
      if (args.length < 2) return message.reply('❌ Usage: `!xp <@user> <amount>`');

      const userMention = args[0];
      const amount = parseInt(args[1], 10);
      if (!Number.isFinite(amount) || amount < 0) return message.reply('❌ Укажи корректное число XP');

      const userId = userMention.replace(/[<@!>]/g, '');
      const targetUser = await client.users.fetch(userId).catch(() => null);
      if (!targetUser) return message.reply('❌ User not found.');

      const res = await addXP(userId, amount, 'manual_admin');
      await checkLevelMilestone(res.oldLevel, res.newLevel, targetUser, message.guild);

      await logAction('xpAdd', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        target: { id: targetUser.id, tag: targetUser.tag },
        amount: res.xpGained,
        oldLevel: res.oldLevel,
        newLevel: res.newLevel
      });

      return message.reply(`✅ <@${userId}> +${res.xpGained} XP (уровень ${res.oldLevel} → ${res.newLevel})`);
    }
  },

  xpset: {
    name: 'xpset',
    description: 'Установить точный XP пользователю: !xpset @user amount',
    adminOnly: true,
    async execute(message, args, client) {
      if (args.length < 2) return message.reply('❌ Usage: `!xpset <@user> <amount>`');

      const userId = args[0].replace(/[<@!>]/g, '');
      const amount = parseInt(args[1], 10);
      if (!Number.isFinite(amount) || amount < 0) return message.reply('❌ Укажи корректное число XP');

      const u = await getUser(userId);
      const oldLevel = calculateLevel(u.xp || 0);
      u.xp = amount;
      await setUser(userId, u);
      const newLevel = calculateLevel(u.xp || 0);

      const targetUser = await client.users.fetch(userId).catch(() => ({ id: userId, tag: 'unknown' }));
      await checkLevelMilestone(oldLevel, newLevel, targetUser, message.guild);

      await logAction('xpSet', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        target: { id: userId },
        value: amount,
        oldLevel,
        newLevel
      });

      return message.reply(`🛠️ XP для <@${userId}> установлен на ${amount} (уровень ${oldLevel} → ${newLevel})`);
    }
  },

  xpinvite: {
    name: 'xpinvite',
    description: 'Добавить +100 XP (с премиум множителем) и +1 invite пользователю: !xpinvite @user',
    adminOnly: true,
    async execute(message, args) {
      if (!args[0]) return message.reply('❌ Usage: `!xpinvite <@user>`');
      const userId = args[0].replace(/[<@!>]/g, '');

      const res = await addXP(userId, 100, 'invite');
      const u = await getUser(userId);
      u.invites = (u.invites || 0) + 1;
      await setUser(userId, u);

      await logAction('xpInvite', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        target: { id: userId },
        gainedXp: res.xpGained
      });

      return message.reply(`✅ <@${userId}> за инвайт получил +${res.xpGained} XP и +1 invite.`);
    }
  },

  gpset: {
    name: 'gpset',
    description: 'Установить очки розыгрыша пользователю: !gpset @user points',
    adminOnly: true,
    async execute(message, args) {
      if (args.length < 2) return message.reply('❌ Usage: `!gpset <@user> <points>`');
      const userId = args[0].replace(/[<@!>]/g, '');
      const points = parseInt(args[1], 10);
      if (!Number.isFinite(points) || points < 0) return message.reply('❌ Некорректное число');

      const u = await getUser(userId);
      u.rafflePoints = points;
      await setUser(userId, u);

      await logAction('raffleSet', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        target: { id: userId },
        points
      });

      return message.reply(`🎟️ У <@${userId}> теперь ${points} очков розыгрыша.`);
    }
  },

  ddset: {
    name: 'ddset',
    description: 'Задать пользователю количество DD-жетонов: !ddset @user amount',
    adminOnly: true,
    async execute(message, args) {
      if (args.length < 2) return message.reply('❌ Usage: `!ddset <@user> <amount>`');
      const userId = args[0].replace(/[<@!>]/g, '');
      const amount = parseInt(args[1], 10);
      if (!Number.isFinite(amount) || amount < 0) return message.reply('❌ Некорректное число');

      const u = await getUser(userId);
      u.doubleTokens = amount;
      await setUser(userId, u);

      await logAction('doubleStakeTokensSet', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        target: { id: userId },
        amount
      });

      return message.reply(`🎯 У <@${userId}> установлено DD-жетонов: ${amount}.`);
    }
  },

  ddstart: {
    name: 'ddstart',
    description: 'Открыть окно Double-Down для всех',
    adminOnly: true,
    async execute(message) {
      await patchSettings(message.guild.id, { ddEnabled: true });
      await logAction('doubleStakeWindow', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        enabled: true
      });
      return message.reply('✅ Окно Double-Down открыто');
    }
  },

  ddstop: {
    name: 'ddstop',
    description: 'Закрыть окно Double-Down для всех',
    adminOnly: true,
    async execute(message) {
      await patchSettings(message.guild.id, { ddEnabled: false });
      await logAction('doubleStakeWindow', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        enabled: false
      });
      return message.reply('🛑 Окно Double-Down закрыто');
    }
  },

  setlog: {
    name: 'setlog',
    description: 'Установить канал логов: !setlog #channel',
    adminOnly: true,
    async execute(message) {
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply('❌ Укажи канал: `!setlog #канал`');
      await patchSettings(message.guild.id, { logChannelId: ch.id });
      return message.reply(`✅ Лог-канал установлен: <#${ch.id}>`);
    }
  },

  premiumon: {
    name: 'premiumon',
    description: 'Включить премиум пользователю: !premiumon @user',
    adminOnly: true,
    async execute(message, args) {
      if (!args[0]) return message.reply('❌ Usage: `!premiumon <@user>`');
      const userId = args[0].replace(/[<@!>]/g, '');
      const u = await getUser(userId);
      u.premium = true;
      u.premium_since = new Date().toISOString();
      await setUser(userId, u);

      await logAction('premiumChange', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        target: { id: userId },
        premium: true
      });

      return message.reply(`⭐ Премиум включён для <@${userId}>`);
    }
  },

  premiumoff: {
    name: 'premiumoff',
    description: 'Выключить премиум пользователю: !premiumoff @user',
    adminOnly: true,
    async execute(message, args) {
      if (!args[0]) return message.reply('❌ Usage: `!premiumoff <@user>`');
      const userId = args[0].replace(/[<@!>]/g, '');
      const u = await getUser(userId);
      u.premium = false;
      await setUser(userId, u);

      await logAction('premiumChange', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        target: { id: userId },
        premium: false
      });

      return message.reply(`🆓 Премиум выключен для <@${userId}>`);
    }
  },

  setcode: {
    name: 'setcode',
    description: 'Создать промокод: !setcode CODE TTL_MIN XP [MAX_USES]',
    adminOnly: true,
    async execute(message, args) {
      if (args.length < 3) return message.reply('❌ Usage: `!setcode CODE TTL_MIN XP [MAX_USES]`');

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

      await logAction('promoCreate', message.guild, {
        admin: { id: message.author.id, tag: message.author.tag },
        code, ttlMin, xp, maxUses
      });

      return message.reply(`✅ Промокод **${code}**: +${xp} XP, TTL ${ttlMin} мин, лимит ${maxUses || '∞'}`);
    }
  },

  bpstat: {
    name: 'bpstat',
    description: 'Показать статистику БП для @user (или себя, если не указан)',
    adminOnly: true,
    async execute(message, args) {
      const userId = args[0]?.replace(/[<@!>]/g, '') || message.author.id;
      const u = await getUser(userId);
      const lvl = calculateLevel(u.xp || 0);
      const prog = calculateXPProgress(u.xp || 0); // {currentXP, neededXP, progress:"x/y"}

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
  }
};

module.exports = adminCommands;
