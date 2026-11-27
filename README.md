# GRAFFAGNINO · Prospection

Application de prospection des emplacements : carte des 57 zones, CRM des emplacements, entreprises par zone, administration des utilisateurs.

- **En ligne :** https://grafftothemoon.netlify.app (Netlify, mise en ligne automatique à chaque push sur `main`).
- **Données et comptes :** Supabase (base PostgreSQL, Supabase Auth, règles de sécurité par ligne).
- **Code :** HTML, CSS et JavaScript, sans compilation. supabase-js est inclus dans `js/vendor/`.

## Comptes

Les comptes se créent dans Supabase : **Authentication → Users → Add user → Create new user**, avec **Auto Confirm User**.
Un profil « Utilisateur » est créé automatiquement ; un administrateur règle ensuite nom, fonction et rôle dans l'écran Administration.
L'inscription libre est désactivée dans Supabase.

## Installation de la base (une seule fois)

Dans Supabase, **SQL Editor → New query**, coller le contenu de `supabase/schema.sql`, puis **Run**.
Puis exécuter de la même façon `supabase/002_documents_visites.sql` (photos, documents, position GPS des visites)
et `supabase/003_position_fiches.sql` (position des fiches sur la carte).
Nommer ensuite le premier administrateur :

```sql
update public.profiles set role = 'admin' where email = 'email-de-l-administrateur@exemple.fr';
```

## Structure

```
index.html                    coquille de l'application (connexion + espaces)
carte/carte.html              carte verrouillée (empreinte dans carte/carte.sha256, vérifiée par Netlify et GitHub)
css/app.css                   style
js/config.js                  adresse et clé publique Supabase, référentiels : statuts, types, rôles, activités
js/data/zones.js              57 zones extraites de la carte (généré, lecture seule)
js/data/supabase-repository.js  accès aux données et à l'authentification Supabase
js/data/repository.js         création du client Supabase (GA.repo)
js/vendor/                    supabase-js 2.118.0 (MIT) et Leaflet 1.9.4 (BSD-2), copies des paquets npm officiels
data/parcelles-pm/            propriétaires personnes morales par commune (DGFiP, généré)
js/services/auth.js           connexion (Supabase Auth)
js/services/permissions.js    droits administrateur / utilisateur
js/services/prospects.js      logique métier : fiches, statuts, échanges, utilisateurs
js/services/entreprises.js    entreprises autour d'une zone (API Recherche d'entreprises)
js/services/export-xlsx.js    export Excel (.xlsx) sans bibliothèque
js/services/images.js         réduction des photos avant envoi
js/ui/*.js                    écrans : connexion, carte, CRM, fiche, relances, tableau de bord, administration
js/ui/carte-ajouts.js         recherche, emplacements et fiches sur la carte (chargé dans le cadre de la carte)
js/app.js                     démarrage et navigation
supabase/schema.sql           tables, déclencheurs et règles de sécurité de la base
supabase/002_documents_visites.sql  documents, stockage privé, position GPS des échanges
supabase/003_position_fiches.sql    position des fiches
tools/make_zones.py           régénère js/data/zones.js depuis la carte
tools/bundle.py               produit la version en un seul fichier
tools/make_parcelles.py       régénère data/parcelles-pm/ depuis le fichier DGFiP
```

L'interface n'accède aux données que par `GA.repo`. La clé publique Supabase de `js/config.js` est faite pour être visible : sans compte connecté et actif, les règles de sécurité de la base ne donnent accès à rien. La clé secrète (service_role) ne doit jamais apparaître dans le dépôt.

## Relances, tableau de bord, export

- **Relances :** dossiers en retard, du jour, des 7 prochains jours, et dossiers en cours sans date. « Fait » enregistre l'échange et programme la suite ; « +1 j » / « +7 j » reportent. La pastille rouge du menu compte mes relances en retard ou du jour.
- **Tableau de bord :** fiches par statut, par responsable et par zone ; taux de transformation = accords / dossiers clos (accords + refus).
- **Export Excel :** bouton « Exporter Excel » (CRM ou tableau de bord) : fiches, échanges et utilisateurs dans un classeur .xlsx, qui sert aussi de sauvegarde.

## Recherche et emplacements sur la carte

Sur l'onglet Carte : barre de recherche d'adresse (géocodeur IGN) et bouton « + Emplacement » (clic sur la carte → nom → fiche créée,
avec adresse, commune, position et zone la plus proche à moins de 1,5 km). Toutes les fiches positionnées apparaissent en marqueurs
de la couleur de leur statut ; clic → ouvrir la fiche. Une fiche se positionne aussi depuis son adresse (« Localiser depuis l'adresse »)
ou lors d'une visite terrain.

Ces ajouts sont chargés depuis l'application dans le cadre de la carte (`js/ui/carte-ajouts.js`) : `carte/carte.html` n'est pas modifiée.

## Photos, documents et visites terrain

- **Photos et documents** (section de la fiche) : photos, plans d'implantation, conventions, PDF et fichiers bureautiques (20 Mo maximum).
  Stockage privé Supabase : les fichiers ne s'ouvrent que par des liens temporaires, pour les comptes actifs. Les photos sont réduites à 2000 px avant l'envoi.
- **Visite terrain** (bouton « + Visite », en bas à droite sur téléphone) : position GPS, fiche la plus proche présélectionnée, compte rendu,
  photos prises sur place, statut et prochaine relance. L'échange garde la position (lien « 📍 position » dans l'historique).

## Propriétaire foncier

Bouton « Propriétaire » de la fiche : plan IGN (photo aérienne ou plan) avec les parcelles cadastrales, centré sur l'adresse de la fiche ou sa zone.
Un clic sur une parcelle donne sa référence, sa surface et, quand c'est une personne morale (société, SCI, commune, État, bailleur social…), le propriétaire et son SIREN.
« Utiliser comme propriétaire de la fiche » remplit le propriétaire, son type et ajoute la parcelle aux notes.

- Parcelles : API Carto de l'IGN (apicarto.ign.fr) ; fonds de plan : Géoplateforme IGN (data.geopf.fr) ; adresses : géocodeur IGN.
- Propriétaires : fichier DGFiP des parcelles des personnes morales (situation 2026, Licence Ouverte), préparé par `tools/make_parcelles.py`
  dans `data/parcelles-pm/` pour les 94 communes du Val-d'Oise autour des zones. Les propriétaires particuliers ne sont pas publiés.
- Mise à jour annuelle : télécharger le nouveau fichier sur data.economie.gouv.fr (« Fichiers des locaux et des parcelles des personnes morales »)
  et relancer le script.

## Entreprises de la zone

Le bouton « Entreprises » (fiche, CRM filtré sur une zone, ou formulaire de nouvelle fiche) liste les établissements situés autour du point de la zone : nom, enseigne, SIREN, SIRET, activité, effectif, dirigeant, distance.
Filtres : rayon (200 m à 2 km), secteur d'activité, texte, établissements fermés. « + Fiche » crée une fiche CRM pré-remplie (SIREN et source dans les notes).
Source : API publique [Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr/docs/) (data.gouv.fr), gratuite et sans clé. La carte n'est pas modifiée.

## Droits

- **Administrateur :** tous les espaces, gestion des utilisateurs, toutes les fiches (modification, attribution, suppression).
- **Utilisateur :** carte et CRM. Il voit toutes les fiches. Il modifie celles dont il est responsable et celles qui ne sont pas attribuées. Il crée des fiches, dont il devient responsable. Il ne supprime pas de fiche.
