# Règles du dépôt GRAFFAGNINO · Prospection

## Carte verrouillée
- `carte/carte.html` est l'outil de travail principal (57 zones, scores, distances). Ne jamais la modifier,
  la reformater, la régénérer ni la déplacer, même pour une correction mineure.
- Ne jamais modifier `carte/carte.sha256` : cette empreinte bloque la mise en ligne Netlify et fait échouer
  la vérification GitHub si la carte change.
- Une évolution qui semble demander de toucher à la carte se fait côté application (`js/`, `css/`, `index.html`),
  en dialoguant avec la carte par messages, ou en lui ajoutant des éléments depuis l'application
  (`js/ui/map-view.js` injecte un style et `js/ui/carte-ajouts.js` dans le cadre, sans toucher au fichier). Si c'est impossible, s'arrêter et demander l'accord explicite
  du propriétaire du dépôt avant toute modification.

## Travail
- Push direct sur `main`, un commit par correction, après `node --check` sur les fichiers JS modifiés.
- Aucune clé `service_role`, aucun mot de passe, aucun fichier `.env` dans le dépôt.
