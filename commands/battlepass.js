// commands/battlepass.js
// Рендер Боевого пропуска + кнопки 1–10/…/91–100
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { calculateXPProgress } = require('../database/userManager');

function clampPage(p) { return Math.max(1, Math.min(10, Number.isFinite(p) ? p : 1)); }
function pageLabel(p) { const s=(p-1)*10+1, e=p*10; return `${s}–${e}`; }
function rangeKeyForPage(p){ return pageLabel(p).replace('–','-'); }

// Получить ссылку на изображение для текущей страницы. Возвращает null, если ссылка не найдена.
function imageUrlForPage(page) {
  const bp = config.battlePass || {};
  const src = bp.imageUrls || {};
  let baseUrl = '';

  if (Array.isArray(src)) {
    baseUrl = src[clampPage(page) - 1] || src[0] || '';
  } else if (src && typeof src === 'object') {
    baseUrl = src[rangeKeyForPage(page)] || src['1-10'] || '';
  }

  // Также поддерживаем переменные окружения: BP_IMAGE_BASE и BP_IMAGE_EXT
  if (!baseUrl) {
    const base = process.env.BP_IMAGE_BASE;
    const ext = process.env.BP_IMAGE_EXT || '.png';
    if (base && /^https?:\/\/\S+$/i.test(base)) {
      baseUrl = `${base}bp_${clampPage(page)}${ext}`;
    }
  }

  // Если ссылка пустая или невалидная, возвращаем null
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
  const img = imageUrlForPage(page);
  if (img) embed.setImage(img);
  return embed;
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
  // Attempt to generate dynamic page image via Python script
  let files;
  try {
    // Pass the user's total XP so the generator can compute progress within the current level
    const imgAtt = await module.exports.generateImageAttachment(
      { premium: u.premium, id: interaction.user.id },
      page,
      level,
      u.xp || 0
    );
    if (imgAtt) {
      // Attach image and point embed to it
      embed.setImage(`attachment://${imgAtt.name}`);
      files = [imgAtt];
    }
  } catch (e) {
    // ignore image errors
  }
  return interaction.update({ embeds: [embed], components, files });
}

module.exports = { onButton, makeEmbed, makePageButtons };

// Функция для вычисления страницы по уровню (1-10). Уровень 1..100.
module.exports.defaultLevelToPage = function(level) {
  const lvl = Number(level) || 1;
  const p = Math.ceil(Math.max(1, lvl) / 10);
  return Math.min(10, Math.max(1, p));
};

/**
 * Generate a dynamic battle‑pass page image as an attachment. This helper
 * spawns a Python script to render the grid with the user's progress. If
 * the script is unavailable or fails, null is returned and the caller
 * should fall back to using a static image (via imageUrlForPage).
 *
 * @param {Object} user An object containing at least the premium flag and id
 * @param {number} page The page number (1–10)
 * @param {number} level The user level (1–100)
 * @param {number} xp    The user's total experience points; used to compute
 *                       progress within the current level
 * @returns {Promise<null|{attachment: Buffer, name: string}>}
 */
module.exports.generateImageAttachment = async function(user, page, level, xp) {
  const { execFile } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { calculateXPProgress, calculateLevel } = require('../database/userManager');
  const bp = config.battlePass || {};

  // Determine the local image path for this page
  const rangeKey = rangeKeyForPage(page);
  let imagePath;
  if (bp.imagePaths && typeof bp.imagePaths === 'object') {
    imagePath = bp.imagePaths[rangeKey] || bp.imagePaths['1-10'];
  }
  // If no local path, do not attempt overlay (fallback to imageUrl)
  if (!imagePath) return null;
  // Resolve to absolute path relative to the DiscordBotLSBP project directory
  // __dirname is ".../commands"; we want to resolve from the parent (project/DiscordBotLSBP)
  imagePath = path.resolve(path.join(__dirname, '..'), imagePath);
  if (!fs.existsSync(imagePath)) {
    return null;
  }

  // Compute progress across the page
  let progressFraction = 0;
  try {
    const lvl = calculateLevel(xp || 0);
    const prog = calculateXPProgress(xp || 0);
    const withinLevel = prog.neededXP > 0 ? prog.currentXP / prog.neededXP : 0;
    const pageStart = (page - 1) * 10 + 1;
    const pageEnd = page * 10;
    if (lvl < pageStart) {
      progressFraction = 0;
    } else if (lvl > pageEnd) {
      progressFraction = 1;
    } else {
      // lvl is within this page
      progressFraction = ((lvl - pageStart) + withinLevel) / 10;
    }
    progressFraction = Math.max(0, Math.min(1, progressFraction));
  } catch (err) {
    progressFraction = 0;
  }

  // Path to overlay script
  const scriptPath = path.join(__dirname, '..', 'scripts', 'overlay_bp_progress.py');
  try {
    if (!fs.existsSync(scriptPath)) return null;
    // Temporary output file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpimg-'));
    const outPath = path.join(tmpDir, `page_${page}.png`);
    const args = [imagePath, progressFraction.toString(), outPath];
    // Execute python script
    await new Promise((resolve, reject) => {
      execFile('python', [scriptPath, ...args], { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve();
        }
      });
    });
    // Read file into buffer
    const buf = await fs.promises.readFile(outPath);
    const name = `bp_${user.id || 'page'}_${page}.png`;
    return { attachment: buf, name };
  } catch (err) {
    console.warn('BP progress overlay failed:', err.message || err);
    return null;
  }
};
