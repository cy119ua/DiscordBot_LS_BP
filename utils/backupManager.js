// utils/backupManager.js
//
// Этот модуль обеспечивает сохранение резервных копий базы данных и
// восстановление последней копии.  Бэкапы записываются в
// подкаталог `data/backups` относительно корня проекта.  Каждая копия
// содержит полный JSON файл базы (db.json), поэтому восстановление
// перезаписывает существующую базу.

const fs = require('fs/promises');
const path = require('path');

// Путь к исходной базе данных и каталогу бэкапов.  База хранится в
// data/db.json, а бэкапы будут записываться в data/backups.
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

/**
 * Убедиться, что директория для бэкапов существует.  Создаёт её
 * рекурсивно, если необходимо.
 */
async function ensureDir() {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
}

/**
 * Создать резервную копию базы данных.  Файл базы данных
 * `data/db.json` будет скопирован в каталожную папку `data/backups` с
 * временной меткой в названии (формат: db-YYYY-MM-DD-HH-mm-ss.json).
 *
 * @returns {Promise<string>} Абсолютный путь к созданной копии
 */
async function backupDb() {
  await ensureDir();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const filename = `db-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.json`;
  const dest = path.join(BACKUPS_DIR, filename);
  await fs.copyFile(DB_FILE, dest);
  return dest;
}

/**
 * Восстановить базу данных из самой свежей резервной копии.  Выбирает
 * последний по названию JSON файл в `data/backups` и копирует его
 * содержимое обратно в `data/db.json`.  Если бэкапы отсутствуют,
 * выбрасывает исключение.
 *
 * @returns {Promise<string>} Путь к бэкапу, из которого была восстановлена база
 */
async function restoreLatest() {
  await ensureDir();
  const files = await fs.readdir(BACKUPS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  if (!jsonFiles.length) {
    throw new Error('Нет доступных бэкапов');
  }
  // Сортируем по алфавиту и берём самый последний (новее)
  jsonFiles.sort();
  const latest = jsonFiles[jsonFiles.length - 1];
  const src = path.join(BACKUPS_DIR, latest);
  await fs.copyFile(src, DB_FILE);
  return src;
}

/**
 * Запланировать автоматическое создание бэкапов раз в сутки.  Интервал
 * устанавливается равным 24 часам.  Если функция будет вызвана
 * несколько раз, несколько интервалов не будут запущены — во время
 * вызова она хранит идентификатор интервала во внутренней переменной.
 */
let _intervalId = null;
function scheduleDailyBackup() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (_intervalId) return;
  _intervalId = setInterval(async () => {
    try {
      await backupDb();
    } catch (err) {
      console.error('[backupManager] Error during scheduled backup:', err);
    }
  }, DAY_MS);
}

module.exports = {
  backupDb,
  restoreLatest,
  scheduleDailyBackup,
};