// ⚠️ Doit rester IDENTIQUE aux constantes de devgram.html (BASE, LINKED, OPTS, DELIVERY).
// Le prix facturé est TOUJOURS calculé ici : le navigateur n'envoie jamais de montant.
const BASE = { channel: 19, group: 19, forum: 24 };
const LINKED = 6;
const OPT = { post: 12, schedule: 8, welcome: 3, buttons: 3, relay: 19, moderation: 9, errorAlerts: 3 };
const OPT_LABEL = {
  post: 'Publication automatique de messages', schedule: 'Programmation des publications', welcome: 'Message de bienvenue automatique',
  buttons: 'Boutons avec des liens', relay: 'Relais depuis une source autorisée', moderation: 'Modération', errorAlerts: 'Notifications en cas d\u2019erreur',
};
const DELIVERY = { standard: 0, express: 10 };
const FORMAT_LABEL = { channel: 'Canal de diffusion', group: 'Groupe de discussion', forum: 'Groupe avec sujets' };

// Retire les options incompatibles avec le format (mêmes règles que le formulaire).
function normalize(o) {
  const options = { ...o.options };
  const linked = o.format === 'channel' && !!o.linkedGroup;
  if (o.format === 'channel') delete options.welcome;
  if (o.format === 'channel' && !linked) delete options.moderation;
  return { ...o, linkedGroup: linked, options, username: o.visibility === 'public' ? o.username : null };
}

function lines(o) {
  const L = [{ label: `${FORMAT_LABEL[o.format]} ${o.visibility === 'public' ? 'public' : 'privé'}`, cents: BASE[o.format] * 100 }];
  if (o.linkedGroup) L.push({ label: 'Groupe de commentaires relié', cents: LINKED * 100 });
  for (const k of Object.keys(OPT)) if (o.options[k]) L.push({ label: OPT_LABEL[k], cents: OPT[k] * 100 });
  if (DELIVERY[o.delivery]) L.push({ label: 'Livraison express', cents: DELIVERY[o.delivery] * 100 });
  return L;
}
const totalCents = (o) => lines(o).reduce((a, x) => a + x.cents, 0);

module.exports = { normalize, lines, totalCents, FORMAT_LABEL, OPT_LABEL };
