require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const Database = require('@replit/database');
const config = require('./config');
const { isAdmin } = require('./utils/permissions');
const { handleBattlePassInteraction } = require('./utils/battlepassUtils');
const battlepassCommands = require('./commands/battlepass');
const adminCommands = require('./commands/admin');
const userCommands = require('./commands/user');

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize Replit Database
const db = new Database();

// Store database reference globally
global.db = db;

// Command collections
const commands = new Collection();

// Load commands properly into Collection
const allCommands = { ...battlepassCommands, ...adminCommands, ...userCommands };
for (const [commandName, commandData] of Object.entries(allCommands)) {
    commands.set(commandName, commandData);
}


// Debug: Show loaded commands
console.log('🔧 Loading commands...');
console.log('📦 Battlepass commands:', Object.keys(battlepassCommands));
console.log('⚡ Admin commands:', Object.keys(adminCommands));
console.log('👤 User commands:', Object.keys(userCommands));
console.log('✅ Total commands loaded:', commands.size);

// Bot ready event
client.once(Events.ClientReady, async () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}`);
    console.log(`🔗 Bot is ready and connected to Discord!`);
    
    // Initialize database with default global settings if needed
    try {
        const globalData = await db.get('global') || {};
        if (!globalData.doubleStake) {
            globalData.doubleStake = false;
            await db.set('global', globalData);
        }
        console.log('📊 Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
});

// Message event handler for prefix commands
client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Check if message starts with prefix
    if (!message.content.startsWith(config.prefix)) return;
    
    // Parse command and arguments
    const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    
    // Get command
    const command = commands.get(commandName);
    if (!command) return;
    
    try {
        // Check admin permissions for admin commands
        if (command.adminOnly && !isAdmin(message.member)) {
            return message.reply('❌ You need Administrator permissions to use this command.');
        }
        
        // Execute command
        await command.execute(message, args, client);
    } catch (error) {
        console.error('Command execution error:', error);
        message.reply('❌ There was an error executing this command.');
    }
});

// Button interaction handler for battle pass
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    
    try {
        await handleBattlePassInteraction(interaction, client, global.db);
    } catch (error) {
        console.error('Button interaction error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ There was an error processing your request.', ephemeral: true });
        }
    }
});

// Error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
});

// Login to Discord
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ DISCORD_TOKEN environment variable is required');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
});
