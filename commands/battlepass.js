// commands/battlepass.js
// Показывает Боевой Пропуск с перелистыванием страниц:
// - Авто-страница по текущему уровню пользователя (ceil(level/10))
// - Кнопки 1–10, 11–20, … 91–100 (2 ряда × 5)
// - Анти-кэш картинок (?t=<timestamp>)
// - Поддержка imageUrls как массива [10] или как объекта с ключами '1-10', '11-20', ...

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getUser, calculateLevel, calculateXPProgress } = require('../database/userManager');

// Вспомогательные
function clampPage(p) {
  const n = Number.isFinite(p) ? p : 1;
  return Math.max(1, Math.min(10, n));
}
function pageLabel(p) {
  const start = (p - 1) * 10 + 1;
  const end = p * 10;
  return `${start}–${end}`;
}
function rangeKeyForPage(p) {
  return pageLabel(p).replace('–', '-'); // '1-10', '11-20', ...
}

function imageUrlForPage(page) {
  const bp = config.battlePass || {};
  const src = bp.imageUrls || {};
  let baseUrl = '';

  if (Array.isArray(src)) {
    const idx = clampPage(page) - 1;
    baseUrl = src[idx] || src[0] || '';
  } else if (typeof src === 'object' && src !== null) {
    const key = rangeKeyForPage(page);
    baseUrl = src[key] || src['1-10'] || '';
  }

  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${baseUrl ? sep : ''}t=${Date.now()}`;
}

function makePageButtons(currentPage) {
  const btns = [];
  for (let p = 1; p <= 10; p++) {
    btns.push(
      new ButtonBuilder()
        .setCustomId(`bp_page_${p}`)
        .setLabel(pageLabel(p))
        .setStyle(p === currentPage ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(p === currentPage)
    );
  }
  const row1 = new ActionRowBuilder().addComponents(btns.slice(0, 5));
  const row2 = new ActionRowBuilder().addComponents(btns.slice(5, 10));
  return [row1, row2];
}

function makeEmbed({ user, page, level, xp }) {
  const { progress } = calculateXPProgress(xp || 0); // "current/needed"
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Боевой пропуск')
    .setDescription(
      `Пользователь: <@${user.id}>\n` +
      `Уровень: **${level}**\n` +
      `Опыт: **${xp}** (${progress})\n` +
      `Страница: **${pageLabel(page)}**`
    )
    .setImage(imageUrlForPage(page))
    .setFooter({ text: `Страница ${page}/10` })
    .setTimestamp();
}

const bp = {
  name: 'bp',
  description: 'Открыть боевой пропуск (по умолчанию — страница по твоему уровню)',
  async execute(message, args) {
    const userId = message.author.id;
    const u = await getUser(userId);
    const level = calculateLevel(u.xp || 0);

    const defaultPage = clampPage(Math.ceil(Math.max(1, level) / 10));
    const argPage = Number.parseInt(args?.[0], 10);
    const page = clampPage(Number.isFinite(argPage) ? argPage : defaultPage);

    const embed = makeEmbed({ user: message.author, page, level, xp: u.xp || 0 });
    const components = makePageButtons(page);

    return message.reply({ embeds: [embed], components });
  },

  async onButton(interaction) {
    if (!interaction.isButton()) return;
    const m = interaction.customId.match(/^bp_page_(\d{1,2})$/);
    if (!m) return;

    const page = clampPage(parseInt(m[1], 10));
    const userId = interaction.user.id;
    const u = await getUser(userId);
    const level = calculateLevel(u.xp || 0);

    const embed = makeEmbed({ user: interaction.user, page, level, xp: u.xp || 0 });
    const components = makePageButtons(page);

    return interaction.update({ embeds: [embed], components });
  }
};

module.exports = { bp, onButton: bp.onButton };
