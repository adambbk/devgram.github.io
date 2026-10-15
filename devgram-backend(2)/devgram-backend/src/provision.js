// Crée le canal/groupe à partir de la commande. Chaque étape est enregistrée : en cas d'erreur ou de redémarrage,
// on reprend là où on s'était arrêté, sans créer de doublon.
const db = require('./db');
const tg = require('./tg-user');
const { bot } = require('./bot');
const TOPICS = require('./topics');

const pause = () => tg.sleep(1500 + Math.random() * 1500);
const I18N = {
  fr: (n) => `Bienvenue sur ${n} 👋`, en: (n) => `Welcome to ${n} 👋`, es: (n) => `Bienvenido a ${n} 👋`,
  de: (n) => `Willkommen bei ${n} 👋`, it: (n) => `Benvenuto su ${n} 👋`, pt: (n) => `Bem-vindo ao ${n} 👋`,
};
const intro = (lang, n) => (I18N[lang] || I18N.en)(n);

const KNOWN = {
  CHANNELS_ADMIN_PUBLIC_TOO_MUCH: 'Le compte créateur a atteint sa limite de canaux/groupes publics.',
  CHANNELS_TOO_MUCH: 'Le compte créateur a atteint sa limite de canaux/groupes.',
  USERNAME_PURCHASE_AVAILABLE: 'Ce nom d\u2019utilisateur est réservé à la vente.',
  CHAT_ADMIN_REQUIRED: 'Droits insuffisants sur le canal.',
  PEER_FLOOD: 'Telegram limite temporairement le compte (trop d\u2019actions).',
};
function explain(e) {
  const m = e.errorMessage || e.message || String(e);
  for (const [k, v] of Object.entries(KNOWN)) if (m.includes(k)) return `${v} (${m})`;
  return m;
}

const STEPS = [
  ['create_main', async (o, st) => {
    const d = o.data;
    const c = await tg.createChat({ title: d.name, about: d.description, kind: d.format === 'channel' ? 'channel' : 'group' });
    st.chat = { main: c.id }; db.saveState(o.id, st); // enregistré tout de suite (évite un doublon si crash)
    db.linkChat(c.id, o.id, 'main');
  }],
  ['forum', async (o, st) => { if (o.data.format === 'forum') await tg.toggleForum(st.chat.main); }],
  ['create_linked', async (o, st) => {
    if (!o.data.linkedGroup) return;
    const c = await tg.createChat({ title: `${o.data.name} · Discussion`, about: '', kind: 'group' });
    st.chat.linked = c.id; db.saveState(o.id, st); db.linkChat(c.id, o.id, 'linked');
    await tg.setDiscussion(st.chat.main, c.id);
  }],
  ['username', async (o, st) => {
    const d = o.data; if (d.visibility !== 'public') return;
    const u = await tg.setUsername(st.chat.main, [d.username, d.altUsername]);
    if (!u) throw new Error(`Aucun nom disponible (« ${d.username} »${d.altUsername ? ` ni « ${d.altUsername} »` : ''}). Envoie /username ${o.ref} nouveau_nom`);
    st.username = u;
  }],
  ['photo', async (o, st) => { if (o.logo_path) await tg.setPhoto(st.chat.main, o.logo_path); }],
  ['topics', async (o, st) => {
    if (o.data.format !== 'forum') return;
    const list = TOPICS[o.data.activity] || TOPICS.other; st.topicsExpected = list.length;
    await tg.createTopics(st.chat.main, list);
  }],
  ['bot_admin', async (o, st) => {
    await tg.makeBotAdmin(st.chat.main, o.data.format);
    if (st.chat.linked) await tg.makeBotAdmin(st.chat.linked, 'group');
  }],
  ['first_post', async (o, st) => {
    const d = o.data; const chatId = Number('-100' + st.chat.main);
    const text = d.welcomeMessage || intro(d.language, d.name);
    const kb = (d.options.buttons || []).map((b) => [{ text: b.label, url: b.url }]);
    let msg;
    for (let i = 0; i < 4; i++) { // le bot peut mettre quelques secondes à "voir" le canal
      try { msg = await bot.sendMessage(chatId, text, kb.length ? { reply_markup: { inline_keyboard: kb } } : {}); break; }
      catch (e) { if (i === 3) throw e; await tg.sleep(2500); }
    }
    await bot.pinChatMessage(chatId, msg.message_id, { disable_notification: true });
    st.firstPost = msg.message_id;
  }],
  ['invite', async (o, st) => {
    st.invite = o.data.visibility === 'public' ? `https://t.me/${st.username}` : await tg.exportInvite(st.chat.main);
  }],
  ['selfcheck', async (o, st) => { st.checks = await tg.selfCheck(o.data, st, !!o.logo_path); }],
];

async function provision(order) {
  const st = order.state; st.done = st.done || {};
  for (const [name, fn] of STEPS) {
    if (st.done[name]) continue;
    try { await fn(order, st); } catch (e) { e.message = `[${name}] ${explain(e)}`; throw e; }
    st.done[name] = true; db.saveState(order.id, st);
    await pause();
  }
  return st;
}

module.exports = { provision, intro };
