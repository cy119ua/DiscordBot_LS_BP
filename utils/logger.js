// utils/logger.js
async function logAction(action, guild, payload = {}) {
  try {
    const { getSettings } = require('../database/settingsManager');
    const { EmbedBuilder } = require('discord.js');

    if (!guild) return;
    const s = await getSettings(guild.id);
    if (!s.logChannelId) return;

    const ch = await guild.channels.fetch(s.logChannelId).catch(() => null);
    if (!ch) return;

    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle(`Лог: ${action}`)
      .setDescription('```json\n' + JSON.stringify(payload, null, 2) + '\n```')
      .setTimestamp();

    await ch.send({ embeds: [embed] });
  } catch (e) {
    // молча — чтобы логирование не падало логику бота
    console.error('logAction error:', e);
  }
}

module.exports = { logAction };
