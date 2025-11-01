// slash/register.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Импортируем настройки при необходимости.
// Для выдачи прав на админ‑команды мы используем роль Administrator,
// назначаемую whitelisted‑пользователям в коде бота. Здесь импорт config
// оставлен закомментированным, так как adminUsers не используется.
// const config = require('../config');

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
    { name: 'tokens', description: 'Количество жетонов (1 или 2)', type: 4, required: true, min_value: 1, max_value: 2 },
    { name: 'team',   description: 'Команда (оставьте пустым для выбора из списка)', type: 3, required: false, autocomplete: true }
  ]
}
  ,
  {
    name: 'predict',
    description: 'Сделать прогноз на исход параллельного матча',
    // Опции убраны, т.к. прогноз теперь выбирается через выпадающий список.
    options: []
  }
  ,
  {
    name: 'cup',
    description: 'Сделать прогноз в CUP (специальные 4 команды, когда окно открыто)',
    options: []
  }
  ,
  {
    name: 'infop',
    description: 'Показать историю предсказаний всех пользователей'
  }
];

// Админ-команды — по умолчанию НИКОМУ не видны (default_member_permissions: '0').
// Видимость и право использования выдавай ровно двум людям через
// Настройки сервера → Интеграции → <твой бот> → Команды → Permissions.
const adminOnlyCommands = [
  {
    name: 'bpstat',
    description: 'Показать BP-статистику',
    
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: false }
    ]
  },
  {
    name: 'xp',
    description: 'Добавить XP пользователю',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'amount', description: 'XP', type: 4, required: true }
    ]
  },
  {
    name: 'xpset',
    description: 'Установить точный XP',
     
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'amount', description: 'XP', type: 4, required: true }
    ]
  },
  {
    name: 'xpinvite',
    description: 'Выдать +100 XP и +1 инвайт',
    options: [
      { name: 'user', description: 'Пользователь (кому начислить XP и инвайт)', type: 6, required: true },
      { name: 'added', description: 'Приглашаемый пользователь (опционально)', type: 6, required: false }
    ]
  },
  {
    name: 'gpset',
    description: 'Установить очки розыгрыша',
     
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'points', description: 'Очки', type: 4, required: true }
    ]
  },
  {
    name: 'ddset',
    description: 'Установить количество DD-жетонов',
     
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'amount', description: 'Количество жетонов', type: 4, required: true }
    ]
  },
  {
    name: 'invset',
    description: 'Установить количество инвайтов',
    
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'amount', description: 'Количество инвайтов', type: 4, required: true }
    ]
  },
  {
    name: 'cpset',
    description: 'Установить количество паков карт',
    
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'amount', description: 'Количество паков', type: 4, required: true }
    ]
  },
  { name: 'ddstart', description: 'Открыть окно Double-Down',  },
  { name: 'ddstop',  description: 'Закрыть окно Double-Down',  },
  { name: 'ddcup1', description: 'Открыть окно CUP — раунд 1 (XP за верный прогноз: 100)' },
  { name: 'ddcup2', description: 'Открыть окно CUP — раунд 2 (XP за верный прогноз: 120)' },
  { name: 'ddcup3', description: 'Открыть окно CUP — раунд 3 (XP за верный прогноз: 150)' },
  { name: 'ddcupstop', description: 'Закрыть окно CUP (ddcup)' },
  {
    name: 'ddcupsetteams',
    description: 'Установить 4 команды для текущего CUP (порядок важен)',
    options: [
      { name: 'team1', description: 'Команда #1', type: 3, required: true },
      { name: 'team2', description: 'Команда #2', type: 3, required: true },
      { name: 'team3', description: 'Команда #3', type: 3, required: true },
      { name: 'team4', description: 'Команда #4', type: 3, required: true }
    ]
  },
  {
    name: 'setlog',
    description: 'Установить лог-канал',
     
    options: [
      { name: 'channel', description: 'Канал', type: 7, required: true }
    ]
  },
  {
    name: 'premiumon',
    description: 'Включить премиум пользователю',
     
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true }
    ]
  },
  {
    name: 'premiumoff',
    description: 'Выключить премиум пользователю',
     
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true }
    ]
  },
  {
    name: 'setcode',
    description: 'Создать промокод',
     
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
     
    options: [
      // Имя команды остаётся строкой с автодополнением
      { name: 'name', description: 'Название команды', type: 3, required: true, autocomplete: true },
      /*
       * Кого заменить в команде. Discord не поддерживает автодополнение
       * для опций типа USER, поэтому параметр `old` объявлен как строка.
       * Бот использует автодополнение, чтобы предлагать только участников
       * выбранной команды (см. обработку в index.js). В выдаче предложений
       * отображается ник/тег пользователя, а в значение подставляется
       * строка-пинг вида `<@1234567890>`. При обработке команды ID
       * извлекается из этой строки, чтобы заменить участника.
       */
      { name: 'old', description: 'Кого заменить', type: 3, required: true, autocomplete: true },
      { name: 'new', description: 'Новый участник', type: 6, required: true }
    ]
  },
  {
    name: 'teamdelete',
    description: 'Удалить команду',
     
    options: [
      { name: 'name', description: 'Название команды', type: 3, required: true, autocomplete: true }
    ]
  },
  {
    name: 'backup',
    description: 'Создать резервную копию базы данных'
  },
  {
    name: 'restore',
    description: 'Восстановить базу данных из последней копии'
  },
  {
    name: 'teamresult',
    description: 'Зафиксировать результат команды',
     
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
     
    options: [
      { name: 'user', description: 'Участник', type: 6, required: true }
    ]
  },
  {
    name: 'teamhistory',
    description: 'История команд',
     
    options: [
      { name: 'name', description: 'Название команды', type: 3, required: false, autocomplete: true }
    ]
  }
  ,
  {
    name: 'userreset',
    description: 'Сбросить статистику одного пользователя',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true }
    ]
  }
  ,
  {
    name: 'dbreset',
    description: 'Сбросить статистику всех пользователей',
    options: [
      { name: 'confirm', description: 'Подтвердите выполнение', type: 5, required: true }
    ]
  }
  ,
  {
    name: 'usersprem',
    description: 'Показать всех премиум‑пользователей',
    // Эта команда не принимает параметров
    options: []
  }
  ,
  {
    name: 'bpreapply',
    description: 'Доначислить недостающие награды Боевого пропуска',
    options: [
      { name: 'user', description: 'Пользователь', type: 6, required: true },
      { name: 'includexp', description: 'Также пересчитать XP-награды', type: 5, required: false }
    ]
  }
];

const commands = [...publicCommands, ...adminOnlyCommands];

// В Node 22 использование top‑level await в CommonJS приводит к ошибке. Поэтому
// переносим асинхронную логику в отдельную функцию и вызываем её.
async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    // Регистрируем все команды (публичные и админские) для гильдии.
    await rest.put(
      Routes.applicationGuildCommands(APP_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash-команды зарегистрированы для гильдии:', GUILD_ID);
    // Дополнительные настройки прав не выполняем. Проверка доступа и видимость
    // обеспечиваются кодом бота через роль Administrator.
  } catch (e) {
    console.error('❌ Register error:', e);
    process.exit(1);
  }
}

registerCommands();
