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

function makeEmbed({ user, page, level, xp, invites = 0, doubleTokens = 0, rafflePoints = 0, cardPacks = 0, isPremium = false }) {
  const prog = calculateXPProgress(xp || 0);
  // Формируем отображение имени пользователя.  Если у пользователя есть
  // премиум‑статус, добавляем звёздочку (*) сразу после упоминания.
  // При наличии премиум‑статуса выводим символ ⭐ после упоминания
  const mention = isPremium ? `<@${user.id}> ⭐` : `<@${user.id}>`;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Боевой пропуск')
    .setDescription(
      `Пользователь: ${mention}\n` +
      `Уровень: **${level}**\n` +
      `Опыт: **${xp}** (${prog.progress})\n` +
      `Приглашения: **${invites}**\n` +
      `Двойные ставки: **${doubleTokens}**\n` +
      `Паки карт: **${cardPacks}**\n` +
      `Очки розыгрыша: **${rafflePoints}**`
    )
    // Убираем отображение номера страницы в футере, чтобы не показывать номер
    // .setFooter({ text: `Страница ${page}/10` })
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

  const embed = makeEmbed({
    user: interaction.user,
    page,
    level,
    xp: u.xp || 0,
    invites: u.invites || 0,
    doubleTokens: u.doubleTokens || 0,
    rafflePoints: u.rafflePoints || 0,
    cardPacks: u.cardPacks || 0,
    isPremium: !!u.premium
  });
  // Добавляем кнопку 'топ-20' к компонентам
  const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('top_20_xp').setLabel('топ-20').setStyle(ButtonStyle.Primary)
  );
  const components = [topRow, ...makePageButtons(page)];

  let files;
  try {
    // Делаем оверлей двух полос прогресса на ЛОКАЛЬНУЮ картинку страницы
    // Передаём полный объект пользователя (u) в generateImageAttachment,
    // чтобы скрипт мог отобразить дополнительные данные (инвайты, жетоны и т.п.)
    const imgAtt = await module.exports.generateImageAttachment(
      u,
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

  // 2.1) Подготовка данных для информационных блоков (синий и красный).
  // Не все данные о пользователе могут быть в переданном объекте, поэтому
  // пытаемся загрузить полную запись пользователя из базы. Используем
  // calculateXPProgress выше, чтобы вычислить current/needed XP.
  let fullUser;
  try {
    // getUser доступен из userManager (импортирован в начале файла)
    fullUser = await getUser(user.id);
  } catch (e) {
     console.error('[BP overlay error]', e?.message || e);
    // fallback: используем переданный объект, если базы нет
    fullUser = user || {};
  }
  // Текущий прогресс по XP в рамках уровня
  const xpCurrent = prog.currentXP;
  const xpNeeded  = prog.neededXP;
  // Определяем статус премиума (1/0) и бонусные значения
  const premiumFlag = fullUser.premium ? 1 : 0;
  const invitesCount = Number(fullUser.invites || 0);
  const doubleTokens = Number(fullUser.doubleTokens || 0);
  const rafflePoints = Number(fullUser.rafflePoints || 0);
  const cardPacksCount = Number(fullUser.cardPacks || 0);

  // 3) Геометрия полос из конфигурации (в процентах от картинки)
  const bars = bp.progressBars || {
    // Запасной план на случай, если конфигурация не определена. Значения
    // подобраны под новую цветную разметку 1–10 (левая колонка FREE/PREM,
    // правая белая область для инфо‑блоков).
    xPct: 15,
    widthPct: 67.5,
    top: { yPct: 16, heightPct: 3.2 },
    bottom: { yPct: 61, heightPct: 3.2 }
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

  // 5.1) Добавляем дополнительные параметры для скрипта, если все данные присутствуют
  // Передаём текущий уровень, текущий XP, необходимый XP, флаг премиума,
  // количество инвайтов, жетонов двойной ставки и очков розыгрыша. Эти
  // значения позволяют нарисовать текст в синем и красном блоках справа.
  args.push(
    String(level),
    String(xpCurrent),
    String(xpNeeded),
    String(premiumFlag),
    String(invitesCount),
    String(doubleTokens),
    String(rafflePoints),
    String(cardPacksCount)
  );

  // 5.2) Подготавливаем окружение для скрипта. В дополнение к стандартным 
  // переменным окружения передаём цвета для каждой половинки полосы, если они определены
  const env = { ...process.env };
  try {
    const colors = bp.progressBarColors || {};
    function setColor(prefix, obj) {
      if (!obj) return;
      const { r, g, b, a } = obj;
      if (typeof r === 'number') env[`${prefix}_R`] = String(r);
      if (typeof g === 'number') env[`${prefix}_G`] = String(g);
      if (typeof b === 'number') env[`${prefix}_B`] = String(b);
      if (typeof a === 'number') env[`${prefix}_A`] = String(a);
    }
    setColor('BP_BAR_TOP_FREE', colors.top?.free);
    setColor('BP_BAR_TOP_PREM', colors.top?.premium);
    setColor('BP_BAR_BOT_FREE', colors.bottom?.free);
    setColor('BP_BAR_BOT_PREM', colors.bottom?.premium);
  } catch {}

  await new Promise((resolve, reject) => {
    execFile('python', [scriptPath, ...args], { timeout: 15000, env }, (err, _so, se) => {
      if (err) reject(new Error(se || err.message));
      else resolve();
    });
  });

  // 6) Возвращаем готовое изображение
  const buf = await fs.promises.readFile(outPath);
  const name = `bp_${rangeKey}.png`;
  return { attachment: buf, name };
};
