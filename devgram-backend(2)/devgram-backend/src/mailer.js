const nodemailer = require('nodemailer');
const cfg = require('./config');
const tx = cfg.smtpUrl ? nodemailer.createTransport(cfg.smtpUrl) : null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function send(to, subject, html) {
  if (!tx) { console.log(`[mail simulé] à ${to} : ${subject}`); return; }
  await tx.sendMail({ from: cfg.mailFrom, to, subject, html });
}

const shell = (body) => `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a;line-height:1.55">${body}<p style="color:#64748b;font-size:13px;margin-top:28px">DEVGRAM</p></div>`;

exports.sendDelivery = (o, link) => send(o.email, `Votre ${o.data.format === 'channel' ? 'canal' : 'groupe'} Telegram est prêt 🎉`, shell(`
  <h2>Votre espace « ${esc(o.data.name)} » est prêt</h2>
  <p>Rejoignez-le avec le compte Telegram <b>@${esc(o.tg_username)}</b> :</p>
  <p><a href="${esc(link)}" style="background:#10b981;color:#04130d;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Ouvrir sur Telegram</a></p>
  <p>Dès que vous avez rejoint, vous recevez automatiquement les droits d'administrateur (quelques secondes à quelques minutes).</p>
  <p style="color:#64748b">Référence de commande : ${esc(o.ref)}</p>`));

exports.sendError = (o, message) => send(o.email, `Alerte sur ${o.data.name}`, shell(`<p>Une automatisation a rencontré un problème :</p><p><i>${esc(message)}</i></p><p>Notre équipe est prévenue.</p>`));
