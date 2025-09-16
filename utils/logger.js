// utils/logger.js
const { EmbedBuilder, Colors } = require('discord.js');
const { getSettings } = require('../database/settingsManager');

function colorByType(type) {
  switch (type) {
    case 'xpAdd': return Colors.Green;
    case 'xpSet': return Colors.Blurple;
    case 'xpInvite': return Colors.Green;
    case 'raffleSet': return Colors.Orange;
    case 'doubleStake': return Colors.Gold;
    case 'doubleStakeTokensSet': return Colors.Orange;
    case 'doubleStakeWindow': return Colors.Yellow;
    case 'promo': return Colors.Blue;
    case 'premiumChange': return Colors.Purple;
    case 'teamCreate': return Colors.Green;
    case 'teamChange': return Colors.Blurple;
    case 'teamDelete': return Colors.Orange;
    case 'teamResult': return Colors.Red;
    case 'bpReward': return Colors.Orange;
    // новые:
    case 'invitesSet': return Colors.Orange;
    case 'cardPacksSet': return Colors.Orange;
    case 'bpReapply': return Colors.Green;
    case 'userReset': return Colors.Red;
    case 'dbReset': return Colors.Red;
    default: return Colors.Greyple;
  }
}

async function logAction(type, guild, details = {}) {
  try {
    if (!guild) return;
    const settings = await getSettings(guild.id);
    if (!settings.logChannelId) return;
    const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder().setTitle(`Лог: ${type}`).setColor(colorByType(type)).setTimestamp();
    const lines = [];
    if (details.admin) lines.push(`**Админ:** ${details.admin.tag || details.admin}`);
    if (details.user) lines.push(`**Пользователь:** ${details.user.tag || details.user}`);
    if (details.target) lines.push(`**Цель:** ${details.target.tag || details.target}`);

    if (typeof details.amount !== 'undefined') lines.push(`**Количество:** ${details.amount}`);
    if (typeof details.value !== 'undefined') lines.push(`**Значение:** ${details.value}`);
    if (typeof details.gainedXp !== 'undefined') lines.push(`**Получено XP:** ${details.gainedXp}`);
    if (typeof details.points !== 'undefined') lines.push(`**Очки:** ${details.points}`);
    if (typeof details.limit !== 'undefined') lines.push(`**Лимит:** ${details.limit}`);
    if (typeof details.minutes !== 'undefined') lines.push(`**Срок:** ${details.minutes} мин`);
    if (typeof details.code !== 'undefined') lines.push(`**Код:** ${details.code}`);
    if (typeof details.beforeTokens !== 'undefined' || typeof details.afterTokens !== 'undefined') {
      lines.push(`**Токены:** ${details.beforeTokens} → ${details.afterTokens}`);
    }
    if (typeof details.oldLevel !== 'undefined' || typeof details.newLevel !== 'undefined') {
      lines.push(`**Уровень:** ${details.oldLevel ?? '?'} → ${details.newLevel ?? '?'}`);
    }
    if (details.rewardType) lines.push(`**Награда:** ${details.rewardType}`);
    if (typeof details.level !== 'undefined') lines.push(`**Уровень:** ${details.level}`);
    if (typeof details.xpChange !== 'undefined') lines.push(`**Прогресс XP:** ${details.xpChange}`);
    if (typeof details.enabled !== 'undefined') lines.push(`**DD:** ${details.enabled ? 'включено' : 'выключено'}`);
    if (typeof details.premium !== 'undefined') lines.push(`**Премиум:** ${details.premium ? 'включён' : 'выключен'}`);
    if (typeof details.totalXp !== 'undefined') lines.push(`**Начислено XP:** ${details.totalXp}`);
    if (typeof details.affected !== 'undefined') lines.push(`**Ставок обработано:** ${details.affected}`);
    if (typeof details.deltas !== 'undefined') lines.push(`**Δ наград:** ${details.deltas}`);

    embed.setDescription(lines.join('\n'));
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('logAction error:', e);
  }
}

module.exports = { logAction };
