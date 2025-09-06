// commands/battlepass.js
// Рендер Боевого пропуска + кнопки 1–10/…/91–100
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { calculateXPProgress } = require('../database/userManager');

function clampPage(p) { return Math.max(1, Math.min(10, Number.isFinite(p) ? p : 1)); }
function pageLabel(p) { const s=(p-1)*10+1, e=p*10; return `${s}–${e}`; }
function rangeKeyForPage(p){ return pageLabel(p).replace('–','-'); }

function imageUrlForPage(page) {
  const bp = config.battlePass || {};
  const src = bp.imageUrls || {};
  let baseUrl = '';
  if (Array.isArray(src)) {
    baseUrl = src[clampPage(page)-1] || src[0] || '';
  } else if (src && typeof src === 'object') {
    baseUrl = src[rangeKeyForPage(page)] || src['1-10'] || '';
  }
  if (!baseUrl) return '';
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}t=${Date.now()}`; // анти-кэш
}

function makePageButtons(currentPage) {
  const btns = [];
  for (let p=1; p<=10; p++) {
    btns.push(
      new ButtonBuilder()
        .setCustomId(`bp_page_${p}`)
        .setLabel(pageLabel(p))
        .setStyle(p===currentPage ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(p===currentPage)
    );
  }
  return [
    new ActionRowBuilder().addComponents(btns.slice(0,5)),
    new ActionRowBuilder().addComponents(btns.slice(5,10)),
  ];
}

function makeEmbed({ user, page, level, xp }) {
  const prog = calculateXPProgress(xp || 0); // "x/100"
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Боевой пропуск')
    .setDescription(
      `Пользователь: <@${user.id}>\n` +
      `Уровень: **${level}**\n` +
      `Опыт: **${xp}** (${prog.progress})\n` +
      `Страница: **${pageLabel(page)}**`
    )
    .setImage(imageUrlForPage(page))
    .setFooter({ text: `Страница ${page}/10` })
    .setTimestamp();
}

async function onButton(interaction /*, client */) {
  if (!interaction.isButton()) return;
  const m = interaction.customId.match(/^bp_page_(\d{1,2})$/);
  if (!m) return;
  const page = clampPage(parseInt(m[1],10));

  // берём текущие значения уровня/XP пользователя
  const { getUser, calculateLevel } = require('../database/userManager');
  const u = await getUser(interaction.user.id);
  const level = calculateLevel(u.xp || 0);

  const embed = makeEmbed({ user: interaction.user, page, level, xp: u.xp || 0 });
  const components = makePageButtons(page);
  return interaction.update({ embeds: [embed], components });
}

module.exports = { onButton, makeEmbed, makePageButtons };
