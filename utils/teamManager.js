const path = require('path');
const { readJSON, writeJSON } = require('./storage');

// Путь к JSON‑файлу, где хранятся все команды. Структура: { teams: { [name]: { name, members, lastResult } } }
const DATA_FILE = path.join(__dirname, '..', 'data', 'teams.json');

/**
 * Загружает список всех команд. Если файл отсутствует, возвращает пустой объект.
 * @returns {Object} Объект команд
 */
function loadTeams() {
  const data = readJSON(DATA_FILE, { teams: {} });
  return data.teams || {};
}

/**
 * Сохраняет объект команд в файл
 * @param {Object} teams Объект команд для сохранения
 */
function saveTeams(teams) {
  writeJSON(DATA_FILE, { teams });
}

/**
 * Возвращает команду по имени.
 * @param {string} name Название команды
 * @returns {Object|undefined} Объект команды или undefined
 */
function getTeam(name) {
  const teams = loadTeams();
  return teams[name];
}

/**
 * Возвращает все команды.
 * @returns {Object} Объект, где ключи — названия команд, значения — сами команды
 */
function getAllTeams() {
  return loadTeams();
}

/**
 * Возвращает массив названий всех команд.
 * @returns {string[]}
 */
function getAllTeamNames() {
  return Object.keys(loadTeams());
}

/**
 * Создаёт новую команду. Возвращает false, если команда с таким именем уже существует.
 * @param {string} name Название команды
 * @param {string[]} members Массив ID участников (5 шт.)
 * @returns {boolean} true, если создано; false, если уже существует
 */
function createTeam(name, members) {
  const teams = loadTeams();
  if (teams[name]) return false;
  teams[name] = { name, members: [...members], lastResult: null };
  saveTeams(teams);
  return true;
}

/**
 * Обновляет команду. Принимает частичные данные (например, members или lastResult)
 * @param {string} name Название команды
 * @param {Object} data Данные для обновления
 * @returns {boolean} true, если обновлено; false, если команды нет
 */
function updateTeam(name, data) {
  const teams = loadTeams();
  const team = teams[name];
  if (!team) return false;
  teams[name] = { ...team, ...data };
  saveTeams(teams);
  return true;
}

/**
 * Обновляет поле lastResult для команды.
 * @param {string} name
 * @param {'win'|'loss'|'draw'} result
 * @returns {boolean} true if updated
 */
function setResult(name, result) {
  return updateTeam(name, { lastResult: result });
}

/**
 * Удаляет команду.
 * @param {string} name Название команды
 * @returns {boolean} true, если удалено; false, если не найдено
 */
function deleteTeam(name) {
  const teams = loadTeams();
  if (!teams[name]) return false;
  delete teams[name];
  saveTeams(teams);
  return true;
}

module.exports = {
  getTeam,
  getAllTeams,
  getAllTeamNames,
  createTeam,
  updateTeam,
  deleteTeam,
  setResult
};