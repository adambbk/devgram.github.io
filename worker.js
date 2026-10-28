// DEVGRAM : reçoit la commande du site et l'envoie sur Telegram sous forme de fiche lisible.
// Aucune création, aucun stockage. Variables nécessaires (Cloudflare > Settings > Variables) :
//   BOT_TOKEN (secret) · ADMIN_CHAT · ALLOWED_ORIGIN (= https://adambbk.github.io)

const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const S = (v, n) => String(v ?? '').trim().slice(0, n);
const yn = (b) => (b ? 'Oui' : 'Non');

const FORMATS = { channel: 'Canal de diffusion', group: 'Groupe de discussion', forum: 'Groupe avec sujets (forum)' };
const LANGS = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', ar: 'العربية', ru: 'Русский', tr: 'Türkçe', other: 'Autre' };
const TONES = { pro: 'Professionnel', warm: 'Chaleureux', dynamic: 'Dynamique', premium: 'Premium / sobre' };
const DELIVERY = { standard: 'Standard (sous 24 h)', express: 'Express (sous 2 h)' };
const CONTACTS = [['website', '🌐 Site web'], ['instagram', '📸 Instagram'], ['whatsapp', '💬 WhatsApp'], ['phone', '📞 Téléphone'],
  ['email', '✉️ E-mail'], ['address', '📍 Adresse'], ['hours', '🕒 Horaires']];

const line = (label, value) => (value || value === 0 ? `• <b>${label} :</b> ${esc(value)}` : null);
const block = (title, rows) => {
  const r = rows.filter(Boolean);
  return r.length ? `<b>${title}</b>\n${r.join('\n')}` : null;
};

function buildBlocks(o, ref) {
  const opt = o.options || {}, br = o.brand || {}, c = br.contacts || {};
  const isChannel = o.format === 'channel', isPublic = o.visibility === 'public';
  const when = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const blocks = [];

  blocks.push(`🆕 <b>NOUVELLE COMMANDE</b>\nRéférence : <code>${esc(ref)}</code>\nReçue le ${esc(when)}`);

  blocks.push(block('📦 TYPE', [
    line('Format', FORMATS[o.format] || o.format),
    line('Visibilité', isPublic ? 'Public (lien public)' : 'Privé (sur invitation)'),
    isChannel ? line('Groupe de commentaires relié', yn(o.linkedGroup)) : null,
  ]));

  blocks.push(block('✏️ PERSONNALISATION', [
    line('Nom', S(o.name, 128)),
    isPublic ? line('Username souhaité', o.username ? '@' + S(o.username, 40) : null) : null,
    isPublic ? line('Username de secours', o.altUsername ? '@' + S(o.altUsername, 40) : null) : null,
    line('Activité', [S(o.activityLabel || o.activity, 80), o.activityOther ? '(' + S(o.activityOther, 80) + ')' : ''].filter(Boolean).join(' ')),
    line('Description', S(o.description, 600)),
    line('Message épinglé', S(o.welcomeMessage, 900)),
    line('Langue', LANGS[o.language] ? `${LANGS[o.language]} (${o.language})` : o.language),
    line('Ton des messages', TONES[br.tone] || br.tone),
  ]));

  const sec = Array.isArray(br.sections) ? br.sections.slice(0, 8) : [];
  if (sec.length) {
    const kind = o.format === 'forum' ? 'SUJETS (onglets du groupe)' : 'RUBRIQUES (publications de départ + menu épinglé)';
    blocks.push(`<b>🗂️ ${kind} — ${sec.length}</b>\n` + sec.map((x, i) =>
      `${i + 1}. ${esc(S(x.emoji, 4))} <b>${esc(S(x.name, 40))}</b>${x.text ? '\n    ↳ ' + esc(S(x.text, 400)) : ''}`).join('\n'));
  }

  blocks.push(block('📇 COORDONNÉES À AFFICHER', CONTACTS.map(([k, l]) => line(l, S(c[k], 200)))));
  if (br.rules) blocks.push(`<b>📜 RÈGLES DU GROUPE</b>\n${esc(S(br.rules, 700))}`);

  // Automatisations
  const au = [];
  if (opt.post) au.push(`• <b>Publication automatique</b> — fréquence : ${esc(S(opt.post.frequency, 60))}`);
  if (opt.schedule) au.push(`• <b>Programmation</b> — à ${esc(S(opt.schedule.time, 10))} (${esc(S(opt.schedule.timezone, 40))})`);
  if (opt.welcome) au.push('• <b>Accueil des nouveaux membres</b> — activé');
  if (Array.isArray(opt.buttons) && opt.buttons.length)
    au.push('• <b>Boutons avec liens</b>\n' + opt.buttons.slice(0, 3).map((b, i) => `    ${i + 1}. ${esc(S(b.label, 64))} → ${esc(S(b.url, 300))}`).join('\n'));
  if (opt.relay) au.push(`• <b>Relais depuis une source</b> — ${esc(S(opt.relay.source, 300))}\n    Droit de relayer confirmé : ${yn(opt.relay.authorized)}`);
  if (opt.moderation) au.push(`• <b>Modération</b> — niveau ${opt.moderation.level === 'strict' ? 'strict (+ mots interdits)' : 'standard (spam et liens)'}`);
  if (opt.errorAlerts) au.push(`• <b>Alertes d'erreur</b> — par ${opt.errorAlerts.via === 'telegram' ? 'message Telegram' : 'e-mail'}`);
  blocks.push(`<b>⚙️ AUTOMATISATIONS</b>\n${au.length ? au.join('\n') : '• Aucune'}`);

  blocks.push(block('🚚 LIVRAISON', [line('Mode', DELIVERY[o.delivery] || o.delivery)]));

  blocks.push(block('👤 CLIENT', [
    line('Telegram', S(o.telegram, 60)),
    line('E-mail', S(o.email, 120)),
    line('Conditions acceptées', yn(o.acceptedTerms)),
  ]));

  const lines = Array.isArray(o.lines) ? o.lines.slice(0, 20) : [];
  blocks.push(`<b>💶 TARIF</b>\n${lines.map(l => '• ' + esc(S(l, 80))).join('\n')}${lines.length ? '\n' : ''}<b>TOTAL : ${esc(S(o.total, 10))} €</b>`);

  return blocks.filter(Boolean);
}

// Regroupe les blocs en messages de moins de ~3800 caractères (limite Telegram : 4096)
function toMessages(blocks, max = 3800) {
  const out = []; let cur = '';
  const push = () => { if (cur) { out.push(cur); cur = ''; } };
  for (const b of blocks) {
    if (b.length > max) {                                   // bloc trop long : on coupe par lignes
      push();
      for (const l of b.split('\n')) { if ((cur + '\n' + l).length > max) push(); cur += (cur ? '\n' : '') + l; }
      push();
    } else if ((cur + '\n\n' + b).length > max) { push(); cur = b; }
    else cur += (cur ? '\n\n' : '') + b;
  }
  push();
  return out;
}

const tg = (env, method, body) =>
  fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, description: String(e) }));

async function handleOrder(req, env) {
  const cors = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if ((req.headers.get('Origin') || '') !== env.ALLOWED_ORIGIN) return json({ error: 'origin' }, 403);

  let order, logo;
  try {
    const fd = await req.formData();
    order = JSON.parse(fd.get('order'));
    logo = fd.get('logo');
  } catch { return json({ error: 'bad request' }, 400); }
  if (!order || !order.name || !order.email || !order.telegram || !order.acceptedTerms) return json({ error: 'invalid' }, 400);
  if (logo && (typeof logo === 'string' || logo.size > 2 * 1024 * 1024)) logo = null;

  const ref = 'DG-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

  // 1) la fiche lisible
  for (const text of toMessages(buildBlocks(order, ref))) {
    const r = await tg(env, 'sendMessage', { chat_id: env.ADMIN_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) { console.log('telegram', r); return json({ error: 'telegram' }, 502); }
  }

  // 2) le logo, puis 3) la commande brute (JSON) pour une automatisation future
  const send = async (file, name, caption) => {
    const f = new FormData();
    f.append('chat_id', env.ADMIN_CHAT); f.append('caption', caption); f.append('document', file, name);
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: f }).catch(() => null);
  };
  if (logo) await send(logo, logo.name || 'logo.png', '🖼️ Logo ' + ref);
  await send(new Blob([JSON.stringify({ ref, receivedAt: new Date().toISOString(), order }, null, 2)], { type: 'application/json' }), `commande-${ref}.json`, '📎 Données brutes ' + ref);

  return json({ ok: true, ref });
}

export default {
  async fetch(req, env) {
    try {
      if (new URL(req.url).pathname === '/telegram') return new Response('ok');   // ancien webhook : on l'ignore
      return await handleOrder(req, env);
    } catch (e) {
      console.log('erreur', e);
      return new Response(JSON.stringify({ error: 'internal', detail: String(e) }), {
        status: 500, headers: { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Content-Type': 'application/json' } });
    }
  },
  async scheduled() {},   // ancien minuteur : ne fait plus rien
};
