// database/promoManager.js
// Хранилище промокодов с TTL в минутах и лимитом общих активаций.

const db = global.db;
if (!db) throw new Error('global.db не инициализирован. Убедись, что база подключена в index.js');

function promoKey(code) {
  return `promo_${String(code).toUpperCase()}`;
}

async function createPromoCode(code, rewards, expiresAt, maxUses = 0) {
  // rewards: { xp: number }
  const data = {
    code: String(code).toUpperCase(),
    rewards: rewards || {},
    expiresAt: expiresAt ? expiresAt.toISOString() : null, // null = бессрочно
    maxUses: Number.isFinite(maxUses) ? maxUses : 0,        // 0 = без лимита
    usedCount: 0,
    usedBy: [],
    createdAt: new Date().toISOString()
  };
  await db.set(promoKey(data.code), data);
  return true;
}

async function getPromoCode(code) {
  return db.get(promoKey(code));
}

async function hasUserUsedPromo(code, userId) {
  const p = await getPromoCode(code);
  if (!p) return false;
  return Array.isArray(p.usedBy) && p.usedBy.includes(userId);
}

function isCodeExpired(promo) {
  if (!promo) return true;
  if (promo.expiresAt && Date.now() > new Date(promo.expiresAt).getTime()) return true;
  if (promo.maxUses && promo.usedCount >= promo.maxUses) return true;
  return false;
}

async function markPromoCodeUsed(code, userId) {
  const key = promoKey(code);
  const p = await db.get(key);
  if (!p) return false;
  if (!Array.isArray(p.usedBy)) p.usedBy = [];
  if (!p.usedBy.includes(userId)) p.usedBy.push(userId);
  p.usedCount = (p.usedCount || 0) + 1;
  await db.set(key, p);
  return true;
}

module.exports = {
  createPromoCode,
  getPromoCode,
  hasUserUsedPromo,
  isCodeExpired,
  markPromoCodeUsed
};
