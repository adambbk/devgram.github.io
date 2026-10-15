const path = require('path');
const fs = require('fs');
require('dotenv').config();

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`✖ Variable manquante dans .env : ${k}`); process.exit(1); }
  return v;
};

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

module.exports = {
  port: Number(process.env.PORT) || 3000,
  origin: need('ALLOWED_ORIGIN').replace(/\/$/, ''),
  siteUrl: need('SITE_URL').replace(/\/$/, ''),
  stripe: { key: need('STRIPE_SECRET_KEY'), webhookSecret: need('STRIPE_WEBHOOK_SECRET') },
  tg: { apiId: Number(need('TG_API_ID')), apiHash: need('TG_API_HASH'), session: need('TG_SESSION') },
  bot: { token: need('BOT_TOKEN'), username: need('BOT_USERNAME').replace(/^@/, ''), ownerId: Number(need('OWNER_TELEGRAM_ID')) },
  maxPerDay: Number(process.env.MAX_CHANNELS_PER_DAY) || 8,
  smtpUrl: process.env.SMTP_URL || '',
  mailFrom: process.env.MAIL_FROM || 'DEVGRAM <no-reply@example.com>',
  dataDir, uploadsDir,
};
