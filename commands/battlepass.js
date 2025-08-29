const { generateBattlePassEmbed, createBattlePassButtons } = require('../utils/battlepassUtils');

const battlepassCommands = {
    bp: {
        name: 'bp',
        description: 'View your battle pass progress',
        async execute(message, args, client) {
            try {
                const userId = message.author.id;
                const page = parseInt(args[0]) || 1;
                
                // Validate page number
                if (page < 1 || page > 10) {
                    return message.reply('❌ Invalid page number. Please specify a page between 1-10.');
                }
                
                // Generate battle pass embed and buttons
                const embed = await generateBattlePassEmbed(userId, page);
                const buttons = createBattlePassButtons(page);
                
                await message.reply({
                    embeds: [embed],
                    components: buttons
                });
            } catch (error) {
                console.error('Battle pass command error:', error);
                message.reply('❌ There was an error displaying your battle pass.');
            }
        }
    }
};

module.exports = battlepassCommands;
