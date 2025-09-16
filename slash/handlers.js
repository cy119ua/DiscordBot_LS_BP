const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { getUser, setUser, addXP, calculateLevel, calculateXPProgress } = require('../database/userManager');
const { getPromoCode, hasUserUsedPromo, isCodeExpired, markPromoCodeUsed, createPromoCode } = require('../database/promoManager');
const { getSettings, patchSettings } = require('../database/settingsManager');
const { logAction } = require('../utils/logger');
const battlepass = require('../commands/battlepass');

// Менеджеры команд, ставок и истории
const { getTeam, getAllTeams, createTeam, updateTeam, deleteTeam } = require('../utils/teamManager');
const { addBet, getBetsForTeam, clearBetsForTeam } = require('../utils/betManager');
const { addBetHistory, addTeamCreate, addTeamResult, getBetHistoryForUser, getTeamHistory } = require('../utils/historyManager');

async function replyPriv(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ ...payload, ephemeral: true });
  }
  return interaction.reply({ ...payload, ephemeral: true });
};

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
      const oldProg = calculateXPProgress(before.xp || 0);

      let gained = 0;
      // Результат добавления XP для промокода
      let resPromo = null;
      if (promo.rewards && Number.isFinite(promo.rewards.xp)) {
        resPromo = await addXP(userId, promo.rewards.xp, 'promo');
        gained = resPromo.xpGained || 0;
      }
      await markPromoCodeUsed(code, userId);

      const after = await getUser(userId);
      const newLevel = calculateLevel(after.xp || 0);
      const newProg = calculateXPProgress(after.xp || 0);
      // Формируем строку изменения прогресса XP без повторения уровней. Вместо
      // сообщений вида "L (cur/need) → L (cur/need)" оставляем только прогресс
      // текущего уровня, а сами номера уровней будут отображаться отдельно.
      const xpChangeStr = resPromo
        ? `${resPromo.oldXPProgress?.progress || '0/100'} → ${resPromo.newXPProgress?.progress || '0/100'}`
        : `${oldProg.progress} → ${newProg.progress}`;

      await logAction('promo', interaction.guild, {
        user: { id: userId, tag: interaction.user.tag },
        code,
        gainedXp: gained,
        oldLevel,
        newLevel,
        xpChange: xpChangeStr
      });

      // Логирование наград, полученных в результате повышения уровня по промокоду
      // Сравниваем параметры до и после применения промокода
      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks = (after.cardPacks || 0) - (before.cardPacks || 0);
      if (diffDouble > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: userId, tag: interaction.user.tag },
          amount: diffDouble,
          rewardType: 'doubleTokens',
          level: newLevel
        });
      }
      if (diffRaffle > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: userId, tag: interaction.user.tag },
          amount: diffRaffle,
          rewardType: 'rafflePoints',
          level: newLevel
        });
      }
      if (diffInvites > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: userId, tag: interaction.user.tag },
          amount: diffInvites,
          rewardType: 'invites',
          level: newLevel
        });
      }
      if (diffPacks > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: userId, tag: interaction.user.tag },
          amount: diffPacks,
          rewardType: 'cardPacks',
          level: newLevel
        });
      }

      return replyPriv(interaction, { content: `✅ Код принят: +${gained} XP` });
    }
  },

  usedd: {
    async run(interaction) {
      // Разместить ставку на команду.
      const tokens = interaction.options.getInteger('tokens', true);
      const teamName = interaction.options.getString('team', false);

      // Проверка количества жетонов
      if (!Number.isFinite(tokens) || tokens <= 0) {
        return replyPriv(interaction, { content: '❌ Количество жетонов должно быть положительным числом.' });
      }
      if (tokens > 50) {
        return replyPriv(interaction, { content: '❌ Можно поставить максимум 50 жетонов за раз.' });
      }

      // Окно Double-Down должно быть открыто
      const settings = await getSettings(interaction.guild.id);
      if (!settings.ddEnabled) {
        return replyPriv(interaction, { content: '❌ Double-Down сейчас недоступен.' });
      }

      const userId = interaction.user.id;
      const userRecord = await getUser(userId);
      const current = Number(userRecord.doubleTokens || 0);
      if (current < tokens) {
        return replyPriv(interaction, { content: `❌ Недостаточно жетонов: есть ${current}, требуется ${tokens}.` });
      }

      // Если команда не указана, выдаём выпадающий список
      if (!teamName) {
        const teams = getAllTeams();
        const names = Object.keys(teams);
        if (names.length === 0) {
          return replyPriv(interaction, { content: '❌ Нет доступных команд для ставки. Попросите администратора создать команды.' });
        }
        const options = names.slice(0, 25).map((n) => ({ label: n, value: n }));
        const menu = new StringSelectMenuBuilder()
          .setCustomId(`usedd_team_select:${userId}:${tokens}`)
          .setPlaceholder('Выберите команду')
          .addOptions(options);
        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ content: 'Выберите команду для ставки:', components: [row], embeds: [], files: [], ephemeral: true });
      }

      // Проверяем существование команды
      const team = getTeam(teamName);
      if (!team) {
        const allNames = Object.keys(getAllTeams());
        const available = allNames.length ? allNames.map((n) => `**${n}**`).join(', ') : 'нет';
        return replyPriv(interaction, { content: `❌ Команда **${teamName}** не найдена. Доступные: ${available}.` });
      }

      // Списываем жетоны (повторная проверка)
      const fresh = await getUser(userId);
      const before = Number(fresh.doubleTokens || 0);
      if (before < tokens) {
        return replyPriv(interaction, { content: `❌ Недостаточно жетонов: есть ${before}, требуется ${tokens}.` });
      }
      fresh.doubleTokens = before - tokens;
      await setUser(userId, fresh);

      // Сохраняем ставку
      await addBet(userId, teamName, tokens);

      // История ставок
      addBetHistory({ type: 'bet', userId, team: teamName, tokens, members: team.members, xp: 0 });

      // Лог
      await logAction('doubleStake', interaction.guild, {
        user: { id: userId, tag: interaction.user.tag },
        tokens,
        team: teamName,
        beforeTokens: before,
        afterTokens: fresh.doubleTokens
      });

      return replyPriv(interaction, {
        content: `✅ Ставка принята: ${tokens} жетон(ов) на команду **${teamName}**. Осталось жетонов: ${fresh.doubleTokens}.`
      });
    }
  },

  bp: {
    adminOnly: false,
    async run(interaction) {
      // Определяем страницу исходя из уровня пользователя
      const u = await getUser(interaction.user.id);
      const level = calculateLevel(u.xp || 0);
      const page = battlepass.defaultLevelToPage(level);
      const embed = battlepass.makeEmbed({
        user: interaction.user,
        page,
        level,
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
        if (imgAtt) {
          embed.setImage(`attachment://${imgAtt.name}`);
          files = [imgAtt];
        }
      } catch (e) {
        console.error('[BP overlay error]', e?.message || e);
      }
      return replyPriv(interaction, { embeds: [embed], components, files });
    }
  },

  // Статистика боевого пропуска
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

  // Создание промокода (админ)
  setcode: {
    adminOnly: true,
    async run(interaction) {
      const codeStr = interaction.options.getString('code', true).toUpperCase();
      const minutes = interaction.options.getInteger('minutes', true);
      const xpAmount = interaction.options.getInteger('xp', true);
      const limit = interaction.options.getInteger('limit', false) || 0;
      const expiresAt = new Date(Date.now() + minutes * 60000);
      await createPromoCode(codeStr, { xp: xpAmount }, expiresAt, limit);
      await logAction('promo', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        code: codeStr,
        gainedXp: xpAmount,
        limit,
        minutes
      });
      return replyPriv(interaction, {
        content: `✅ Промокод \`${codeStr}\` создан: +${xpAmount} XP, срок ${minutes} мин., лимит ${limit || 'без ограничений'}.`
      });
    }
  },

  // ---------- ADMIN ----------
  xp: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      // Сохраняем состояние пользователя до начисления XP
      const before = await getUser(user.id);
      const res = await addXP(user.id, amount, 'manual_admin');
      const after = await getUser(user.id);
      // Формируем строку изменения опыта вида "L (cur/need) → L (cur/need)"
      // Формируем строку прогресса без повторения номеров уровней. Номера уровней
      // будут отображаться отдельно в логах. Пример: "35/100 → 20/100".
      const xpChangeStr = `${res.oldXPProgress?.progress || '0/100'} → ${res.newXPProgress?.progress || '0/100'}`;
      await logAction('xpAdd', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        amount: res.xpGained,
        oldLevel: res.oldLevel,
        newLevel: res.newLevel,
        xpChange: xpChangeStr
      });
      // Вычисляем разницу наград после повышения уровня
      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks = (after.cardPacks || 0) - (before.cardPacks || 0);
      const diffXP   = (after.xp || 0) - (before.xp || 0);
      // Логируем каждую полученную награду отдельно
      if (diffDouble > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: user.id, tag: user.tag },
          amount: diffDouble,
          rewardType: 'doubleTokens',
          level: res.newLevel
        });
      }
      if (diffRaffle > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: user.id, tag: user.tag },
          amount: diffRaffle,
          rewardType: 'rafflePoints',
          level: res.newLevel
        });
      }
      if (diffInvites > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: user.id, tag: user.tag },
          amount: diffInvites,
          rewardType: 'invites',
          level: res.newLevel
        });
      }
      if (diffPacks > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: user.id, tag: user.tag },
          amount: diffPacks,
          rewardType: 'cardPacks',
          level: res.newLevel
        });
      }
      return replyPriv(interaction, { content: `✅ <@${user.id}> +${res.xpGained} XP (уровень ${res.oldLevel} → ${res.newLevel})` });
    }
  },

  xpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      const oldXp = u.xp || 0;
      const oldLevel = calculateLevel(oldXp);
      const oldProg = calculateXPProgress(oldXp);
      // Устанавливаем новое значение XP без применения наград (ручная установка)
      u.xp = amount;
      await setUser(user.id, u);
      const newLevel = calculateLevel(u.xp || 0);
      const newProg = calculateXPProgress(u.xp || 0);
      // Формируем строку прогресса XP без повторения уровней, чтобы не дублировать
      // информацию: выводим только прогресс текущего уровня в формате
      // "curr/need → curr/need".
      const xpChangeStr = `${oldProg.progress} → ${newProg.progress}`;
      await logAction('xpSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        value: amount,
        oldLevel,
        newLevel,
        xpChange: xpChangeStr
      });
      return replyPriv(interaction, { content: `🛠️ XP для <@${user.id}> установлен на ${amount} (уровень ${oldLevel} → ${newLevel})` });
    }
  },

  xpinvite: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      // состояние до
      const before = await getUser(user.id);
      const res = await addXP(user.id, 100, 'invite');
      const u = await getUser(user.id);
      u.invites = (u.invites || 0) + 1;
      await setUser(user.id, u);
      // состояние после
      const after = await getUser(user.id);
      // Формируем строку изменения XP для логов
      // Формируем строку изменения прогресса XP без повторения уровней. Уровни
      // будут отображаться отдельно в логах, так что здесь выводим только
      // текущий прогресс (текущий XP / необходимый XP).
      const xpChangeStr = `${res.oldXPProgress?.progress || '0/100'} → ${res.newXPProgress?.progress || '0/100'}`;
      await logAction('xpInvite', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        gainedXp: res.xpGained,
        xpChange: xpChangeStr
      });
      // вычисляем разницу наград
      const diffDouble = (after.doubleTokens || 0) - (before.doubleTokens || 0);
      const diffRaffle = (after.rafflePoints || 0) - (before.rafflePoints || 0);
      const diffInvites = (after.invites || 0) - (before.invites || 0);
      const diffPacks = (after.cardPacks || 0) - (before.cardPacks || 0);
      if (diffDouble > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: user.id, tag: user.tag },
          amount: diffDouble,
          rewardType: 'doubleTokens',
          level: res.newLevel
        });
      }
      if (diffRaffle > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: user.id, tag: user.tag },
          amount: diffRaffle,
          rewardType: 'rafflePoints',
          level: res.newLevel
        });
      }
      if (diffInvites > 1) {
        // one invite is manually added below; subtract 1 to get level reward invites
        const rewardedInvites = diffInvites - 1;
        if (rewardedInvites > 0) {
          await logAction('bpReward', interaction.guild, {
            user: { id: user.id, tag: user.tag },
            amount: rewardedInvites,
            rewardType: 'invites',
            level: res.newLevel
          });
        }
      }
      if (diffPacks > 0) {
        await logAction('bpReward', interaction.guild, {
          user: { id: user.id, tag: user.tag },
          amount: diffPacks,
          rewardType: 'cardPacks',
          level: res.newLevel
        });
      }
      return replyPriv(interaction, { content: `✅ <@${user.id}>: +${res.xpGained} XP и +1 invite.` });
    }
  },

  gpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const points = interaction.options.getInteger('points', true);
      const u = await getUser(user.id);
      u.rafflePoints = points;
      await setUser(user.id, u);
      await logAction('raffleSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, points
      });
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
      await logAction('doubleStakeTokensSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, amount
      });
      return replyPriv(interaction, { content: `🎯 У <@${user.id}> установлено DD-жетонов: ${amount}.` });
    }
  },

  /**
   * Установить точное количество инвайтов пользователю.
   * Опции: user (USER), amount (INTEGER)
   */
  invset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.invites = amount;
      await setUser(user.id, u);
      await logAction('invitesSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        amount
      });
      return replyPriv(interaction, { content: `📨 У <@${user.id}> установлено инвайтов: ${amount}.` });
    }
  },

  /**
   * Установить точное количество паков карт пользователю.
   * Опции: user (USER), amount (INTEGER)
   */
  cpset: {
    adminOnly: true,
    async run(interaction) {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const u = await getUser(user.id);
      u.cardPacks = amount;
      await setUser(user.id, u);
      await logAction('cardPacksSet', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        target: { id: user.id, tag: user.tag },
        amount
      });
      return replyPriv(interaction, { content: `🃏 У <@${user.id}> установлено паков карт: ${amount}.` });
    }
  },

  ddstart: {
    adminOnly: true,
    async run(interaction) {
      await patchSettings(interaction.guild.id, { ddEnabled: true });
      await logAction('doubleStakeWindow', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: true
      });
      return replyPriv(interaction, { content: '✅ Окно Double-Down открыто.' });
    }
  },

  ddstop: {
    adminOnly: true,
    async run(interaction) {
      await patchSettings(interaction.guild.id, { ddEnabled: false });
      await logAction('doubleStakeWindow', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, enabled: false
      });
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
      await logAction('premiumChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, premium: true
      });
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
      await logAction('premiumChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag }, target: { id: user.id, tag: user.tag }, premium: false
      });
      return replyPriv(interaction, { content: `🆓 Премиум выключен для <@${user.id}>` });
    }
  },

  /**
   * Создать команду из 5 участников. Название команды должно быть уникальным.
   * Опции: name (STRING), player1..player5 (USER).
   */
  teamcreate: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();

      // Собираем участников
      const members = [];
      for (let i = 1; i <= 5; i++) {
        const optName = `player${i}`;
        const user = interaction.options.getUser(optName, true);
        members.push(user.id);
      }

      // Проверяем, что 5 уникальных участников
      if (new Set(members).size !== members.length) {
        return replyPriv(interaction, {
          content: '❌ Ошибка: необходимо указать 5 уникальных участников.'
        });
      }

      // Дополнительные проверки:
      const all = getAllTeams();

      // 1) Название команды уникально (без учёта регистра)
      const existsByName = Object.keys(all).some(
        (n) => n.toLowerCase() === name.toLowerCase()
      );
      if (existsByName) {
        return replyPriv(interaction, {
          content: `❌ Ошибка: команда с именем **${name}** уже существует.`
        });
      }

      // 2) Эти 5 участников не состоят в других командах
      const conflicts = [];
      for (const [tname, t] of Object.entries(all)) {
        const inTeam = new Set((t.members || []).map(String));
        for (const m of members) {
          if (inTeam.has(String(m))) {
            conflicts.push({ member: m, team: tname });
          }
        }
      }
      if (conflicts.length) {
        const pretty = conflicts
          .map((c) => `<@${c.member}> в «${c.team}»`)
          .join(', ');
        return replyPriv(interaction, {
          content: `❌ Ошибка: следующие участники уже состоят в других командах: ${pretty}`
        });
      }

      // 3) Запрещаем дублировать состав из тех же 5 участников (даже с другим именем)
      const norm = (arr) => [...new Set(arr.map(String))].sort().join('|');
      const sig = norm(members);
      for (const t of Object.values(all)) {
        if (norm(t.members || []) === sig) {
          return replyPriv(interaction, {
            content: '❌ Ошибка: команда с таким же составом уже существует.'
          });
        }
      }

      // Создаём команду
      const created = createTeam(name, members);
      if (!created) {
        return replyPriv(interaction, {
          content: `❌ Ошибка: команда **${name}** уже существует.`
        });
      }

      // История и лог
      addTeamCreate(name, members);
      await logAction('teamCreate', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name,
        members
      });

      const mentions = members.map((id) => `<@${id}>`).join(', ');
      return replyPriv(interaction, {
        content: `✅ Команда **${name}** создана. Участники: ${mentions}.`
      });
    }
  },

  /**
   * Заменить одного участника в существующей команде на другого.
   * Опции: name (STRING), old (USER), new (USER).
   */
  teamchange: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const oldUser = interaction.options.getUser('old', true);
      const newUser = interaction.options.getUser('new', true);

      if (oldUser.id === newUser.id) {
        return replyPriv(interaction, {
          content: '❌ Ошибка: вы указали одинаковых пользователей.'
        });
      }

      const team = getTeam(name);
      if (!team) {
        return replyPriv(interaction, {
          content: `❌ Ошибка: команда **${name}** не найдена.`
        });
      }

      // Если команда уже завершена (получила результат), запрещаем изменения
      if (team.lastResult) {
        return replyPriv(interaction, {
          content: '❌ Ошибка: команда уже завершена. Изменение состава недоступно.'
        });
      }

      const idx = team.members.indexOf(oldUser.id);
      if (idx === -1) {
        return replyPriv(interaction, {
          content: `❌ Ошибка: <@${oldUser.id}> не состоит в команде **${name}**.`
        });
      }

      if (team.members.includes(newUser.id)) {
        return replyPriv(interaction, {
          content: `❌ Ошибка: <@${newUser.id}> уже состоит в команде **${name}**.`
        });
      }

      // Заменяем участника
      team.members[idx] = newUser.id;
      updateTeam(name, { members: team.members });

      await logAction('teamChange', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name,
        oldMember: oldUser.id,
        newMember: newUser.id
      });

      return replyPriv(interaction, {
        content: `🔄 В команде **${name}** заменён <@${oldUser.id}> на <@${newUser.id}>.`
      });
    }
  },

  /**
   * Удалить существующую команду.
   * Опции: name (STRING)
   */
  teamdelete: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const removed = deleteTeam(name);
      if (!removed) {
        return replyPriv(interaction, {
          content: `❌ Ошибка: команда **${name}** не найдена.`
        });
      }

      await logAction('teamDelete', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name
      });

      return replyPriv(interaction, {
        content: `🗑️ Команда **${name}** удалена.`
      });
    }
  },

  /**
   * Выставить результат команды и начислить XP по ставкам. После этого
   * команда автоматически удаляется и её нельзя изменять.
   * Опции: name (STRING), result (STRING: win|loss|draw)
   */
  teamresult: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', true)?.trim();
      const result = interaction.options.getString('result', true); // win | loss | draw

      const team = getTeam(name);
      if (!team) {
        return replyPriv(interaction, {
          content: `❌ Ошибка: команда **${name}** не найдена.`
        });
      }

      // Фиксируем результат
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
          // Сохраняем состояние пользователя до начисления XP
          const beforeU = await getUser(bet.userId);
          await addXP(bet.userId, xpGain, 'teamBet');
          totalXp += xpGain;
          // Состояние после
          const afterU = await getUser(bet.userId);
          // Запись в историю выплат
          addBetHistory({
            type: 'payout',
            userId: bet.userId,
            team: name,
            tokens: bet.tokens,
            members: team.members,
            result,
            xp: xpGain
          });
          // Разница наград по уровням
          const diffDouble = (afterU.doubleTokens || 0) - (beforeU.doubleTokens || 0);
          const diffRaffle = (afterU.rafflePoints || 0) - (beforeU.rafflePoints || 0);
          const diffInvites = (afterU.invites || 0) - (beforeU.invites || 0);
          const diffPacks = (afterU.cardPacks || 0) - (beforeU.cardPacks || 0);
          const lvlNew = calculateLevel(afterU.xp || 0);
          // Пользователь объекта для логов
          const target = { id: bet.userId, tag: (await interaction.client.users.fetch(bet.userId)).tag };
          if (diffDouble > 0) {
            await logAction('bpReward', interaction.guild, {
              user: target,
              amount: diffDouble,
              rewardType: 'doubleTokens',
              level: lvlNew
            });
          }
          if (diffRaffle > 0) {
            await logAction('bpReward', interaction.guild, {
              user: target,
              amount: diffRaffle,
              rewardType: 'rafflePoints',
              level: lvlNew
            });
          }
          if (diffInvites > 0) {
            await logAction('bpReward', interaction.guild, {
              user: target,
              amount: diffInvites,
              rewardType: 'invites',
              level: lvlNew
            });
          }
          if (diffPacks > 0) {
            await logAction('bpReward', interaction.guild, {
              user: target,
              amount: diffPacks,
              rewardType: 'cardPacks',
              level: lvlNew
            });
          }
        }
      }

      // Очистить ставки и записать результат
      clearBetsForTeam(name);
      addTeamResult(name, team.members, result);

      // Удалить команду после результата
      deleteTeam(name);

      await logAction('teamResult', interaction.guild, {
        admin: { id: interaction.user.id, tag: interaction.user.tag },
        name,
        result,
        affected,
        totalXp
      });

      const map = { win: 'победа', loss: 'поражение', draw: 'ничья' };
      return replyPriv(interaction, {
        content: `📊 Результат для **${name}**: **${map[result] || result}**. Обработано ставок: ${affected}. Начислено XP: ${totalXp}.`
      });
    }
  },

  /**
   * Показать историю ставок пользователя. Опция: user (USER)
   */
  bethistory: {
    adminOnly: true,
    async run(interaction) {
      const target = interaction.options.getUser('user', true);
      const events = getBetHistoryForUser(target.id);
      if (!events || events.length === 0) {
        return replyPriv(interaction, { content: `🕑 У пользователя <@${target.id}> нет истории ставок.` });
      }

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

  /**
   * Показать историю команд. Опция: name (STRING, опционально)
   */
  teamhistory: {
    adminOnly: true,
    async run(interaction) {
      const name = interaction.options.getString('name', false);
      const events = getTeamHistory(name);
      if (!events || events.length === 0) {
        if (name) {
          return replyPriv(interaction, { content: `🕑 У команды **${name}** нет истории.` });
        }
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
      const embed = new EmbedBuilder()
        .setColor(0x2b6cb0)
        .setTitle(title)
        .setDescription(lines.join('\n'));
      return replyPriv(interaction, { embeds: [embed] });
    }
  }
};

// Экспорт с флагом adminOnly там, где нужно
module.exports = {
  code: { run: handlers.code.run },
  usedd: { run: handlers.usedd.run },
  bp: { run: handlers.bp.run, adminOnly: false },

  // Пользовательские/статусные
  bpstat: { run: handlers.bpstat.run, adminOnly: true },
  setcode: { run: handlers.setcode.run, adminOnly: true },

  // Админ-операции
  xp: { run: handlers.xp.run, adminOnly: true },
  xpset: { run: handlers.xpset.run, adminOnly: true },
  xpinvite: { run: handlers.xpinvite.run, adminOnly: true },
  gpset: { run: handlers.gpset.run, adminOnly: true },
  ddset: { run: handlers.ddset.run, adminOnly: true },
  // Установка числа инвайтов (админ)
  invset: { run: handlers.invset.run, adminOnly: true },
  // Установка числа паков карт (админ)
  cpset: { run: handlers.cpset.run, adminOnly: true },
  ddstart: { run: handlers.ddstart.run, adminOnly: true },
  ddstop: { run: handlers.ddstop.run, adminOnly: true },
  setlog: { run: handlers.setlog.run, adminOnly: true },
  premiumon: { run: handlers.premiumon.run, adminOnly: true },
  premiumoff: { run: handlers.premiumoff.run, adminOnly: true },

  // Управление командами (админ)
  teamcreate: { run: handlers.teamcreate.run, adminOnly: true },
  teamchange: { run: handlers.teamchange.run, adminOnly: true },
  teamdelete: { run: handlers.teamdelete.run, adminOnly: true },
  teamresult: { run: handlers.teamresult.run, adminOnly: true },

  // История (админ)
  bethistory: { run: handlers.bethistory.run, adminOnly: true },
  teamhistory: { run: handlers.teamhistory.run, adminOnly: true }
};