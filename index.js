require('dotenv').config();

const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
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
      const allowed = await isWhitelisted(interaction.user);
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
