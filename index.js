require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const Database = require('@replit/database');
const config = require('./config');

// Permissions: use whitelist if available, fall back to admin
const permissions = require('./utils/permissions');
const isAllowed = async (member) => {
  if (permissions && typeof permissions.isWhitelisted === 'function') {
    try { return await permissions.isWhitelisted(member); } catch { /* ignore */ }
  }
  if (member?.permissions?.has?.('Administrator')) return true;
  return false;
};

// Load command modules
const battlepassModule = require('./commands/battlepass');
const adminModule = require('./commands/admin');
const userModule = require('./commands/user');

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// DB init
const db = new Database();
global.db = db;

// Collect commands from modules (only exports that have execute)
function collectCommands(...modules) {
  const map = new Collection();
  for (const mod of modules) {
    for (const [exportName, value] of Object.entries(mod)) {
      if (value && typeof value.execute === 'function') {
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

console.log('✅ Загружены команды:', [...commands.keys()].join(', ') || '(пусто)');

client.once(Events.ClientReady, async () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log('🔗 Bot is ready and connected to Discord!');
  try {
    console.log('📊 Database available');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
});

// Prefix message commands
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = (args.shift() || '').toLowerCase();
    const command = commands.get(commandName);
    if (!command) return;

    if (command.adminOnly) {
      const ok = await isAllowed(message.member);
      if (!ok) return message.reply('⛔ Недостаточно прав (whitelist/admin).');
    }

    await command.execute(message, args, client);
  } catch (error) {
    console.error('Command execution error:', error);
    if (message && message.reply) {
      message.reply('❌ Ошибка при выполнении команды.');
    }
  }
});

// Button interactions
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      // Battle pass page buttons
      if (interaction.customId.startsWith('bp_page_')) {
        const { onButton } = require('./commands/battlepass');
        return onButton(interaction, client);
      }
      // other buttons can be handled here
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

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Переменная окружения DISCORD_TOKEN обязательна');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Не удалось войти в Discord:', error);
  process.exit(1);
});
