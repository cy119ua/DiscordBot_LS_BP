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

module.exports = { addBet, getBetsForTeam, clearBetsForTeam, getBetsForUser };