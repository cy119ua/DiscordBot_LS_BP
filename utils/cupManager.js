const path = require('path');
const { readJSON, writeJSON } = require('./storage');

// Файл для хранения CUP-прогнозов/ставок
const DATA_FILE = path.join(__dirname, '..', 'data', 'cup_predictions.json');

function loadData() {
  return readJSON(DATA_FILE, { bets: [] });
}

function saveData(obj) {
  writeJSON(DATA_FILE, obj || { bets: [] });
}

function addCupPrediction(guildId, userId, matchKey, prediction, roundId) {
  if (!guildId || !userId || !matchKey || !prediction) return false;
  const data = loadData();
  data.bets = Array.isArray(data.bets) ? data.bets : [];
  data.bets.push({ guildId, userId, matchKey, prediction, roundId: Number(roundId || 0), ts: Date.now() });
  saveData(data);
  return true;
}

function getCupPredictionsForMatch(guildId, matchKey) {
  const data = loadData();
  return (data.bets || []).filter(b => String(b.guildId) === String(guildId) && b.matchKey === matchKey);
}

function getCupPredictionsForUser(guildId, userId) {
  const data = loadData();
  return (data.bets || []).filter(b => String(b.guildId) === String(guildId) && String(b.userId) === String(userId));
}

function clearCupPredictionsForMatch(guildId, matchKey) {
  const data = loadData();
  data.bets = (data.bets || []).filter(b => !(String(b.guildId) === String(guildId) && b.matchKey === matchKey));
  saveData(data);
}

function clearAllCupPredictionsForGuild(guildId) {
  const data = loadData();
  data.bets = (data.bets || []).filter(b => String(b.guildId) !== String(guildId));
  saveData(data);
}

module.exports = {
  addCupPrediction,
  getCupPredictionsForMatch,
  getCupPredictionsForUser,
  clearCupPredictionsForMatch,
  clearAllCupPredictionsForGuild
};
