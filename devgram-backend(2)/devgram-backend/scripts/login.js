// À lancer UNE fois : connecte le compte Telegram créateur et affiche la session à coller dans .env (TG_SESSION).
require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

(async () => {
  if (!process.env.TG_API_ID || !process.env.TG_API_HASH) { console.error('Renseigne TG_API_ID et TG_API_HASH dans .env'); process.exit(1); }
  const c = new TelegramClient(new StringSession(''), Number(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 5 });
  await c.start({
    phoneNumber: () => input.text('Numéro du compte créateur (ex. +33612345678) : '),
    password: () => input.text('Mot de passe 2FA (laisse vide s\u2019il n\u2019y en a pas) : '),
    phoneCode: () => input.text('Code reçu dans Telegram : '),
    onError: (e) => console.error(e),
  });
  console.log('\n✔ Connecté. Copie cette ligne dans ton .env (c\u2019est un SECRET : elle donne accès au compte) :\n');
  console.log('TG_SESSION=' + c.session.save() + '\n');
  process.exit(0);
})();
