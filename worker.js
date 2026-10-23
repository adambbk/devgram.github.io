// DEVGRAM : relais de commandes + bot Telegram (Cloudflare Worker)
//
// Variables : BOT_TOKEN (secret), ADMIN_CHAT, ALLOWED_ORIGIN, BOT_USERNAME (sans @), WEBHOOK_SECRET (secret), AUTOMATION_KEY (secret)
// Binding KV : DB
// Cron : * * * * *   (toutes les minutes)

const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const tg = (env, method, body) =>
  fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, description: String(e) }));

const say = (env, chat, text, html = false, extra = {}) =>
  tg(env, 'sendMessage', { chat_id: chat, text, ...(html ? { parse_mode: 'HTML' } : {}), disable_web_page_preview: true, ...extra });

const isActive = (rec) => rec.status === 'paid' || rec.status === 'delivered';
const getRec = (env, ref) => env.DB.get('order:' + ref, 'json');
const putRec = (env, rec) => env.DB.put('order:' + rec.ref, JSON.stringify(rec));
const getQueue = async (env, ref) => (await env.DB.get('queue:' + ref, 'json')) || [];

async function setQueue(env, ref, q) {
  await env.DB.put('queue:' + ref, JSON.stringify(q));
  const pending = (await env.DB.get('pending', 'json')) || [];
  const has = pending.includes(ref);
  if (q.length && !has) await env.DB.put('pending', JSON.stringify([...pending, ref]));
  if (!q.length && has) await env.DB.put('pending', JSON.stringify(pending.filter(r => r !== ref)));
}

// ---------- Heure locale d'une commande ----------
function localNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, wd: p.weekday };
}
const tzOf = (rec) => (rec.order.options.schedule || {}).timezone || 'Europe/Paris';

function slotsOf(opts) {
  const freq = (opts.post || {}).frequency;
  if (freq === 'Selon mon calendrier') return [];
  const t = (opts.schedule || {}).time || '09:00';
  return { times: freq === 'Plusieurs fois par jour' ? ['09:00', '13:00', '18:00'] : [t], weekly: freq === 'Chaque semaine' };
}

// ---------- Publication ----------
function keyboard(opts) {
  const b = (opts.buttons || []).filter(x => x.label && /^https?:\/\//.test(x.url)).slice(0, 3);
  return b.length ? { inline_keyboard: b.map(x => [{ text: x.label.slice(0, 64), url: x.url }]) } : undefined;
}

async function publish(env, rec, item) {
  const reply_markup = keyboard(rec.order.options);
  const r = item.type === 'photo'
    ? await tg(env, 'sendPhoto', { chat_id: rec.target, photo: item.file_id, caption: item.caption || undefined, reply_markup })
    : await tg(env, 'sendMessage', { chat_id: rec.target, text: item.text, reply_markup, disable_web_page_preview: false });
  return r.ok ? { ok: true } : { ok: false, error: r.description || 'erreur inconnue' };
}

async function notifyError(env, rec, error) {
  await say(env, env.ADMIN_CHAT, `⚠️ Échec de publication ${rec.ref} (${rec.order.name}) : ${error}`);
  const o = rec.order.options;
  if (o.errorAlerts && rec.clientChat) {
    if (o.errorAlerts.via === 'telegram')
      await say(env, rec.clientChat, `⚠️ Une publication n'a pas pu être envoyée (${error}). Nous nous en occupons.`);
    else await say(env, env.ADMIN_CHAT, `ℹ️ ${rec.ref} : le client veut être prévenu par e-mail → ${rec.order.email}`);
  }
}

// ---------- Cron : publications programmées ----------
async function runQueues(env) {
  const pending = (await env.DB.get('pending', 'json')) || [];
  for (const ref of pending) {
    const rec = await getRec(env, ref);
    if (!rec || !rec.target) continue;
    let q = await getQueue(env, ref);
    const now = localNow(tzOf(rec));
    const nowKey = `${now.date} ${now.time}`;
    const slots = slotsOf(rec.order.options);
    let changed = false;

    // 1) messages avec date précise
    for (const item of q.filter(i => i.at && i.at <= nowKey).slice(0, 5)) {
      const r = await publish(env, rec, item);
      item.tries = (item.tries || 0) + 1;
      if (r.ok) { q = q.filter(i => i !== item); changed = true; }
      else { await notifyError(env, rec, r.error); if (item.tries >= 3) { q = q.filter(i => i !== item); changed = true; } }
    }
    // 2) prochain créneau habituel
    const isSlot = slots.times && slots.times.includes(now.time) && (!slots.weekly || now.wd === 'Mon');
    if (isSlot && rec.lastSlot !== nowKey) {
      const item = q.find(i => !i.at);
      if (item) {
        const r = await publish(env, rec, item);
        item.tries = (item.tries || 0) + 1;
        rec.lastSlot = nowKey; await putRec(env, rec);
        if (r.ok) { q = q.filter(i => i !== item); changed = true; }
        else { await notifyError(env, rec, r.error); if (item.tries >= 3) { q = q.filter(i => i !== item); changed = true; } }
      }
    }
    if (changed) await setQueue(env, ref, q); else if (!q.length) await setQueue(env, ref, q);
  }
}

// ---------- Messages Telegram ----------
async function processUpdate(env, u) {
  const m = u.message;
  if (!m || !m.chat) return;
  if (m.chat.type === 'private') return privateMessage(env, m);
  return groupMessage(env, m);
}

async function privateMessage(env, m) {
  const isAdmin = String(m.from.id) === String(env.ADMIN_CHAT);
  const text = (m.text || m.caption || '').trim();
  const cmd = text.startsWith('/') ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : null;
  const args = text.split(/\s+/).slice(1);
  const ADMIN_CMDS = ['/aide', '/orders', '/order', '/brief', '/paid', '/link', '/linkgroup', '/post', '/file'];

  if (cmd === '/start' && args[0]) return clientStart(env, m, args[0].toUpperCase());
  if (isAdmin && cmd && ADMIN_CMDS.includes(cmd)) return adminCommand(env, m, cmd, args);
  if (isAdmin && (cmd === '/start' || !(await env.DB.get('client:' + m.chat.id))))
    return say(env, m.chat.id, 'Commandes admin : /aide');
  return clientMessage(env, m, text, cmd, args);
}

async function adminCommand(env, m, cmd, args) {
  const chat = m.chat.id;
  const ref = (args[0] || '').toUpperCase();
  const link = (r) => `https://t.me/${env.BOT_USERNAME}?start=${r}`;

  if (cmd === '/aide') return say(env, chat,
`/orders — dernières commandes
/order REF — détail d'une commande
/brief REF — fiche complète (JSON)
/paid REF — marquer payée (prévient le client)
/link REF @canal — relier le canal (le bot doit en être admin)
/linkgroup REF @groupe — relier le groupe (accueil, modération)
/post REF texte — publier un test dans le canal
/file REF — messages en attente`);

  if (cmd === '/orders') {
    const l = await env.DB.list({ prefix: 'order:', limit: 20 });
    const recs = (await Promise.all(l.keys.map(k => env.DB.get(k.name, 'json')))).filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 15);
    return say(env, chat, recs.length ? recs.map(r =>
      `${r.ref} · ${r.status === 'delivered' ? '🎉' : r.status === 'paid' ? '✅' : '🕓'} · ${r.order.name} · ${r.order.total} €${r.target ? ' · lié' : ''}`).join('\n') : 'Aucune commande.');
  }

  const rec = ref ? await getRec(env, ref) : null;
  if (!rec) return say(env, chat, 'Commande introuvable. Exemple : ' + cmd + ' DG-XXXXXX');

  if (cmd === '/order') {
    const o = rec.order;
    return say(env, chat,
`${rec.ref} · ${rec.status}
${o.name} (${o.format}, ${o.visibility})
Client : ${o.telegram} · ${o.email}
Options : ${Object.keys(o.options).join(', ') || 'aucune'}
Canal lié : ${rec.target || 'non'} · Groupe lié : ${rec.group || 'non'}
Bot démarré par le client : ${rec.clientChat ? 'oui' : 'non'}
Lien client : ${link(rec.ref)}`);
  }

  if (cmd === '/brief') return sendBrief(env, chat, rec);

  if (cmd === '/paid') {
    rec.status = 'paid'; await putRec(env, rec);
    if (rec.clientChat) {
      await say(env, rec.clientChat, `✅ Paiement confirmé pour « ${rec.order.name} ». Nous préparons votre ${rec.order.format === 'channel' ? 'canal' : 'groupe'} et vous prévenons dès qu'il est prêt.`);
      return say(env, chat, `✅ ${rec.ref} marquée payée, client prévenu.`);
    }
    return say(env, chat, `✅ ${rec.ref} marquée payée. Le client n'a pas encore démarré le bot, envoyez-lui ce lien :\n${link(rec.ref)}`);
  }

  if (cmd === '/link' || cmd === '/linkgroup') {
    if (!args[1]) return say(env, chat, `Exemple : ${cmd} ${rec.ref} @moncanal`);
    const c = await tg(env, 'getChat', { chat_id: args[1] });
    if (!c.ok) return say(env, chat, `❌ Introuvable (${c.description}). Ajoutez d'abord le bot comme admin du canal/groupe.`);
    const cm = await tg(env, 'getChatMember', { chat_id: c.result.id, user_id: env.BOT_TOKEN.split(':')[0] });
    const adm = cm.ok && (cm.result.status === 'administrator' || cm.result.status === 'creator');
    if (cmd === '/link') rec.target = c.result.id; else rec.group = c.result.id;
    await putRec(env, rec); await env.DB.put('chat:' + c.result.id, rec.ref);
    return say(env, chat, `${adm ? '✅' : '⚠️ Le bot n\'est PAS admin ici.'} ${c.result.title || args[1]} relié à ${rec.ref}.`);
  }

  if (cmd === '/post') {
    if (!rec.target) return say(env, chat, 'Canal non relié : /link ' + rec.ref + ' @canal');
    const t = text(m).split(/\s+/).slice(2).join(' ');
    if (!t) return say(env, chat, 'Exemple : /post ' + rec.ref + ' Bonjour !');
    const r = await publish(env, rec, { type: 'text', text: t });
    return say(env, chat, r.ok ? '✅ Publié.' : '❌ ' + r.error);
  }

  if (cmd === '/file') {
    const q = await getQueue(env, ref);
    return say(env, chat, q.length ? q.map((i, n) => `${n + 1}. ${i.at ? '[' + i.at + '] ' : ''}${(i.text || i.caption || '(photo)').slice(0, 60)}`).join('\n') : 'File vide.');
  }
}
const text = (m) => (m.text || m.caption || '').trim();

async function clientStart(env, m, ref) {
  const rec = await getRec(env, ref);
  if (!rec) return say(env, m.chat.id, 'Commande introuvable. Utilisez le lien reçu avec votre commande.');
  if (rec.clientChat && String(rec.clientChat) !== String(m.chat.id))
    return say(env, m.chat.id, 'Cette commande est déjà reliée à un autre compte. Contactez-nous.');
  rec.clientChat = m.chat.id; await putRec(env, rec);
  await env.DB.put('client:' + m.chat.id, ref);
  await say(env, env.ADMIN_CHAT, `👤 ${m.from.first_name || ''} (@${m.from.username || '?'}) a démarré le bot pour ${ref}.`);
  const o = rec.order.options;
  const how = o.post || o.schedule
    ? `\n\nEnvoyez-moi ici les messages à publier (texte ou photo). Ils seront publiés au prochain créneau.\nPour une date précise, commencez par @AAAA-MM-JJ HH:MM (ex : @2026-11-02 18:30 Promo !).\n/file : voir vos messages en attente · /annuler N : retirer le message N`
    : o.buttons ? `\n\nEnvoyez-moi un message : je le publie dans votre canal avec vos boutons.` : '';
  return say(env, m.chat.id,
    `👋 Bienvenue ! Votre commande « ${rec.order.name} » (${ref}) est enregistrée.\n${isActive(rec) ? '✅ Paiement reçu.' : '🕓 En attente de paiement.'}${how}`);
}

async function clientMessage(env, m, t, cmd, args) {
  const chat = m.chat.id;
  const ref = await env.DB.get('client:' + chat);
  if (!ref) return say(env, chat, 'Bonjour ! Utilisez le lien envoyé avec votre commande pour démarrer.');
  const rec = await getRec(env, ref);
  if (!rec) return say(env, chat, 'Commande introuvable.');
  const o = rec.order.options;

  if (cmd === '/file') {
    const q = await getQueue(env, ref);
    return say(env, chat, q.length ? q.map((i, n) => `${n + 1}. ${i.at ? '[' + i.at + '] ' : ''}${(i.text || i.caption || '(photo)').slice(0, 60)}`).join('\n') : 'Aucun message en attente.');
  }
  if (cmd === '/annuler') {
    const q = await getQueue(env, ref); const n = parseInt(args[0], 10) - 1;
    if (!q[n]) return say(env, chat, 'Numéro invalide. Voir /file');
    q.splice(n, 1); await setQueue(env, ref, q);
    return say(env, chat, '🗑️ Retiré.');
  }
  if (cmd) return say(env, chat, 'Commande inconnue.');

  if (!isActive(rec)) return say(env, chat, '🕓 Votre commande n\'est pas encore active (paiement en attente).');
  if (!rec.target) return say(env, chat, '🛠️ Votre canal est en cours de préparation, je vous préviens dès qu\'il est prêt.');
  if (!o.post && !o.schedule && !o.buttons) return say(env, chat, 'Votre commande n\'inclut pas la publication via le bot.');

  let item;
  if (m.photo && m.photo.length) item = { type: 'photo', file_id: m.photo[m.photo.length - 1].file_id, caption: m.caption || '' };
  else if (m.text) item = { type: 'text', text: m.text };
  else return say(env, chat, 'Envoyez du texte ou une photo.');

  const key = item.type === 'photo' ? 'caption' : 'text';
  const dm = (item[key] || '').match(/^@(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s*/);
  if (dm) { item.at = `${dm[1]} ${dm[2].padStart(2, '0')}:${dm[3]}`; item[key] = item[key].slice(dm[0].length); }
  if (item.type === 'text' && !item.text) return say(env, chat, 'Message vide.');

  if (!o.post && !o.schedule) {           // boutons seuls : publication immédiate
    const r = await publish(env, rec, item);
    if (!r.ok) await notifyError(env, rec, r.error);
    return say(env, chat, r.ok ? '✅ Publié.' : '❌ Échec de la publication, nous sommes prévenus.');
  }
  const s = slotsOf(o);
  if (!item.at && !s.times) return say(env, chat, 'Indiquez une date en début de message : @AAAA-MM-JJ HH:MM votre texte');

  item.id = Date.now().toString(36); item.tries = 0;
  const q = await getQueue(env, ref); q.push(item); await setQueue(env, ref, q);
  const when = item.at ? `le ${item.at}` : `au prochain créneau (${s.times.join(' / ')}${s.weekly ? ', le lundi' : ''})`;
  return say(env, chat, `✅ Message n°${q.length} programmé ${when} (${tzOf(rec)}).`);
}

// Accueil + modération dans les groupes liés
async function groupMessage(env, m) {
  const ref = await env.DB.get('chat:' + m.chat.id);
  if (!ref) return;
  const rec = await getRec(env, ref);
  if (!rec || !isActive(rec)) return;
  const o = rec.order.options;

  if (m.new_chat_members && o.welcome) {
    const names = m.new_chat_members.filter(u => !u.is_bot).map(u => u.first_name).join(', ');
    if (names) await say(env, m.chat.id, `${rec.order.welcomeMessage || 'Bienvenue !'}\n\n👋 ${names}`);
    return;
  }
  if (!o.moderation || !m.from || m.from.is_bot) return;
  const ents = [...(m.entities || []), ...(m.caption_entities || [])];
  const hasLink = ents.some(e => e.type === 'url' || e.type === 'text_link') || /t\.me\/|https?:\/\//i.test(m.text || m.caption || '');
  const forwarded = o.moderation.level === 'strict' && (m.forward_origin || m.forward_date);
  if (!hasLink && !forwarded) return;
  const cm = await tg(env, 'getChatMember', { chat_id: m.chat.id, user_id: m.from.id });
  if (cm.ok && (cm.result.status === 'administrator' || cm.result.status === 'creator')) return;
  await tg(env, 'deleteMessage', { chat_id: m.chat.id, message_id: m.message_id });
}


// ---------- Fiche complète de la commande (pour l'automatisation) ----------
const S = (v, n) => String(v ?? '').slice(0, n);
function cleanBrand(b = {}) {
  const c = b.contacts || {};
  return {
    tone: S(b.tone, 20), rules: S(b.rules, 600),
    sections: (Array.isArray(b.sections) ? b.sections : []).slice(0, 8)
      .map(x => ({ emoji: S(x.emoji, 4), name: S(x.name, 32), text: S(x.text, 400) })).filter(x => x.name),
    contacts: Object.fromEntries(['website', 'instagram', 'whatsapp', 'phone', 'email', 'address', 'hours'].map(k => [k, S(c[k], 200)])),
  };
}

function buildBrief(rec) {
  const o = rec.order, b = o.brand || {}, c = b.contacts || {}, sec = b.sections || [];
  return {
    ref: rec.ref, status: rec.status, createdAt: new Date(rec.createdAt).toISOString(),
    type: o.format, visibility: o.visibility, discussionGroup: !!o.linkedGroup,
    title: o.name, language: o.language, activity: o.activityLabel || o.activity, activityOther: o.activityOther || null,
    about: [o.description, c.website].filter(Boolean).join(' · ').slice(0, 255),
    username: o.visibility === 'public' ? { primary: o.username, fallback: o.altUsername || null } : null,
    logoFileId: rec.logoFileId || null,
    pinnedMessage: o.welcomeMessage || null, tone: b.tone || null, rules: b.rules || null, contacts: c,
    structure: o.format === 'forum'
      ? { topics: sec }
      : { startPosts: sec, pinnedNavigation: sec.map(x => ({ label: `${x.emoji} ${x.name}`.trim(), target: 'post:' + x.name })) },
    options: o.options, delivery: o.delivery,
    client: { telegram: o.telegram, email: o.email }, total: o.total,
  };
}

async function sendBrief(env, chat, rec) {
  const f = new FormData();
  f.append('chat_id', chat);
  f.append('caption', 'Fiche ' + rec.ref);
  f.append('document', new Blob([JSON.stringify(buildBrief(rec), null, 2)], { type: 'application/json' }), `brief-${rec.ref}.json`);
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: f });
}

// ---------- API pour l'automatisation (protégée par AUTOMATION_KEY) ----------
async function handleApi(req, env, url) {
  const J = (o, s = 200) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!env.AUTOMATION_KEY || req.headers.get('Authorization') !== 'Bearer ' + env.AUTOMATION_KEY) return J({ error: 'unauthorized' }, 401);
  const parts = url.pathname.split('/').filter(Boolean);   // api / orders | order / REF / result

  if (parts[1] === 'orders' && req.method === 'GET') {
    const want = url.searchParams.get('status') || 'paid';
    const l = await env.DB.list({ prefix: 'order:', limit: 100 });
    const recs = (await Promise.all(l.keys.map(k => env.DB.get(k.name, 'json')))).filter(Boolean)
      .filter(r => want === 'all' || r.status === want).sort((a, b) => a.createdAt - b.createdAt);
    return J(recs.map(buildBrief));
  }
  if (parts[1] === 'order' && parts[2]) {
    const rec = await getRec(env, parts[2].toUpperCase());
    if (!rec) return J({ error: 'not found' }, 404);
    if (req.method === 'GET' && !parts[3]) return J(buildBrief(rec));
    if (req.method === 'POST' && parts[3] === 'result') {   // l'automatisation annonce que c'est livré
      let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
      if (b.channelId) { rec.target = b.channelId; await env.DB.put('chat:' + b.channelId, rec.ref); }
      if (b.groupId) { rec.group = b.groupId; await env.DB.put('chat:' + b.groupId, rec.ref); }
      rec.status = 'delivered'; rec.deliveredAt = Date.now(); rec.inviteLink = b.inviteLink || b.publicLink || null;
      await putRec(env, rec);
      await say(env, env.ADMIN_CHAT, `🎉 ${rec.ref} livrée ${rec.inviteLink ? ': ' + rec.inviteLink : ''}`);
      if (rec.clientChat) await say(env, rec.clientChat, `🎉 Votre ${rec.order.format === 'channel' ? 'canal' : 'groupe'} « ${rec.order.name} » est prêt !${rec.inviteLink ? '\n' + rec.inviteLink : ''}`);
      return J({ ok: true });
    }
  }
  return J({ error: 'not found' }, 404);
}

// ---------- Commande du site ----------
async function handleOrder(req, env) {
  const origin = req.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'origin' }, 403);

  let order, logo;
  try {
    const fd = await req.formData();
    order = JSON.parse(fd.get('order'));
    logo = fd.get('logo');
  } catch { return json({ error: 'bad request' }, 400); }
  if (!order || !order.name || !order.email || !order.telegram || !order.acceptedTerms) return json({ error: 'invalid' }, 400);
  if (logo && logo.size > 2 * 1024 * 1024) logo = null;
  order.options = order.options || {};
  order.brand = cleanBrand(order.brand);

  const ref = 'DG-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  const rec = { ref, order, status: 'new', createdAt: Date.now(), target: null, group: null, clientChat: null, lastSlot: null };
  await putRec(env, rec);

  const o = order.options;
  const optLines = Object.keys(o).length
    ? Object.entries(o).map(([k, v]) => `   • ${esc(k)}: <code>${esc(JSON.stringify(v))}</code>`).join('\n') : '   Aucune';
  const text =
`🆕 <b>Nouvelle commande ${ref}</b>

<b>Type :</b> ${esc(order.format)} (${esc(order.visibility)})${order.linkedGroup ? ' + groupe relié' : ''}
<b>Nom :</b> ${esc(order.name)}
<b>Username :</b> ${order.username ? '@' + esc(order.username) : '—'}${order.altUsername ? ' / alt @' + esc(order.altUsername) : ''}
<b>Activité :</b> ${esc(order.activityLabel || order.activity)}${order.activityOther ? ' (' + esc(order.activityOther) + ')' : ''}
<b>Description :</b> ${esc(order.description) || '—'}
<b>Message épinglé :</b> ${esc(order.welcomeMessage) || '—'}
<b>Langue :</b> ${esc(order.language)}
<b>Options :</b>
${optLines}
<b>Livraison :</b> ${esc(order.delivery)}

🎨 <b>Rendu pro</b>
<b>Rubriques :</b> ${esc(order.brand.sections.map(x => (x.emoji + ' ' + x.name).trim()).join(', ')) || '—'}
<b>Ton :</b> ${esc(order.brand.tone) || '—'}
<b>Contacts :</b> ${esc(Object.entries(order.brand.contacts).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join(' | ')) || '—'}${order.brand.rules ? '\n<b>Règles :</b> ' + esc(order.brand.rules) : ''}

👤 Client : ${esc(order.email)} · ${esc(order.telegram)}
💶 <b>Total annoncé : ${esc(order.total)} €</b>
${esc((order.lines || []).join(' | '))}

🔗 Lien à envoyer au client :
https://t.me/${esc(env.BOT_USERNAME)}?start=${ref}

Ensuite : /paid ${ref} · /link ${ref} @canal`;
  const r = await say(env, env.ADMIN_CHAT, text, true);
  if (!r.ok) return json({ error: 'telegram' }, 502);

  if (logo) {
    const f = new FormData();
    f.append('chat_id', env.ADMIN_CHAT); f.append('caption', 'Logo ' + ref);
    f.append('document', logo, logo.name || 'logo.png');
    const lr = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: f }).then(x => x.json()).catch(() => null);
    if (lr && lr.ok && lr.result.document) { rec.logoFileId = lr.result.document.file_id; await putRec(env, rec); }
  }
  await sendBrief(env, env.ADMIN_CHAT, rec);
  return json({ ok: true, ref });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/telegram') {
      if (req.method !== 'POST' || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET)
        return new Response('forbidden', { status: 403 });
      try { await processUpdate(env, await req.json()); } catch (e) { console.log('update error', e); }
      return new Response('ok');
    }
    if (url.pathname.startsWith('/api/')) return handleApi(req, env, url);
    return handleOrder(req, env);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(runQueues(env)); },
};
