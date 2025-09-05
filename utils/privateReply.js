// utils/privateReply.js
async function privateReply(message, payload) {
  // 1) пробуем ЛС
  const dm = await message.author.createDM().catch(() => null);
  if (dm) {
    const res = await dm.send(payload).catch(() => null);
    if (res) {
      // в канале — короткое уведомление и удаление
      const note = await message.reply('📩 Проверьте личные сообщения').catch(()=>null);
      if (note) setTimeout(() => note.delete().catch(()=>{}), 5000);
      return res;
    }
  }
  // 2) fallback — ответ в канал
  return message.reply(payload);
}
module.exports = { privateReply };
