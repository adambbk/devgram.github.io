# DEVLAB — Studio & Écosystème Web

Site vitrine d'un studio fictif qui configurerait des **canaux Telegram** (DEVGRAM) et des **serveurs Discord** (DEVCORD). Projet personnel de démonstration pour travailler une interface front-end complète, sans backend.

🌐 **Démo en ligne :** https://adambbk.github.io/devgram.github.io/

> ⚠️ **Projet fictif.** Aucun service n'est réellement vendu : paiements, prix, partenaires et statistiques du tableau de bord sont des données de démonstration.


## Fonctionnalités

- Navigation entre 4 vues (accueil, catalogue, espace client, onboarding) **sans rechargement de page**
- Catalogue de partenaires avec **recherche** et **filtres par catégorie**, et fiche détaillée en fenêtre modale
- Tableau de bord avec indicateurs et **graphique d'évolution** (Chart.js, données fictives)
- Formulaire d'onboarding en **5 étapes**
- Pages dédiées **DEVGRAM** (Telegram) et **DEVCORD** (Discord)
- Menu mobile, notifications (toasts) et fond animé sur canvas
- Design sombre responsive

## Technologies

- HTML5, JavaScript
- Tailwind CSS (via CDN) et CSS personnalisé
- Chart.js
- Font Awesome

## Structure du projet

```
├── index.html      Page principale (accueil, catalogue, dashboard, onboarding)
├── devgram.html    Page DEVGRAM (Telegram)
├── devcord.html    Page DEVCORD (Discord)
├── style.css       Styles personnalisés
└── script.js       Navigation, filtres, graphique, formulaire
```

## Lancer le projet

Le projet est statique. Ouvre `index.html` dans le navigateur, ou lance un petit serveur local :

```bash
python -m http.server 8000
```

Puis ouvre `http://localhost:8000`.

## Ce que ce projet démontre

- Gestion d'une interface multi-vues en JavaScript
- Génération dynamique d'éléments (catalogue, filtres, tableau de bord)
- Intégration d'une bibliothèque de graphiques
- Mise en page responsive avec Tailwind CSS

## Limites connues et améliorations prévues

- Tailwind est chargé par CDN, pratique pour un prototype. Pour une mise en production, il faudrait le compiler.
- Liens de contact à remplacer par de vrais liens, et pages légales à rédiger.
- Audit d'accessibilité : contrastes, tailles de texte, navigation au clavier.
- Optimisation de l'animation de fond sur mobile.

## Auteur

Adam Bouberka — [GitHub](https://github.com/adambbk) · [LinkedIn](https://www.linkedin.com/in/adam-bouberka-741467334/)
