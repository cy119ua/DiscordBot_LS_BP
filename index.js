require('dotenv').config();

const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
// Менеджер резервного копирования.  Используется для планового создания
// ежедневных снимков базы данных.  Функция scheduleDailyBackup() будет
// вызвана после успешного подключения клиента.
const { scheduleDailyBackup, backupDb } = require('./utils/backupManager');
const config = require('./config'); // для доступа к adminUsers
// Заменяем @replit/database на локальную реализацию базы данных
// utils/db.js предоставляет класс Client, совместимый по API, сохраняющий
// данные в файл db.json в папке data. Это упрощает локальный запуск без Replit.
const { Client: DBClient } = require('./utils/db');

// === БД инициализируем ДО любых require модулей ===
const db = new DBClient();
global.db = db;

// Права (whitelist → фолбэк на администратора)
const { isWhitelisted } = require('./utils/permissions');

// Подключаем только то, что нужно для slash
const slashHandlers = require('./slash/handlers');
const battlepass = require('./commands/battlepass'); // для обработчика кнопок страниц

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,         // slash-команды и кнопки
    GatewayIntentBits.GuildMessages,  // лог‑каналы
    GatewayIntentBits.GuildMembers    // необходим для управления ролями
  ],
});

/**
 * Гарантирует наличие роли для whitelisted‑пользователей и выдаёт её. Роль
 * имеет флаг Administrator, что позволяет whitelisted‑пользователям видеть
 * скрытые slash‑команды (с default_member_permissions: '0'). Сама проверка
 * доступа осуществляется в isWhitelisted(), поэтому другие администраторы
 * сервера смогут увидеть команды, но не смогут их выполнить.
 *
 * @param {import('discord.js').Guild} guild
 */
async function ensureWhitelistAdminRole(guild) {
  const roleName = 'LSBP Admin (auto)';
  const me = guild.members.me;
  // Проверяем, что у бота достаточно прав для управления ролями
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Bot lacks Manage Roles permission');
  }
  // Ищем существующую роль
  let role = guild.roles.cache.find((r) => r.name === roleName);
  if (!role) {
    // Создаём роль с правом Administrator, если у бота это право есть
    const perms = me.permissions.has(PermissionFlagsBits.Administrator)
      ? [PermissionFlagsBits.Administrator]
      : [];
    role = await guild.roles.create({
      name: roleName,
      permissions: perms,
      reason: 'Role for whitelisted admins',
    });
  } else {
    // Обновляем права роли: добавляем Administrator, если бот его имеет
    if (
      me.permissions.has(PermissionFlagsBits.Administrator) &&
      !role.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      await role.setPermissions([PermissionFlagsBits.Administrator]);
    }
  }
  // Располагаем роль прямо под самой высокой ролью бота
  const topBotRole = me.roles.highest;
  if (topBotRole && role.position >= topBotRole.position) {
    await role.setPosition(topBotRole.position - 1);
  }
  // Выдаём роль всем whitelisted‑пользователям
  const ids = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  for (const id of ids) {
    const member = await guild.members.fetch(id).catch(() => null);
    if (!member) continue;
    // Бот может управлять пользователем только если его высшая роль ниже роли бота
    const canManage = me.roles.highest.comparePositionTo(member.roles.highest) > 0;
    if (canManage && !member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Grant whitelisted admin role');
    }
  }
  // Убираем роль у тех, кто вышел из whitelist
  for (const [, member] of role.members) {
    if (!ids.includes(member.id)) {
      const canManage = me.roles.highest.comparePositionTo(member.roles.highest) > 0;
      if (canManage) {
        await member.roles.remove(role, 'Remove whitelisted admin role');
      }
    }
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('✅ Slash commands:', Object.keys(slashHandlers).join(', ') || '(none)');
  /*
   * Ранее бот создавал и выдавал специальную роль с правом Administrator для
   * пользователей из whitelist, чтобы они могли видеть скрытые slash‑команды.
   * По новым требованиям нельзя управлять ролями Discord или выдавать права
   * автоматически. Поэтому роль больше не создаётся и не назначается.
   *
   * Администраторские команды теперь видны всем (см. register.js),
   * а реальная проверка доступа выполняется в isWhitelisted().
   */

  // Запускаем ежедневное создание бэкапов через scheduleDailyBackup.
  try {
    scheduleDailyBackup();
  } catch (e) {
    console.error('[index] Failed to schedule daily backups:', e);
  }
});

// Обработка интеракций: slash + кнопки
client.on(Events.InteractionCreate, async (interaction) => {
  // Кнопка "топ-20" — показать топ 20 игроков по XP
  if (interaction.isButton() && interaction.customId === 'top_20_xp') {
    const db = global.db;
    const { calculateLevel } = require('./database/userManager');
    // Получаем всех пользователей через list('user_')
    const usersObj = await db.list('user_');
    const users = Object.values(usersObj)
      .filter(u => u.id && typeof u.xp === 'number')
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 20);
    let text = users.map((u, i) => {
      const star = u.premium ? '⭐ ' : '';
      const lvl = calculateLevel(u.xp || 0);
      return `${i+1}. ${star}<@${u.id}> — ${u.xp} XP — уровень ${lvl}`;
    }).join('\n');
    try {
      await interaction.reply({ content: `🏆 Топ 20 игроков по XP:\n${text}`, ephemeral: true });
    } catch (e) {
      const code = e?.code || e?.rawError?.code;
      if (code === 10062) return; // Unknown interaction — игнорируем
      throw e;
    }
    return;
  }
  try {
    // Обработка выпадающих списков (StringSelectMenu) для пользовательских команд
        if (interaction.isStringSelectMenu()) {
      // Логирование select-меню для диагностики (показывает customId и пользователя)
      try { console.log(`[select] customId=${interaction.customId} user=${interaction.user.tag}(${interaction.user.id}) values=${JSON.stringify(interaction.values)}`); } catch {}
      const customId = interaction.customId;
      // Форма customId: usedd_team_select:<userId>:<tokens>
      if (customId.startsWith('usedd_team_select:')) {
        const parts = customId.split(':');
        const userId = parts[1];
        const tokensStr = parts[2];
        const tokens = Number(tokensStr);
        const selectedTeam = interaction.values[0];

        // Только сам пользователь может подтвердить свой выбор
        if (interaction.user.id !== userId) {
          return interaction.reply({ content: '❌ Это меню не для вас.', ephemeral: true });
        }

        try {
          // Импортируем необходимые менеджеры локально, чтобы избежать циклов
          const { getSettings } = require('./database/settingsManager');
          const { getTeam, getAllTeams } = require('./utils/teamManager');
          const { getUser, setUser } = require('./database/userManager');
          const { addBet } = require('./utils/betManager');
          const { addBetHistory } = require('./utils/historyManager');
          const { logAction } = require('./utils/logger');

          // Проверяем включено ли окно DD
          const settings = await getSettings(interaction.guild.id);
          if (!settings.ddEnabled) {
            return interaction.update({ content: '❌ Double-Down сейчас недоступен.', components: [] });
          }
          const windowId = settings.ddWindowId || 0;

          // Проверяем существование команды
          const team = getTeam(selectedTeam);
          if (!team) {
            const names = Object.keys(getAllTeams());
            const available = names.length ? names.map((n) => `**${n}**`).join(', ') : 'нет';
            return interaction.update({ content: `❌ Команда **${selectedTeam}** не найдена. Доступные: ${available}.`, components: [] });
          }

          // Загружаем пользователя
          const userRecord = await getUser(userId);
          const balance = Number(userRecord.doubleTokens || 0);
          if (balance < tokens) {
            return interaction.update({ content: `❌ Недостаточно жетонов: есть ${balance}, требуется ${tokens}.`, components: [] });
          }

          // Сброс окна, если ID изменился
          if (!userRecord.ddWindow || userRecord.ddWindow.id !== windowId) {
            userRecord.ddWindow = { id: windowId, usedTokens: 0, betTeam: null };
          }

          // Лимит 2 жетона за окно (одно применение на 2 жетона или два применения по 1)
          const used = Number(userRecord.ddWindow.usedTokens || 0);
          if (used + tokens > 2) {
            const remain = Math.max(0, 2 - used);
            return interaction.update({ content: `❌ Лимит жетонов на окно — 2. Доступно: ${remain}.`, components: [] });
          }

          // Привязка к одной команде в текущем окне
          if (userRecord.ddWindow.betTeam && userRecord.ddWindow.betTeam !== selectedTeam) {
            return interaction.update({ content: `❌ В этом окне уже была ставка на **${userRecord.ddWindow.betTeam}**. Ставка может быть только на одну команду.`, components: [] });
          }

          // Списываем жетоны и фиксируем использование в текущем окне
          const before = balance;
          userRecord.doubleTokens = before - tokens;
          userRecord.ddWindow.usedTokens = used + tokens;
          if (!userRecord.ddWindow.betTeam) userRecord.ddWindow.betTeam = selectedTeam;
          await setUser(userId, userRecord);

          // Сохраняем ставку и историю
          await addBet(userId, selectedTeam, tokens);
          addBetHistory({ type: 'bet', userId, team: selectedTeam, tokens, members: team.members, xp: 0 });

          // Логирование
          await logAction('doubleStake', interaction.guild, {
            user: { id: userId, tag: interaction.user.tag },
            tokens,
            team: selectedTeam,
            beforeTokens: before,
            afterTokens: userRecord.doubleTokens,
            windowId,
            usedInWindow: userRecord.ddWindow.usedTokens
          });

          // Ответ пользователю
          return interaction.update({
            content: `✅ Ставка принята на **${selectedTeam}**: ${tokens} жетон(а). Осталось жетонов: ${userRecord.doubleTokens}. (Окно #${windowId}: ${userRecord.ddWindow.usedTokens}/2)`,
            components: []
          });
        } catch (e) {
          console.error('usedd select error:', e);
          return interaction.update({ content: '❌ Ошибка при обработке выбора команды.', components: [] });
        }
      }
      // Обработка выбора матча для прогноза
      if (customId.startsWith('predict_match_select:')) {
        // customId: predict_match_select:<userId>
        const parts = customId.split(':');
        const userId = parts[1];
        const selectedMatch = interaction.values[0];
        // Только пользователь, вызвавший меню, может продолжить
        if (interaction.user.id !== userId) {
          return interaction.reply({ content: '❌ Это меню не для вас.',
                                     ephemeral: true });
        }
        try {
          const { getSettings } = require('./database/settingsManager');
          const { getTeam } = require('./utils/teamManager');
          const { getPredictionsForUser } = require('./utils/predictionManager');
          const settings = await getSettings(interaction.guild.id);
          if (!settings.ddEnabled) {
            return interaction.update({ content: '❌ Прогнозы сейчас недоступны.', components: [] });
          }
          // Разбираем выбранный матч
          const [team1, team2] = selectedMatch.split('_');
        // Вычисляем номер текущего окна Double‑Down
        const ddWindowId = settings.ddWindowId || 0;
        // Смотрим, есть ли у пользователя уже прогноз в этом окне
        const userPreds = getPredictionsForUser(String(userId));
        if (userPreds.find((p) => p.ddWindowId === ddWindowId)) {
          return interaction.update({ content: '❌ Вы уже сделали прогноз в этом окне Double-Down. Дождитесь следующего /ddstart.', components: [] });
        }
        // Проверяем, что пользователь ещё не делал прогноз на этот матч
        const existing = userPreds.find((p) => p.matchKey === selectedMatch);
        if (existing) {
          return interaction.update({ content: '❌ Вы уже сделали прогноз на этот матч.', components: [] });
        }
          // Убеждаемся, что обе команды существуют
          const t1 = getTeam(team1);
          const t2 = getTeam(team2);
          if (!t1 || !t2) {
            return interaction.update({ content: '❌ Одна или обе команды не найдены.', components: [] });
          }
          // Строим меню выбора исхода
          const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
          const resultSelect = new StringSelectMenuBuilder()
            .setCustomId(`predict_result_select:${userId}:${selectedMatch}`)
            .setPlaceholder('Выберите исход матча')
            .addOptions([
              { label: `Победа ${team1}`, value: 'team1' },
              { label: 'Ничья', value: 'draw' },
              { label: `Победа ${team2}`, value: 'team2' }
            ]);
          const resultRow = new ActionRowBuilder().addComponents(resultSelect);
          return interaction.update({ content: `Матч **${team1}** vs **${team2}**. Выберите исход:`, components: [resultRow] });
        } catch (e) {
          console.error('predict match select error:', e);
          return interaction.update({ content: '❌ Ошибка при обработке прогноза.', components: [] });
        }
      }
      // Обработка выбора матча для CUP
      if (customId.startsWith('cup_match_select:')) {
        const parts = customId.split(':');
        const userId = parts[1];
        const selectedMatch = interaction.values[0];
        if (interaction.user.id !== userId) {
          return interaction.reply({ content: '❌ Это меню не для вас.', ephemeral: true });
        }
        try {
          const { getSettings } = require('./database/settingsManager');
          const settings = await getSettings(interaction.guild.id);
          if (!settings.cupEnabled) {
            return interaction.update({ content: '❌ CUP сейчас недоступен.', components: [] });
          }
          // Формируем выбор исхода
          const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
          const [team1, team2] = selectedMatch.split('_');
          const resultSelect = new StringSelectMenuBuilder()
            .setCustomId(`cup_result_select:${userId}:${selectedMatch}`)
            .setPlaceholder('Выберите исход матча')
            .addOptions([
              { label: `Победа ${team1}`, value: 'team1' },
              { label: 'Ничья', value: 'draw' },
              { label: `Победа ${team2}`, value: 'team2' }
            ]);
          const resultRow = new ActionRowBuilder().addComponents(resultSelect);
          return interaction.update({ content: `Матч **${team1}** vs **${team2}** (CUP). Выберите исход:`, components: [resultRow] });
        } catch (e) {
          console.error('cup match select error:', e);
          return interaction.update({ content: '❌ Ошибка при обработке выбора матча CUP.', components: [] });
        }
      }
      // Обработка выбора исхода прогноза
      if (customId.startsWith('predict_result_select:')) {
        // customId: predict_result_select:<userId>:<matchKey>
        const parts = customId.split(':');
        const userId = parts[1];
        // matchKey может содержать символ '_', поэтому берем оставшуюся часть
        const matchKey = parts.slice(2).join(':');
        const resultVal = interaction.values[0];
        if (interaction.user.id !== userId) {
          return interaction.reply({ content: '❌ Это меню не для вас.',
                                     ephemeral: true });
        }
        try {
          const { getSettings } = require('./database/settingsManager');
          const { getTeam } = require('./utils/teamManager');
          const { addPrediction, getPredictionsForUser } = require('./utils/predictionManager');
          const { logAction } = require('./utils/logger');
          const settings = await getSettings(interaction.guild.id);
          if (!settings.ddEnabled) {
            return interaction.update({ content: '❌ Прогнозы сейчас недоступны.', components: [] });
          }
          const [team1, team2] = matchKey.split('_');
          const t1 = getTeam(team1);
          const t2 = getTeam(team2);
          if (!t1 || !t2) {
            return interaction.update({ content: '❌ Одна или обе команды не найдены.', components: [] });
          }
        // Вычисляем номер текущего окна Double‑Down
        const ddWindowId = settings.ddWindowId || 0;
        // Смотрим, есть ли у пользователя уже прогноз в этом окне
        const userPreds = getPredictionsForUser(String(userId));
        if (userPreds.find((p) => p.ddWindowId === ddWindowId)) {
          return interaction.update({ content: '❌ Вы уже сделали прогноз в этом окне Double-Down. Дождитесь следующего /ddstart.', components: [] });
        }
        // Проверяем дублирование для выбранного матча
        const existing = userPreds.find((p) => p.matchKey === matchKey);
        if (existing) {
          return interaction.update({ content: '❌ Вы уже сделали прогноз на этот матч.', components: [] });
        }
        // Сохраняем прогноз с учётом номера окна Double‑Down
        addPrediction(userId, matchKey, resultVal, ddWindowId);
          // Логирование с подробностями
          await logAction('predictionAdd', interaction.guild, {
            user: { id: userId, tag: interaction.user.tag },
            match: matchKey,
            teams: [team1, team2],
            prediction: resultVal
          });
          // Формируем описание исхода
          const outcomeDesc = resultVal === 'team1'
            ? `победа ${team1}`
            : resultVal === 'team2'
              ? `победа ${team2}`
              : 'ничья';
          return interaction.update({ content: `✅ Ваш прогноз принят: матч **${team1}** vs **${team2}**, исход **${outcomeDesc}**.`, components: [] });
        } catch (e) {
          console.error('predict result select error:', e);
          return interaction.update({ content: '❌ Ошибка при обработке прогноза.', components: [] });
        }
      }
      // Обработка выбора исхода для CUP
      if (customId.startsWith('cup_result_select:')) {
        const parts = customId.split(':');
        const userId = parts[1];
        const matchKey = parts.slice(2).join(':');
        const resultVal = interaction.values[0];
        if (interaction.user.id !== userId) {
          return interaction.reply({ content: '❌ Это меню не для вас.', ephemeral: true });
        }
        try {
          const { getSettings } = require('./database/settingsManager');
          const settings = await getSettings(interaction.guild.id);
          if (!settings.cupEnabled) {
            try { await interaction.update({ content: '❌ CUP сейчас недоступен.', components: [] }); } catch { await interaction.reply({ content: '❌ CUP сейчас недоступен.', ephemeral: true }); }
            return;
          }
          const { addCupPrediction, getCupPredictionsForUser } = require('./utils/cupManager');
          const { logAction } = require('./utils/logger');
          const round = settings.cupRound || 0;
          // Проверяем, есть ли уже прогноз этого пользователя в раунде
          const userPreds = getCupPredictionsForUser(interaction.guild.id, userId) || [];
          if (userPreds.find(p => p.roundId === round)) {
            try { await interaction.update({ content: '❌ Вы уже сделали прогноз в этом раунде CUP.', components: [] }); } catch { await interaction.reply({ content: '❌ Вы уже сделали прогноз в этом раунде CUP.', ephemeral: true }); }
            return;
          }
          // Проверяем, не дублирует ли пользователь прогноз на этот матч
          if (userPreds.find(p => p.matchKey === matchKey)) {
            try { await interaction.update({ content: '❌ Вы уже сделали прогноз на этот матч в CUP.', components: [] }); } catch { await interaction.reply({ content: '❌ Вы уже сделали прогноз на этот матч в CUP.', ephemeral: true }); }
            return;
          }
          const ok = addCupPrediction(interaction.guild.id, userId, matchKey, resultVal, round);
          if (!ok) {
            throw new Error('addCupPrediction returned falsy');
          }
          await logAction('cupPredictionAdd', interaction.guild, { user: { id: userId, tag: interaction.user.tag }, match: matchKey, prediction: resultVal, round });
          const [team1, team2] = matchKey.split('_');
          const outcomeDesc = resultVal === 'team1' ? `победа ${team1}` : resultVal === 'team2' ? `победа ${team2}` : 'ничья';
          try {
            await interaction.update({ content: `✅ Ваш прогноз в CUP принят: матч **${team1}** vs **${team2}**, исход **${outcomeDesc}**.`, components: [] });
          } catch (updErr) {
            // Если update не сработал (например, interaction уже обработан), пробуем reply
            try { await interaction.reply({ content: `✅ Ваш прогноз в CUP принят: матч **${team1}** vs **${team2}**, исход **${outcomeDesc}**.`, ephemeral: true }); }
            catch (replyErr) {
              console.error('cup result select: failed to respond to user', updErr, replyErr);
            }
          }
          return;
        } catch (e) {
          console.error('cup result select error:', e && (e.stack || e));
          // Попытка корректно ответить пользователю (update → reply)
          try { await interaction.update({ content: '❌ Ошибка при обработке прогноза CUP. Описание ошибки записано в лог.', components: [] }); }
          catch (err2) {
            try { await interaction.reply({ content: '❌ Ошибка при обработке прогноза CUP. Описание ошибки записано в лог.', ephemeral: true }); }
            catch { /* окончательный silent fail */ }
          }
          return;
        }
      }
      // другие select-меню — игнорируем
    }


    // Обработка автодополнения для параметров типа STRING
    if (interaction.isAutocomplete()) {
      try {
        const focused = interaction.options.getFocused(true);
        if (!focused) return;
        const optionName = focused.name;
        if (optionName === 'team' || optionName === 'name') {
          const { getAllTeams } = require('./utils/teamManager');
          const teams = getAllTeams();
          const names = Object.keys(teams).slice(0, 25);
          return interaction.respond(names.map((n) => ({ name: n, value: n })));
        }
        // Autocomplete for ddcupresult team1/team2 — берем установленные cupTeams из настроек
        if (optionName === 'team1' || optionName === 'team2') {
          try {
            const { getSettings } = require('./database/settingsManager');
            const settings = await getSettings(interaction.guild.id);
            const cupTeams = Array.isArray(settings.cupTeams) ? settings.cupTeams : [];
            const out = cupTeams.slice(0, 25).map((t) => ({ name: t, value: t }));
            return interaction.respond(out);
          } catch (e) {
            console.error('autocomplete ddcupresult error:', e);
            return interaction.respond([]);
          }
        }
        // Автодополнение для выбора участника команды (параметр 'old' в /teamchange).
        if (optionName === 'old') {
          try {
            // Для корректной работы необходимо, чтобы параметр 'name' уже был введён.
            const teamName = interaction.options.getString('name');
            if (!teamName) return interaction.respond([]);
            const { getTeam } = require('./utils/teamManager');
            const team = getTeam(teamName);
            if (!team || !Array.isArray(team.members)) return interaction.respond([]);
            // Формируем список предложений, отображая ник или тег пользователя.  В
            // значении каждого варианта указываем пинг (`<@id>`), чтобы пользователь
            // видел привычный ник вместо числового ID. В хендлере команды ID будет
            // извлечён из этой строки.
            const memberIds = team.members.slice(0, 25).map((uid) => String(uid));
            const suggestions = [];
            for (const uid of memberIds) {
              let display = uid;
              try {
                // Пытаемся получить ник на сервере; если участник отсутствует в кэше,
                // происходит запрос к API Discord. Если ника нет, используем тег.
                const member = await interaction.guild.members.fetch(uid);
                if (member) {
                  display = member.displayName || (member.user && member.user.tag) || uid;
                }
              } catch (fetchErr) {
                try {
                  const user = await interaction.client.users.fetch(uid);
                  display = user.tag || uid;
                } catch {
                  display = uid;
                }
              }
              // Формируем mention, чтобы пользователь видел привычный ник вместо цифрового ID
              const mention = `<@${uid}>`;
              suggestions.push({ name: display, value: mention });
            }
            return interaction.respond(suggestions);
          } catch (err) {
            console.error('autocomplete old error:', err);
            return interaction.respond([]);
          }
        }
      } catch (e) {
        console.error('autocomplete error:', e);
      }
      return;
    }

    // Кнопки страниц БП
    if (interaction.isButton() && interaction.customId.startsWith('bp_page_')) {
      return battlepass.onButton(interaction, client);
    }

    // Slash-команды
    if (!interaction.isChatInputCommand()) return;

    // Логируем факт вызова slash-команды
    try { console.log(`[slash] command=${interaction.commandName} user=${interaction.user.tag}(${interaction.user.id}) guild=${interaction.guild?.id || 'DM'}`); } catch {}

    const handler = slashHandlers[interaction.commandName];
    if (!handler) return;

    /*
     * Проверка прав для админ‑команд.
     *
     * По умолчанию, если команда помечена как `adminOnly` в файле описания,
     * бот проверит, находится ли вызывающий участник в белом списке (роль
     * администратора, whitelisted ID и т. д.). Ранее все команды с
     * `adminOnly` требовали админских прав, что приводило к тому, что
     * обычные пользователи не видели публичных слэш‑команд. Теперь
     * поддерживается список команд, которые должны быть доступны всем
     * пользователям, даже если в их обработчике указан `adminOnly`.
     */
    const publiclyAccessibleCommands = ['bp', 'code', 'usedd'];
    const requiresAdmin = handler.adminOnly && !publiclyAccessibleCommands.includes(interaction.commandName);

    if (requiresAdmin) {
      const allowed = await isWhitelisted(interaction.user);
      if (!allowed) {
        return interaction.reply({ content: '⛔ Недостаточно прав.', ephemeral: true });
      }
    }

    await handler.run(interaction, client);
  } catch (e) {
    // Фильтруем ошибки DiscordAPIError[10062] и [40060] (Unknown interaction, Interaction has already been acknowledged)
    const code = e?.code || e?.rawError?.code;
    if (code === 10062 || code === 40060) {
      // Не выводим эти ошибки в терминал
      return;
    }
    // Все остальные ошибки логируем
    console.error('Interaction error:', e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Ошибка при обработке команды.', ephemeral: true });
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Переменная DISCORD_TOKEN не задана в .env');
  process.exit(1);
}
client.login(token).catch((e) => {
  console.error('❌ Login error:', e);
  process.exit(1);
});
