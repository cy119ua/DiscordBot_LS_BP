// commands/battlepass.js
// Рендер Боевого пропуска + кнопки 1–10/…/91–100 (две полосы на 1 картинке: 1–5 и 6–10)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { calculateXPProgress, calculateLevel, getUser } = require('../database/userManager');

function clampPage(p) { return Math.max(1, Math.min(10, Number.isFinite(p) ? p : 1)); }
function pageLabel(p) { const s=(p-1)*10+1, e=p*10; return `${s}–${e}`; }
function rangeKeyForPage(p){ return pageLabel(p).replace('–','-'); }

// Получить ссылку на изображение для текущей страницы (fallback, если нет локального пути)
function imageUrlForPage(page) {
  const bp = config.battlePass || {};
  const src = bp.imageUrls || {};
  let baseUrl = '';

  if (Array.isArray(src)) {
    baseUrl = src[clampPage(page) - 1] || src[0] || '';
  } else if (src && typeof src === 'object') {
    baseUrl = src[rangeKeyForPage(page)] || src['1-10'] || '';
  }

  if (!baseUrl) {
    const base = process.env.BP_IMAGE_BASE;
    const ext = process.env.BP_IMAGE_EXT || '.png';
    if (base && /^https?:\/\/\S+$/i.test(base)) baseUrl = `${base}bp_${clampPage(page)}${ext}`;
  }

  if (!baseUrl || !/^https?:\/\/\S+$/i.test(baseUrl)) return null;
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
  const prog = calculateXPProgress(xp || 0);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Боевой пропуск')
    .setDescription(
      `Пользователь: <@${user.id}>\n` +
      `Уровень: **${level}**\n` +
      `Опыт: **${xp}** (${prog.progress})\n` +
      `Страница: **${pageLabel(page)}**`
    )
    .setFooter({ text: `Страница ${page}/10` })
    .setTimestamp();

  // Показываем либо статичный URL, либо позже заменим на attachment с оверлеем
  const img = imageUrlForPage(page);
  if (img) embed.setImage(img);

  return embed;
}

async function onButton(interaction) {
  if (!interaction.isButton()) return;
  const m = interaction.customId.match(/^bp_page_(\d{1,2})$/);
  if (!m) return;
  const page = clampPage(parseInt(m[1],10));

  const u = await getUser(interaction.user.id);
  const level = calculateLevel(u.xp || 0);

  const embed = makeEmbed({ user: interaction.user, page, level, xp: u.xp || 0 });
  const components = makePageButtons(page);

  let files;
  try {
    // Делаем оверлей двух полос прогресса на ЛОКАЛЬНУЮ картинку страницы
    const imgAtt = await module.exports.generateImageAttachment(
      { id: interaction.user.id, premium: u.premium },
      page,
      level,
      u.xp || 0
    );
    if (imgAtt) {
      // Заменяем картинку в embed на attachment
      embed.setImage(`attachment://${imgAtt.name}`);
      files = [imgAtt];
    }
  } catch {}

  return interaction.update({ embeds: [embed], components, files });
}

module.exports = { onButton, makeEmbed, makePageButtons };

// Страница по уровню (1..100)
module.exports.defaultLevelToPage = function(level) {
  const lvl = Number(level) || 1;
  const p = Math.ceil(Math.max(1, lvl) / 10);
  return Math.min(10, Math.max(1, p));
};

/**
 * Генерация attachment с ОДНОЙ картинкой, где поверх нарисованы ДВЕ полосы прогресса:
 * верхняя — уровни 1–5 этой страницы, нижняя — 6–10.
 * Если локального изображения нет или скрипт не найден — вернётся null (embed покажет статичный URL).
 *
 * @param {Object} user {id, premium}
 * @param {number} page 1..10
 * @param {number} level 1..100
 * @param {number} totalXP суммарный XP
 * @returns {Promise<null|{attachment: Buffer, name: string}>}
 */
module.exports.generateImageAttachment = async function(user, page, level, totalXP) {
  const { execFile } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const bp = config.battlePass || {};
  const rangeKey = rangeKeyForPage(page);

  // 1) Находим локальную картинку страницы
  let imagePath = bp.imagePaths?.[rangeKey] || bp.imagePaths?.['1-10'];
  if (!imagePath) return null;
  imagePath = path.resolve(path.join(__dirname, '..'), imagePath);
  if (!fs.existsSync(imagePath)) return null;

  // 2) Считаем долю внутри уровня (для текущего уровня)
  const prog = calculateXPProgress(totalXP || 0);
  const levelFrac = (prog.neededXP > 0) ? (prog.currentXP / prog.neededXP) : 0;

  // 3) Геометрия полос из конфигурации (в процентах от картинки)
  const bars = bp.progressBars || {
    xPct: 17, widthPct: 78,
    top: { yPct: 11, heightPct: 3.2 },
    bottom: { yPct: 92, heightPct: 3.2 }
  };

  // 4) Путь к скрипту-оверлею
  const scriptPath = path.join(__dirname, '..', 'scripts', 'overlay_bp_progress.py');
  if (!fs.existsSync(scriptPath)) return null;

  // 5) Запускаем скрипт
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-'));
  const outPath = path.join(tmpDir, `bp_${rangeKey}_${user.id || 'u'}.png`);

  const pageStart = (page - 1) * 10 + 1;

  const args = [
    imagePath,
    outPath,
    String(pageStart),             // от какого уровня начинается страница
    String(level),                 // текущий уровень пользователя
    String(levelFrac),             // доля внутри текущего уровня (0..1)
    String(bars.xPct),
    String(bars.widthPct),
    String(bars.top?.yPct ?? 11),
    String(bars.top?.heightPct ?? 3),
    String(bars.bottom?.yPct ?? 92),
    String(bars.bottom?.heightPct ?? 3)
  ];

  await new Promise((resolve, reject) => {
    execFile('python', [scriptPath, ...args], { timeout: 15000 }, (err, _so, se) => {
      if (err) reject(new Error(se || err.message));
      else resolve();
    });
  });

  // 6) Возвращаем готовое изображение
  const buf = await fs.promises.readFile(outPath);
  const name = `bp_${rangeKey}.png`;
  return { attachment: buf, name };
};
