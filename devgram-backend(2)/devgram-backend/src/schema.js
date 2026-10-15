const { z } = require('zod');

const username = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{4,31}$/, 'nom d\u2019utilisateur invalide');
const ACTIVITIES = ['commerce', 'food', 'realestate', 'training', 'finance', 'content', 'community', 'wellness', 'services', 'other'];
const LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'ru', 'tr', 'other'];

// Même structure que l'objet `order` envoyé par devgram.html
const orderSchema = z.object({
  format: z.enum(['channel', 'group', 'forum']),
  visibility: z.enum(['public', 'private']),
  linkedGroup: z.boolean(),
  activity: z.enum(ACTIVITIES),
  activityLabel: z.string().max(60).nullable().optional(),
  activityOther: z.string().max(60).nullable().optional(),
  name: z.string().trim().min(1).max(64),
  description: z.string().max(255).default(''),
  username: username.nullable(),
  altUsername: username.nullable().optional(),
  welcomeMessage: z.string().max(500).default(''),
  language: z.enum(LANGS),
  options: z.object({
    post: z.object({ frequency: z.string().max(40) }).optional(),
    schedule: z.object({ time: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string().max(40) }).optional(),
    welcome: z.literal(true).optional(),
    buttons: z.array(z.object({
      label: z.string().min(1).max(24),
      url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'lien http(s) uniquement'),
    })).min(1).max(3).optional(),
    relay: z.object({ source: z.string().min(1).max(300), authorized: z.literal(true) }).optional(),
    moderation: z.object({ level: z.enum(['standard', 'strict']) }).optional(),
    errorAlerts: z.object({ via: z.enum(['email', 'telegram']) }).optional(),
  }).strict(),
  delivery: z.enum(['standard', 'express']),
  email: z.string().email().max(120),
  telegram: z.string().regex(/^@[A-Za-z][A-Za-z0-9_]{4,31}$/, 'pseudo Telegram invalide'),
  acceptedTerms: z.literal(true),
}).strict().refine((o) => o.visibility !== 'public' || !!o.username, { message: 'nom d\u2019utilisateur requis pour un canal public', path: ['username'] });

module.exports = { orderSchema };
