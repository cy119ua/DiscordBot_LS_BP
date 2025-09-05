module.exports = {
    prefix: '!',
    
    // Battle pass configuration
    battlePass: {
        maxLevel: 100,
        levelsPerPage: 10,
        
        // XP thresholds for each level (simplified progression)
        xpThresholds: Array.from({ length: 100 }, (_, i) => (i + 1) * 100),
        
        // Pre-generated battle pass image URLs (placeholder URLs - replace with actual hosted images)
        imageUrls: {
            '1-10': 'https://example.com/battlepass/levels_1_10.png',
            '11-20': 'https://example.com/battlepass/levels_11_20.png',
            '21-30': 'https://example.com/battlepass/levels_21_30.png',
            '31-40': 'https://example.com/battlepass/levels_31_40.png',
            '41-50': 'https://example.com/battlepass/levels_41_50.png',
            '51-60': 'https://example.com/battlepass/levels_51_60.png',
            '61-70': 'https://example.com/battlepass/levels_61_70.png',
            '71-80': 'https://example.com/battlepass/levels_71_80.png',
            '81-90': 'https://example.com/battlepass/levels_81_90.png',
            '91-100': 'https://example.com/battlepass/levels_91_100.png'
        },
        
        // Reward configuration for each level
        rewards: {
            free: {
                // Free tier rewards (example configuration)
                1: { type: 'tokens', amount: 50 },
                2: { type: 'pack', amount: 1 },
                5: { type: 'tokens', amount: 100 },
                10: { type: 'rafflePoints', amount: 10 },
                // ... more rewards
            },
            premium: {
                // Premium tier rewards (example configuration)
                1: { type: 'tokens', amount: 100 },
                2: { type: 'pack', amount: 2 },
                3: { type: 'tokens', amount: 75 },
                5: { type: 'tokens', amount: 150 },
                10: { type: 'rafflePoints', amount: 20 },
                // ... more rewards
            }
        }
    },
    
    // XP system configuration
    xp: {
        premiumMultiplier: 1.1,
        milestones: [50, 96, 100]
    },
    
    // Logging configuration
    logging: {
        channelName: 'bp-logs',
        colors: {
            xpAdd: 0x00ff00,
            xpInvite: 0x0099ff,
            promo: 0xff9900,
            doubleStake: 0xff0066,
            milestone: 0xffff00
        }
    }
};
