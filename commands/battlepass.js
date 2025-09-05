// commands/battlepass.js
// Показывает Боевой Пропуск:
// - Авто-страница по текущему уровню пользователя (ceil(level/10))
// - Кнопки 1–10, 11–20, … 91–100 (2 ряда × 5)
// - Анти-кэш картинок (добавляет ?t=<timestamp>)

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { battlePass } = require('../config'); // ожидается battlePass.imageUrls[0..9]
const { getUser, calculateLevel, calculateXPProgress } = require('../database/userManager');

// --- Вспомогательные функции внутри файла (никаких внешних utils) ---

function pageLabel(p) {
  const start = (p - 1) * 10 + 1;
  const end = p * 10;
  return `${start}–${end}`;
}

function clampPage(p) {
  const n = Number.isFinite(p) ? p : 1;
  return Math.max(1, Math.min(10, n));
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
  // 2 ряда × 5 кнопок
  const row1 = new ActionRowBuilder().addComponents(btns.slice(0, 5));
  const row2 = new ActionRowBuilder().addComponents(btns.slice(5, 10));
  return [row1, row2];
}

function imageUrlForPage(page) {
  const idx = clampPage(page) - 1;
  const baseUrl = (battlePass && Array.isArray(battlePass.imageUrls) && battlePass.imageUrls[idx])
    ? battlePass.imageUrls[idx]
    : (battlePass.imageUrls && battlePass.imageUrls[0]) || '';
  // Анти-кэш: принудительная подгрузка новой версии
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${baseUrl ? sep : ''}t=${Date.now()}`;
}

function makeEmbed({ user, page, level, xp }) {
  const { progress } = calculateXPProgress(xp || 0); // "xx%"
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

// --- Команда и обработчик кнопок ---

const bp = {
  name: 'bp',
  description: 'Открыть боевой пропуск (по умолчанию — страница с твоим текущим уровнем)',
  /**
   * Сообщение-команда: !bp [номер_страницы]
   */
  async execute(message, args /*, client */) {
    const userId = message.author.id;
    const u = await getUser(userId);
    const level = calculateLevel(u.xp || 0);

    // По умолчанию — страница = ceil(level/10), но в пределах 1..10
    const defaultPage = clampPage(Math.ceil(Math.max(1, level) / 10));
    const argPage = Number.parseInt(args?.[0], 10);
    const page = clampPage(Number.isFinite(argPage) ? argPage : defaultPage);

    const embed = makeEmbed({ user: message.author, page, level, xp: u.xp || 0 });
    const components = makePageButtons(page);

    return message.reply({ embeds: [embed], components });
  },

  /**
   * Обработчик button-интеракций (кнопки страниц bp_page_X)
   * Важно: см. ниже как подключить в index.js
   */
  async onButton(interaction /*, client */) {
    if (!interaction.isButton()) return;
    const m = interaction.customId.match(/^bp_page_(\d{1,2})$/);
    if (!m) return;

    const page = clampPage(parseInt(m[1], 10));
    const userId = interaction.user.id;
    const u = await getUser(userId);
    const level = calculateLevel(u.xp || 0);

    const embed = makeEmbed({ user: interaction.user, page, level, xp: u.xp || 0 });
    const components = makePageButtons(page);

    // Обновляем исходное сообщение с картинкой/кнопками
    return interaction.update({ embeds: [embed], components });
  }
};

module.exports = { bp, onButton: bp.onButton };
