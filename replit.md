# replit.md

## Overview

This is a Discord bot built with Node.js and Discord.js that implements a battle pass progression system with XP tracking, user profiles, and administrative commands. The bot provides a gamified experience for Discord server members through level progression, rewards collection, and promotional code redemption.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

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