# Replit.md

## Overview

This is a Discord bot that implements a battle pass and XP system for gaming communities. The bot allows users to progress through levels, redeem promo codes, and earn various rewards including tokens, raffle points, and premium status. It features a comprehensive admin panel for managing user progression and global settings like double stake events.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

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