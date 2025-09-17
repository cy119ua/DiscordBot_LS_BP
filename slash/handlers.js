// sfth/slash/handlers.js
// ВАЖНО: никаких тяжёлых действий на верхнем уровне (во время require)!
// Всё, что может дернуть Discord API или БД — только внутри run().
const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const {
  getUser, setUser, addXP, calculateLevel, calculateXPProgress, reapplyRewardsForUser
} = require('../database/userManager');
const {
  getPromoCode, hasUserUsedPromo, isCodeExpired, markPromoCodeUsed, createPromoCode
} = require('../database/promoManager');
const { getSettings, patchSettings } = require('../database/settingsManager');
const { logAction } = require('../utils/logger');

// Менеджеры команд, ставок и истории
const { getTeam, getAllTeams, createTeam, updateTeam, deleteTeam } = require('../utils/teamManager');
const { addBet, getBetsForTeam, clearBetsForTeam } = require('../utils/betManager');
const {
  addBetHistory, addTeamCreate, addTeamResult, getBetHistoryForUser, getTeamHistory
} = require('../utils/historyManager');

function replyPriv(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ ...payload, ephemeral: true });
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

// безопасно получить тег (только внутри обработчиков)
async function fetchTagSafe(client, userId) {
  try { const u = await client.users.fetch(userId); return u.tag; }
  catch { return userId; }
}

const handlers = {
  // ---------- USER ----------
  code: {
    async run(interaction) {
      const code = interaction.options.getString('value', true).toUpperCase();
      const promo = await getPromoCode(code);
      if (!promo) return replyPriv(interaction, { content: '❌ Неверный код' });

      const userId = interaction.user.id;
      if (await hasUserUsedPromo(code, userId)) return replyPriv(interaction, { content: '❌ Вы уже использовали этот код' });
      if (isCodeExpired(promo)) return replyPriv(interaction, { content: '❌ Промокод недействителен' });

      const before = await getUser(userId);
      const oldLevel = calculateLevel(before.xp || 0);
      const oldProg  = calculateXPProgress(before.xp || 0);

      let resPromo = null;
      if (promo.rewards && Number.isFinite(promo.rewards.xp)) {
        resPromo = await addXP(userId, promo.rewards.xp, 'promo');
      }
      await markPromoCodeUsed(code, userId);

      const after = await getUser(userId);
      const newLevel = calculateLevel(after.xp || 0);
      const newProg  = calculateXPProgress(after.xp || 0);

      const xpChangeStr = resPromo
        ? `${resPromo.oldXPProgress?.progress || '0/100'} → ${resPromo.newXPProgress?.progress || '0/100'}`
        : `${oldProg.progress} → ${newProg.progress}`;

      await logAction('promo', interaction.guild, {
        user: { id: userId, tag: interaction.user.tag },
        code,
        gainedXp: resPromo ? resPromo.xpGained : 0,
        xpBase:   resPromo ? resPromo.xpBase   : 0,
        oldLevel,
        newLevel,
        xpChange: xpChangeStr
      });

      // Зафиксируем дельты наград
      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks = (after.cardPacks || 0) - (before.cardPacks || 0);
      const tgt = { id: userId, tag: interaction.user.tag };
      if (diffDouble > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffDouble, rewardType: 'doubleTokens', level: newLevel });
      if (diffRaffle > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffRaffle,  rewardType: 'rafflePoints', level: newLevel });
      if (diffInvites > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffInvites,  rewardType: 'invites',      level: newLevel });
      if (diffPacks  > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffPacks,   rewardType: 'cardPacks',   level: newLevel });

      return replyPriv(interaction, { content: `✅ Код принят: +${resPromo ? resPromo.xpGained : 0} XP` });
    }
  },

  usedd: {
    async run(interaction) {
      const tokens = interaction.options.getInteger('tokens', true);
      const teamName = interaction.options.getString('team', false);
      if (tokens !== 1 && tokens !== 2) {
        return replyPriv(interaction, { content: '❌ Можно использовать только 1 или 2 жетона.', ephemeral: true });
      }
      const settings = await getSettings(interaction.guild.id);
      if (!settings.ddEnabled) return replyPriv(interaction, { content: '❌ Double-Down сейчас недоступен.' });
      const windowId = settings.ddWindowId || 0;

      const userId = interaction.user.id;
      const u = await getUser(userId);
      const balance = Number(u.doubleTokens || 0);
      if (balance < tokens) return replyPriv(interaction, { content: `❌ Недостаточно жетонов: есть ${balance}, требуется ${tokens}.` });

      if (!u.ddWindow || u.ddWindow.id !== windowId) {
        u.ddWindow = { id: windowId, usedTokens: 0, betTeam: null };
      }
      if ((u.ddWindow.usedTokens || 0) + tokens > 2) {
        const remain = Math.max(0, 2 - (u.ddWindow.usedTokens || 0));
        return replyPriv(interaction, { content: `❌ Лимит жетонов на окно — 2. Доступно: ${remain}.`, ephemeral: true });
      }

      if (!teamName) {
        const teams = getAllTeams();
        const names = Object.keys(teams);
        if (!names.length) return replyPriv(interaction, { content: '❌ Нет доступных команд для ставки. Попросите администратора создать команды.' });
        const allow = u.ddWindow.betTeam ? [u.ddWindow.betTeam] : names;
        const options = allow.slice(0, 25).map((n) => ({ label: n, value: n }));
        const menu = new StringSelectMenuBuilder()
          .setCustomId(`usedd_team_select:${userId}:${tokens}`)
          .setPlaceholder('Выберите команду')
          .addOptions(options);
        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ content: 'Выберите команду для ставки:', components: [row], embeds: [], files: [], ephemeral: true });
      }

      const team = getTeam(teamName);
      if (!team) {
        const avail = Object.keys(getAllTeams());
        const txt = avail.length ? avail.map(n => `**${n}**`).join(', ') : 'нет';
        return replyPriv(interaction, { content: `❌ Команда **${teamName}** не найдена. Доступные: ${txt}.` });
      }
      if (u.ddWindow.betTeam && u.ddWindow.betTeam !== teamName) {
        return replyPriv(interaction, { content: `❌ В этом окне ставка уже была на **${u.ddWindow.betTeam}**. Ставка может быть только на одну команду.`, ephemeral: true });
      }

      const before = Number(u.doubleTokens || 0);
      u.doubleTokens = before - tokens;
      u.ddWindow.usedTokens = (u.ddWindow.usedTokens || 0) + tokens;
      if (!u.ddWindow.betTeam) u.ddWindow.betTeam = teamName;
      await setUser(userId, u);

      await addBet(userId, teamName, tokens);
      addBetHistory({ type: 'bet', userId, team: teamName, tokens, members: team.members, xp: 0 });

      await logAction('doubleStake', interaction.guild, {
        user: { id: userId, tag: interaction.user.tag },
        tokens, team: teamName, beforeTokens: before, afterTokens: u.doubleTokens
      });

      return replyPriv(interaction, { content: `✅ Ставка принята: ${tokens} жетон(ов) на **${teamName}**. Осталось жетонов: ${u.doubleTokens}. (Окно #${windowId}: ${u.ddWindow.usedTokens}/2)` });
    }
  },

  bp: {
    adminOnly: false,
    async run(interaction) {
      const battlepass = require('../commands/battlepass'); // ленивый импорт
      const u = await getUser(interaction.user.id);
      const level = calculateLevel(u.xp || 0);
      const page = battlepass.defaultLevelToPage(level);
      const embed = battlepass.makeEmbed({
        user: interaction.user,
        page, level,
        xp: u.xp || 0,
        invites: u.invites || 0,
        doubleTokens: u.doubleTokens || 0,
        rafflePoints: u.rafflePoints || 0,
        cardPacks: u.cardPacks || 0
      });
      const components = battlepass.makePageButtons(page);
      let files;
      try {
        const imgAtt = await battlepass.generateImageAttachment(u, page, level, u.xp || 0);
        if (imgAtt) { embed.setImage(`attachment://${imgAtt.name}`); files = [imgAtt]; }
      } catch(e) { console.error('[BP overlay error]', e?.message || e); }
      return replyPriv(interaction, { embeds: [embed], components, files });
    }
  },

  // ---------- ADMIN ----------
  bpstat: {
    adminOnly: true,
    async run(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      const u = await getUser(target.id);
      const level = calculateLevel(u.xp || 0);
      const progress = calculateXPProgress(u.xp || 0);

      const emb = new EmbedBuilder()
        .setColor(u.premium ? 0xffd700 : 0x2b6cb0)
        .setTitle(`BP-статистика — ${target.tag}`)
        .addFields(
          { name: 'Уровень', value: String(level), inline: true },
          { name: 'XP', value: String(u.xp || 0), inline: true },
          { name: 'Прогресс', value: progress.progress, inline: true },
          { name: 'DD-жетоны', value: String(u.doubleTokens || 0), inline: true },
          { name: 'Очки розыгрыша', value: String(u.rafflePoints || 0), inline: true },
          { name: 'Инвайты', value: String(u.invites || 0), inline: true },
          { name: 'Паки карт', value: String(u.cardPacks || 0), inline: true },
          { name: 'Премиум', value: u.premium ? 'активен' : 'нет', inline: true }
        )
        .setFooter({ text: `ID: ${target.id}` });

      return replyPriv(interaction, { embeds: [emb] });
    }
  },

  setcode: {
    adminOnly: true,
    async run(interaction) {
      const codeStr  = interaction.options.getString('code', true).toUpperCase();
      const minutes  = interaction.options.getInteger('minutes', true);
      const xpAmount = interaction.options.getInteger('xp', true);
      const limit    = interaction.options.getInteger('limit', false) || 0;
      const expiresAt = new Date(Date.now() + minutes * 60000);
      await createPromoCode(codeStr, { xp: xpAmount }, expiresAt, limit);
      await logAction('promo', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        code: codeStr, gainedXp: xpAmount, limit, minutes
      });
      return replyPriv(interaction, { content: `✅ Промокод \`${codeStr}\` создан (+${xpAmount} XP, ${minutes} мин., лимит ${limit || '∞'})` });
    }
  },

  xp: {
    adminOnly: true,
    async run(interaction) {
      const user   = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const before = await getUser(user.id);
      const res    = await addXP(user.id, amount, 'manual_admin');
      const after  = await getUser(user.id);
      const xpChangeStr = `${res.oldXPProgress?.progress || '0/100'} → ${res.newXPProgress?.progress || '0/100'}`;

      await logAction('xpAdd', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        amount: res.xpGained, gainedXp: res.xpGained, xpBase: res.xpBase,
        oldLevel: res.oldLevel, newLevel: res.newLevel, xpChange: xpChangeStr
      });

      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks = (after.cardPacks || 0) - (before.cardPacks || 0);
      const lvlNew = res.newLevel;
      const tgt = { id: user.id, tag: user.tag };
      if (diffDouble > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffDouble, rewardType: 'doubleTokens', level: lvlNew });
      if (diffRaffle > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffRaffle,  rewardType: 'rafflePoints', level: lvlNew });
      if (diffInvites > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffInvites,  rewardType: 'invites',      level: lvlNew });
      if (diffPacks  > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffPacks,   rewardType: 'cardPacks',   level: lvlNew });

      return replyPriv(interaction, { content: `✅ <@${user.id}> +${res.xpGained} XP (уровень ${res.oldLevel} → ${res.newLevel})` });
    }
  },

  xpset: {
    adminOnly: true,
    async run(interaction) {
      const user   = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      const oldXp = u.xp || 0;
      const oldLevel = calculateLevel(oldXp);
      const oldProg  = calculateXPProgress(oldXp);
      u.xp = amount;
      await setUser(user.id, u);
      const newLevel = calculateLevel(u.xp || 0);
      const newProg  = calculateXPProgress(u.xp || 0);
      const xpChangeStr = `${oldProg.progress} → ${newProg.progress}`;
      await logAction('xpSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        value: amount, oldLevel, newLevel, xpChange: xpChangeStr
      });
      return replyPriv(interaction, { content: `🛠️ XP для <@${user.id}> установлен на ${amount} (уровень ${oldLevel} → ${newLevel})` });
    }
  },

  xpinvite: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const before = await getUser(user.id);
      const res = await addXP(user.id, 100, 'invite');
      const u = await getUser(user.id);
      u.invites = (u.invites || 0) + 1;
      await setUser(user.id, u);
      const after = await getUser(user.id);
      const xpChangeStr = `${res.oldXPProgress?.progress || '0/100'} → ${res.newXPProgress?.progress || '0/100'}`;
      await logAction('xpInvite', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        gainedXp: res.xpGained, xpBase: res.xpBase, xpChange: xpChangeStr
      });
      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks   = (after.cardPacks || 0) - (before.cardPacks || 0);
      const lvlNew = calculateLevel(after.xp || 0);
      const tgt = { id: user.id, tag: user.tag };
      if (diffDouble > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffDouble, rewardType: 'doubleTokens', level: lvlNew });
      if (diffRaffle > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffRaffle,  rewardType: 'rafflePoints', level: lvlNew });
      if (diffInvites > 1) { const rewardedInvites = diffInvites - 1; if (rewardedInvites > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: rewardedInvites, rewardType: 'invites', level: lvlNew }); }
      if (diffPacks  > 0) await logAction('bpReward', interaction.guild, { user: tgt, amount: diffPacks,   rewardType: 'cardPacks', level: lvlNew });

      return replyPriv(interaction, { content: `✅ <@${user.id}>: +${res.xpGained} XP и +1 invite.` });
    }
  },

  // Ручные сеттеры
  gpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const points = interaction.options.getInteger('points', true);
      const u = await getUser(user.id);
      u.rafflePoints = points;
      await setUser(user.id, u);
      await logAction('raffleSet', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, points });
      return replyPriv(interaction, { content: `🎟️ У <@${user.id}> теперь ${points} очков розыгрыша.` });
    }
  },
  ddset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.doubleTokens = amount;
      await setUser(user.id, u);
      await logAction('doubleStakeTokensSet', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, amount });
      return replyPriv(interaction, { content: `🎯 У <@${user.id}> установлено DD-жетонов: ${amount}.` });
    }
  },
  invset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.invites = amount;
      await setUser(user.id, u);
      await logAction('invitesSet', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, amount });
      return replyPriv(interaction, { content: `🤝 У <@${user.id}> установлено инвайтов: ${amount}.` });
    }
  },
  cpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.cardPacks = amount;
      await setUser(user.id, u);
      await logAction('cardPacksSet', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, amount });
      return replyPriv(interaction, { content: `🃏 У <@${user.id}> установлено паков карт: ${amount}.` });
    }
  },

  bpreapply: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const includeXP = !!interaction.options.getBoolean('includexp', false);
      const res = await reapplyRewardsForUser(user.id, includeXP);
      await logAction('bpReapply', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, level: res.level, deltas: JSON.stringify(res.deltas) });
      return replyPriv(interaction, { content: `🔁 Доначислены недостающие награды для <@${user.id}> (уровень ${res.level}).` });
    }
  },

  userreset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const u = await getUser(user.id);
      u.xp = 0; u.doubleTokens = 0; u.rafflePoints = 0; u.invites = 0; u.cardPacks = 0;
      await setUser(user.id, u);
      await logAction('userReset', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag } });
      return replyPriv(interaction, { content: `🧹 Пользователь <@${user.id}> обнулён.` });
    }
  },

  dbreset: {
    adminOnly: true,
    async run(interaction) {
      const confirm = interaction.options.getBoolean('confirm', true);
      if (!confirm) return replyPriv(interaction, { content: 'Отмена.' });

      let wiped = 0;
      try {
        const db = global.db;
        if (db?.list && db?.delete) {
          const keys = await db.list('user_');
          for (const k of keys) { await db.delete(k); wiped++; }
        }
      } catch (e) { console.error('[dbreset/list-delete]', e); }
      await logAction('dbReset', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, value: `users=${wiped}` });
      return replyPriv(interaction, { content: `💣 Сброшено пользователей: ${wiped}.` });
    }
  },

  ddstart: {
    adminOnly: true,
    async run(interaction) {
      const settings = await getSettings(interaction.guild.id);
      const nextId = (settings.ddWindowId || 0) + 1;
      await patchSettings(interaction.guild.id, { ddEnabled: true, ddWindowId: nextId });
      await logAction('doubleStakeWindow', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: true, value: `windowId=${nextId}` });
      return interaction.reply({ content: `✅ Окно Double-Down открыто (ID: ${nextId}).`, ephemeral: true });
    }
  },

  ddstop: {
    adminOnly: true,
    async run(interaction) {
      await patchSettings(interaction.guild.id, { ddEnabled: false });
      await logAction('doubleStakeWindow', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: false });
      return replyPriv(interaction, { content: '🛑 Окно Double-Down закрыто.' });
    }
  },

  setlog: {
    adminOnly: true,
    async run(interaction) {
      const ch = interaction.options.getChannel('channel', true);
      await patchSettings(interaction.guild.id, { logChannelId: ch.id });
      return replyPriv(interaction, { content: `✅ Лог-канал: <#${ch.id}>` });
    }
  },

  premiumon: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const u = await getUser(user.id);
      u.premium = true;
      u.premium_since = new Date().toISOString();
      await setUser(user.id, u);
      await logAction('premiumChange', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, premium: true });
      return replyPriv(interaction, { content: `⭐ Премиум включён для <@${user.id}>` });
    }
  },

  premiumoff: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const u = await getUser(user.id);
      u.premium = false;
      await setUser(user.id, u);
      await logAction('premiumChange', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, premium: false });
      return replyPriv(interaction, { content: `🆓 Премиум выключен для <@${user.id}>` });
    }
  },

  // ---------- Команды для команд ----------
  teamcreate: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const members = [];
      for (let i = 1; i <= 5; i++) {
        const optName = `player${i}`;
        const user = interaction.options.getUser(optName, true);
        members.push(user.id);
      }
      if (new Set(members).size !== members.length) {
        return replyPriv(interaction, { content: '❌ Ошибка: необходимо указать 5 уникальных участников.' });
      }
      const all = getAllTeams();
      const existsByName = Object.keys(all).some((n) => n.toLowerCase() === name.toLowerCase());
      if (existsByName) return replyPriv(interaction, { content: `❌ Ошибка: команда с именем **${name}** уже существует.` });

      const conflicts = [];
      for (const [tname, t] of Object.entries(all)) {
        const inTeam = new Set((t.members || []).map(String));
        for (const m of members) if (inTeam.has(String(m))) conflicts.push({ member: m, team: tname });
      }
      if (conflicts.length) {
        const pretty = conflicts.map((c) => `<@${c.member}> в «${c.team}»`).join(', ');
        return replyPriv(interaction, { content: `❌ Ошибка: следующие участники уже состоят в других командах: ${pretty}` });
      }

      const norm = (arr) => [...new Set(arr.map(String))].sort().join('|');
      const sig = norm(members);
      for (const t of Object.values(all)) {
        if (norm(t.members || []) === sig) {
          return replyPriv(interaction, { content: '❌ Ошибка: команда с таким же составом уже существует.' });
        }
      }

      const created = createTeam(name, members);
      if (!created) return replyPriv(interaction, { content: `❌ Ошибка: команда **${name}** уже существует.` });

      addTeamCreate(name, members);
      // информативный лог: название и ники участников
      const memberTags = await Promise.all(members.map((id) => fetchTagSafe(interaction.client, id)));
      await logAction('teamCreate', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name,
        membersList: memberTags
      });

      const mentions = members.map((id) => `<@${id}>`).join(', ');
      return replyPriv(interaction, { content: `✅ Команда **${name}** создана. Участники: ${mentions}.` });
    }
  },

  teamchange: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const oldUser = interaction.options.getUser('old', true);
      const newUser = interaction.options.getUser('new', true);
      if (oldUser.id === newUser.id) {
        return replyPriv(interaction, { content: '❌ Ошибка: вы указали одинаковых пользователей.' });
      }
      const team = getTeam(name);
      if (!team) return replyPriv(interaction, { content: `❌ Ошибка: команда **${name}** не найдена.` });
      if (team.lastResult) return replyPriv(interaction, { content: '❌ Ошибка: команда уже завершена. Изменение состава недоступно.' });

      const idx = team.members.indexOf(oldUser.id);
      if (idx === -1) return replyPriv(interaction, { content: `❌ Ошибка: <@${oldUser.id}> не состоит в команде **${name}**.` });
      if (team.members.includes(newUser.id)) return replyPriv(interaction, { content: `❌ Ошибка: <@${newUser.id}> уже состоит в команде **${name}**.` });

      team.members[idx] = newUser.id;
      updateTeam(name, { members: team.members });

      const memberTags = await Promise.all(team.members.map((id) => fetchTagSafe(interaction.client, id)));
      const oldTag = await fetchTagSafe(interaction.client, oldUser.id);
      const newTag = await fetchTagSafe(interaction.client, newUser.id);

      await logAction('teamChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name,
        change: `${oldTag} → ${newTag}`,
        membersList: memberTags
      });

      return replyPriv(interaction, { content: `🔄 В команде **${name}** заменён <@${oldUser.id}> на <@${newUser.id}>.` });
    }
  },

  teamdelete: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const removed = deleteTeam(name);
      if (!removed) return replyPriv(interaction, { content: `❌ Ошибка: команда **${name}** не найдена.` });

      await logAction('teamDelete', interaction.guild, { admin: { id: interaction.user.id, tag: interaction.user.tag }, name });
      return replyPriv(interaction, { content: `🗑️ Команда **${name}** удалена.` });
    }
  },

  teamresult: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const result = interaction.options.getString('result', true); // win | loss | draw

      const team = getTeam(name);
      if (!team) return replyPriv(interaction, { content: `❌ Ошибка: команда **${name}** не найдена.` });

      updateTeam(name, { lastResult: result });

      // Обрабатываем ставки
      const bets = getBetsForTeam(name);
      let affected = 0;
      let totalXp = 0;
      const xpPerToken = result === 'win' ? 20 : result === 'draw' ? 10 : 0;

      for (const bet of bets) {
        affected++;
        if (xpPerToken > 0) {
          const xpGain = xpPerToken * bet.tokens;
          const beforeU = await getUser(bet.userId);
          const resTeam = await addXP(bet.userId, xpGain, 'teamBet');
          totalXp += resTeam.xpGained;
          const afterU = await getUser(bet.userId);
          addBetHistory({ type: 'payout', userId: bet.userId, team: name, tokens: bet.tokens, members: team.members, result, xp: resTeam.xpGained });

          const diffDouble = (afterU.doubleTokens || 0) - (beforeU.doubleTokens || 0);
          const diffRaffle = (afterU.rafflePoints || 0) - (beforeU.rafflePoints || 0);
          const diffInvites = (afterU.invites || 0) - (beforeU.invites || 0);
          const diffPacks   = (afterU.cardPacks || 0) - (beforeU.cardPacks || 0);
          const lvlNew = calculateLevel(afterU.xp || 0);
          const target = { id: bet.userId, tag: await fetchTagSafe(interaction.client, bet.userId) };
          if (diffDouble > 0) await logAction('bpReward', interaction.guild, { user: target, amount: diffDouble, rewardType: 'doubleTokens', level: lvlNew });
          if (diffRaffle > 0) await logAction('bpReward', interaction.guild, { user: target, amount: diffRaffle,  rewardType: 'rafflePoints', level: lvlNew });
          if (diffInvites > 0) await logAction('bpReward', interaction.guild, { user: target, amount: diffInvites,  rewardType: 'invites',      level: lvlNew });
          if (diffPacks  > 0) await logAction('bpReward', interaction.guild, { user: target, amount: diffPacks,   rewardType: 'cardPacks',   level: lvlNew });
        }
      }

      // Награды участникам команды — ленивый импорт config (во время run, НЕ на require)
      let teamRewards = {};
      try {
        teamRewards = require('../config')?.teamRewards?.[result] || {};
      } catch (_) { teamRewards = {}; }

      const memberXPList = [];
      for (const memberId of (team.members || [])) {
        let gotXP = 0, baseXP = 0;
        if (teamRewards.xp && Number(teamRewards.xp) > 0) {
          const res = await addXP(memberId, Number(teamRewards.xp), 'teamMemberReward');
          gotXP = res.xpGained; baseXP = res.xpBase;
        }
        const u = await getUser(memberId);
        if (teamRewards.doubleTokens) { u.doubleTokens = (u.doubleTokens || 0) + Number(teamRewards.doubleTokens || 0); }
        if (teamRewards.invites)      { u.invites      = (u.invites || 0)      + Number(teamRewards.invites || 0); }
        if (teamRewards.rafflePoints) { u.rafflePoints = (u.rafflePoints || 0) + Number(teamRewards.rafflePoints || 0); }
        if (teamRewards.cardPacks)    { u.cardPacks    = (u.cardPacks || 0)    + Number(teamRewards.cardPacks || 0); }
        await setUser(memberId, u);

        const tag = await fetchTagSafe(interaction.client, memberId);
        memberXPList.push({ id: memberId, tag, gainedXp: gotXP, xpBase: baseXP });
      }

      // Сводка ставок
      let betsSummary = '';
      if (bets.length) {
        const items = await Promise.all(bets.map(async b => {
          const tag = await fetchTagSafe(interaction.client, b.userId);
          const total = xpPerToken > 0 ? xpPerToken * b.tokens : 0;
          return `• ${tag}: ${b.tokens} жет. ⇒ ${total} XP`;
        }));
        betsSummary = items.join('\n');
      }

      clearBetsForTeam(name);
      addTeamResult(name, team.members, result);
      deleteTeam(name);

      await logAction('teamResult', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name, result, affected, totalXp,
        membersXPList: memberXPList,
        betsSummary
      });

      return replyPriv(interaction, { content: `📊 Результат для **${name}**: **${result}**. Обработано ставок: ${affected}. Начислено XP: ${totalXp}.` });
    }
  },

  bethistory: {
    adminOnly: true,
    async run(interaction) {
      const target = interaction.options.getUser('user', true);
      const events = getBetHistoryForUser(target.id);
      if (!events || events.length === 0) return replyPriv(interaction, { content: `🕑 У пользователя <@${target.id}> нет истории ставок.` });
      const lines = events.slice(-15).map((e) => {
        const date = new Date(e.ts).toLocaleString();
        if (e.type === 'bet') {
          const members = e.members?.map((m) => `<@${m}>`).join(', ') || '';
          return `🟦 [${date}] Ставка: **${e.team}** — ${e.tokens} жет. Состав: ${members}`;
        } else if (e.type === 'payout') {
          const map = { win: 'победа', loss: 'поражение', draw: 'ничья' };
          return `🟩 [${date}] Выплата: **${e.team}** (${map[e.result] || e.result}) — ${e.tokens} жет. ⇒ +${e.xp} XP`;
        }
        return `ℹ️ [${date}] Неизвестное событие`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x2b6cb0)
        .setTitle(`История ставок — ${target.tag}`)
        .setDescription(lines.join('\n'));
      return replyPriv(interaction, { embeds: [embed] });
    }
  },

  teamhistory: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', false);
      const events = getTeamHistory(name);
      if (!events || events.length === 0) {
        if (name) return replyPriv(interaction, { content: `🕑 У команды **${name}** нет истории.` });
        return replyPriv(interaction, { content: '🕑 Нет истории команд.' });
      }
      const lines = events.slice(-20).map((e) => {
        const date = new Date(e.ts).toLocaleString();
        if (e.type === 'create') {
          const members = e.members?.map((m) => `<@${m}>`).join(', ') || '';
          return `🆕 [${date}] Создана команда **${e.name}**: ${members}`;
        } else if (e.type === 'result') {
          const map = { win: 'победа', loss: 'поражение', draw: 'ничья' };
          const members = e.members?.map((m) => `<@${m}>`).join(', ') || '';
          return `🏁 [${date}] Результат команды **${e.name}**: ${map[e.result] || e.result}. Состав: ${members}`;
        }
        return `ℹ️ [${date}] Неизвестное событие`;
      });

      const title = name ? `История команды — ${name}` : 'История всех команд';
      const embed = new EmbedBuilder().setColor(0x2b6cb0).setTitle(title).setDescription(lines.join('\n'));
      return replyPriv(interaction, { embeds: [embed] });
    }
  }
};

// Экспорт команд (ничего лишнего не выполняет)
module.exports = {
  code: { run: handlers.code.run },
  usedd: { run: handlers.usedd.run },
  bp: { run: handlers.bp.run, adminOnly: false },

  bpstat: { run: handlers.bpstat.run, adminOnly: true },
  setcode: { run: handlers.setcode.run, adminOnly: true },

  xp: { run: handlers.xp.run, adminOnly: true },
  xpset: { run: handlers.xpset.run, adminOnly: true },
  xpinvite: { run: handlers.xpinvite.run, adminOnly: true },

  gpset: { run: handlers.gpset.run, adminOnly: true },
  ddset: { run: handlers.ddset.run, adminOnly: true },
  invset: { run: handlers.invset.run, adminOnly: true },
  cpset: { run: handlers.cpset.run, adminOnly: true },

  bpreapply: { run: handlers.bpreapply.run, adminOnly: true },
  userreset: { run: handlers.userreset.run, adminOnly: true },
  dbreset:   { run: handlers.dbreset.run,   adminOnly: true },

  ddstart: { run: handlers.ddstart.run, adminOnly: true },
  ddstop:  { run: handlers.ddstop.run,  adminOnly: true },
  setlog:  { run: handlers.setlog.run,  adminOnly: true },

  teamcreate: { run: handlers.teamcreate.run, adminOnly: true },
  teamchange: { run: handlers.teamchange.run, adminOnly: true },
  teamdelete: { run: handlers.teamdelete.run, adminOnly: true },
  teamresult: { run: handlers.teamresult.run, adminOnly: true },
  bethistory: { run: handlers.bethistory.run, adminOnly: true },
  teamhistory:{ run: handlers.teamhistory.run, adminOnly: true }
};
