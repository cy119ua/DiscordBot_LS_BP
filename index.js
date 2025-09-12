require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
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
    GatewayIntentBits.GuildMessages,  // пригодится для лог-канала/каналов
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('✅ Slash commands:', Object.keys(slashHandlers).join(', ') || '(none)');
});

// Обработка интеракций: slash + кнопки
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Обработка выпадающих списков (StringSelectMenu) для пользовательских команд
    if (interaction.isStringSelectMenu()) {
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
          // Проверяем существование команды
          const team = getTeam(selectedTeam);
          if (!team) {
            const names = Object.keys(getAllTeams());
            const available = names.length ? names.map((n) => `**${n}**`).join(', ') : 'нет';
            return interaction.update({ content: `❌ Команда **${selectedTeam}** не найдена. Доступные: ${available}.`, components: [] });
          }
          // Проверяем баланс жетонов
          const userRecord = await getUser(userId);
          const before = Number(userRecord.doubleTokens || 0);
          if (before < tokens) {
            return interaction.update({ content: `❌ Недостаточно жетонов: есть ${before}, требуется ${tokens}.`, components: [] });
          }
          // Списываем жетоны
          userRecord.doubleTokens = before - tokens;
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
          });
          // Обновляем сообщение, убирая меню
          return interaction.update({ content: `✅ Ставка принята: ${tokens} жетон(ов) на команду **${selectedTeam}**. Осталось жетонов: ${userRecord.doubleTokens}.`, components: [] });
        } catch (e) {
          console.error('usedd select error:', e);
          return interaction.update({ content: '❌ Ошибка при обработке выбора команды.', components: [] });
        }
      }
      // Если это другой select-меню, игнорируем, другие типы меню пока не используются
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
      const allowed = await isWhitelisted(interaction.member);
      if (!allowed) {
        return interaction.reply({ content: '⛔ Недостаточно прав.', ephemeral: true });
      }
    }

    await handler.run(interaction, client);
  } catch (e) {
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
