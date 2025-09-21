const path = require('path');
const { readJSON, writeJSON } = require('./storage');

// Файл, где хранятся активные ставки. Структура: { bets: [ { userId, team, tokens, ts } ] }
const DATA_FILE = path.join(__dirname, '..', 'data', 'bets.json');

function loadBets() {
  const data = readJSON(DATA_FILE, { bets: [] });
  return data.bets || [];
}

function saveBets(bets) {
  writeJSON(DATA_FILE, { bets });
}

/**
 * Добавляет ставку пользователя
 * @param {string} userId ID пользователя
 * @param {string} team Название команды
 * @param {number} tokens Количество жетонов
 */
function addBet(userId, team, tokens) {
  const bets = loadBets();
  bets.push({ userId, team, tokens, ts: Date.now() });
  saveBets(bets);
}

/**
 * Возвращает ставки на указанную команду
 * @param {string} team Название команды
 * @returns {Array} Массив ставок
 */
function getBetsForTeam(team) {
  return loadBets().filter((b) => b.team === team);
}

/**
 * Удаляет ставки, связанные с указанной командой
 * @param {string} team Название команды
 */
function clearBetsForTeam(team) {
  const bets = loadBets().filter((b) => b.team !== team);
  saveBets(bets);
}

/**
 * Возвращает активные ставки пользователя
 * @param {string} userId ID пользователя
 * @returns {Array} Массив ставок
 */
function getBetsForUser(userId) {
  return loadBets().filter((b) => b.userId === userId);
}

/**
 * Удаляет ставки пользователя на указанную команду. Если у пользователя
 * были размещены ставки на эту команду, они будут удалены, а остальные
 * ставки останутся без изменений.
 * @param {string} userId ID пользователя
 * @param {string} team Название команды
 */
function removeBetsForUserAndTeam(userId, team) {
  const bets = loadBets().filter((b) => {
    // Сохраняем ставки, если либо userId не совпадает, либо команда отличается
    return !(String(b.userId) === String(userId) && String(b.team) === String(team));
  });
  saveBets(bets);
}

/**
 * Удаляет все активные ставки пользователя, независимо от команды.
 * @param {string} userId ID пользователя
 */
function removeBetsForUser(userId) {
  const bets = loadBets().filter((b) => String(b.userId) !== String(userId));
  saveBets(bets);
}

/**
 * Полностью очищает список активных ставок. Полезно для полного сброса БД.
 */
function clearAllBets() {
  saveBets([]);
}

module.exports = {
  addBet,
  getBetsForTeam,
  clearBetsForTeam,
  getBetsForUser,
  removeBetsForUserAndTeam,
  removeBetsForUser,
  clearAllBets
};