const fs = require('fs');
const path = require('path');

/**
 * Читает JSON из файла. Возвращает fallback, если файл не существует или произошла ошибка.
 * @param {string} filePath Путь к файлу
 * @param {*} fallback Значение по умолчанию
 * @returns {*} Содержимое JSON или fallback
 */
function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[storage] readJSON error:', e);
    return fallback;
  }
}

/**
 * Сохраняет объект в JSON‑файл. Создаёт директорию, если необходимо.
 * @param {string} filePath Путь к файлу
 * @param {*} data Сохраняемые данные
 */
function writeJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[storage] writeJSON error:', e);
  }
}

module.exports = { readJSON, writeJSON };