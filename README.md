# B.R.S. // MISSION 207 — Terminal de consultation

Site statique **autonome** (HTML/CSS/JS vanilla, zéro dépendance hors Google
Fonts + `logobrs.png`), style « VISOR » du Bureau du Renseignement Sénatorial.

Le terminal présente **deux rapports** sur la surveillance du **212e Bataillon**
(mandat de l'Amirauté) : un **Rapport de surveillance** et un **Rapport final**,
à **télécharger** ou **consulter** — après saisie d'un **code d'accès**.

## 🔒 Sécurité (important)
- Les PDF sont **chiffrés (AES-256-GCM)** : seuls les fichiers `*.pdf.enc` sont
  publiés. Les PDF en clair ne sont **jamais** dans le dépôt.
- La clé est **dérivée du code d'accès** (PBKDF2-SHA256). Le code d'accès
  **n'apparaît pas** dans le dépôt : seul un « témoin » chiffré sert à le valider.
- Sans le bon code, les `.enc` sont **inexploitables**, et la consultation /
  le téléchargement déchiffrent le PDF **dans le navigateur**.
- ⚠️ Limite : ça protège le contenu vis-à-vis du public, **pas** vis-à-vis de
  quelqu'un à qui on a donné le code (il peut évidemment lire/extraire les PDF).
  La robustesse dépend de la force du code d'accès.

## Lancer / héberger
Le déchiffrement utilise `fetch()` → il faut un **vrai serveur** (http/https),
pas une ouverture directe `file://`.

- En local : `python -m http.server 8781` puis http://localhost:8781
- En ligne : **GitHub Pages** (repo public) — fonctionne directement.

## Structure
```
corsaire/
├── index.html                          intro + en-tête dossier + 2 cartes-rapport
├── css/style.css                       feuille de style unique
├── js/main.js                          moteur (audio, intro, crypto, download)
├── logobrs.png                         emblème B.R.S.
└── rapports/                           les 2 rapports CHIFFRÉS (.pdf.enc)
```

## Éditer le contenu
Textes dans `index.html` (commentaires `ZONE ÉDITABLE`) : en-tête du dossier,
références/dates/descriptions des 2 cartes. Lignes de l'intro dans `js/main.js`
(fonction `runSession`).

## Changer le code d'accès ou les PDF
Il faut **re-chiffrer** à partir des PDF d'origine (le code d'accès n'est pas
stocké en clair) :
1. lancer le script de chiffrement avec le nouveau code + les PDF d'origine ;
2. remplacer les fichiers `rapports/*.pdf.enc` ;
3. coller les nouvelles constantes (`salt` / `iter` / `sentinel`) dans l'objet
   `SEC` en haut de `js/main.js`.

---
© B.R.S. — Bureau du Renseignement Sénatorial — Transmission chiffrée — confidentiel.
