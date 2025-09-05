 HEAD
# replit.md

## Overview

This is a Discord bot built with Node.js and Discord.js that implements a battle pass progression system with XP tracking, user profiles, and administrative commands. The bot provides a gamified experience for Discord server members through level progression, rewards collection, and promotional code redemption.

# Replit.md

## Overview

This is a Discord bot that implements a battle pass and XP system for gaming communities. The bot allows users to progress through levels, redeem promo codes, and earn various rewards including tokens, raffle points, and premium status. It features a comprehensive admin panel for managing user progression and global settings like double stake events.
 8618bfb29cc39882f0552db0abd7f88419e4b607

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

<<<<<<< HEAD
### Core Framework
- **Discord.js v14**: Modern Discord bot framework with gateway intents for guilds, messages, and message content
- **Node.js**: Server-side JavaScript runtime
- **Replit Database**: Cloud-based key-value storage for persistent data

### Bot Architecture
- **Command System**: Modular command structure with separate files for different command categories (admin, battlepass, user)
- **Permission System**: Whitelist-based permissions with admin fallback for command authorization
- **Event-Driven Design**: Discord client events drive the bot's functionality

### Data Management
- **User Management**: XP tracking, level calculation, premium status, and reward collection
- **Battle Pass System**: 100-level progression with configurable XP thresholds and tier-based rewards
- **Settings Management**: Guild-specific configuration storage
- **Promotional Codes**: Time-limited codes with usage tracking and reward distribution

### Key Features
- **XP Progression**: Linear XP system with 100 XP per level progression
- **Battle Pass**: Visual progression display with paginated level ranges (1-10, 11-20, etc.)
- **Premium System**: Enhanced rewards and multipliers for premium users
- **Administrative Tools**: XP manipulation, user management, and promotional code creation
- **Logging System**: Action logging to designated channels for audit trails

### Security & Permissions
- **Whitelist System**: Role-based and user-based access control
- **Admin Verification**: Multiple permission checks including Discord administrator permissions
- **Input Validation**: Sanitized user inputs and safe database operations

## External Dependencies

### Primary Dependencies
- **discord.js**: Discord API wrapper for bot functionality
- **@replit/database**: Cloud database service for data persistence
- **dotenv**: Environment variable management for secure configuration

### Third-Party Integrations
- **Battle Pass Images**: External image hosting for battle pass level displays (placeholder URLs configured)
- **Discord API**: Real-time communication with Discord servers and users

### Database Schema
- **Users**: XP, premium status, tokens, raffle points, invites, collected rewards
- **Settings**: Guild-specific configurations including log channels and whitelists
- **Promotional Codes**: Code data with expiration, usage limits, and reward definitions
- **Global Settings**: Server-wide configurations like double stake events
=======
### Bot Framework
- **Discord.js v14**: Modern Discord API wrapper for handling bot interactions, events, and message processing
- **Prefix-based Commands**: Uses configurable command prefix (default: '!') for all user interactions
- **Event-driven Architecture**: Handles Discord events through centralized event listeners and command routing

### Data Storage
- **Replit Database**: NoSQL key-value database for persistent data storage
- **User Data Model**: Stores XP, premium status, tokens, raffle points, invites, and reward collection history
- **Global Settings**: Manages server-wide configurations like double stake events
- **Promo Code System**: Tracks promotional codes with expiration dates and usage limits

### Battle Pass System
- **Level Progression**: 100 levels with XP thresholds (simplified 100 XP per level)
- **Dual Reward Tracks**: Free and premium tiers with different reward structures
- **Visual Progress Display**: Pre-generated image assets for different level ranges (1-10, 11-20, etc.)
- **Paginated Interface**: Navigation through 10 pages of battle pass content with interactive buttons

### Command Structure
- **Admin Commands**: XP management, promo code creation/deletion, global settings control
- **User Commands**: Promo code redemption, battle pass viewing, progress tracking
- **Permission System**: Role-based access control using Discord's built-in administrator permissions

### Reward System
- **Multiple Currency Types**: Tokens, raffle points, premium status upgrades
- **Milestone Tracking**: Automatic detection and logging of level achievements
- **Reward Collection State**: Prevents duplicate reward claims and tracks user progress

### Logging and Monitoring
- **Centralized Logging**: Automatic creation of dedicated log channels for admin actions
- **Action Tracking**: Comprehensive logging of XP additions, promo redemptions, and milestone achievements
- **Error Handling**: Graceful error management with user-friendly error messages

## External Dependencies

### Core Dependencies
- **discord.js (v14.22.1)**: Primary Discord API library for bot functionality
- **@replit/database (v3.0.1)**: Replit's managed database service for data persistence

### Discord API Integration
- **Gateway Intents**: Configured for guilds, messages, message content, and member data access
- **Permissions System**: Integrates with Discord's permission framework for admin controls
- **Channel Management**: Automatic creation and management of logging channels

### Image Assets
- **Battle Pass Visuals**: External image hosting for pre-generated battle pass level displays
- **Placeholder URLs**: Currently configured with example.com URLs requiring replacement with actual hosted images

### Configuration Management
- **Environment-based Settings**: Centralized configuration file for XP thresholds, reward structures, and visual assets
- **Extensible Reward System**: Configurable reward types and amounts for both free and premium battle pass tiers
>>>>>>> 8618bfb29cc39882f0552db0abd7f88419e4b607
