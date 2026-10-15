const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const Stripe = require('stripe');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const cfg = require('./config');
const db = require('./db');
const tg = require('./tg-user');
const B = require('./bot');
const worker = require('./worker');
const { orderSchema } = require('./schema');
const { normalize, lines, totalCents } = require('./pricing');

const stripe = Stripe(cfg.stripe.key);
const app = express();
app.set('trust proxy', 1);

// ---- Webhook Stripe : le SEUL moyen fiable de savoir qu'une commande est payée (lu AVANT tout parseur JSON)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], cfg.stripe.webhookSecret); }
  catch { return res.status(400).send('Signature invalide'); }
  try {
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      const s = event.data.object;
      const o = db.byStripeSession(s.id) || db.get(s.client_reference_id);
      if (o && s.payment_status === 'paid' && o.status === 'pending_payment') {
        if (s.amount_total !== o.total_cents) {
          db.update(o.id, { status: 'payment_mismatch' });
          await B.notifyOwner(`🚨 Montant inattendu pour ${o.ref} : payé ${s.amount_total / 100} € au lieu de ${o.total_cents / 100} €. Rien n'a été créé.`);
        } else {
          db.update(o.id, { status: 'paid', payment_intent: s.payment_intent });
          await B.notifyOwner(`💰 Paiement reçu : <b>${o.ref}</b> · ${(o.total_cents / 100).toFixed(2)} € · ${B.esc(o.data.name)}. Création en cours…`);
        }
      }
    }
  } catch (e) { console.error('webhook', e); return res.status(500).end(); }
  res.json({ received: true });
});

app.use(cors({ origin: cfg.origin }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const orderLimiter = rateLimit({ windowMs: 3600e3, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives, réessayez plus tard.' } });

app.get('/health', (req, res) => res.json({ ok: true }));

// ---- Création de commande (appelée par le formulaire) puis redirection vers Stripe
app.post('/api/order', orderLimiter, upload.single('logo'), async (req, res) => {
  let parsed;
  try { parsed = orderSchema.parse(JSON.parse(req.body.order)); }
  catch (e) { return res.status(400).json({ error: 'Commande invalide', details: (e.issues || []).map((i) => `${i.path.join('.')}: ${i.message}`) }); }

  const data = normalize(parsed);
  const tgName = data.telegram.slice(1);
  let tgUserId = null;
  try {
    const u = await tg.resolveUser(tgName);
    if (!u) return res.status(422).json({ error: `Le pseudo Telegram @${tgName} est introuvable. Vérifiez-le (il doit être celui d'un compte personnel).` });
    tgUserId = u.id;
  } catch (e) { console.error('resolveUser (ignoré)', e.message); }

  const id = crypto.randomUUID();
  const ref = crypto.randomBytes(4).toString('hex').toUpperCase();
  let logoPath = null;
  if (req.file) {
    try {
      logoPath = path.join(cfg.uploadsDir, `${id}.jpg`);
      await sharp(req.file.buffer).rotate().resize(640, 640, { fit: 'cover' }).jpeg({ quality: 90 }).toFile(logoPath);
    } catch { return res.status(400).json({ error: 'Image invalide (JPG, PNG ou WebP).' }); }
  }

  try {
    const total = totalCents(data);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', customer_email: data.email, client_reference_id: id, metadata: { orderId: id, ref },
      line_items: lines(data).map((l) => ({ quantity: 1, price_data: { currency: 'eur', unit_amount: l.cents, product_data: { name: l.label } } })),
      success_url: `${cfg.siteUrl}/succes.html?order=${id}`,
      cancel_url: `${cfg.siteUrl}/devgram.html#configurateur`,
    });
    db.createOrder({ id, ref, data, totalCents: total, email: data.email, tgUsername: tgName, tgUserId, stripeSession: session.id, logoPath });
    res.json({ url: session.url, ref });
  } catch (e) {
    console.error('order', e);
    if (logoPath) fs.unlink(logoPath, () => {});
    res.status(500).json({ error: 'Paiement indisponible pour le moment.' });
  }
});

// ---- Statut pour la page de succès (l'identifiant est impossible à deviner)
const PUBLIC = { pending_payment: 'awaiting_payment', paid: 'creating', provisioning: 'creating', review: 'review', approved: 'review', failed: 'review', delivered: 'ready', completed: 'ready' };
app.get('/api/order/:id/status', (req, res) => {
  const o = db.get(req.params.id); if (!o) return res.status(404).json({ error: 'introuvable' });
  const status = PUBLIC[o.status] || 'review';
  res.json({ status, ref: o.ref, name: o.data.name, telegram: '@' + o.tg_username, link: status === 'ready' ? o.state.invite : null });
});

(async () => {
  try {
    db.recoverCrashed();
    await tg.init();
    B.start();
    worker.start();
    app.listen(cfg.port, () => console.log(`✔ DEVGRAM backend prêt sur le port ${cfg.port}`));
  } catch (e) { console.error('✖ Démarrage impossible :', e.message); process.exit(1); }
})();
