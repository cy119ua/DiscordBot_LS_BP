const { Client, GatewayIntentBits, Collection, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('@replit/database');
const config = require('./config');
const { isAdmin } = require('./utils/permissions');
const { findOrCreateLogChannel, logAction } = require('./utils/logger');
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

// Load commands
Object.assign(commands, battlepassCommands, adminCommands, userCommands);

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
    // Debug logging
    console.log(`📨 Message received: "${message.content}" from ${message.author.username}`);
    
    // Ignore bot messages
    if (message.author.bot) {
        console.log(`🤖 Ignoring bot message`);
        return;
    }
    
    // Check if message starts with prefix
    if (!message.content.startsWith(config.prefix)) {
        console.log(`❌ Message doesn't start with prefix "${config.prefix}"`);
        return;
    }
    
    console.log(`✅ Valid command detected`);
    
    // Parse command and arguments
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    console.log(`🔍 Looking for command: "${commandName}"`);
    console.log(`📋 Available commands: ${Array.from(commands.keys()).join(', ')}`);
    
    // Get command
    const command = commands.get(commandName);
    if (!command) {
        console.log(`❌ Command "${commandName}" not found`);
        return;
    }
    
    console.log(`✅ Executing command: "${commandName}"`);
    
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

// Button interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    
    try {
        // Handle battle pass navigation
        if (interaction.customId.startsWith('bp_page_')) {
            const { handleBattlePassInteraction } = require('./utils/battlepassUtils');
            await handleBattlePassInteraction(interaction);
        }
    } catch (error) {
        console.error('Button interaction error:', error);
        if (!interaction.replied) {
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
const token = process.env.DISCORD_TOKEN || 'your_bot_token_here';
client.login(token).catch(error => {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
});
