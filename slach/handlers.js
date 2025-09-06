const { EmbedBuilder } = require('discord.js');
const { getUser, setUser, addXP, calculateLevel, calculateXPProgress } = require('../database/userManager');
const { getPromoCode, hasUserUsedPromo, isCodeExpired, markPromoCodeUsed } = require('../database/promoManager');
const { getSettings, patchSettings } = require('../database/settingsManager');
const { logAction } = require('../utils/logger');
const battlepass = require('../commands/battlepass');

async function replyPriv(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ ...payload, ephemeral: true });
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

const handlers = {
  // ---------- USER ----------
  profile: {
    async run(interaction) {
      const user = interaction.user;
      const u = await getUser(user.id);
      const level = calculateLevel(u.xp || 0);
      const progress = calculateXPProgress(u.xp || 0);

      const embed = new EmbedBuilder()
        .setColor(u.premium ? 0xffd700 : 0x0099ff)
        .setTitle(`${user.username} — профиль`)
        .setThumbnail(user.displayAvatarURL())
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

      return replyPriv(interaction, { embeds: [embed] });
    }
  },

  code: {
    async run(interaction) {
      const code = interaction.options.getString('value', true).toUpperCase();
      const promo = await getPromoCode(code);
      if (!promo) return replyPriv(interaction, { content: '❌ Неверный код' });

      const userId = interaction.user.id;
      if (await hasUserUsedPromo(code, userId)) return replyPriv(interaction, { content: '❌ Вы уже использовали этот код' });
      if (isCodeExpired(promo)) return replyPriv(interaction, { content: '❌ Промокод недействителен' });

      const before = await getUser(userId);
      const oldLevel = calculateLevel(before.xp || 0);

      let gained = 0;
      if (promo.rewards && Number.isFinite(promo.rewards.xp)) {
        const res = await addXP(userId, promo.rewards.xp, 'promo');
        gained = res.xpGained || 0;
      }
      await markPromoCodeUsed(code, userId);

      const after = await getUser(userId);
      const newLevel = calculateLevel(after.xp || 0);

      await logAction('promo', interaction.guild, {
        user: { id: userId, tag: interaction.user.tag }, code, gainedXp: gained, oldLevel, newLevel
      });

      return replyPriv(interaction, { content: `✅ Код принят: +${gained} XP` });
    }
  },

  usedd: {
    async run(interaction) {
      const amount = interaction.options.getInteger('amount', true);
      if (![1, 2].includes(amount)) return replyPriv(interaction, { content: '❌ amount должен быть 1 или 2' });

      const s = await getSettings(interaction.guild.id);
      if (!s.ddEnabled) return replyPriv(interaction, { content: '❌ Double-Down сейчас недоступен' });

      const userId = interaction.user.id;
      const u = await getUser(userId);
      const before = Number(u.doubleTokens || 0);
      if (before < amount) return replyPriv(interaction, { content: `❌ Недостаточно жетонов (есть: ${before}, нужно: ${amount}).` });

      const after = before - amount;
      u.doubleTokens = after;
      await setUser(userId, u);

      const multiplier = amount === 2 ? 3 : 2;
      await logAction('doubleStake', interaction.guild, {
        user: { id: userId, tag: interaction.user.tag },
        amount, multiplier, beforeTokens: before, afterTokens: after
      });

      return replyPriv(interaction, { content: `✅ Активировано: **x${multiplier}**. Списано ${amount}. Осталось: ${after}.` });
    }
  },

  bp: {
    async run(interaction) {
      const pageOpt = interaction.options.getInteger('page', false);
      const { getUser, calculateLevel } = require('../database/userManager');

      const u = await getUser(interaction.user.id);
      const level = calculateLevel(u.xp || 0);
      const defaultPage = Math.max(1, Math.min(10, Math.ceil(Math.max(1, level) / 10)));
      const page = Number.isInteger(pageOpt) ? Math.max(1, Math.min(10, pageOpt)) : defaultPage;

      const embed = battlepass.makeEmbed({ user: interaction.user, page, level, xp: u.xp || 0 });
      const components = battlepass.makePageButtons(page);

      return replyPriv(interaction, { embeds: [embed], components });
    }
  },

  // ---------- ADMIN ----------
  xp: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const res = await addXP(user.id, amount, 'manual_admin');
      await logAction('xpAdd', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        amount: res.xpGained, oldLevel: res.oldLevel, newLevel: res.newLevel
      });
      return replyPriv(interaction, { content: `✅ <@${user.id}> +${res.xpGained} XP (уровень ${res.oldLevel} → ${res.newLevel})` });
    }
  },

  xpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      const oldLevel = calculateLevel(u.xp || 0);
      u.xp = amount;
      await setUser(user.id, u);
      const newLevel = calculateLevel(u.xp || 0);
      await logAction('xpSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        value: amount, oldLevel, newLevel
      });
      return replyPriv(interaction, { content: `🛠️ XP для <@${user.id}> установлен на ${amount} (уровень ${oldLevel} → ${newLevel})` });
    }
  },

  xpinvite: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const res = await addXP(user.id, 100, 'invite');
      const u = await getUser(user.id);
      u.invites = (u.invites || 0) + 1;
      await setUser(user.id, u);
      await logAction('xpInvite', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag }, gainedXp: res.xpGained
      });
      return replyPriv(interaction, { content: `✅ <@${user.id}>: +${res.xpGained} XP и +1 invite.` });
    }
  },

  gpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const points = interaction.options.getInteger('points', true);
      const u = await getUser(user.id);
      u.rafflePoints = points;
      await setUser(user.id, u);
      await logAction('raffleSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, points
      });
      return replyPriv(interaction, { content: `🎟️ У <@${user.id}> теперь ${points} очков розыгрыша.` });
    }
  },

  ddset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.doubleTokens = amount;
      await setUser(user.id, u);
      await logAction('doubleStakeTokensSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, amount
      });
      return replyPriv(interaction, { content: `🎯 У <@${user.id}> установлено DD-жетонов: ${amount}.` });
    }
  },

  ddstart: {
    adminOnly: true,
    async run(interaction) {
      await patchSettings(interaction.guild.id, { ddEnabled: true });
      await logAction('doubleStakeWindow', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: true
      });
      return replyPriv(interaction, { content: '✅ Окно Double-Down открыто.' });
    }
  },

  ddstop: {
    adminOnly: true,
    async run(interaction) {
      await patchSettings(interaction.guild.id, { ddEnabled: false });
      await logAction('doubleStakeWindow', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: false
      });
      return replyPriv(interaction, { content: '🛑 Окно Double-Down закрыто.' });
    }
  },

  setlog: {
    adminOnly: true,
    async run(interaction) {
      const ch = interaction.options.getChannel('channel', true);
      await patchSettings(interaction.guild.id, { logChannelId: ch.id });
      return replyPriv(interaction, { content: `✅ Лог-канал: <#${ch.id}>` });
    }
  },

  premiumon: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const u = await getUser(user.id);
      u.premium = true;
      u.premium_since = new Date().toISOString();
      await setUser(user.id, u);
      await logAction('premiumChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, premium: true
      });
      return replyPriv(interaction, { content: `⭐ Премиум включён для <@${user.id}>` });
    }
  },

  premiumoff: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const u = await getUser(user.id);
      u.premium = false;
      await setUser(user.id, u);
      await logAction('premiumChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, premium: false
      });
      return replyPriv(interaction, { content: `🆓 Премиум выключен для <@${user.id}>` });
    }
  }
};

// Экспорт с флагом adminOnly там, где нужно
module.exports = {
  profile: { run: handlers.profile.run },
  code: { run: handlers.code.run },
  usedd: { run: handlers.usedd.run },
  bp: { run: handlers.bp.run },

  xp: { run: handlers.xp.run, adminOnly: true },
  xpset: { run: handlers.xpset.run, adminOnly: true },
  xpinvite: { run: handlers.xpinvite.run, adminOnly: true },
  gpset: { run: handlers.gpset.run, adminOnly: true },
  ddset: { run: handlers.ddset.run, adminOnly: true },
  ddstart: { run: handlers.ddstart.run, adminOnly: true },
  ddstop: { run: handlers.ddstop.run, adminOnly: true },
  setlog: { run: handlers.setlog.run, adminOnly: true },
  premiumon: { run: handlers.premiumon.run, adminOnly: true },
  premiumoff: { run: handlers.premiumoff.run, adminOnly: true }
};
