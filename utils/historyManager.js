const path = require('path');
const { readJSON, writeJSON } = require('./storage');

// Файлы для истории ставок и команд
const BET_HISTORY_FILE = path.join(__dirname, '..', 'data', 'history_bets.json');
const TEAM_HISTORY_FILE = path.join(__dirname, '..', 'data', 'history_teams.json');

function loadBetHistory() {
  const data = readJSON(BET_HISTORY_FILE, { events: [] });
  return data.events || [];
}
function saveBetHistory(events) {
  writeJSON(BET_HISTORY_FILE, { events });
}

function loadTeamHistory() {
  const data = readJSON(TEAM_HISTORY_FILE, { events: [] });
  return data.events || [];
}
function saveTeamHistory(events) {
  writeJSON(TEAM_HISTORY_FILE, { events });
}

/**
 * Добавляет событие ставки (или выплаты) в историю.
 * @param {Object} event
 */
function addBetHistory(event) {
  const events = loadBetHistory();
  events.push({ ...event, ts: Date.now() });
  saveBetHistory(events);
}

/**
 * Записывает создание команды.
 * @param {string} name Название команды
 * @param {string[]} members Состав команды
 */
function addTeamCreate(name, members) {
  const events = loadTeamHistory();
  events.push({ type: 'create', name, members: [...members], ts: Date.now() });
  saveTeamHistory(events);
}

/**
 * Записывает результат команды.
 * @param {string} name Название команды
 * @param {string[]} members Состав команды на момент результата
 * @param {string} result Результат: win, draw или loss
 */
function addTeamResult(name, members, result) {
  const events = loadTeamHistory();
  events.push({ type: 'result', name, members: [...members], result, ts: Date.now() });
  saveTeamHistory(events);
}

/**
 * Возвращает историю ставок пользователя.
 * @param {string} userId ID пользователя
 * @returns {Array}
 */
function getBetHistoryForUser(userId) {
  return loadBetHistory().filter((e) => e.userId === userId);
}

/**
 * Возвращает историю команд; если имя не указано, возвращаются все события.
 * @param {string|undefined} name
 * @returns {Array}
 */
function getTeamHistory(name) {
  const events = loadTeamHistory();
  if (!name) return events;
  return events.filter((e) => e.name === name);
}

module.exports = { addBetHistory, addTeamCreate, addTeamResult, getBetHistoryForUser, getTeamHistory };