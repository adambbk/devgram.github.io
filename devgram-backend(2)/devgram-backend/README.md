# DEVGRAM — backend (Telegram)

Commande payée → le canal est créé automatiquement → **tu valides en un clic** → le client reçoit son lien et devient administrateur.

```
Formulaire (GitHub Pages) ──POST──> /api/order ──> Stripe Checkout ──> client paie
                                                        │ webhook /webhook
                                                        ▼
                          Compte créateur (GramJS) crée canal/groupe/forum, nom public, logo,
                          sujets, groupe relié, bot admin, message épinglé + boutons, lien d'invitation
                                                        │ contrôle automatique (nom, lien, logo, épinglé, bot, sujets…)
                                                        ▼
              Le bot t'envoie la fiche sur Telegram : [✅ Valider et livrer] [🔁 Relancer] [❌ Rejeter]
                                                        │ ✅
                                                        ▼
        E-mail + lien au client → dès qu'il rejoint, le compte créateur lui donne les droits d'admin
```

## Pourquoi un « compte créateur » ?
Un bot Telegram **ne peut pas créer** de canal ou de groupe. Seul un compte utilisateur le peut (API MTProto).
Utilise donc **un compte dédié** (pas ton compte perso), avec une carte SIM à lui et la **validation en deux étapes (2FA)** activée.
La session (`TG_SESSION`) donne un accès complet à ce compte : ne la partage jamais, ne la mets jamais dans GitHub.

## Ce que tu dois préparer
1. **Compte Telegram dédié** + `api_id` / `api_hash` sur https://my.telegram.org (API development tools).
2. **Un bot** avec @BotFather (`/newbot`) : note le token et le nom d'utilisateur. **Envoie-lui `/start`** depuis ton compte perso, sinon il ne pourra pas t'écrire.
3. **Ton ID Telegram** numérique (écris à @userinfobot) → `OWNER_TELEGRAM_ID`. Toi seul peux valider.
4. **Stripe** (clé secrète) et un **hébergeur** pour ce serveur. GitHub Pages ne peut pas l'héberger (pages statiques uniquement).
   Render, Railway ou Fly.io conviennent. Il faut un **disque persistant** (base SQLite + logos).

## En local (test)
```bash
npm install
cp .env.example .env        # puis remplis les valeurs
npm run login               # une fois : saisis le numéro du compte créateur, copie TG_SESSION dans .env
npm run test:provision      # crée un forum PRIVÉ de test, contrôle tout, le supprime  (ajoute  -- --keep  pour le garder)
npm start
stripe listen --forward-to localhost:3000/webhook    # donne le STRIPE_WEBHOOK_SECRET
```
**Lance `test:provision` avant toute vraie commande** : c'est la vérification réelle de la création sur Telegram.

## Mise en ligne (Render) — pas à pas
> ⚠️ Le plan **gratuit** de Render ne convient pas : il s'endort après 15 min d'inactivité (le bot et la boucle de création s'arrêtent) et il ne peut pas avoir de disque. Prends l'instance **Starter** (≈ 7 $/mois) + un **disque** de 1 Go.

1. Mets le contenu de ce dossier dans un dépôt GitHub **privé** (séparé de ton site), à la racine du dépôt.
2. Render → *New* → *Web Service* → choisis ce dépôt. Runtime **Node**, Build `npm install`, Start `npm start`, Instance **Starter**.
3. *Advanced* → **Add Disk** : Mount path `/var/data`, taille 1 Go. Ajoute la variable `DATA_DIR=/var/data`.
4. Ajoute toutes les variables de `.env.example` (au premier déploiement, mets `STRIPE_WEBHOOK_SECRET=whsec_provisoire` : tu le corriges à l'étape 5). `TG_SESSION` vient de `npm run login` lancé sur ton ordinateur.
5. Quand Render affiche l'adresse (ex. `https://devgram-xxxx.onrender.com`) : Stripe → Développeurs → Webhooks → *Ajouter un endpoint* `https://…/webhook`, événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`. Copie la clé de signature `whsec_…` dans la variable `STRIPE_WEBHOOK_SECRET` sur Render (le service redémarre).
6. Sur le site : dans `devgram.html` remplace `http://localhost:3000` (ligne `API_URL`) par l'adresse Render. Mets `frontend/succes.html` à côté de `devgram.html` et change `API_BASE` dedans.
7. **N'allume pas le serveur sur ton ordinateur en même temps que Render** (même bot et même session Telegram : conflit).

## Au quotidien
- Tu reçois : 💰 paiement → 🆕 fiche de validation avec le contrôle automatique (✅/❌ par point).
- Ouvre le canal avec le bouton, vérifie, puis **✅ Valider et livrer**.
- Commandes du bot (toi seul) : `/orders`, `/review REF`, `/retry REF`, `/username REF nouveau_nom`, `/plan REF 2026-11-02 09:00 texte…`.
- Si le nom public voulu est pris (et le nom de secours aussi), la création s'arrête et te le dit : réponds `/username REF autre_nom`.

## Automatisations incluses
| Option | État |
|---|---|
| Message de bienvenue, boutons-liens (sur le message épinglé), modération (liens, transferts) | automatique |
| Programmation | via `/plan` (publié à l'heure du fuseau du client) |
| Alertes d'erreur | e-mail (ou message Telegram si le client a démarré ton bot) |
| Publication automatique, relais de source | **manuel pour l'instant** : la fiche te le signale (contenus à récupérer, source à brancher) |

## À savoir avant de vendre
- **Je n'ai pas pu tester contre les vrais serveurs Telegram/Stripe** (pas d'accès réseau ici). Le code est vérifié syntaxiquement et les prix sont identiques à ceux du site, mais `npm run test:provision` est indispensable.
- **Limites Telegram :** un compte ne peut posséder qu'un nombre limité de canaux/groupes publics (de l'ordre de 10, à vérifier), et trop de créations rapprochées peuvent faire restreindre le compte. `MAX_CHANNELS_PER_DAY` protège, et des pauses sont intégrées. Si tu vends beaucoup, prévois plusieurs comptes créateurs ou le transfert de propriété aux clients.
- **Propriété :** le compte créateur reste propriétaire ; le client est administrateur (sans le droit de nommer d'autres admins : voir `adminRights` dans `src/tg-user.js`).
- **Paiement :** le montant est recalculé côté serveur (`src/pricing.js`, à garder identique aux prix de `devgram.html`). Les remboursements se font à la main dans Stripe.
- **Données personnelles :** on stocke e-mail, pseudo Telegram et logo. Mentionne-le dans tes conditions de vente / politique de confidentialité.
- **Devcord (Discord)** : pas encore inclus.
