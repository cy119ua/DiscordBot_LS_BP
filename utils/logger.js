const { EmbedBuilder, Colors } = require('discord.js');
const { getSettings } = require('../database/settingsManager');

// Определяем цвет по типу события
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
    case 'raffleSet': return Colors.Orange;
    default: return Colors.Greyple;
  }
}

/**
 * Отправляет структурированный лог в указанный лог-канал гильдии.
 * @param {string} type Тип действия (используется для заголовка и цвета)
 * @param {import('discord.js').Guild} guild Объект гильдии
 * @param {object} details Детали события
 */
async function logAction(type, guild, details = {}) {
  try {
    if (!guild) return;
    const settings = await getSettings(guild.id);
    if (!settings.logChannelId) return;
    const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`Лог: ${type}`)
      .setColor(colorByType(type))
      .setTimestamp();

    // Формируем строки описания
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
    if (typeof details.multiplier !== 'undefined') lines.push(`**Множитель:** x${details.multiplier}`);
    if (typeof details.beforeTokens !== 'undefined' || typeof details.afterTokens !== 'undefined') {
      lines.push(`**Токены:** ${details.beforeTokens} → ${details.afterTokens}`);
    }
    if (typeof details.oldLevel !== 'undefined' || typeof details.newLevel !== 'undefined') {
      lines.push(`**Уровень:** ${details.oldLevel ?? '?'} → ${details.newLevel ?? '?'}`);
    }
    if (typeof details.enabled !== 'undefined') lines.push(`**DD:** ${details.enabled ? 'включено' : 'выключено'}`);
    if (typeof details.premium !== 'undefined') lines.push(`**Премиум:** ${details.premium ? 'включён' : 'выключен'}`);

    embed.setDescription(lines.join('\n'));
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('logAction error:', e);
  }
}

module.exports = { logAction };