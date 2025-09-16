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

// Публичные команды (видны и доступны всем)
const publicCommands = [
  { name: 'bp', description: 'Открыть боевой пропуск' },
  {
    name: 'code',
    description: 'Активировать промокод',
    options: [
      { name: 'value', description: 'Код', type: 3, required: true }
    ]
  },
  {
    name: 'usedd',
    description: 'Использовать даблжетоны для ставки на команду',
    options: [
      {
        name: 'tokens',
        description: 'Количество жетонов',
        type: 4,
        required: true,
        min_value: 1,
        max_value: 50
      },
      {
        name: 'team',
        description: 'Команда (оставьте пустым для автодополнения)',
        type: 3,
        required: false,
        autocomplete: true
      }
    ]
  }
];

// Админ-команды — по умолчанию НИКОМУ не видны (default_member_permissions: '0').
// Видимость и право использования выдавай ровно двум людям через
// Настройки сервера → Интеграции → <твой бот> → Команды → Permissions.
const adminOnlyCommands = [
  {
    name: 'bpstat',
    description: 'Показать BP-статистику',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: false }
    ]
  },
  {
    name: 'xp',
    description: 'Добавить XP пользователю',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'amount', description: 'XP', type: 4, required: true }
    ]
  },
  {
    name: 'xpset',
    description: 'Установить точный XP',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'amount', description: 'XP', type: 4, required: true }
    ]
  },
  {
    name: 'xpinvite',
    description: 'Выдать +100 XP и +1 инвайт',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true }
    ]
  },
  {
    name: 'gpset',
    description: 'Установить очки розыгрыша',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'points', description: 'Очки', type: 4, required: true }
    ]
  },
  {
    name: 'ddset',
    description: 'Установить количество DD-жетонов',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'amount', description: 'Количество жетонов', type: 4, required: true }
    ]
  },
  { name: 'ddstart', description: 'Открыть окно Double-Down', default_member_permissions: '0' },
  { name: 'ddstop',  description: 'Закрыть окно Double-Down', default_member_permissions: '0' },
  {
    name: 'setlog',
    description: 'Установить лог-канал',
    default_member_permissions: '0',
    options: [
      { name: 'channel', description: 'Канал', type: 7, required: true }
    ]
  },
  {
    name: 'premiumon',
    description: 'Включить премиум пользователю',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true }
    ]
  },
  {
    name: 'premiumoff',
    description: 'Выключить премиум пользователю',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true }
    ]
  },
  {
    name: 'setcode',
    description: 'Создать промокод',
    default_member_permissions: '0',
    options: [
      { name: 'code', description: 'Код', type: 3, required: true },
      { name: 'minutes', description: 'Время жизни (мин)', type: 4, required: true },
      { name: 'xp', description: 'Количество XP', type: 4, required: true },
      { name: 'limit', description: 'Лимит использований (0 = без лимита)', type: 4, required: false }
    ]
  },
  {
    name: 'teamcreate',
    description: 'Создать команду из 5 участников',
    default_member_permissions: '0',
    options: [
      { name: 'name', description: 'Название команды', type: 3, required: true },
      { name: 'player1', description: 'Участник #1', type: 6, required: true },
      { name: 'player2', description: 'Участник #2', type: 6, required: true },
      { name: 'player3', description: 'Участник #3', type: 6, required: true },
      { name: 'player4', description: 'Участник #4', type: 6, required: true },
      { name: 'player5', description: 'Участник #5', type: 6, required: true }
    ]
  },
  {
    name: 'teamchange',
    description: 'Заменить участника в команде',
    default_member_permissions: '0',
    options: [
      { name: 'name', description: 'Название команды', type: 3, required: true, autocomplete: true },
      { name: 'old', description: 'Кого заменить', type: 6, required: true },
      { name: 'new', description: 'Новый участник', type: 6, required: true }
    ]
  },
  {
    name: 'teamdelete',
    description: 'Удалить команду',
    default_member_permissions: '0',
    options: [
      { name: 'name', description: 'Название команды', type: 3, required: true, autocomplete: true }
    ]
  },
  {
    name: 'teamresult',
    description: 'Зафиксировать результат команды',
    default_member_permissions: '0',
    options: [
      { name: 'name', description: 'Название команды', type: 3, required: true, autocomplete: true },
      {
        name: 'result',
        description: 'Результат',
        type: 3,
        required: true,
        choices: [
          { name: 'победа', value: 'win' },
          { name: 'поражение', value: 'loss' },
          { name: 'ничья', value: 'draw' }
        ]
      }
    ]
  },
  {
    name: 'bethistory',
    description: 'История ставок участника',
    default_member_permissions: '0',
    options: [
      { name: 'user', description: 'Участник', type: 6, required: true }
    ]
  },
  {
    name: 'teamhistory',
    description: 'История команд',
    default_member_permissions: '0',
    options: [
      { name: 'name', description: 'Название команды', type: 3, required: false, autocomplete: true }
    ]
  }
];

const commands = [...publicCommands, ...adminOnlyCommands];

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
