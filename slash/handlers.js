// sfth/slash/handlers.js
// ВАЖНО: никаких тяжёлых действий на верхнем уровне (во время require)!
// Всё, что может дернуть Discord API или БД — только внутри run().
const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const {
  getUser, setUser, addXP, calculateLevel, calculateXPProgress, reapplyRewardsForUser
} = require('../database/userManager');
const {
  getPromoCode, hasUserUsedPromo, isCodeExpired, markPromoCodeUsed, createPromoCode
} = require('../database/promoManager');
const { getSettings, patchSettings } = require('../database/settingsManager');
const { logAction } = require('../utils/logger');
const { checkLevelMilestone } = require('../utils/xpUtils');
// Менеджер резервных копий: отвечает за создание ежедневных бэкапов
// и восстановление последнего снимка.  См. utils/backupManager.js.
const { backupDb, restoreLatest } = require('../utils/backupManager');

// Менеджеры команд, ставок и истории
const { getTeam, getAllTeams, createTeam, updateTeam, deleteTeam } = require('../utils/teamManager');
const { addBet, getBetsForTeam, clearBetsForTeam, removeBetsForUserAndTeam } = require('../utils/betManager');
const {
  addBetHistory, addTeamCreate, addTeamResult, getBetHistoryForUser, getTeamHistory
} = require('../utils/historyManager');

// Для очистки статистики отдельных пользователей потребуется доступ к файлам
// с активными ставками, прогнозами и историей.  readJSON и writeJSON
// обеспечивают безопасную загрузку/сохранение JSON, а path используется
// для построения путей к файлам данных.
const path = require('path');
const { readJSON, writeJSON } = require('../utils/storage');

// Список статических пар команд, используемый для прогнозов и обработки результатов.
// Используется в /predict и /teamresult, чтобы обеспечить единое определение пар.
const STATIC_PAIRS = [
  ['Месси', 'Роналду'],
  ['Хэмилтон', 'Феттель'],
  ['Надаль', 'Федерер']
];

function replyPriv(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ ...payload, ephemeral: true });
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

// безопасно получить тег (только внутри обработчиков)
async function fetchTagSafe(client, userId) {
  try { const u = await client.users.fetch(userId); return u.tag; }
  catch { return userId; }
}

const handlers = {
  infop: {
    adminOnly: false,
    async run(interaction) {
      const { EmbedBuilder } = require('discord.js');
      const { readJSON } = require('../utils/storage');
      let predsData;
      try {
        predsData = readJSON(require('path').join(__dirname, '..', 'data', 'predictions.json'), { predictions: [] });
      } catch (e) {
        return interaction.reply({ content: 'Ошибка чтения истории предсказаний.', ephemeral: true });
      }
      const allPreds = Array.isArray(predsData.predictions) ? predsData.predictions : [];
      if (!allPreds || allPreds.length === 0) {
        return interaction.reply({ content: 'Нет пользователей с историей предсказаний.', ephemeral: true });
      }
      // Группируем по userId
      const userMap = {};
      for (const p of allPreds) {
        if (!userMap[p.userId]) userMap[p.userId] = [];
        userMap[p.userId].push(p);
      }
      const resultBlocks = [];
      // Загружаем историю результатов команд
      const teamResults = (() => {
        try {
          const hist = readJSON(require('path').join(__dirname, '..', 'data', 'history_teams.json'), { events: [] });
          return Array.isArray(hist.events) ? hist.events.filter(e => e.type === 'result') : [];
        } catch { return []; }
      })();
      function getMatchOutcome(teamA, teamB) {
        const resA = teamResults.find(e => e.name === teamA);
        const resB = teamResults.find(e => e.name === teamB);
        if (!resA || !resB) return { outcome: null, text: '— результат: неизвестен', code: null };
        if (resA.result === 'draw' && resB.result === 'draw') return { outcome: 'draw', text: '— результат: ничья', code: 'draw' };
        if (resA.result === 'win' && resB.result === 'loss') return { outcome: 'team1', text: `— результат: победа ${teamA}`, code: 'team1' };
        if (resA.result === 'loss' && resB.result === 'win') return { outcome: 'team2', text: `— результат: победа ${teamB}`, code: 'team2' };
        return { outcome: null, text: '— результат: неизвестен', code: null };
      }
      for (const uid of Object.keys(userMap)) {
        const predictions = userMap[uid];
        if (!predictions || predictions.length === 0) continue;
        const tag = `<@${uid}>`;
        const lines = predictions.map((p) => {
          const date = new Date(p.ts).toLocaleString();
          const [teamA, teamB] = String(p.matchKey).split('_');
          let outcomeText = '';
          if (p.prediction === 'team1') outcomeText = `победа ${teamA}`;
          else if (p.prediction === 'team2') outcomeText = `победа ${teamB}`;
          else if (p.prediction === 'draw') outcomeText = 'ничья';
          const matchRes = getMatchOutcome(teamA, teamB);
          let resultText = matchRes.text;
          if (matchRes.code) {
            resultText += (p.prediction === matchRes.code) ? ' (УГАДАНО)' : ' (НЕ угадано)';
          }
          return `🟨 [${date}] Матч: **${teamA} vs ${teamB}** — прогноз: ${outcomeText} ${resultText}`;
        });
        resultBlocks.push({
          name: `${tag} (${uid})`,
          value: lines.join('\n')
        });
      }
      // Если слишком много пользователей, разбиваем на несколько эмбедов
      const embeds = [];
      for (let i = 0; i < resultBlocks.length; i += 5) {
        const emb = new EmbedBuilder()
          .setColor(0xf5c518)
          .setTitle('История предсказаний пользователей')
          .addFields(resultBlocks.slice(i, i + 5));
        embeds.push(emb);
      }
      return interaction.reply({ embeds, ephemeral: false });
    }
  },
  top20: {
    adminOnly: false,
    async run(interaction) {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('top_20_xp').setLabel('топ-20').setStyle(ButtonStyle.Primary)
      );
      await interaction.reply({ content: 'Нажмите кнопку, чтобы увидеть топ-20 игроков по XP:', components: [row], ephemeral: true });
    }
  },
  // ---------- USER ----------
  code: {
    async run(interaction) {
      const code = interaction.options.getString('value', true).toUpperCase();
      const promo = await getPromoCode(code);
      if (!promo) return replyPriv(interaction, { content: '❌ Неверный код' });

      const userId = interaction.user.id;
      if (await hasUserUsedPromo(code, userId)) return replyPriv(interaction, { content: '❌ Вы уже использовали этот код' });
      if (isCodeExpired(promo)) return replyPriv(interaction, { content: '❌ Промокод недействителен' });

      const before = await getUser(userId);
      const oldLevel = calculateLevel(before.xp || 0);
      const oldProg  = calculateXPProgress(before.xp || 0);

      let resPromo = null;
      if (promo.rewards && Number.isFinite(promo.rewards.xp)) {
        resPromo = await addXP(userId, promo.rewards.xp, 'promo');
      }
      await markPromoCodeUsed(code, userId);

      const after = await getUser(userId);
      const newLevel = calculateLevel(after.xp || 0);
      const newProg  = calculateXPProgress(after.xp || 0);

      // Проверяем, достиг ли пользователь контрольного уровня с премиум‑статусом
      await checkLevelMilestone(oldLevel, newLevel, interaction.user, interaction.guild);

      const xpChangeStr = resPromo
        ? `${resPromo.oldXPProgress?.progress || '0/100'} → ${resPromo.newXPProgress?.progress || '0/100'}`
        : `${oldProg.progress} → ${newProg.progress}`;

      await logAction('promo', interaction.guild, {
        user: { id: userId, tag: interaction.user.tag },
        code,
        gainedXp: resPromo ? resPromo.xpGained : 0,
        xpBase:   resPromo ? resPromo.xpBase   : 0,
        oldLevel,
        newLevel,
        xpChange: xpChangeStr
      });

      // Зафиксируем дельты наград
      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks = (after.cardPacks || 0) - (before.cardPacks || 0);
      const tgt = { id: userId, tag: interaction.user.tag };
      if (diffDouble > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffDouble, rewardType: 'doubleTokens', level: newLevel });
      if (diffRaffle > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffRaffle,  rewardType: 'rafflePoints', level: newLevel });
      if (diffInvites > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffInvites,  rewardType: 'invites',      level: newLevel });
      if (diffPacks  > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffPacks,   rewardType: 'cardPacks',   level: newLevel });

      return replyPriv(interaction, { content: `✅ Код принят: +${resPromo ? resPromo.xpGained : 0} XP` });
    }
  },

  usedd: {
    async run(interaction) {
      // Количество жетонов Double-Down, которые пользователь хочет использовать
      const tokens = interaction.options.getInteger('tokens', true);
      // Имя команды, переданное в аргументе (может отсутствовать)
      const teamNameArg = interaction.options.getString('team', false);
      if (tokens !== 1 && tokens !== 2) {
        return replyPriv(interaction, { content: '❌ Можно использовать только 1 или 2 жетона.', ephemeral: true });
      }
      // DD доступен только участникам команды. Определим команду пользователя.
      const allTeams = getAllTeams();
      let userTeamName = null;
      for (const [tName, tObj] of Object.entries(allTeams)) {
        if (Array.isArray(tObj.members) && tObj.members.map(String).includes(String(interaction.user.id))) {
          userTeamName = tName;
          break;
        }
      }
      if (!userTeamName) {
        return replyPriv(interaction, { content: '❌ Жетоны Double‑Down можно использовать только участникам команд. Вы не состоите ни в одной команде.', ephemeral: true });
      }
      // Если пользователь указал имя команды, оно должно совпадать с командой пользователя
      if (teamNameArg && teamNameArg !== userTeamName) {
          return replyPriv(interaction, { content: `❌ Вы можете использовать жетоны только на свою команду (**${userTeamName}**).`, ephemeral: true });
      }
      const teamName = userTeamName;

      // Проверяем, разрешено ли сейчас использовать DD и идентификатор окна
      const settings = await getSettings(interaction.guild.id);
      if (!settings.ddEnabled) {
        return replyPriv(interaction, { content: '❌ Double‑Down сейчас недоступен.', ephemeral: true });
      }
      const windowId = settings.ddWindowId || 0;

      const userId = interaction.user.id;
      const u = await getUser(userId);
      const balance = Number(u.doubleTokens || 0);
      if (balance < tokens) {
        return replyPriv(interaction, { content: `❌ Недостаточно жетонов: есть ${balance}, требуется ${tokens}.`, ephemeral: true });
      }

      // Инициализируем окно DD для пользователя при смене идентификатора
      if (!u.ddWindow || u.ddWindow.id !== windowId) {
        u.ddWindow = { id: windowId, usedTokens: 0, betTeam: null };
      }
      // Лимит жетонов на окно — 2 (суммарно за все использования)
      if ((u.ddWindow.usedTokens || 0) + tokens > 2) {
        const remain = Math.max(0, 2 - (u.ddWindow.usedTokens || 0));
        return replyPriv(interaction, { content: `❌ Лимит жетонов на окно — 2. Доступно: ${remain}.`, ephemeral: true });
      }
      // Если уже была ставка в этом окне, она должна быть на ту же команду
      if (u.ddWindow.betTeam && u.ddWindow.betTeam !== teamName) {
        return replyPriv(interaction, { content: `❌ В этом окне ставка уже была на **${u.ddWindow.betTeam}**. Вы можете сделать Double‑Down только на одну команду.`, ephemeral: true });
      }

      // Списываем жетоны
      const before = Number(u.doubleTokens || 0);
      u.doubleTokens = before - tokens;
      u.ddWindow.usedTokens = (u.ddWindow.usedTokens || 0) + tokens;
      if (!u.ddWindow.betTeam) u.ddWindow.betTeam = teamName;
      await setUser(userId, u);

      // Записываем DD-ставку. Для участников команды это запись понадобится для мультипликатора в /teamresult
      await addBet(userId, teamName, tokens);
      addBetHistory({ type: 'bet', userId, team: teamName, tokens, members: allTeams[teamName]?.members || [], xp: 0 });

      await logAction('doubleStake', interaction.guild, {
        user: { id: userId, tag: interaction.user.tag },
        tokens,
        team: teamName,
        beforeTokens: before,
        afterTokens: u.doubleTokens
      });

      return replyPriv(interaction, { content: `✅ Вы активировали Double‑Down: ${tokens} жетон(ов) на **${teamName}**. Осталось жетонов: ${u.doubleTokens}. (Окно #${windowId}: ${u.ddWindow.usedTokens}/2)`, ephemeral: true });
    }
  },

  /**
   * Предсказание исхода параллельного матча. Пользователь указывает пару команд
   * через подчёркивание (например, "йцу3_йцу4") и исход: победа первой,
   * ничья или победа второй. Предсказания доступны всем пользователям, но
   * участник не может делать прогноз на свой матч или матч, в котором
   * участвует его соперник. Каждое предсказание перезаписывает прежнее
   * предсказание пользователя на тот же матч.
   */
  predict: {
    async run(interaction) {
      // Получаем опции без обязательности (если не указаны, будут undefined)
      const matchStr = interaction.options.getString('match', false)?.trim();
      const resultVal = interaction.options.getString('result', false);

      // Прогнозы доступны только если окно Double‑Down включено
      const settings = await getSettings(interaction.guild.id);
      if (!settings.ddEnabled) {
        return replyPriv(interaction, { content: '❌ Прогнозы сейчас недоступны.', ephemeral: true });
      }
      // Ограничение: только один прогноз на любую пару за окно ddWindowId
      const ddWindowId = settings.ddWindowId || 0;
      const { getPredictionsForUser } = require('../utils/predictionManager');
      const userPredictions = getPredictionsForUser(String(interaction.user.id));
      if (userPredictions.find(p => p.ddWindowId === ddWindowId)) {
        return replyPriv(interaction, { content: '❌ Вы уже сделали прогноз в этом окне Double-Down. Дождитесь следующего /ddstart.', ephemeral: true });
      }

      // Получаем все команды и определяем, состоит ли пользователь в какой-либо из них
      const allTeams = getAllTeams();
      let userTeamName = null;
      for (const [tName, tObj] of Object.entries(allTeams)) {
        if (Array.isArray(tObj.members) && tObj.members.map(String).includes(String(interaction.user.id))) {
          userTeamName = tName;
          break;
        }
      }

      // Используем глобальный список пар команд для прогнозов
      const staticPairs = STATIC_PAIRS;

      // Если пользователь не указал матч или исход, переходим в интерактивный режим
      if (!matchStr || !resultVal) {
        // Сформируем список пар, на которые пользователь может сделать прогноз
        let availablePairs = staticPairs.slice();
        if (userTeamName) {
          // Определим соперника пользователя, чтобы исключить матчи с его участием
          let opponent = null;
          for (const pair of staticPairs) {
            if (pair.includes(userTeamName)) {
              opponent = pair[0] === userTeamName ? pair[1] : pair[0];
              break;
            }
          }
          availablePairs = staticPairs.filter((pair) => {
            return !pair.includes(userTeamName) && !(opponent && pair.includes(opponent));
          });
        }
        if (availablePairs.length === 0) {
          return replyPriv(interaction, { content: '❌ Нет доступных матчей для прогноза.', components: [] });
        }
        const menuOptions = availablePairs.map((pair) => {
          return { label: `${pair[0]} vs ${pair[1]}`, value: `${pair[0]}_${pair[1]}` };
        });
        const select = new StringSelectMenuBuilder()
          .setCustomId(`predict_match_select:${interaction.user.id}`)
          .setPlaceholder('Выберите матч для прогноза')
          .addOptions(menuOptions);
        const row = new ActionRowBuilder().addComponents(select);
        return replyPriv(interaction, { content: 'Выберите матч для прогноза:', components: [row] });
      }
      // Разбиваем matchKey на две команды по символу '_'
      const parts = matchStr.split('_').map((s) => s.trim()).filter(Boolean);
      if (parts.length !== 2) {
        return replyPriv(interaction, { content: '❌ Некорректный формат матча. Используйте формат «команда1_команда2».', ephemeral: true });
      }
      const [team1, team2] = parts;
      // Валидация значения результата
      if (!['team1', 'team2', 'draw'].includes(resultVal)) {
        return replyPriv(interaction, { content: '❌ Некорректный исход. Используйте team1, team2 или draw.', ephemeral: true });
      }
      // Проверяем ограничения для пользователя
      // Пользователь не может делать прогноз на матч с участием своей команды
      if (userTeamName && (userTeamName === team1 || userTeamName === team2)) {
        return replyPriv(interaction, { content: '❌ Вы не можете делать прогноз на матч с участием вашей команды.',
                                          ephemeral: true });
      }
      // Пользователь не может делать прогноз на матч, где играет потенциальный соперник
      if (userTeamName) {
        for (const pair of staticPairs) {
          if (pair.includes(userTeamName)) {
            const opponent = pair[0] === userTeamName ? pair[1] : pair[0];
            if (opponent === team1 || opponent === team2) {
              return replyPriv(interaction, { content: '❌ Вы не можете делать прогноз на матч, где играют ваши потенциальные соперники.',
                                            ephemeral: true });
            }
          }
        }
      }
      // Убеждаемся, что обе команды существуют
      const t1 = getTeam(team1);
      const t2 = getTeam(team2);
      if (!t1 || !t2) {
        return replyPriv(interaction, { content: `❌ Одна или обе команды не найдены. Проверьте правильность названий.`, ephemeral: true });
      }
      // Проверяем, что для обоих команд ещё нет зафиксированного результата
      if (t1.lastResult || t2.lastResult) {
        return replyPriv(interaction, { content: '❌ Результат для этого матча уже зафиксирован. Прогнозы больше не принимаются.', ephemeral: true });
      }
      // Собираем ключ матча так, чтобы порядок команд был фиксирован (по имени)
      const sorted = [team1, team2].sort((a, b) => a.localeCompare(b));
      const matchKey = `${sorted[0]}_${sorted[1]}`;
      // Проверяем, делал ли пользователь уже прогноз на этот матч
      // (дополнительная проверка на матч не нужна — ограничение по окну)
      // Сохраняем прогноз с ddWindowId
      addPrediction(interaction.user.id, matchKey, resultVal, ddWindowId);
      // Логируем событие, включая список команд и исход
      // Для лога: прогноз как название команды, а не team1/team2
      let logOutcomeDesc;
      if (resultVal === 'team1') logOutcomeDesc = team1;
      else if (resultVal === 'team2') logOutcomeDesc = team2;
      else logOutcomeDesc = 'ничья';
      await logAction('predictionAdd', interaction.guild, {
        user: { id: interaction.user.id, tag: interaction.user.tag },
        match: matchKey,
        teams: [sorted[0], sorted[1]],
        prediction: logOutcomeDesc
      });
      // Формируем строку с описанием исхода для пользователя и для лога
      let outcomeDesc;
      if (resultVal === 'team1') outcomeDesc = `победа ${team1}`;
      else if (resultVal === 'team2') outcomeDesc = `победа ${team2}`;
      else outcomeDesc = 'ничья';
      return replyPriv(interaction, { content: `✅ Ваш прогноз принят: матч **${sorted[0]}** vs **${sorted[1]}**, исход **${outcomeDesc}**.`, ephemeral: true });
    }
  },

  cup: {
    async run(interaction) {
      try {
        const settings = await getSettings(interaction.guild.id);
        if (!settings.cupEnabled) return replyPriv(interaction, { content: '❌ CUP сейчас недоступен.', ephemeral: true });
        const round = settings.cupRound || 0;
        const cupTeams = Array.isArray(settings.cupTeams) ? settings.cupTeams : [];
        if (!cupTeams || cupTeams.length < 2) return replyPriv(interaction, { content: '❌ Команды для CUP не установлены. Ожидайте администратора.', ephemeral: true });

        // Проверка: пользователь может делать только один прогноз в раунде
        const { getCupPredictionsForUser, addCupPrediction } = require('../utils/cupManager');
        const userPreds = getCupPredictionsForUser(interaction.guild.id, interaction.user.id);
        if (userPreds.find(p => p.roundId === round)) {
          return replyPriv(interaction, { content: '❌ Вы уже сделали прогноз в этом раунде CUP.', ephemeral: true });
        }

        // Если нет параметров — интерактивный выбор матча
        // Формируем все возможные пары из cupTeams
        const pairs = [];
        for (let i = 0; i < cupTeams.length; i++) {
          for (let j = i + 1; j < cupTeams.length; j++) {
            pairs.push([cupTeams[i], cupTeams[j]]);
          }
        }
        if (!pairs.length) return replyPriv(interaction, { content: '❌ Нет доступных матчей для CUP.', ephemeral: true });
        const menuOptions = pairs.map(p => ({ label: `${p[0]} vs ${p[1]}`, value: `${p[0]}_${p[1]}` }));
        const select = new StringSelectMenuBuilder()
          .setCustomId(`cup_match_select:${interaction.user.id}`)
          .setPlaceholder('Выберите матч CUP')
          .addOptions(menuOptions);
        const row = new ActionRowBuilder().addComponents(select);
        return replyPriv(interaction, { content: 'Выберите матч для прогноза в CUP:', components: [row] });
      } catch (e) {
        console.error('[cup] error', e);
        return replyPriv(interaction, { content: '❌ Ошибка при обработке команды /cup.' });
      }
    }
  },

  bp: {
    adminOnly: false,
    async run(interaction) {
      const battlepass = require('../commands/battlepass'); // ленивый импорт
      const u = await getUser(interaction.user.id);
      const level = calculateLevel(u.xp || 0);
      const page = battlepass.defaultLevelToPage(level);
      const embed = battlepass.makeEmbed({
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
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const pageButtons = battlepass.makePageButtons(page);
      // Кнопка 'топ-20'
      const topRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('top_20_xp').setLabel('топ-20').setStyle(ButtonStyle.Primary)
      );
      await interaction.deferReply({ ephemeral: true });
      let files;
      try {
        const imgAtt = await battlepass.generateImageAttachment(u, page, level, u.xp || 0);
        if (imgAtt) { embed.setImage(`attachment://${imgAtt.name}`); files = [imgAtt]; }
      } catch(e) { console.error('[BP overlay error]', e?.message || e); }
      // Только editReply, без replyPriv
      await interaction.editReply({ embeds: [embed], components: [topRow, ...pageButtons], files });
      return;
    }
  },

  // ---------- ADMIN ----------
  bpstat: {
    adminOnly: true,
    async run(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      const u = await getUser(target.id);
      const level = calculateLevel(u.xp || 0);
      const progress = calculateXPProgress(u.xp || 0);

      const emb = new EmbedBuilder()
        .setColor(u.premium ? 0xffd700 : 0x2b6cb0)
        .setTitle(`BP-статистика — ${target.tag}`)
        .addFields(
          { name: 'Уровень', value: String(level), inline: true },
          { name: 'XP', value: String(u.xp || 0), inline: true },
          { name: 'Прогресс', value: progress.progress, inline: true },
          { name: 'DD-жетоны', value: String(u.doubleTokens || 0), inline: true },
          { name: 'Очки розыгрыша', value: String(u.rafflePoints || 0), inline: true },
          { name: 'Инвайты', value: String(u.invites || 0), inline: true },
          { name: 'Паки карт', value: String(u.cardPacks || 0), inline: true },
          { name: 'Премиум', value: u.premium ? 'активен' : 'нет', inline: true }
        )
        .setFooter({ text: `ID: ${target.id}` });

      return replyPriv(interaction, { embeds: [emb] });
    }
  },

  setcode: {
    adminOnly: true,
    async run(interaction) {
      const codeStr  = interaction.options.getString('code', true).toUpperCase();
      const minutes  = interaction.options.getInteger('minutes', true);
      const xpAmount = interaction.options.getInteger('xp', true);
      const limit    = interaction.options.getInteger('limit', false) || 0;
      const expiresAt = new Date(Date.now() + minutes * 60000);
      await createPromoCode(codeStr, { xp: xpAmount }, expiresAt, limit);
      await logAction('promo', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        code: codeStr, gainedXp: xpAmount, limit, minutes
      });
      return replyPriv(interaction, { content: `✅ Промокод \`${codeStr}\` создан (+${xpAmount} XP, ${minutes} мин., лимит ${limit || '∞'})` });
    }
  },

  xp: {
    adminOnly: true,
    async run(interaction) {
      const user   = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const before = await getUser(user.id);
      const res    = await addXP(user.id, amount, 'manual_admin');
      const after  = await getUser(user.id);

  // Контрольные уровни: уведомление админа при достижении 50/98/100 уровня с премиум
  // (убрано двойное начисление наград, если addXP уже сама начисляет)
  const xpChangeStr = `${res.oldXPProgress?.progress || '0/100'} → ${res.newXPProgress?.progress || '0/100'}`;

      await logAction('xpAdd', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        amount: res.xpGained, gainedXp: res.xpGained, xpBase: res.xpBase,
        oldLevel: res.oldLevel, newLevel: res.newLevel, xpChange: xpChangeStr
      });

      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks = (after.cardPacks || 0) - (before.cardPacks || 0);
      const lvlNew = res.newLevel;
      const tgt = { id: user.id, tag: user.tag };
      if (diffDouble > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffDouble, rewardType: 'doubleTokens', level: lvlNew });
      if (diffRaffle > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffRaffle,  rewardType: 'rafflePoints', level: lvlNew });
      if (diffInvites > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffInvites,  rewardType: 'invites',      level: lvlNew });
      if (diffPacks  > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffPacks,   rewardType: 'cardPacks',   level: lvlNew });

      return replyPriv(interaction, { content: `✅ <@${user.id}> +${res.xpGained} XP (уровень ${res.oldLevel} → ${res.newLevel})` });
    }
  },

  xpset: {
    adminOnly: true,
    async run(interaction) {
      const user   = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      const oldXp = u.xp || 0;
      const oldLevel = calculateLevel(oldXp);
      const oldProg  = calculateXPProgress(oldXp);
      u.xp = amount;
      await setUser(user.id, u);
      const newLevel = calculateLevel(u.xp || 0);
      const newProg  = calculateXPProgress(u.xp || 0);
      const xpChangeStr = `${oldProg.progress} → ${newProg.progress}`;
      await logAction('xpSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        value: amount, oldLevel, newLevel, xpChange: xpChangeStr
      });
      return replyPriv(interaction, { content: `🛠️ XP для <@${user.id}> установлен на ${amount} (уровень ${oldLevel} → ${newLevel})` });
    }
  },

  xpinvite: {
    adminOnly: true,
    async run(interaction) {
      const inviter = interaction.options.getUser('user', true);
      const added   = interaction.options.getUser('added', false);
      // Достаем данные до начисления XP
      const before = await getUser(inviter.id);
      // Проверяем, приглашал ли уже inviter этого пользователя
      let u = await getUser(inviter.id);
      if (added) {
        // инициализация списка приглашенных, если его нет
        u.invitedUsers = Array.isArray(u.invitedUsers) ? u.invitedUsers : [];
        const already = u.invitedUsers.map(String).includes(String(added.id));
        if (already) {
          return replyPriv(interaction, { content: `❌ Пользователь <@${inviter.id}> уже пригласил(а) <@${added.id}>. Повторно пригласить нельзя.`, ephemeral: true });
        }
        u.invitedUsers.push(String(added.id));
      }
      // Начисляем XP за инвайт (100 XP)
      const res = await addXP(inviter.id, 100, 'invite');
      // Проверяем достижение контрольного уровня
      await checkLevelMilestone(res.oldLevel, res.newLevel, inviter, interaction.guild);
      // Увеличиваем количество инвайтов
      u.invites = (u.invites || 0) + 1;
      await setUser(inviter.id, u);
      const after = await getUser(inviter.id);
      const xpChangeStr = `${res.oldXPProgress?.progress || '0/100'} → ${res.newXPProgress?.progress || '0/100'}`;
      // Логируем выдачу XP и инвайта
      await logAction('xpInvite', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: inviter.id, tag: inviter.tag },
        gainedXp: res.xpGained, xpBase: res.xpBase, xpChange: xpChangeStr
      });
      // Логи для наград BP
      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks   = (after.cardPacks || 0) - (before.cardPacks || 0);
      const lvlNew = calculateLevel(after.xp || 0);
      const tgt = { id: inviter.id, tag: inviter.tag };
      if (diffDouble > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffDouble, rewardType: 'doubleTokens', level: lvlNew });
      if (diffRaffle > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffRaffle,  rewardType: 'rafflePoints', level: lvlNew });
      // diffInvites > 1 означает, что помимо 1 инвайта, игрок получил ещё и награду за уровень
      if (diffInvites > 1) {
        const rewardedInvites = diffInvites - 1;
        if (rewardedInvites > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: rewardedInvites, rewardType: 'invites', level: lvlNew });
      }
      if (diffPacks  > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffPacks,   rewardType: 'cardPacks', level: lvlNew });
      return replyPriv(interaction, { content: `✅ <@${inviter.id}>: +${res.xpGained} XP и +1 invite.` });
    }
  },

  // Ручные сеттеры
  gpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const points = interaction.options.getInteger('points', true);
      const u = await getUser(user.id);
      u.rafflePoints = points;
      await setUser(user.id, u);
      await logAction('raffleSet', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, points });
      return replyPriv(interaction, { content: `🎟️ У <@${user.id}> теперь ${points} очков розыгрыша.` });
    }
  },
  ddset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.doubleTokens = amount;
      await setUser(user.id, u);
      await logAction('doubleStakeTokensSet', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, amount });
      return replyPriv(interaction, { content: `🎯 У <@${user.id}> установлено DD-жетонов: ${amount}.` });
    }
  },
  invset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.invites = amount;
      await setUser(user.id, u);
      await logAction('invitesSet', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, amount });
      return replyPriv(interaction, { content: `🤝 У <@${user.id}> установлено инвайтов: ${amount}.` });
    }
  },
  cpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.cardPacks = amount;
      await setUser(user.id, u);
      await logAction('cardPacksSet', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, amount });
      return replyPriv(interaction, { content: `🃏 У <@${user.id}> установлено паков карт: ${amount}.` });
    }
  },

  bpreapply: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const includeXP = !!interaction.options.getBoolean('includexp', false);
      const res = await reapplyRewardsForUser(user.id, includeXP);
      await logAction('bpReapply', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, level: res.level, deltas: JSON.stringify(res.deltas) });
      return replyPriv(interaction, { content: `🔁 Доначислены недостающие награды для <@${user.id}> (уровень ${res.level}).` });
    }
  },

  userreset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const userId = user.id;
      // Полностью очищаем данные пользователя, включая XP, все награды, достижения и премиум‑статус.
      const resetData = {
        xp: 0,
        invites: 0,
        rafflePoints: 0,
        doubleTokens: 0,
        cardPacks: 0,
        premium: false,
        premium_since: null,
        matchesPlayed: 0,
        winsInRow: 0,
        achievements: { ninePlayed: false, twelvePlayed: false, fourWinsStreak: false }
      };
      // Перезаписываем запись пользователя дефолтными значениями; при этом
      // свойства, отсутствующие в resetData, будут взяты из DEFAULT_USER (id и др.).
      await setUser(userId, resetData);

      // Очищаем связанные с пользователем данные: активные ставки, прогнозы и историю ставок.
      try {
        // bets.json: удаляем все ставки пользователя
        const betsFile   = path.join(__dirname, '..', 'data', 'bets.json');
        const betsData   = readJSON(betsFile, { bets: [] });
        if (Array.isArray(betsData.bets)) {
          betsData.bets = betsData.bets.filter((b) => String(b.userId) !== String(userId));
          writeJSON(betsFile, betsData);
        }
        // predictions.json: удаляем все прогнозы пользователя
        const predFile   = path.join(__dirname, '..', 'data', 'predictions.json');
        const predData   = readJSON(predFile, { predictions: [] });
        if (Array.isArray(predData.predictions)) {
          predData.predictions = predData.predictions.filter((p) => String(p.userId) !== String(userId));
          writeJSON(predFile, predData);
        }
        // history_bets.json: удаляем события ставок пользователя
        const histFile   = path.join(__dirname, '..', 'data', 'history_bets.json');
        const histData   = readJSON(histFile, { events: [] });
        if (Array.isArray(histData.events)) {
          histData.events = histData.events.filter((e) => String(e.userId) !== String(userId));
          writeJSON(histFile, histData);
        }
      } catch (e) {
        console.error('[userreset] error wiping user data', e);
      }
      await logAction('userReset', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: userId, tag: user.tag }
      });
      return replyPriv(interaction, { content: `🧹 Пользователь <@${userId}> полностью обнулён.` });
    }
  },

  dbreset: {
    adminOnly: true,
    async run(interaction) {
      const confirm = interaction.options.getBoolean('confirm', true);
      if (!confirm) return replyPriv(interaction, { content: 'Отмена.' });

      let wiped = 0;
      try {
        const db = global.db;
        // Удаляем все записи пользователей из БД
        if (db?.list) {
          const entries = await db.list('user_');
          for (const k of Object.keys(entries)) {
            await db.delete(k);
            wiped++;
          }
        }
        // Очищаем список команд: перезаписываем файл teams.json пустым объектом
        {
          const teamsFile = path.join(__dirname, '..', 'data', 'teams.json');
          writeJSON(teamsFile, { teams: {} });
        }
        // Очищаем все активные ставки
        {
          const { clearAllBets } = require('../utils/betManager');
          clearAllBets();
        }
        // Очищаем все прогнозы
        {
          const { clearAllPredictions } = require('../utils/predictionManager');
          clearAllPredictions();
        }
        // Очищаем историю ставок и историю команд
        {
          const betsHistFile = path.join(__dirname, '..', 'data', 'history_bets.json');
          writeJSON(betsHistFile, { events: [] });
          const teamsHistFile = path.join(__dirname, '..', 'data', 'history_teams.json');
          writeJSON(teamsHistFile, { events: [] });
        }
        // Сбрасываем настройки Double‑Down: выключаем окно и ставим идентификатор на 0
        try {
          await patchSettings(interaction.guild.id, { ddEnabled: false, ddWindowId: 0 });
        } catch {}
      } catch (e) {
        console.error('[dbreset/full-reset]', e);
      }
      await logAction('dbReset', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        value: `users=${wiped}`
      });
      return replyPriv(interaction, { content: `💣 Полная очистка выполнена. Удалено пользователей: ${wiped}.` });
    }
  },

  /**
   * Создать резервную копию базы данных вручную.  Хотя резервные копии
   * выполняются ежедневно автоматически, иногда администратору требуется
   * сделать снимок немедленно.  После выполнения команда возвращает
   * название файла, в который была записана резервная копия.
   */
  backup: {
    adminOnly: true,
    async run(interaction) {
      try {
        await interaction.deferReply({ flags: 64 /* MessageFlags.Ephemeral */ });
      } catch {}
      try {
        const filePath = await backupDb();
        await logAction('dbBackup', interaction.guild, {
          admin: { id: interaction.user.id, tag: interaction.user.tag },
          file: filePath
        });
        return replyPriv(interaction, { content: `🗂️ Резервная копия создана: ${filePath}` });
      } catch (e) {
        console.error('[backup] failed to create backup', e);
        return replyPriv(interaction, { content: '❌ Ошибка при создании резервной копии.' });
      }
    }
  },

  /**
   * Восстановить базу данных из самой свежей резервной копии.  Эта
   * операция перезаписывает текущий файл базы (`data/db.json`) данными
   * последнего снимка.  Будьте осторожны: откатить изменения после
   * восстановления нельзя.  Отчёт об операции записывается в логи.
   */
  restore: {
    adminOnly: true,
    async run(interaction) {
      try {
        await interaction.deferReply({ flags: 64 /* MessageFlags.Ephemeral */ });
      } catch {}
      try {
        const filePath = await restoreLatest();
        await logAction('dbRestore', interaction.guild, {
          admin: { id: interaction.user.id, tag: interaction.user.tag },
          file: filePath
        });
        return replyPriv(interaction, { content: `📦 База данных восстановлена из: ${filePath}` });
      } catch (e) {
        console.error('[restore] failed to restore backup', e);
        return replyPriv(interaction, { content: '❌ Ошибка при восстановлении из резервной копии.' });
      }
    }
  },

  ddstart: {
    adminOnly: true,
    async run(interaction) {
      // При открытии нового окна Double‑Down очищаем все предыдущие прогнозы, чтобы пользователи могли
      // заново делать ставки. Это предотвращает перенос старых прогнозов в новое окно.
      const settings = await getSettings(interaction.guild.id);
      const nextId = (settings.ddWindowId || 0) + 1;
      // Сброс прогнозов
      try {
        const { clearAllPredictions } = require('../utils/predictionManager');
        clearAllPredictions();
      } catch (e) {
        console.error('[ddstart] error clearing predictions', e);
      }
      await patchSettings(interaction.guild.id, { ddEnabled: true, ddWindowId: nextId });
      await logAction('doubleStakeWindow', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: true, value: `windowId=${nextId}` });
      return interaction.reply({ content: `✅ Окно Double-Down открыто (ID: ${nextId}).`, ephemeral: true });
    }
  },

  ddstop: {
    adminOnly: true,
    async run(interaction) {
      await patchSettings(interaction.guild.id, { ddEnabled: false });
      await logAction('doubleStakeWindow', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: false });
      return replyPriv(interaction, { content: '🛑 Окно Double-Down закрыто.' });
    }
  },

  // Открыть CUP-окно для раунда 1/2/3. Награды за правильный прогноз — 100/120/150 XP соответственно.
  ddcup1: {
    adminOnly: true,
    async run(interaction) {
      try {
        // Сброс предыдущих cup-прогнозов для этой гильдии
        const { clearAllCupPredictionsForGuild } = require('../utils/cupManager');
        clearAllCupPredictionsForGuild(interaction.guild.id);
        await patchSettings(interaction.guild.id, { cupEnabled: true, cupRound: 1 });
        await logAction('ddcupWindow', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: true, round: 1 });
        return interaction.reply({ content: '✅ CUP раунд 1 открыт (награда за верный прогноз: 100 XP).', ephemeral: true });
      } catch (e) {
        console.error('[ddcup1] error', e);
        return replyPriv(interaction, { content: '❌ Ошибка при открытии CUP раунда 1.' });
      }
    }
  },
  ddcup2: {
    adminOnly: true,
    async run(interaction) {
      try {
        const { clearAllCupPredictionsForGuild } = require('../utils/cupManager');
        clearAllCupPredictionsForGuild(interaction.guild.id);
        await patchSettings(interaction.guild.id, { cupEnabled: true, cupRound: 2 });
        await logAction('ddcupWindow', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: true, round: 2 });
        return interaction.reply({ content: '✅ CUP раунд 2 открыт (награда за верный прогноз: 120 XP).', ephemeral: true });
      } catch (e) {
        console.error('[ddcup2] error', e);
        return replyPriv(interaction, { content: '❌ Ошибка при открытии CUP раунда 2.' });
      }
    }
  },
  ddcup3: {
    adminOnly: true,
    async run(interaction) {
      try {
        const { clearAllCupPredictionsForGuild } = require('../utils/cupManager');
        clearAllCupPredictionsForGuild(interaction.guild.id);
        await patchSettings(interaction.guild.id, { cupEnabled: true, cupRound: 3 });
        await logAction('ddcupWindow', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: true, round: 3 });
        return interaction.reply({ content: '✅ CUP раунд 3 открыт (награда за верный прогноз: 150 XP).', ephemeral: true });
      } catch (e) {
        console.error('[ddcup3] error', e);
        return replyPriv(interaction, { content: '❌ Ошибка при открытии CUP раунда 3.' });
      }
    }
  },
  ddcupstop: {
    adminOnly: true,
    async run(interaction) {
      try {
        // Закрываем CUP и очищаем список команд и обработанных результатов.
        await patchSettings(interaction.guild.id, { cupEnabled: false, cupRound: 0, cupTeams: [], cupResults: [] });
        await logAction('ddcupWindow', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: false });
        return replyPriv(interaction, { content: '🛑 CUP окно закрыто.' });
      } catch (e) {
        console.error('[ddcupstop] error', e);
        return replyPriv(interaction, { content: '❌ Ошибка при закрытии CUP окна.' });
      }
    }
  },

  ddcupsetteams: {
    adminOnly: true,
    async run(interaction) {
      try {
        const t1 = interaction.options.getString('team1', true).trim();
        const t2 = interaction.options.getString('team2', true).trim();
        const t3 = interaction.options.getString('team3', true).trim();
        const t4 = interaction.options.getString('team4', true).trim();
        const teams = [t1, t2, t3, t4];
        // Проверка на уникальность
        if (new Set(teams.map(s => s.toLowerCase())).size !== 4) {
          return replyPriv(interaction, { content: '❌ Ошибка: команды должны быть уникальными.' });
        }
        // Не перезаписываем существующий список команд: если команды уже установлены,
        // просим админа сначала очистить их (ddcupstop) или вручную удалить.
        const { getSettings } = require('../database/settingsManager');
        const settings = await getSettings(interaction.guild.id);
        if (Array.isArray(settings.cupTeams) && settings.cupTeams.length > 0) {
          return replyPriv(interaction, { content: `❌ Ошибка: команды для CUP уже установлены: ${settings.cupTeams.map(t => `**${t}**`).join(', ')}. Сначала сбросьте их командой /ddcupstop.` });
        }
        await patchSettings(interaction.guild.id, { cupTeams: teams });
        await logAction('ddcupSetTeams', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, teams });
        return replyPriv(interaction, { content: `✅ Установлены команды для CUP: ${teams.map(t => `**${t}**`).join(', ')}.` });
      } catch (e) {
        console.error('[ddcupsetteams] error', e);
        return replyPriv(interaction, { content: '❌ Ошибка при установке команд CUP.' });
      }
    }
  },

  setlog: {
    adminOnly: true,
    async run(interaction) {
      const ch = interaction.options.getChannel('channel', true);
      await patchSettings(interaction.guild.id, { logChannelId: ch.id });
      return replyPriv(interaction, { content: `✅ Лог-канал: <#${ch.id}>` });
    }
  },

 premiumon: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const u = await getUser(user.id);
      // Если у пользователя уже есть премиум, возвращаем ошибку
      if (u && u.premium) {
        return replyPriv(interaction, { content: `❌ У <@${user.id}> уже активирован премиум.` });
      }
      // Включаем премиум и фиксируем дату активации
      u.premium = true;
      u.premium_since = new Date().toISOString();
      await setUser(user.id, u);
      // Начисляем пропущенные премиальные награды.  XP‑награды не пересчитываются.
      try {
        await reapplyRewardsForUser(user.id, false);
      } catch (e) {
        console.error('[premiumon] reapplyRewardsForUser', e);
      }
      await logAction('premiumChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        premium: true
      });
      return replyPriv(interaction, { content: `⭐ Премиум включён для <@${user.id}>` });
    }
  },

  premiumoff: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const u = await getUser(user.id);
      // Если премиум не активирован, выдаём ошибку
      if (!u || !u.premium) {
        return replyPriv(interaction, { content: `❌ У <@${user.id}> нет активного премиума.` });
      }
      // Отключаем премиум. Можно обнулить время активации, если оно есть
      u.premium = false;
      u.premium_since = null;
      await setUser(user.id, u);
      await logAction('premiumChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        premium: false
      });
      return replyPriv(interaction, { content: `🆓 Премиум выключен для <@${user.id}>` });
    }
  },

  /**
   * Вывести список всех пользователей, имеющих премиум‑статус.
   * Список формируется на основе базы данных (user_*) и включает упоминание
   * пользователя и его тег (если доступен).  Команда доступна только
   * администраторам.
   */
  usersprem: {
    adminOnly: true,
    async run(interaction) {
      // Загружаем все записи пользователей из БД
      const db = global.db;
      let entries = {};
      try {
        if (db?.list) entries = await db.list('user_');
      } catch (e) {
        console.error('[usersprem] list error:', e);
      }
      const ids = [];
      for (const key of Object.keys(entries || {})) {
        const udata = entries[key];
        if (udata && udata.premium) {
          const uid = udata.id || String(key).replace(/^user_/, '');
          ids.push(String(uid));
        }
      }
      const lines = [];
      for (const uid of ids) {
        try {
          const tag = await fetchTagSafe(interaction.client, uid);
          if (tag) {
            lines.push(`⭐ ${tag} (<@${uid}>)`);
          } else {
            lines.push(`⭐ <@${uid}>`);
          }
        } catch {
          lines.push(`⭐ <@${uid}>`);
        }
      }
      const content = lines.length
        ? 'Список премиум‑пользователей:\n' + lines.join('\n')
        : 'Премиум‑пользователи не найдены.';
      return replyPriv(interaction, { content });
    }
  },

  // ---------- Команды для команд ----------
  teamcreate: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const members = [];
      for (let i = 1; i <= 5; i++) {
        const optName = `player${i}`;
        const user = interaction.options.getUser(optName, true);
        members.push(user.id);
      }
      if (new Set(members).size !== members.length) {
        return replyPriv(interaction, { content: '❌ Ошибка: необходимо указать 5 уникальных участников.' });
      }
      const all = getAllTeams();
      const existsByName = Object.keys(all).some((n) => n.toLowerCase() === name.toLowerCase());
      if (existsByName) return replyPriv(interaction, { content: `❌ Ошибка: команда с именем **${name}** уже существует.` });

      const conflicts = [];
      for (const [tname, t] of Object.entries(all)) {
        const inTeam = new Set((t.members || []).map(String));
        for (const m of members) if (inTeam.has(String(m))) conflicts.push({ member: m, team: tname });
      }
      if (conflicts.length) {
        const pretty = conflicts.map((c) => `<@${c.member}> в «${c.team}»`).join(', ');
        return replyPriv(interaction, { content: `❌ Ошибка: следующие участники уже состоят в других командах: ${pretty}` });
      }

      const norm = (arr) => [...new Set(arr.map(String))].sort().join('|');
      const sig = norm(members);
      for (const t of Object.values(all)) {
        if (norm(t.members || []) === sig) {
          return replyPriv(interaction, { content: '❌ Ошибка: команда с таким же составом уже существует.' });
        }
      }

      // Перед созданием команды проверяем, не делал ли кто-то из участников ставки на эту команду.
      // Если участник использовал Double‑Down на эту команду, возвращаем жетоны и удаляем ставку.
      for (const memberId of members) {
        try {
          const mUser = await getUser(memberId);
          if (mUser && mUser.ddWindow && mUser.ddWindow.betTeam === name) {
            const used = Number(mUser.ddWindow.usedTokens || 0);
            if (used > 0) {
              mUser.doubleTokens = Number(mUser.doubleTokens || 0) + used;
              mUser.ddWindow.usedTokens = 0;
              mUser.ddWindow.betTeam = null;
              await setUser(memberId, mUser);
              removeBetsForUserAndTeam(memberId, name);
              const memberTag = await fetchTagSafe(interaction.client, memberId);
              await logAction('doubleRefund', interaction.guild, {
                user: { id: memberId, tag: memberTag },
                team: name,
                tokens: used
              });
            }
          }
        } catch (e) {
          console.error('[teamcreate/refund]', e);
        }
      }

      const created = createTeam(name, members);
      if (!created) return replyPriv(interaction, { content: `❌ Ошибка: команда **${name}** уже существует.` });

      addTeamCreate(name, members);
      // информативный лог: название и ники участников
      const memberTags = await Promise.all(members.map((id) => fetchTagSafe(interaction.client, id)));
      await logAction('teamCreate', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name,
        membersList: memberTags
      });

      const mentions = members.map((id) => `<@${id}>`).join(', ');
      return replyPriv(interaction, { content: `✅ Команда **${name}** создана. Участники: ${mentions}.` });
    }
  },

  teamchange: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      // Параметр old поступает как строка (ID пользователя) из автодополнения
      // Значение параметра old приходит в формате `<@id>` или просто ID.
      const oldRaw = interaction.options.getString('old', true);
      let oldUserId = oldRaw;
      // Извлекаем числовой идентификатор из пинга (оставляя ID без символов)
      if (typeof oldRaw === 'string') {
        const match = oldRaw.match(/\d+/);
        if (match) oldUserId = match[0];
      }
      const newUser = interaction.options.getUser('new', true);
      if (String(oldUserId) === String(newUser.id)) {
        return replyPriv(interaction, { content: '❌ Ошибка: вы указали одинаковых пользователей.' });
      }
      const team = getTeam(name);
      if (!team) return replyPriv(interaction, { content: `❌ Ошибка: команда **${name}** не найдена.` });
      if (team.lastResult) return replyPriv(interaction, { content: '❌ Ошибка: команда уже завершена. Изменение состава недоступно.' });

      const idx = team.members.indexOf(String(oldUserId));
      if (idx === -1) return replyPriv(interaction, { content: `❌ Ошибка: <@${oldUserId}> не состоит в команде **${name}**.` });
      if (team.members.includes(String(newUser.id))) return replyPriv(interaction, { content: `❌ Ошибка: <@${newUser.id}> уже состоит в команде **${name}**.` });

      // Перед заменой участника возвращаем Double‑Down жетоны, если старый участник ставил на эту команду.
      try {
        const oldUser = await getUser(oldUserId);
        if (oldUser && oldUser.ddWindow && oldUser.ddWindow.betTeam === name) {
          const used = Number(oldUser.ddWindow.usedTokens || 0);
          if (used > 0) {
            oldUser.doubleTokens = Number(oldUser.doubleTokens || 0) + used;
            oldUser.ddWindow.usedTokens = 0;
            oldUser.ddWindow.betTeam = null;
            await setUser(oldUserId, oldUser);
            // Удаляем ставки пользователя на эту команду
            removeBetsForUserAndTeam(oldUserId, name);
            const oldTag2 = await fetchTagSafe(interaction.client, oldUserId);
            await logAction('doubleRefund', interaction.guild, {
              user: { id: oldUserId, tag: oldTag2 },
              team: name,
              tokens: used
            });
          }
        }
      } catch (e) { console.error('[teamchange/refund-old]', e); }

      // Возвращаем жетоны новому участнику, если он ранее ставил на эту команду (до вступления)
      try {
        const newUserData = await getUser(newUser.id);
        if (newUserData && newUserData.ddWindow && newUserData.ddWindow.betTeam === name) {
          const usedN = Number(newUserData.ddWindow.usedTokens || 0);
          if (usedN > 0) {
            newUserData.doubleTokens = Number(newUserData.doubleTokens || 0) + usedN;
            newUserData.ddWindow.usedTokens = 0;
            newUserData.ddWindow.betTeam = null;
            await setUser(newUser.id, newUserData);
            removeBetsForUserAndTeam(newUser.id, name);
            const newTag2 = await fetchTagSafe(interaction.client, newUser.id);
            await logAction('doubleRefund', interaction.guild, {
              user: { id: newUser.id, tag: newTag2 },
              team: name,
              tokens: usedN
            });
          }
        }
      } catch (e) { console.error('[teamchange/refund-new]', e); }

      // Заменяем участника
      team.members[idx] = String(newUser.id);
      updateTeam(name, { members: team.members });

      // Для логов и уведомления получаем теги участников
      const memberTags = await Promise.all(team.members.map((id) => fetchTagSafe(interaction.client, id)));
      const oldTag = await fetchTagSafe(interaction.client, oldUserId);
      const newTag = await fetchTagSafe(interaction.client, newUser.id);

      await logAction('teamChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name,
        change: `${oldTag} → ${newTag}`,
        membersList: memberTags
      });

      return replyPriv(interaction, { content: `🔄 В команде **${name}** заменён <@${oldUserId}> на <@${newUser.id}>.` });
    }
  },

  teamdelete: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const removed = deleteTeam(name);
      if (!removed) return replyPriv(interaction, { content: `❌ Ошибка: команда **${name}** не найдена.` });

      await logAction('teamDelete', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, name });
      return replyPriv(interaction, { content: `🗑️ Команда **${name}** удалена.` });
    }
  },

  teamresult: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const result = interaction.options.getString('result', true); // win | loss | draw
      // Количество обработанных прогнозов (ставок) для лога
      let predictionsCount = 0;

      const team = getTeam(name);
      if (!team) return replyPriv(interaction, { content: `❌ Ошибка: команда **${name}** не найдена.` });

      // Сохраняем результат для команды
      updateTeam(name, { lastResult: result });

      // ---- Обработка прогнозов на исход матча ----
      try {
        const { getPredictionsForMatch, clearPredictionsForMatch } = require('../utils/predictionManager');
        // Статические пары команд для определения матча (используем те же, что и в predict)
        let matchPair = null;
        for (const p of STATIC_PAIRS) {
          if (p.includes(name)) { matchPair = p; break; }
        }
          if (matchPair) {
            const sorted = [...matchPair].sort((a, b) => a.localeCompare(b));
            const matchKey = `${sorted[0]}_${sorted[1]}`;
            const preds = getPredictionsForMatch(matchKey);
            predictionsCount = preds.length;
            if (preds && preds.length > 0) {
              // Определяем фактический исход относительно sorted: team1, team2 или draw
              let actualOutcome;
              if (result === 'draw') {
                actualOutcome = 'draw';
              } else if (result === 'win') {
                actualOutcome = (name === sorted[0]) ? 'team1' : 'team2';
              } else if (result === 'loss') {
                actualOutcome = (name === sorted[0]) ? 'team2' : 'team1';
              }
              let predictionsAwarded = 0;
              for (const pr of preds) {
                if (pr.prediction === actualOutcome) {
                  // За правильный прогноз начисляем 100 XP
                  const resPred = await addXP(pr.userId, 100, 'prediction');
                  predictionsAwarded += resPred.xpGained;
                  // Проверяем контрольные уровни для игрока
                  const targetTag = await fetchTagSafe(interaction.client, pr.userId);
                  await checkLevelMilestone(resPred.oldLevel, resPred.newLevel, { id: pr.userId, tag: targetTag }, interaction.guild);
                  // Логируем индивидуально
                  // Готовим человекочитаемое описание исхода для лога
                  let outcomeDesc;
                  if (pr.prediction === 'draw') outcomeDesc = 'ничья';
                  else if (pr.prediction === 'team1') outcomeDesc = `победа ${sorted[0]}`;
                  else if (pr.prediction === 'team2') outcomeDesc = `победа ${sorted[1]}`;
                  await logAction('predictionPayout', interaction.guild, {
                    user: { id: pr.userId, tag: targetTag },
                    match: matchKey,
                    prediction: outcomeDesc,
                    xpGained: resPred.xpGained,
                    xpBase: resPred.xpBase
                  });
                }
              }
              // Очищаем прогнозы для матча, чтобы не начислять дважды
              clearPredictionsForMatch(matchKey);
              // ---- Обработка CUP-прогнозов (если для этой гильдии включён CUP и пары совпадают) ----
              try {
                const { getSettings } = require('../database/settingsManager');
                const settingsCup = await getSettings(interaction.guild.id);
                if (settingsCup.cupEnabled && Array.isArray(settingsCup.cupTeams) && settingsCup.cupTeams.length >= 2) {
                  const { getCupPredictionsForMatch, clearCupPredictionsForMatch } = require('../utils/cupManager');
                  const cupPreds = getCupPredictionsForMatch(interaction.guild.id, matchKey);
                  if (cupPreds && cupPreds.length > 0) {
                    // Определяем фактический исход (тот же actualOutcome)
                    const CUP_XP = { 1: 100, 2: 120, 3: 150 };
                    const roundId = Number(settingsCup.cupRound || 0);
                    for (const pr of cupPreds) {
                      if (pr.prediction === actualOutcome) {
                        const xpAward = CUP_XP[roundId] || 100;
                        const resPred = await addXP(pr.userId, xpAward, 'cupPrediction');
                        const targetTag = await fetchTagSafe(interaction.client, pr.userId);
                        await checkLevelMilestone(resPred.oldLevel, resPred.newLevel, { id: pr.userId, tag: targetTag }, interaction.guild);
                        await logAction('cupPredictionPayout', interaction.guild, {
                          user: { id: pr.userId, tag: targetTag }, match: matchKey, prediction: pr.prediction, xpGained: resPred.xpGained, round: roundId
                        });
                      }
                    }
                    // Очищаем cup-прогнозы для матча
                    clearCupPredictionsForMatch(interaction.guild.id, matchKey);
                  }
                }
              } catch (e) {
                console.error('[teamresult/cupPrediction]', e);
              }
            }
          }
      } catch (e) {
        console.error('[teamresult/prediction]', e?.message || e);
      }

      // ---- Обработка Double‑Down для участников и начисление XP ----
      const bets = getBetsForTeam(name);
      // Собираем множители DD для участников команды: по id суммируем жетоны
      const ddMultiplierMap = {};
      for (const bet of bets) {
        const uid = bet.userId;
        // Если пользователь — участник команды, используем жетоны как множитель (1 жетон → ×2, 2 жетона → ×3)
        if (team.members && team.members.includes(uid)) {
          const current = ddMultiplierMap[uid] || 1;
          const mult = (bet.tokens || 0) + 1;
          // Если пользователь несколько раз делал ставки, суммируем жетоны до 2
          const existingTokens = current - 1;
          const totalTokens = Math.min(2, (existingTokens) + (bet.tokens || 0));
          ddMultiplierMap[uid] = totalTokens + 1;
        }
      }
      // Базовые очки за участие и результат
      const baseXP = 200;
      const resultXP = result === 'win' ? 150 : result === 'draw' ? 60 : 0;
      const memberXPList = [];
      let totalXp = 0;
      let affected = 0;
      for (const memberId of (team.members || [])) {
        affected++;
        // Рассчитываем множитель: по умолчанию 1 (без DD)
        const multiplier = ddMultiplierMap[memberId] || 1;
        const resultPortion = resultXP * multiplier;
        const totalForMember = baseXP + resultPortion;
        let gained = 0;
        let base = 0;
        if (totalForMember > 0) {
          const res = await addXP(memberId, totalForMember, 'teamMemberResult');
          gained = res.xpGained;
          base = res.xpBase;
          totalXp += res.xpGained;
          // Контрольные уровни для каждого участника
          await checkLevelMilestone(res.oldLevel, res.newLevel, { id: memberId, tag: String(memberId) }, interaction.guild);
        }
        // Обновляем статистику в профиле участника
        const u = await getUser(memberId);
        // matchesPlayed и winsInRow могут отсутствовать в старых записях, поэтому приводим к числу
        u.matchesPlayed = Number(u.matchesPlayed || 0) + 1;
        if (result === 'win') {
          u.winsInRow = Number(u.winsInRow || 0) + 1;
        } else {
          u.winsInRow = 0;
        }
        // Готовим флаги достижений, инициализируя при необходимости
        if (!u.achievements || typeof u.achievements !== 'object') {
          u.achievements = { ninePlayed: false, twelvePlayed: false, fourWinsStreak: false };
        }
        // Проверяем достижения и начисляем дополнительные XP
        // 9 сыгранных туров → +200 XP (разовый бонус)
        if (!u.achievements.ninePlayed && u.matchesPlayed >= 9) {
          const resAch = await addXP(memberId, 200, 'achievementNine');
          totalXp += resAch.xpGained;
          u.achievements.ninePlayed = true;
          await checkLevelMilestone(resAch.oldLevel, resAch.newLevel, { id: memberId, tag: String(memberId) }, interaction.guild);
        }
        // 12 сыгранных туров → +500 XP (разовый бонус)
        if (!u.achievements.twelvePlayed && u.matchesPlayed >= 12) {
          const resAch = await addXP(memberId, 500, 'achievementTwelve');
          totalXp += resAch.xpGained;
          u.achievements.twelvePlayed = true;
          await checkLevelMilestone(resAch.oldLevel, resAch.newLevel, { id: memberId, tag: String(memberId) }, interaction.guild);
        }
        // 4 побед подряд → +200 XP (разовый бонус)
        if (!u.achievements.fourWinsStreak && u.winsInRow >= 4) {
          const resAch = await addXP(memberId, 200, 'achievementFourWins');
          totalXp += resAch.xpGained;
          u.achievements.fourWinsStreak = true;
          await checkLevelMilestone(resAch.oldLevel, resAch.newLevel, { id: memberId, tag: String(memberId) }, interaction.guild);
        }
        await setUser(memberId, u);
        const tag = await fetchTagSafe(interaction.client, memberId);
        memberXPList.push({ id: memberId, tag, gainedXp: gained, xpBase: base, multiplier });
      }
      // Очищаем записи DD-ставок для команды
      clearBetsForTeam(name);
      // Записываем факт результата для команды и сохраняем его в историю
      addTeamResult(name, team.members, result);
      // Удаляем команду из списка активных (если требуется)
      deleteTeam(name);

      // Формируем сводку ставок участников (для DD). Награды за DD описываем как множитель.
      let betsSummary = '';
      if (Object.keys(ddMultiplierMap).length) {
        const items = await Promise.all(Object.entries(ddMultiplierMap).map(async ([uid, mult]) => {
          const tag = await fetchTagSafe(interaction.client, uid);
          const usedTokens = mult - 1;
          return `• ${tag}: использовано ${usedTokens} жет. (множитель ×${mult})`;
        }));
        betsSummary = items.join('\n');
      }

      await logAction('teamResult', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name,
        result,
        affected: predictionsCount,
        totalXp,
        membersXPList: memberXPList,
        betsSummary
      });

      return replyPriv(interaction, { content: `📊 Результат для **${name}**: **${result}**. Обработано ставок: ${predictionsCount}. Начислено XP (с учётом премиум‑бонусов): ${totalXp}.` });
    }
  },

  ddcupresult: {
    adminOnly: true,
    async run(interaction) {
      try {
        const team1 = interaction.options.getString('team1', true).trim();
        const team2 = interaction.options.getString('team2', true).trim();
        const result = interaction.options.getString('result', true); // team1 | team2 | draw
        const { getSettings } = require('../database/settingsManager');
        const settings = await getSettings(interaction.guild.id);
        if (!settings.cupEnabled) return replyPriv(interaction, { content: '❌ CUP сейчас закрыт.' });
        const cupTeams = Array.isArray(settings.cupTeams) ? settings.cupTeams : [];
        if (!cupTeams.includes(team1) || !cupTeams.includes(team2)) return replyPriv(interaction, { content: '❌ Одна или обе команды не в списке CUP. Установите команды через /ddcupsetteams.' });
        if (team1 === team2) return replyPriv(interaction, { content: '❌ Нельзя указать одинаковые команды.' });

        const { getCupPredictionsForMatch, clearCupPredictionsForMatch } = require('../utils/cupManager');
        const { addXP } = require('../database/userManager');
        const { checkLevelMilestone } = require('../utils/xpUtils');
        const { readJSON } = require('../utils/storage');

        // Формируем matchKey в том же виде, что и при ставке (sorted by name)
        const sorted = [team1, team2].sort((a, b) => a.localeCompare(b));
        const matchKey = `${sorted[0]}_${sorted[1]}`;

        // Определяем фактический исход относительно sorted
        let actualOutcome;
        if (result === 'draw') actualOutcome = 'draw';
        else if (result === 'team1') actualOutcome = (team1 === sorted[0]) ? 'team1' : 'team2';
        else if (result === 'team2') actualOutcome = (team2 === sorted[0]) ? 'team1' : 'team2';

        const preds = getCupPredictionsForMatch(interaction.guild.id, matchKey);
        let awarded = 0;
        const CUP_XP = { 1: 100, 2: 120, 3: 150 };
        const roundId = Number(settings.cupRound || 0);
        const xpForCorrect = CUP_XP[roundId] || 100;
        // Проверка: не был ли уже зафиксирован результат для этой пары
        const cupResults = Array.isArray(settings.cupResults) ? settings.cupResults : [];
        if (cupResults.includes(matchKey)) {
          return replyPriv(interaction, { content: '❌ Результат для этого матча CUP уже был зафиксирован ранее.' });
        }
        for (const pr of preds) {
          if (pr.prediction === actualOutcome) {
            const res = await addXP(pr.userId, xpForCorrect, 'cup');
            awarded += res.xpGained || 0;
            const tag = `<@${pr.userId}>`;
            await checkLevelMilestone(res.oldLevel, res.newLevel, { id: pr.userId, tag }, interaction.guild);
            // Логирование индивидуальной выплаты
            await logAction('cupPayout', interaction.guild, { user: { id: pr.userId, tag }, match: matchKey, xp: res.xpGained, round: roundId });
          }
        }
        // Очистим прогнозы для матча
        clearCupPredictionsForMatch(interaction.guild.id, matchKey);
        // Отметим матч как обработанный, чтобы повторно нельзя было выставить результат
        try {
          const cupResultsNew = Array.isArray(settings.cupResults) ? settings.cupResults.slice() : [];
          cupResultsNew.push(matchKey);
          await patchSettings(interaction.guild.id, { cupResults: cupResultsNew });
        } catch (e) {
          console.error('[ddcupresult] failed to record cupResults', e);
        }
        await logAction('ddcupResult', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, match: matchKey, result, awarded, round: roundId });
        return replyPriv(interaction, { content: `✅ Результат зафиксирован для **${sorted[0]} vs ${sorted[1]}**. Начислено XP суммарно: ${awarded}.` });
      } catch (e) {
        console.error('[ddcupresult] error', e);
        return replyPriv(interaction, { content: '❌ Ошибка при фиксации результата CUP.' });
      }
    }
  },

  bethistory: {
    adminOnly: true,
    async run(interaction) {
      const target = interaction.options.getUser('user', true);
      const events = getBetHistoryForUser(target.id);
      if (!events || events.length === 0) return replyPriv(interaction, { content: `🕑 У пользователя <@${target.id}> нет истории ставок.` });
      const lines = events.slice(-15).map((e) => {
        const date = new Date(e.ts).toLocaleString();
        if (e.type === 'bet') {
          const members = e.members?.map((m) => `<@${m}>`).join(', ') || '';
          return `🟦 [${date}] Ставка: **${e.team}** — ${e.tokens} жет. Состав: ${members}`;
        } else if (e.type === 'payout') {
          const map = { win: 'победа', loss: 'поражение', draw: 'ничья' };
          return `🟩 [${date}] Выплата: **${e.team}** (${map[e.result] || e.result}) — ${e.tokens} жет. ⇒ +${e.xp} XP`;
        }
        return `ℹ️ [${date}] Неизвестное событие`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x2b6cb0)
        .setTitle(`История ставок — ${target.tag}`)
        .setDescription(lines.join('\n'));
      return replyPriv(interaction, { embeds: [embed] });
    }
  },

  teamhistory: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', false);
      const events = getTeamHistory(name);
      if (!events || events.length === 0) {
        if (name) return replyPriv(interaction, { content: `🕑 У команды **${name}** нет истории.` });
        return replyPriv(interaction, { content: '🕑 Нет истории команд.' });
      }
      const lines = events.slice(-20).map((e) => {
        const date = new Date(e.ts).toLocaleString();
        if (e.type === 'create') {
          const members = e.members?.map((m) => `<@${m}>`).join(', ') || '';
          return `🆕 [${date}] Создана команда **${e.name}**: ${members}`;
        } else if (e.type === 'result') {
          const map = { win: 'победа', loss: 'поражение', draw: 'ничья' };
          const members = e.members?.map((m) => `<@${m}>`).join(', ') || '';
          return `🏁 [${date}] Результат команды **${e.name}**: ${map[e.result] || e.result}. Состав: ${members}`;
        }
        return `ℹ️ [${date}] Неизвестное событие`;
      });

      const title = name ? `История команды — ${name}` : 'История всех команд';
      const embed = new EmbedBuilder().setColor(0x2b6cb0).setTitle(title).setDescription(lines.join('\n'));
      return replyPriv(interaction, { embeds: [embed] });
    }
  }
};

// Экспорт команд (ничего лишнего не выполняет)
module.exports = {
  code: { run: handlers.code.run },
  usedd: { run: handlers.usedd.run },
  predict: { run: handlers.predict.run },
  bp: { run: handlers.bp.run, adminOnly: false },
  infop: { run: handlers.infop.run, adminOnly: false },

  bpstat: { run: handlers.bpstat.run, adminOnly: true },
  setcode: { run: handlers.setcode.run, adminOnly: true },

  xp: { run: handlers.xp.run, adminOnly: true },
  xpset: { run: handlers.xpset.run, adminOnly: true },
  xpinvite: { run: handlers.xpinvite.run, adminOnly: true },

  gpset: { run: handlers.gpset.run, adminOnly: true },
  ddset: { run: handlers.ddset.run, adminOnly: true },
  invset: { run: handlers.invset.run, adminOnly: true },
  cpset: { run: handlers.cpset.run, adminOnly: true },

  bpreapply: { run: handlers.bpreapply.run, adminOnly: true },
  userreset: { run: handlers.userreset.run, adminOnly: true },
  dbreset:   { run: handlers.dbreset.run,   adminOnly: true },

  // команды резервного копирования и восстановления
  backup:    { run: handlers.backup.run,    adminOnly: true },
  restore:   { run: handlers.restore.run,   adminOnly: true },

  ddstart: { run: handlers.ddstart.run, adminOnly: true },
  ddstop:  { run: handlers.ddstop.run,  adminOnly: true },
  ddcup1:  { run: handlers.ddcup1.run,  adminOnly: true },
  ddcup2:  { run: handlers.ddcup2.run,  adminOnly: true },
  ddcup3:  { run: handlers.ddcup3.run,  adminOnly: true },
  ddcupstop:{ run: handlers.ddcupstop.run, adminOnly: true },
  ddcupsetteams: { run: handlers.ddcupsetteams.run, adminOnly: true },
  cup:    { run: handlers.cup.run, adminOnly: false },
  setlog:  { run: handlers.setlog.run,  adminOnly: true },

  teamcreate: { run: handlers.teamcreate.run, adminOnly: true },
  teamchange: { run: handlers.teamchange.run, adminOnly: true },
  teamdelete: { run: handlers.teamdelete.run, adminOnly: true },
  teamresult: { run: handlers.teamresult.run, adminOnly: true },
  ddcupresult: { run: handlers.ddcupresult.run, adminOnly: true },
  bethistory: { run: handlers.bethistory.run, adminOnly: true },
  teamhistory:{ run: handlers.teamhistory.run, adminOnly: true }
  ,
  // Включение/выключение премиума и список премиум‑пользователей
  premiumon:  { run: handlers.premiumon.run,  adminOnly: true },
  premiumoff: { run: handlers.premiumoff.run, adminOnly: true },
  usersprem:  { run: handlers.usersprem.run,  adminOnly: true }
};
