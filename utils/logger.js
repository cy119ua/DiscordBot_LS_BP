// sfth/utils/logger.js
const { EmbedBuilder, Colors } = require('discord.js');
const { getSettings } = require('../database/settingsManager');
const { getUser } = require('../database/userManager'); // для ⭐

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
    case 'invitesSet': return Colors.Orange;
    case 'cardPacksSet': return Colors.Orange;
    case 'bpReapply': return Colors.Green;
    case 'userReset': return Colors.Red;
    case 'dbReset': return Colors.Red;
    case 'teamMemberReward': return Colors.Green;
    default: return Colors.Greyple;
  }
}

async function formatUserMaybePremium(info) {
  if (!info) return null;
  const tag = typeof info === 'string' ? info : (info.tag || info.username || info.id || 'unknown');
  const id = typeof info === 'object' ? info.id : undefined;
  if (!id) return tag;
  try { const u = await getUser(id); return u?.premium ? `${tag} ⭐` : tag; }
  catch { return tag; }
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

    if (details.admin) { const s = await formatUserMaybePremium(details.admin); lines.push(`**Админ:** ${s}`); }
    if (details.user)  { const s = await formatUserMaybePremium(details.user);  lines.push(`**Пользователь:** ${s}`); }
    if (details.target){ const s = await formatUserMaybePremium(details.target);lines.push(`**Цель:** ${s}`); }

    if (typeof details.amount !== 'undefined') lines.push(`**Количество:** ${details.amount}`);
    if (typeof details.value  !== 'undefined') lines.push(`**Значение:** ${details.value}`);
    if (typeof details.points !== 'undefined') lines.push(`**Очки:** ${details.points}`);
    if (typeof details.limit  !== 'undefined') lines.push(`**Лимит:** ${details.limit}`);
    if (typeof details.minutes!== 'undefined') lines.push(`**Срок:** ${details.minutes} мин`);
    if (typeof details.code   !== 'undefined') lines.push(`**Код:** ${details.code}`);

    if (typeof details.beforeTokens !== 'undefined' || typeof details.afterTokens !== 'undefined') {
      lines.push(`**Токены:** ${details.beforeTokens} → ${details.afterTokens}`);
    }

    if (typeof details.oldLevel !== 'undefined' || typeof details.newLevel !== 'undefined') {
      lines.push(`**Уровень:** ${details.oldLevel ?? '?'} → ${details.newLevel ?? '?'}`);
    }
    if (typeof details.level !== 'undefined') lines.push(`**Уровень:** ${details.level}`);

    // XP c пояснением «без премиума»
    if (typeof details.gainedXp !== 'undefined') {
      if (typeof details.xpBase !== 'undefined' && Number(details.xpBase) >= 0 && Number(details.gainedXp) !== Number(details.xpBase)) {
        lines.push(`**Получено XP:** ${details.gainedXp} (${details.xpBase} без премиума)`);
      } else {
        lines.push(`**Получено XP:** ${details.gainedXp}`);
      }
    }

    if (details.rewardType) lines.push(`**Награда:** ${details.rewardType}`);
    if (typeof details.xpChange !== 'undefined') lines.push(`**Прогресс XP:** ${details.xpChange}`);
    if (typeof details.enabled  !== 'undefined') lines.push(`**DD:** ${details.enabled ? 'включено' : 'выключено'}`);
    if (typeof details.premium  !== 'undefined') lines.push(`**Премиум:** ${details.premium ? 'включён' : 'выключен'}`);
    if (typeof details.totalXp  !== 'undefined') lines.push(`**Начислено XP:** ${details.totalXp}`);
    if (typeof details.affected !== 'undefined') lines.push(`**Ставок обработано:** ${details.affected}`);
    if (typeof details.deltas   !== 'undefined') lines.push(`**Δ наград:** ${details.deltas}`);

    // Командные поля
    if (details.name) lines.push(`**Команда:** ${details.name}`);
    if (Array.isArray(details.membersList) && details.membersList.length) {
      lines.push(`**Состав:** ${details.membersList.join(', ')}`);
    }
    if (details.change) lines.push(`**Замена:** ${details.change}`);

    // Дополнительные поля для прогнозов
    if (details.match) {
      // Форматируем матч key в более читаемый вид: team1 vs team2
      const mk = String(details.match);
      if (mk.includes('_')) {
        const parts = mk.split('_');
        lines.push(`**Матч:** ${parts[0]} vs ${parts[1]}`);
      } else {
        lines.push(`**Матч:** ${mk}`);
      }
    }
    if (typeof details.prediction === 'string') {
      lines.push(`**Прогноз:** ${details.prediction}`);
    }

    // Если это выплата за правильный прогноз, добавляем пояснение
    if (type === 'predictionPayout') {
      lines.push('**Получено за:** правильный прогноз');
    }

    // Расширенный блок для /teamresult
    if (Array.isArray(details.membersXPList) && details.membersXPList.length) {
      lines.push(`\n**Участники команды:**`);
      for (const m of details.membersXPList) {
        const shown = await formatUserMaybePremium({ id: m.id, tag: m.tag });
        if (typeof m.gainedXp === 'number') {
          if (typeof m.xpBase === 'number' && m.xpBase !== m.gainedXp) {
            lines.push(`• ${shown}: +${m.gainedXp} XP (${m.xpBase} без премиума)`);
          } else {
            lines.push(`• ${shown}: +${m.gainedXp} XP`);
          }
        } else {
          lines.push(`• ${shown}`);
        }
      }
    }

    if (typeof details.betsSummary === 'string' && details.betsSummary.length) {
      lines.push(`\n**Ставки на команду:**\n${details.betsSummary}`);
    }

    embed.setDescription(lines.join('\n'));
    // Отправляем пинг админа отдельно, если требуется. Пинг выполняется
    // через content-свойство сообщения, чтобы Discord корректно
    // оповестил администратора. Admin ID берётся из конфигурации.
    if (details.pingAdmin) {
      try {
        const config = require('../config');
        // По умолчанию берём второго элемента в списке adminUsers (фрокенг)
        const adminId = Array.isArray(config.adminUsers) && config.adminUsers[1];
        if (adminId) {
          await channel.send({ content: `<@${adminId}>`, embeds: [embed] });
          return;
        }
      } catch {}
    }
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('logAction error:', e);
  }
}

module.exports = { logAction };
