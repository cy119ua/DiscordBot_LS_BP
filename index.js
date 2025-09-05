// index.js — замените целиком

require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const Database = require('@replit/database');
const config = require('./config');

// Права: стараемся использовать whitelist, но безопасный фолбэк на isAdmin
const permissions = require('./utils/permissions');
const isAllowed = async (member) => {
  if (permissions && typeof permissions.isWhitelisted === 'function') {
    return permissions.isWhitelisted(member);
  }
  if (permissions && typeof permissions.isAdmin === 'function') {
    return permissions.isAdmin(member);
  }
  // крайний случай — просто проверка «админ»
  return member?.permissions?.has?.('Administrator') || false;
};

// Модули с командами (могут экспортировать и служебные вещи вроде onButton)
const battlepassModule = require('./commands/battlepass');
const adminModule = require('./commands/admin');
const userModule = require('./commands/user');

// Инициализация Discord клиента
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Инициализация БД (Replit)
const db = new Database();
global.db = db;

// Собираем команды только из экспортов, где есть execute (и имя)
function collectCommands(...modules) {
  const map = new Collection();
  for (const mod of modules) {
    for (const [exportName, value] of Object.entries(mod)) {
      if (value && typeof value.execute === 'function') {
        // Пытаемся определить имя команды
        const name =
          (typeof value.name === 'string' && value.name) ||
          (typeof exportName === 'string' && exportName) ||
          null;
        if (name) {
          map.set(name.toLowerCase(), value);
        }
      }
    }
  }
  return map;
}

const commands = collectCommands(battlepassModule, adminModule, userModule);

// Отладочная печать
console.log('✅ Загружены команды:', [...commands.keys()].join(', ') || '(пусто)');

// Готовность бота
client.once(Events.ClientReady, async () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log('🔗 Bot is ready and connected to Discord!');

  // Если у тебя осталась логика инициализации каких-то глобальных ключей в БД — можешь оставить здесь.
  // Пример ниже больше не обязателен после перехода на settingsManager (ddEnabled хранится на гильдию).
  try {
    const globalData = (await db.get('global')) || {};
    if (typeof globalData.doubleStake === 'undefined') {
      globalData.doubleStake = false;
      await db.set('global', globalData);
    }
    console.log('📊 Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
});

// Обработка префикс-команд
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = (args.shift() || '').toLowerCase();
    const command = commands.get(commandName);
    if (!command) return;

    // Проверка прав для adminOnly
    if (command.adminOnly) {
      const ok = await isAllowed(message.member);
      if (!ok) {
        return message.reply('⛔ Недостаточно прав (whitelist/admin).');
      }
    }

    await command.execute(message, args, client);
  } catch (error) {
    console.error('Command execution error:', error);
    if (message && message.reply) {
      message.reply('❌ Ошибка при выполнении команды.');
    }
  }
});

// Обработка кнопок (interactionCreate)
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      // Кнопки Боевого Пропуска
      if (interaction.customId.startsWith('bp_page_')) {
        const { onButton } = require('./commands/battlepass');
        return onButton(interaction, client);
      }
      // ... здесь можно добавить обработчики других кнопок в будущем
    }
  } catch (error) {
    console.error('Button interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Ошибка при обработке взаимодействия.',
        ephemeral: true
      });
    }
  }
});

// Общая обработка ошибок
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

// Логин
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Переменная окружения DISCORD_TOKEN обязательна');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Не удалось войти в Discord:', error);
  process.exit(1);
});
