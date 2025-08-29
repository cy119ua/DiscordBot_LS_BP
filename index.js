const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Database = require('@replit/database');

// Initialize Replit DB
const db = new Database();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Global settings
let doubleStakeEnabled = false;

// Battle pass image URLs for each page (1-10, 11-20, etc.)
const BATTLE_PASS_IMAGES = {
    '1-10': 'https://i.imgur.com/placeholder1.png',
    '11-20': 'https://i.imgur.com/placeholder2.png',
    '21-30': 'https://i.imgur.com/placeholder3.png',
    '31-40': 'https://i.imgur.com/placeholder4.png',
    '41-50': 'https://i.imgur.com/placeholder5.png',
    '51-60': 'https://i.imgur.com/placeholder6.png',
    '61-70': 'https://i.imgur.com/placeholder7.png',
    '71-80': 'https://i.imgur.com/placeholder8.png',
    '81-90': 'https://i.imgur.com/placeholder9.png',
    '91-100': 'https://i.imgur.com/placeholder10.png'
};

// Helper functions for database operations
async function getUser(userId) {
    let userData = await db.get(`user_${userId}`);
    if (!userData) {
        userData = {
            xp: 0,
            premium: false,
            doubleTokens: 0,
            rafflePoints: 0,
            invites: 0
        };
        await setUser(userId, userData);
    }
    return userData;
}

async function setUser(userId, data) {
    await db.set(`user_${userId}`, data);
}

async function addXP(userId, amount, reason = 'manual') {
    const userData = await getUser(userId);
    const oldLevel = getUserLevel(userData.xp);
    
    // Apply premium multiplier if user has premium
    if (userData.premium) {
        amount = Math.floor(amount * 1.1);
    }
    
    userData.xp += amount;
    const newLevel = getUserLevel(userData.xp);
    
    await setUser(userId, userData);
    
    // Log XP gain
    await logAction(`<@${userId}> gained **${amount} XP** (${reason}). Total: **${userData.xp} XP** (Level ${newLevel})`);
    
    // Check for level milestones
    if (newLevel !== oldLevel && (newLevel === 50 || newLevel === 96 || newLevel === 100)) {
        await logAction(`🎉 <@${userId}> reached **Level ${newLevel}**! Milestone achieved!`);
    }
    
    return userData;
}

async function addInvite(userId) {
    const userData = await getUser(userId);
    userData.invites += 1;
    await setUser(userId, userData);
    await logAction(`<@${userId}> received **+1 invite**. Total: **${userData.invites} invites**`);
    return userData;
}

async function addDoubleToken(userId, amount) {
    const userData = await getUser(userId);
    userData.doubleTokens += amount;
    await setUser(userId, userData);
    return userData;
}

async function addRafflePoints(userId, amount) {
    const userData = await getUser(userId);
    userData.rafflePoints += amount;
    await setUser(userId, userData);
    return userData;
}

// Calculate user level from XP (100 XP per level)
function getUserLevel(xp) {
    return Math.floor(xp / 100) + 1;
}

function getXPForLevel(level) {
    return (level - 1) * 100;
}

function getXPProgressInLevel(xp) {
    return xp % 100;
}

// Logging function
async function logAction(message) {
    try {
        const guilds = client.guilds.cache;
        for (const [guildId, guild] of guilds) {
            let logChannel = guild.channels.cache.find(ch => ch.name === 'bp-logs');
            if (logChannel) {
                await logChannel.send(message);
                break;
            }
        }
    } catch (error) {
        console.error('Failed to log action:', error);
    }
}

// Promo code functions
async function setPromoCode(code, durationMinutes, xpAmount) {
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
    await db.set(`promo_${code}`, {
        xpAmount,
        expiresAt,
        usedBy: []
    });
}

async function redeemPromoCode(userId, code) {
    const promoData = await db.get(`promo_${code}`);
    
    if (!promoData) {
        return { success: false, message: 'Invalid promo code.' };
    }
    
    if (Date.now() > promoData.expiresAt) {
        return { success: false, message: 'This promo code has expired.' };
    }
    
    if (promoData.usedBy.includes(userId)) {
        return { success: false, message: 'You have already used this promo code.' };
    }
    
    // Add user to used list
    promoData.usedBy.push(userId);
    await db.set(`promo_${code}`, promoData);
    
    // Give XP to user
    await addXP(userId, promoData.xpAmount, 'promo code');
    
    return { success: true, xpAmount: promoData.xpAmount };
}

// Create battle pass embed
function createBattlePassEmbed(userData, page = '1-10') {
    const level = getUserLevel(userData.xp);
    const xpInLevel = getXPProgressInLevel(userData.xp);
    const xpNeeded = 100;
    
    // Create progress bar
    const progressBarLength = 10;
    const filledBars = Math.floor((xpInLevel / xpNeeded) * progressBarLength);
    const progressBar = '█'.repeat(filledBars) + '░'.repeat(progressBarLength - filledBars);
    
    const embed = new EmbedBuilder()
        .setTitle(`Battle Pass – Levels ${page}`)
        .setImage(BATTLE_PASS_IMAGES[page])
        .setColor('#00ff00')
        .addFields(
            { name: 'Current Level', value: `${level}`, inline: true },
            { name: 'XP Progress', value: `${xpInLevel}/${xpNeeded}`, inline: true },
            { name: 'Premium', value: userData.premium ? '✅ Active' : '❌ Inactive', inline: true },
            { name: 'Progress Bar', value: `${progressBar}`, inline: false }
        )
        .setFooter({ text: `Page ${page} | Use the buttons below to switch pages` });
    
    return embed;
}

// Create battle pass navigation buttons
function createBattlePassButtons() {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('bp_1-10').setLabel('1–10').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bp_11-20').setLabel('11–20').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bp_21-30').setLabel('21–30').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bp_31-40').setLabel('31–40').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bp_41-50').setLabel('41–50').setStyle(ButtonStyle.Primary)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('bp_51-60').setLabel('51–60').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bp_61-70').setLabel('61–70').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bp_71-80').setLabel('71–80').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bp_81-90').setLabel('81–90').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bp_91-100').setLabel('91–100').setStyle(ButtonStyle.Primary)
        );

    return [row1, row2];
}

// Check if user has admin permissions
function isAdmin(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

// Parse user mention
function parseUserMention(mention) {
    const match = mention.match(/^<@!?(\d+)>$/);
    return match ? match[1] : null;
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Handle messages
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'bp':
                const userData = await getUser(message.author.id);
                const embed = createBattlePassEmbed(userData);
                const buttons = createBattlePassButtons();
                await message.reply({ embeds: [embed], components: buttons });
                break;

            case 'xp':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                const targetUserId = parseUserMention(args[0]);
                const xpAmount = parseInt(args[1]);
                
                if (!targetUserId || isNaN(xpAmount)) {
                    return message.reply('❌ Usage: `!xp @user amount`');
                }
                
                await addXP(targetUserId, xpAmount, 'admin command');
                message.reply(`✅ Added ${xpAmount} XP to <@${targetUserId}>`);
                break;

            case 'xpinvite':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                const inviteUserId = parseUserMention(args[0]);
                if (!inviteUserId) {
                    return message.reply('❌ Usage: `!xpinvite @user`');
                }
                
                await addXP(inviteUserId, 100, 'invite bonus');
                await addInvite(inviteUserId);
                message.reply(`✅ Added 100 XP and 1 invite to <@${inviteUserId}>`);
                break;

            case 'xpset':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                const setUserId = parseUserMention(args[0]);
                const setXP = parseInt(args[1]);
                
                if (!setUserId || isNaN(setXP)) {
                    return message.reply('❌ Usage: `!xpset @user amount`');
                }
                
                const setUserData = await getUser(setUserId);
                setUserData.xp = setXP;
                await setUser(setUserId, setUserData);
                await logAction(`<@${setUserId}> XP set to **${setXP} XP** by admin`);
                message.reply(`✅ Set <@${setUserId}>'s XP to ${setXP}`);
                break;

            case 'gpset':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                const gpUserId = parseUserMention(args[0]);
                const gpAmount = parseInt(args[1]);
                
                if (!gpUserId || isNaN(gpAmount)) {
                    return message.reply('❌ Usage: `!gpset @user amount`');
                }
                
                const gpUserData = await getUser(gpUserId);
                gpUserData.rafflePoints = gpAmount;
                await setUser(gpUserId, gpUserData);
                message.reply(`✅ Set <@${gpUserId}>'s raffle points to ${gpAmount}`);
                break;

            case 'ddset':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                const ddUserId = parseUserMention(args[0]);
                const ddAmount = parseInt(args[1]);
                
                if (!ddUserId || isNaN(ddAmount)) {
                    return message.reply('❌ Usage: `!ddset @user amount`');
                }
                
                const ddUserData = await getUser(ddUserId);
                ddUserData.doubleTokens = ddAmount;
                await setUser(ddUserId, ddUserData);
                message.reply(`✅ Set <@${ddUserId}>'s double-stake tokens to ${ddAmount}`);
                break;

            case 'ddstart':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                doubleStakeEnabled = true;
                await logAction('🔴 **Double-stake has been enabled globally**');
                message.reply('✅ Double-stake is now enabled globally');
                break;

            case 'ddstop':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                doubleStakeEnabled = false;
                await logAction('🔴 **Double-stake has been disabled globally**');
                message.reply('✅ Double-stake is now disabled globally');
                break;

            case 'bpstat':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                const statUserId = parseUserMention(args[0]);
                if (!statUserId) {
                    return message.reply('❌ Usage: `!bpstat @user`');
                }
                
                const statUserData = await getUser(statUserId);
                const statLevel = getUserLevel(statUserData.xp);
                
                const statEmbed = new EmbedBuilder()
                    .setTitle(`Battle Pass Stats for <@${statUserId}>`)
                    .setColor('#0099ff')
                    .addFields(
                        { name: 'Level', value: `${statLevel}`, inline: true },
                        { name: 'XP', value: `${statUserData.xp}`, inline: true },
                        { name: 'Premium', value: statUserData.premium ? '✅ Active' : '❌ Inactive', inline: true },
                        { name: 'Double Tokens', value: `${statUserData.doubleTokens}`, inline: true },
                        { name: 'Raffle Points', value: `${statUserData.rafflePoints}`, inline: true },
                        { name: 'Invites', value: `${statUserData.invites}`, inline: true }
                    );
                
                message.reply({ embeds: [statEmbed] });
                break;

            case 'setcode':
                if (!isAdmin(message.member)) {
                    return message.reply('❌ You need Administrator permissions to use this command.');
                }
                
                const code = args[0];
                const duration = parseInt(args[1]);
                const codeXP = parseInt(args[2]);
                
                if (!code || isNaN(duration) || isNaN(codeXP)) {
                    return message.reply('❌ Usage: `!setcode code durationMinutes xpAmount`');
                }
                
                await setPromoCode(code, duration, codeXP);
                message.reply(`✅ Created promo code **${code}** valid for ${duration} minutes, giving ${codeXP} XP`);
                break;

            case 'code':
                const redeemCode = args[0];
                if (!redeemCode) {
                    return message.reply('❌ Usage: `!code <code>`');
                }
                
                const result = await redeemPromoCode(message.author.id, redeemCode);
                if (result.success) {
                    message.reply(`✅ Successfully redeemed code! You gained ${result.xpAmount} XP.`);
                } else {
                    message.reply(`❌ ${result.message}`);
                }
                break;

            default:
                // Command not found - ignore
                break;
        }
    } catch (error) {
        console.error('Error handling command:', error);
        message.reply('❌ An error occurred while processing your command.');
    }
});

// Handle button interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('bp_')) {
        const page = interaction.customId.replace('bp_', '');
        const userData = await getUser(interaction.user.id);
        const embed = createBattlePassEmbed(userData, page);
        const buttons = createBattlePassButtons();
        
        await interaction.update({ embeds: [embed], components: buttons });
    }
});

// Login with bot token
client.login(process.env.DISCORD_TOKEN);