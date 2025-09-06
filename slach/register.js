// slash/register.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.APPLICATION_ID;
const GUILD_ID = process.env.DEV_GUILD_ID;

if (!TOKEN || !APP_ID || !GUILD_ID) {
  console.error('❌ Нужны DISCORD_TOKEN, APPLICATION_ID и DEV_GUILD_ID в .env');
  process.exit(1);
}

const commands = [
  // user
  { name: 'profile', description: 'Показать профиль' },
  { name: 'code', description: 'Активировать промокод', options: [
    { name: 'value', description: 'Код', type: 3, required: true } // STRING
  ]},
  { name: 'usedd', description: 'Активировать жетоны Double-Down', options: [
    { name: 'amount', description: '1 = x2, 2 = x3', type: 4, required: true, choices: [
      { name: '1 (x2)', value: 1 }, { name: '2 (x3)', value: 2 }
    ]}
  ]},
  { name: 'bp', description: 'Боевой пропуск (по уровню или страница)', options: [
    { name: 'page', description: 'Страница (1..10)', type: 4, required: false, min_value: 1, max_value: 10 }
  ]},

  // admin
  { name: 'xp', description: 'Добавить XP пользователю', options: [
    { name: 'user', description: 'Пользователь', type: 6, required: true },  // USER
    { name: 'amount', description: 'XP', type: 4, required: true }           // INTEGER
  ]},
  { name: 'xpset', description: 'Установить точный XP', options: [
    { name: 'user', description: 'Пользователь', type: 6, required: true },
    { name: 'amount', description: 'XP', type: 4, required: true }
  ]},
  { name: 'xpinvite', description: 'Выдать +100 XP и +1 инвайт', options: [
    { name: 'user', description: 'Пользователь', type: 6, required: true }
  ]},
  { name: 'gpset', description: 'Очки розыгрыша пользователю', options: [
    { name: 'user', description: 'Пользователь', type: 6, required: true },
    { name: 'points', description: 'Очки', type: 4, required: true }
  ]},
  { name: 'ddset', description: 'Выдать DD-жетоны', options: [
    { name: 'user', description: 'Пользователь', type: 6, required: true },
    { name: 'amount', description: 'Жетоны', type: 4, required: true }
  ]},
  { name: 'ddstart', description: 'Открыть окно Double-Down' },
  { name: 'ddstop', description: 'Закрыть окно Double-Down' },
  { name: 'setlog', description: 'Установить лог-канал', options: [
    { name: 'channel', description: 'Канал', type: 7, required: true } // CHANNEL
  ]},
  { name: 'premiumon', description: 'Включить премиум', options: [
    { name: 'user', description: 'Пользователь', type: 6, required: true }
  ]},
  { name: 'premiumoff', description: 'Выключить премиум', options: [
    { name: 'user', description: 'Пользователь', type: 6, required: true }
  ]}
];

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash-команды зарегистрированы для гильдии:', GUILD_ID);
  } catch (e) {
    console.error('❌ Register error:', e);
    process.exit(1);
  }
})();
