// Boucle de travail : crée les canaux payés, livre ceux que tu as validés, donne les droits admin, publie les posts programmés.
const db = require('./db');
const tg = require('./tg-user');
const B = require('./bot');
const mail = require('./mailer');
const cfg = require('./config');
const { provision } = require('./provision');

let busy = false, capWarned = false;
const in_ = (ms) => new Date(Date.now() + ms).toISOString();

async function provisionNext() {
  const o = db.firstWithStatus('paid'); if (!o) return;
  if (!o.provisioned_at) {
    const n = db.countProvisionedSince(new Date(Date.now() - 24 * 3600e3).toISOString());
    if (n >= cfg.maxPerDay) {
      if (!capWarned) { capWarned = true; await B.notifyOwner(`⏸ Plafond de ${cfg.maxPerDay} créations / 24 h atteint. Les commandes suivantes attendent.`); }
      return;
    }
    capWarned = false;
  }
  db.update(o.id, { status: 'provisioning', provisioned_at: o.provisioned_at || db.now(), error: null });
  try {
    await provision(db.get(o.id));
    db.update(o.id, { status: 'review' });
    await B.sendReview(o.id);
  } catch (e) {
    console.error('provision', o.ref, e.message);
    db.update(o.id, { status: 'failed', error: e.message });
    await B.alertFailure(db.get(o.id));
  }
}

async function deliverApproved() {
  const o = db.firstWithStatus('approved'); if (!o) return;
  for (const id of Object.values(o.state.chat)) await tg.tryInvite(o.tg_username, id); // invitation directe si possible
  await mail.sendDelivery(o, o.state.invite);
  db.update(o.id, { status: 'delivered', delivered_at: db.now(), next_admin_try: db.now() });
  await B.notifyOwner(`📨 ${o.ref} livré à ${B.esc(o.email)}. J'attends que @${B.esc(o.tg_username)} rejoigne pour lui donner l'administration.`);
}

async function promotePending() {
  for (const o of db.dueAdminGrants()) {
    try {
      const r = await tg.promote(o.tg_username, o.state.chat.main, o.data.format);
      if (o.state.chat.linked) await tg.promote(o.tg_username, o.state.chat.linked, 'group').catch(() => {}); // au mieux
      if (r === 'ok') {
        db.update(o.id, { status: 'completed', admin_granted_at: db.now() });
        await B.notifyOwner(`🎉 ${o.ref} : @${B.esc(o.tg_username)} est maintenant administrateur. Commande terminée.`);
        continue;
      }
    } catch (e) { console.error('promote', o.ref, e.message); }
    const n = o.admin_attempts + 1; // toutes les minutes au début, puis toutes les 10 min, puis abandon
    if (n >= 300) { db.update(o.id, { status: 'admin_timeout', admin_attempts: n }); await B.notifyOwner(`⚠️ ${o.ref} : @${B.esc(o.tg_username)} n'a pas rejoint après plusieurs jours. À traiter à la main.`); }
    else db.update(o.id, { admin_attempts: n, next_admin_try: in_(n < 60 ? 60e3 : 600e3) });
  }
}

async function alertClient(o, text) {
  const via = o.data.options.errorAlerts && o.data.options.errorAlerts.via;
  if (!via) return;
  if (via === 'telegram' && o.tg_user_id) { try { await B.bot.sendMessage(Number(o.tg_user_id), '⚠️ ' + text); return; } catch { /* repli e-mail */ } }
  await mail.sendError(o, text).catch(() => {});
}

async function publishScheduled() {
  for (const p of db.dueScheduled(db.now())) {
    const o = db.get(p.order_id);
    try {
      const kb = (o.data.options.buttons || []).map((b) => [{ text: b.label, url: b.url }]);
      await B.bot.sendMessage(Number('-100' + o.state.chat.main), p.text, kb.length ? { reply_markup: { inline_keyboard: kb } } : {});
      db.markScheduled(p.id, 'sent');
    } catch (e) {
      db.markScheduled(p.id, 'failed', e.message);
      await B.notifyOwner(`⚠️ Publication #${p.id} (${o.ref}) échouée : ${B.esc(e.message)}`);
      await alertClient(o, `Une publication programmée a échoué : ${e.message}`);
    }
  }
}

async function tick() {
  if (busy) return; busy = true;
  try { await provisionNext(); await deliverApproved(); await promotePending(); await publishScheduled(); }
  catch (e) { console.error('worker', e); }
  finally { busy = false; }
}
module.exports = { start: () => setInterval(tick, 5000) };
