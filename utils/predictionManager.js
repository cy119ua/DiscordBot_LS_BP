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
function addPrediction(userId, matchKey, prediction, ddWindowId) {
  if (!userId || !matchKey || !prediction || !ddWindowId) {
    console.error('[addPrediction] Missing required parameters:', { userId, matchKey, prediction, ddWindowId });
    return false;
  }
  const preds = loadPredictions();
  // Проверяем, делал ли пользователь ставку в этом окне
  if (preds.some(p => p.userId === userId && p.ddWindowId === ddWindowId)) {
    console.warn('[addPrediction] Duplicate prediction for user and window:', { userId, ddWindowId });
    return false; // Уже есть ставка для этого окна
  }
  const now = Date.now();
  const predObj = { userId, matchKey, prediction, ts: now, ddWindowId };
  preds.push(predObj);
  console.log('[addPrediction] Adding prediction:', predObj);
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
  // История предиктов теперь не очищается и не изменяется
  // Эта функция оставлена пустой для обратной совместимости
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