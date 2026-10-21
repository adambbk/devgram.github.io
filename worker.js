// Cloudflare Worker : reçoit la commande du site et l'envoie sur Telegram.
// Variables à définir dans Cloudflare (Settings > Variables) :
//   BOT_TOKEN  (secret)  -> token donné par @BotFather
//   ADMIN_CHAT (texte)   -> ton chat_id (ou celui d'un groupe privé admin)
//   ALLOWED_ORIGIN       -> https://adambbk.github.io

const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export default {
  async fetch(req, env) {
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

    // Validation minimale
    if (!order || !order.name || !order.email || !order.telegram || !order.acceptedTerms)
      return json({ error: 'invalid' }, 400);
    if (logo && logo.size > 2 * 1024 * 1024) logo = null;

    const ref = 'DG-' + Date.now().toString(36).toUpperCase();
    const o = order.options || {};
    const optLines = Object.keys(o).length
      ? Object.entries(o).map(([k, v]) => `   • ${esc(k)}: <code>${esc(JSON.stringify(v))}</code>`).join('\n')
      : '   Aucune';

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

👤 <b>Client</b>
Email : ${esc(order.email)}
Telegram : ${esc(order.telegram)}

💶 <b>Total annoncé : ${esc(order.total)} €</b>
${esc((order.lines || []).join(' | '))}`;

    const api = (m) => `https://api.telegram.org/bot${env.BOT_TOKEN}/${m}`;
    const r = await fetch(api('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.ADMIN_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!r.ok) return json({ error: 'telegram' }, 502);

    if (logo) {
      const f = new FormData();
      f.append('chat_id', env.ADMIN_CHAT);
      f.append('caption', 'Logo ' + ref);
      f.append('document', logo, logo.name || 'logo.png');
      await fetch(api('sendDocument'), { method: 'POST', body: f });
    }
    return json({ ok: true, ref });
  },
};
