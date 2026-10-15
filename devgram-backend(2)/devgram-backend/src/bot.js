// Bot assistant : (1) t'envoie chaque canal à valider, (2) fait tourner les automatisations (bienvenue, modération, publications).
process.env.NTBA_FIX_319 = '1'; process.env.NTBA_FIX_350 = '1';
const TelegramBot = require('node-telegram-bot-api');
const cfg = require('./config');
const db = require('./db');

const bot = new TelegramBot(cfg.bot.token, { polling: false });
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const FORMAT = { channel: 'Canal de diffusion', group: 'Groupe de discussion', forum: 'Groupe avec sujets' };

async function notifyOwner(text, extra = {}) {
  try { return await bot.sendMessage(cfg.bot.ownerId, text, { parse_mode: 'HTML', disable_web_page_preview: true, ...extra }); }
  catch (e) { console.error('Notification propriétaire impossible :', e.message); }
}

function reviewText(o) {
  const d = o.data, st = o.state, o2 = d.options;
  const checks = (st.checks || []).map((c) => `${c.ok ? '✅' : '❌'} ${esc(c.label)}${c.detail ? ` <i>(${esc(c.detail)})</i>` : ''}`).join('\n');
  const auto = [];
  if (o2.welcome) auto.push('✅ Bienvenue automatique');
  if (o2.moderation) auto.push(`✅ Modération (${o2.moderation.level})`);
  if (o2.buttons) auto.push('✅ Boutons-liens (message épinglé)');
  if (o2.schedule) auto.push('✅ Programmation : utilise /plan');
  const manual = [];
  if (o2.post) manual.push(`Publication auto (${esc(o2.post.frequency)}) : récupérer les contenus du client`);
  if (o2.relay) manual.push(`Relais depuis ${esc(o2.relay.source)} : à configurer`);
  return `🆕 <b>Commande ${o.ref}</b> prête à vérifier\n\n` +
    `👤 @${esc(o.tg_username)} · ${esc(o.email)}\n📦 ${FORMAT[d.format]} ${d.visibility === 'public' ? 'public' : 'privé'} · ${esc(d.activityLabel || d.activity)}\n` +
    `💶 ${(o.total_cents / 100).toFixed(2)} €  ·  ${d.delivery === 'express' ? '⚡ EXPRESS' : 'standard'}\n\n` +
    `<b>Contrôle automatique</b>\n${checks || '—'}\n` +
    (auto.length ? `\n<b>Automatisations</b>\n${auto.join('\n')}\n` : '') +
    (manual.length ? `\n⚠️ <b>À faire à la main</b>\n${manual.map((x) => '• ' + x).join('\n')}\n` : '');
}
const reviewKeyboard = (o) => ({ inline_keyboard: [
  [{ text: '🔗 Ouvrir le canal', url: o.state.invite }],
  [{ text: '✅ Valider et livrer', callback_data: 'ok:' + o.id }, { text: '🔁 Relancer', callback_data: 'retry:' + o.id }],
  [{ text: '❌ Rejeter', callback_data: 'no:' + o.id }],
] });

async function sendReview(id) {
  const o = db.get(id); if (!o) return;
  const m = await notifyOwner(reviewText(o), { reply_markup: reviewKeyboard(o) });
  if (m) db.update(id, { review_msg_id: m.message_id });
}
const alertFailure = (o) => notifyOwner(`🚨 <b>Commande ${o.ref}</b> : échec de la création\n\n<code>${esc(o.error)}</code>\n\n@${esc(o.tg_username)} · ${esc(o.data.name)}`,
  { reply_markup: { inline_keyboard: [[{ text: '🔁 Relancer', callback_data: 'retry:' + o.id }]] } });

const isOwner = (id) => id === cfg.bot.ownerId;

bot.on('callback_query', async (q) => {
  try {
    if (!isOwner(q.from.id)) return bot.answerCallbackQuery(q.id, { text: 'Non autorisé' });
    const [act, id] = q.data.split(':'); const o = db.get(id);
    if (!o) return bot.answerCallbackQuery(q.id, { text: 'Commande introuvable' });
    const done = () => bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: q.message.chat.id, message_id: q.message.message_id }).catch(() => {});
    if (act === 'ok') {
      if (o.status !== 'review') return bot.answerCallbackQuery(q.id, { text: 'Déjà traité' });
      db.update(id, { status: 'approved' }); await done(); return bot.answerCallbackQuery(q.id, { text: 'Livraison lancée ✅' });
    }
    if (act === 'retry') {
      const st = o.state; if (st.done) { delete st.done.selfcheck; delete st.done.invite; } db.saveState(id, st);
      db.update(id, { status: 'paid', error: null }); await done(); return bot.answerCallbackQuery(q.id, { text: 'Relance en cours 🔁' });
    }
    if (act === 'no') {
      db.update(id, { status: 'rejected' }); await done();
      await notifyOwner(`❌ Commande ${o.ref} rejetée. Pense à rembourser dans Stripe${o.payment_intent ? ` (<code>${esc(o.payment_intent)}</code>)` : ''}.`);
      return bot.answerCallbackQuery(q.id, { text: 'Rejetée' });
    }
  } catch (e) { console.error('callback', e); }
});

// ----- Commandes propriétaire -----
const guard = (fn) => (msg, m) => { if (isOwner(msg.from.id)) fn(msg, m).catch((e) => notifyOwner('Erreur : ' + esc(e.message))); };
bot.onText(/^\/(start|help)$/, guard(async () => notifyOwner(
  '<b>Commandes</b>\n/orders — commandes en cours\n/review REF — renvoyer la fiche de validation\n/retry REF — relancer une création\n' +
  '/username REF nouveau_nom — changer le nom public\n/plan REF AAAA-MM-JJ HH:MM texte — programmer une publication')));
bot.onText(/^\/orders$/, guard(async () => {
  const l = db.listActive(); notifyOwner(l.length ? l.map((r) => `<b>${r.ref}</b> · ${r.status} · ${esc(r.data.name)}`).join('\n') : 'Aucune commande en cours.');
}));
bot.onText(/^\/review (\S+)$/, guard(async (msg, m) => { const o = db.byRef(m[1]); if (o) await sendReview(o.id); }));
bot.onText(/^\/retry (\S+)$/, guard(async (msg, m) => { const o = db.byRef(m[1]); if (!o) return; db.update(o.id, { status: 'paid', error: null }); notifyOwner('🔁 Relance ' + o.ref); }));
bot.onText(/^\/username (\S+) @?([A-Za-z][A-Za-z0-9_]{4,31})$/, guard(async (msg, m) => {
  const o = db.byRef(m[1]); if (!o) return;
  o.data.username = m[2]; o.data.altUsername = null; db.saveData(o.id, o.data);
  o.state.done = o.state.done || {}; o.state.done.username = false; db.saveState(o.id, o.state);
  db.update(o.id, { status: 'paid', error: null }); notifyOwner(`🔁 ${o.ref} : nouvel essai avec t.me/${esc(m[2])}`);
}));

// Heure locale du client -> UTC
function zonedToUtc(y, mo, d, hh, mm, tz) {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  return new Date(guess - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess));
}
bot.onText(/^\/plan (\S+) (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) ([\s\S]+)$/, guard(async (msg, m) => {
  const o = db.byRef(m[1]); if (!o) return notifyOwner('Référence inconnue.');
  const tz = (o.data.options.schedule && o.data.options.schedule.timezone) || 'Europe/Paris';
  const when = zonedToUtc(+m[2], +m[3], +m[4], +m[5], +m[6], tz);
  if (when < new Date()) return notifyOwner('Cette date est déjà passée.');
  const id = db.addScheduled(o.id, m[7], when.toISOString());
  notifyOwner(`🗓 Publication #${id} programmée pour ${o.ref} le ${m[4]}/${m[3]}/${m[2]} à ${m[5]}:${m[6]} (${esc(tz)}).`);
}));

// ----- Automatisations dans les groupes -----
const adminCache = new Map();
async function isAdmin(chatId, userId) {
  const k = chatId + ':' + userId, hit = adminCache.get(k); if (hit && hit.exp > Date.now()) return hit.v;
  const v = await bot.getChatMember(chatId, userId).then((r) => ['creator', 'administrator'].includes(r.status)).catch(() => false);
  adminCache.set(k, { v, exp: Date.now() + 60000 }); return v;
}
bot.on('message', async (m) => {
  try {
    const info = db.chatInfo(String(m.chat.id).replace(/^-100/, '')); if (!info) return;
    const o = db.get(info.order_id); if (!o) return; const opt = o.data.options;
    if (m.new_chat_members && opt.welcome && info.role === 'main') {
      for (const u of m.new_chat_members) {
        if (u.is_bot) continue;
        const txt = o.data.welcomeMessage ? `👋 ${esc(u.first_name)}\n\n${esc(o.data.welcomeMessage)}` : `👋 Bienvenue ${esc(u.first_name)} !`;
        await bot.sendMessage(m.chat.id, txt, { parse_mode: 'HTML', message_thread_id: m.message_thread_id });
      }
    }
    if (opt.moderation && m.from && !m.sender_chat && !m.is_automatic_forward && !m.new_chat_members) {
      const ents = [...(m.entities || []), ...(m.caption_entities || [])];
      const link = ents.some((e) => e.type === 'url' || e.type === 'text_link');
      const fwd = opt.moderation.level === 'strict' && (m.forward_origin || m.forward_date);
      if ((link || fwd) && !(await isAdmin(m.chat.id, m.from.id))) await bot.deleteMessage(m.chat.id, m.message_id);
    }
  } catch (e) { console.error('message', e.message); }
});

module.exports = { bot, notifyOwner, sendReview, alertFailure, esc, start: () => bot.startPolling({ restart: true }) };
