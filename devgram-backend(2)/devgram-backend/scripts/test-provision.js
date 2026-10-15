// Test réel de la création sur ton compte créateur : crée un forum PRIVÉ de test, vérifie tout, puis le supprime.
//   npm run test:provision            -> crée, contrôle, supprime
//   npm run test:provision -- --keep  -> garde le canal pour le regarder
const crypto = require('crypto');
const db = require('../src/db');
const tg = require('../src/tg-user');
const { provision } = require('../src/provision');

(async () => {
  await tg.init();
  const id = 'test-' + crypto.randomUUID();
  const data = {
    format: 'forum', visibility: 'private', linkedGroup: false, activity: 'commerce', activityLabel: 'Commerce / Boutique',
    name: 'TEST DEVGRAM ' + new Date().toISOString().slice(11, 19), description: 'Canal de test automatique',
    username: null, altUsername: null, welcomeMessage: 'Message de test épinglé', language: 'fr',
    options: { buttons: [{ label: 'Site', url: 'https://example.com' }], welcome: true }, delivery: 'standard',
    email: 'test@example.com', telegram: '@test_user', acceptedTerms: true,
  };
  db.createOrder({ id, ref: id.slice(5, 13).toUpperCase(), data, totalCents: 0, email: data.email, tgUsername: 'test_user' });
  console.log('Création du forum de test…');
  const st = await provision(db.get(id));
  console.table(st.checks);
  console.log('Lien :', st.invite);
  const ok = st.checks.every((c) => c.ok);
  console.log(ok ? '✔ Tous les contrôles sont bons.' : '✖ Certains contrôles ont échoué : lis le tableau ci-dessus.');
  if (!process.argv.includes('--keep')) { await tg.deleteChat(st.chat.main); console.log('Canal de test supprimé.'); }
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('✖', e.message); process.exit(1); });
