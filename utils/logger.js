async function logAction(action, guild, payload = {}) {
  try {
    if (!guild) return;
    const { getSettings } = require('../database/settingsManager');
    const { EmbedBuilder } = require('discord.js');

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
    console.error('logAction error:', e);
  }
}
module.exports = { logAction };
