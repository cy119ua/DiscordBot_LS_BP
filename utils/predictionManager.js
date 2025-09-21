const path = require('path');
const { readJSON, writeJSON } = require('./storage');

// Файл, где хранятся активные прогнозы на исход матчей. Структура:
// { predictions: [ { userId, matchKey, prediction, ts } ] }
const DATA_FILE = path.join(__dirname, '..', 'data', 'predictions.json');

function loadPredictions() {
  const data = readJSON(DATA_FILE, { predictions: [] });
  return Array.isArray(data.predictions) ? data.predictions : [];
}

function savePredictions(preds) {
  writeJSON(DATA_FILE, { predictions: Array.isArray(preds) ? preds : [] });
}

/**
 * Добавляет или обновляет прогноз пользователя на конкретный матч. Если
 * пользователь уже делал прогноз на этот матч, новый прогноз перезаписывает
 * предыдущий. Возвращает true, если прогноз был добавлен или обновлён.
 *
 * @param {string} userId ID пользователя
 * @param {string} matchKey Ключ матча (например, "йцу1_йцу2")
 * @param {string} prediction Предсказанный исход: "team1", "team2" или "draw"
 * @returns {boolean}
 */
function addPrediction(userId, matchKey, prediction) {
  if (!userId || !matchKey || !prediction) return false;
  const preds = loadPredictions();
  const now = Date.now();
  let updated = false;
  for (const p of preds) {
    if (p.userId === userId && p.matchKey === matchKey) {
      p.prediction = prediction;
      p.ts = now;
      if (arguments.length > 3) p.ddWindowId = arguments[3];
      updated = true;
      break;
    }
  }
  if (!updated) {
    const predObj = { userId, matchKey, prediction, ts: now };
    if (arguments.length > 3) predObj.ddWindowId = arguments[3];
    preds.push(predObj);
  }
  savePredictions(preds);
  return true;
}

/**
 * Возвращает все прогнозы для указанного матча.
 * @param {string} matchKey
 * @returns {Array<{ userId:string, matchKey:string, prediction:string, ts:number }>}
 */
function getPredictionsForMatch(matchKey) {
  return loadPredictions().filter((p) => p.matchKey === matchKey);
}

/**
 * Возвращает все прогнозы пользователя (для всех матчей).
 * @param {string} userId
 * @returns {Array}
 */
function getPredictionsForUser(userId) {
  return loadPredictions().filter((p) => p.userId === userId);
}

/**
 * Удаляет все прогнозы для указанного матча.
 * @param {string} matchKey
 */
function clearPredictionsForMatch(matchKey) {
  const preds = loadPredictions().filter((p) => p.matchKey !== matchKey);
  savePredictions(preds);
}

/**
 * Очищает список всех прогнозов. Вызывается при открытии нового окна Double‑Down
 * для сброса всех ранее сделанных ставок. После вызова файл predictions.json
 * содержит пустой массив predictions.
 */
function clearAllPredictions() {
  savePredictions([]);
}

/**
 * Удаляет все прогнозы пользователя. Можно вызывать, когда необходимо
 * аннулировать прогнозы при изменении состава команд или при полном
 * сбросе данных.
 * @param {string} userId ID пользователя
 */
function removePredictionsForUser(userId) {
  const preds = loadPredictions().filter((p) => String(p.userId) !== String(userId));
  savePredictions(preds);
}

/**
 * Удаляет прогнозы пользователя, относящиеся к указанному матчу (matchKey).
 * @param {string} userId ID пользователя
 * @param {string} matchKey Ключ матча
 */
function removePredictionForUserAndMatch(userId, matchKey) {
  const preds = loadPredictions().filter((p) => !(String(p.userId) === String(userId) && p.matchKey === matchKey));
  savePredictions(preds);
}

module.exports = {
  addPrediction,
  getPredictionsForMatch,
  getPredictionsForUser,
  clearPredictionsForMatch,
  clearAllPredictions,
  removePredictionsForUser,
  removePredictionForUserAndMatch
};