function getDB(){ const db = global.db; if(!db) throw new Error('DB not initialized'); return db; }
const pkey = (c)=>`promo_${String(c).toUpperCase()}`;

async function createPromoCode(code, rewards, expiresAt, maxUses=0){
  const db = getDB();
  const data = {
    code: String(code).toUpperCase(),
    rewards: rewards || {},
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    maxUses: Number.isFinite(maxUses) ? maxUses : 0,
    usedCount: 0,
    usedBy: [],
    createdAt: new Date().toISOString()
  };
  await db.set(pkey(data.code), data);
  return true;
}
async function getPromoCode(code){
  const db = getDB();
  return db.get(pkey(code));
}
async function hasUserUsedPromo(code, userId){
  const p = await getPromoCode(code);
  if (!p) return false;
  return Array.isArray(p.usedBy) && p.usedBy.includes(userId);
}
function isCodeExpired(p){
  if (!p) return true;
  if (p.expiresAt && Date.now()>new Date(p.expiresAt).getTime()) return true;
  if (p.maxUses && p.usedCount >= p.maxUses) return true;
  return false;
}
async function markPromoCodeUsed(code, userId){
  const db = getDB();
  const key = pkey(code);
  const p = await db.get(key);
  if (!p) return false;
  if (!Array.isArray(p.usedBy)) p.usedBy = [];
  if (!p.usedBy.includes(userId)) p.usedBy.push(userId);
  p.usedCount = (p.usedCount||0)+1;
  await db.set(key, p);
  return true;
}

module.exports = { createPromoCode, getPromoCode, hasUserUsedPromo, isCodeExpired, markPromoCodeUsed };
