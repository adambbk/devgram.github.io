const Database = require('better-sqlite3');
const path = require('path');
const cfg = require('./config');

const db = new Database(path.join(cfg.dataDir, 'devgram.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, ref TEXT UNIQUE NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, provisioned_at TEXT,
  data TEXT NOT NULL, total_cents INTEGER NOT NULL, email TEXT NOT NULL,
  tg_username TEXT NOT NULL, tg_user_id TEXT, stripe_session TEXT, payment_intent TEXT, logo_path TEXT,
  state TEXT NOT NULL DEFAULT '{}', error TEXT, review_msg_id INTEGER,
  delivered_at TEXT, admin_granted_at TEXT, admin_attempts INTEGER NOT NULL DEFAULT 0, next_admin_try TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS chats (chat_id TEXT PRIMARY KEY, order_id TEXT NOT NULL, role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, text TEXT NOT NULL,
  publish_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT
);
`);

const now = () => new Date().toISOString();
const hydrate = (r) => r && { ...r, data: JSON.parse(r.data), state: JSON.parse(r.state) };
const COLS = ['status', 'error', 'review_msg_id', 'delivered_at', 'admin_granted_at', 'admin_attempts', 'next_admin_try',
  'provisioned_at', 'payment_intent', 'stripe_session', 'tg_user_id'];

module.exports = {
  now,
  createOrder(o) {
    db.prepare(`INSERT INTO orders (id, ref, status, created_at, updated_at, data, total_cents, email, tg_username, tg_user_id, stripe_session, logo_path)
      VALUES (@id, @ref, @status, @t, @t, @data, @total, @email, @tg, @tgid, @session, @logo)`).run({
      id: o.id, ref: o.ref, status: o.status || 'pending_payment', t: now(), data: JSON.stringify(o.data), total: o.totalCents,
      email: o.email, tg: o.tgUsername, tgid: o.tgUserId || null, session: o.stripeSession || null, logo: o.logoPath || null,
    });
  },
  get: (id) => hydrate(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)),
  byRef: (ref) => hydrate(db.prepare('SELECT * FROM orders WHERE ref = ?').get(String(ref).toUpperCase())),
  byStripeSession: (s) => hydrate(db.prepare('SELECT * FROM orders WHERE stripe_session = ?').get(s)),
  firstWithStatus: (s) => hydrate(db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at LIMIT 1').get(s)),
  listActive: () => db.prepare("SELECT ref, status, data, created_at FROM orders WHERE status NOT IN ('pending_payment','completed','rejected') ORDER BY created_at DESC LIMIT 30")
    .all().map((r) => ({ ...r, data: JSON.parse(r.data) })),
  update(id, patch) {
    const keys = Object.keys(patch).filter((k) => COLS.includes(k));
    if (!keys.length) return;
    db.prepare(`UPDATE orders SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = @_t WHERE id = @_id`).run({ ...patch, _t: now(), _id: id });
  },
  saveState: (id, st) => db.prepare('UPDATE orders SET state = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(st), now(), id),
  saveData: (id, d) => db.prepare('UPDATE orders SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(d), now(), id),
  countProvisionedSince: (iso) => db.prepare('SELECT COUNT(*) c FROM orders WHERE provisioned_at > ?').get(iso).c,
  recoverCrashed: () => db.prepare("UPDATE orders SET status = 'paid' WHERE status = 'provisioning'").run(),
  dueAdminGrants: () => db.prepare("SELECT * FROM orders WHERE status = 'delivered' AND (next_admin_try IS NULL OR next_admin_try <= ?) ORDER BY delivered_at LIMIT 5")
    .all(now()).map(hydrate),
  linkChat: (chatId, orderId, role) => db.prepare('INSERT OR REPLACE INTO chats (chat_id, order_id, role) VALUES (?, ?, ?)').run(String(chatId), orderId, role),
  chatInfo: (chatId) => db.prepare('SELECT * FROM chats WHERE chat_id = ?').get(String(chatId)),
  addScheduled: (orderId, text, publishAt) => db.prepare('INSERT INTO scheduled_posts (order_id, text, publish_at) VALUES (?, ?, ?)').run(orderId, text, publishAt).lastInsertRowid,
  dueScheduled: (iso) => db.prepare("SELECT * FROM scheduled_posts WHERE status = 'pending' AND publish_at <= ? ORDER BY publish_at LIMIT 10").all(iso),
  markScheduled: (id, status, error = null) => db.prepare('UPDATE scheduled_posts SET status = ?, error = ? WHERE id = ?').run(status, error, id),
};
