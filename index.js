require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const Database = require('@replit/database');

// === БД инициализируем ДО любых require модулей ===
const db = new Database();
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
    // Кнопки страниц БП
    if (interaction.isButton() && interaction.customId.startsWith('bp_page_')) {
      return battlepass.onButton(interaction, client);
    }

    // Slash-команды
    if (!interaction.isChatInputCommand()) return;

    const handler = slashHandlers[interaction.commandName];
    if (!handler) return;

    // Проверка прав для админ-команд
    if (handler.adminOnly) {
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
