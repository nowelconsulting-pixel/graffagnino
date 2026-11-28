# GRAFFAGNINO · Prospection

Outil de développement commercial des distributeurs GRAFFAGNINO : trouver les meilleurs emplacements (études de sourcing,
carte historique des 57 zones, moteur de score), identifier les interlocuteurs, organiser les actions et piloter les négociations
jusqu'à la signature puis l'installation.

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
`supabase/003_position_fiches.sql` (position des fiches sur la carte) et `supabase/004_moteur.sql` (score des emplacements, réglages du moteur) et `supabase/005_suppression_fiches.sql` (suppression par le responsable de la fiche),
puis `supabase/006_v2_crm_sourcing.sql` (V2 : pipeline commercial, interlocuteurs, journal, réseau, objectifs, sourcing).
006 sauvegarde d'abord les tables existantes dans le schéma `sauvegarde_v1`, convertit les anciens statuts sans perte et vérifie le résultat ;
il peut être relancé sans risque. Retour arrière : `supabase/006_retour_arriere.sql` (les nouvelles tables sont conservées).
Tant que 006 n'est pas exécuté, l'application affiche un écran « Mise à jour de la base nécessaire ».
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
data/gares.json               gares SNCF et fréquentation (généré)
data/tmja.json                trafic du réseau routier national (généré)
data/carreaux/                population INSEE par carreau de 200 m, par département (généré)
data/bpe/                     équipements INSEE qui attirent du monde, par département (généré)
data/parkings.json            parkings publics (généré)
data/antennes-4g.json         antennes 4G / 5G des opérateurs (généré)
data/zones-v2.json            les 57 zones calculées avec le moteur v2 (généré)
js/services/auth.js           connexion (Supabase Auth)
js/services/permissions.js    droits administrateur / utilisateur
js/services/prospects.js      logique métier : dossiers, étapes, interlocuteurs, échanges, réseau, référentiels
js/services/pipeline.js       règles du pipeline : conditions d'étape, avancement, potentiel, matrice, alertes
js/services/sourcing.js       moteur de sourcing : détection, fusion, pré-score, dimensions, acteurs, passage au CRM
js/services/entreprises.js    entreprises autour d'une zone (API Recherche d'entreprises)
js/services/export-xlsx.js    export Excel (.xlsx) sans bibliothèque
js/services/images.js         réduction des photos avant envoi
js/ui/*.js                    écrans : connexion, carte, CRM, fiche, relances, tableau de bord, administration
js/ui/carte-ajouts.js         recherche, emplacements et fiches sur la carte (chargé dans le cadre de la carte)
js/app.js                     démarrage et navigation
supabase/schema.sql           tables, déclencheurs et règles de sécurité de la base
supabase/002_documents_visites.sql  documents, stockage privé, position GPS des échanges
supabase/003_position_fiches.sql    position des fiches
supabase/004_moteur.sql             score des fiches, évaluation terrain, réglages du moteur
supabase/006_v2_crm_sourcing.sql    V2 (sauvegarde, migration des statuts, contacts, journal, réseau, objectifs, sourcing)
supabase/006_retour_arriere.sql     retour aux statuts V1 si nécessaire
tools/make_zones.py           régénère js/data/zones.js depuis la carte
tools/bundle.py               produit la version en un seul fichier
tools/make_parcelles.py       régénère data/parcelles-pm/ depuis le fichier DGFiP
tools/make_carreaux.py, make_bpe.py, make_parkings.py, make_antennes.py, make_gares.py, make_tmja.py   données du moteur
```

L'interface n'accède aux données que par `GA.repo`. La clé publique Supabase de `js/config.js` est faite pour être visible : sans compte connecté et actif, les règles de sécurité de la base ne donnent accès à rien. La clé secrète (service_role) ne doit jamais apparaître dans le dépôt.

## Pipeline commercial (V2)

Étapes : Repéré → Qualifié → Interlocuteur identifié → En discussion → Négociation → Accord → Signé → Installé, et Abandonné.
Signé et Installé sont distincts : un site ne rejoint le réseau (et ne pénalise ses voisins) qu'une fois installé.

- **Changer d'étape** passe par une fenêtre qui exige la prochaine action et propose une date de relance (modifiable).
  Conditions d'entrée : position ou zone dès « Qualifié », un contact joignable dès « Interlocuteur identifié », un contact principal dès « En discussion ».
- **Interlocuteurs :** plusieurs par dossier (fonction, entreprise, coordonnées, rôle, pouvoir de décision, intérêt), un seul principal.
- **Blocage :** raison + date de réexamen ; le dossier revient dans les relances à cette date. **Abandon :** motif obligatoire, dossier réouvrable.
- **Conditions :** modèle économique, montant, durée, électricité, emplacement précis ; échange de type « Proposition ». **Jalons :** accord, signature, installation.
- **Journal automatique** (base de données, non modifiable) distinct des échanges saisis : création, étapes, responsable, blocages, contacts, conditions.
- **Matrice de priorisation :** potentiel de l'emplacement (seuil 60 réglable) × avancement du dossier (en discussion ou au-delà, contact principal intéressé,
  avec pouvoir de décision, sans blocage) → À signer en priorité, Opportunité à saisir, À débloquer, En réserve. Les deux mesures ne sont jamais additionnées
  et l'application ne calcule aucune probabilité de signature.

## Tableau de bord, relances, export

- **Tableau de bord :** objectif commercial (signatures / cible, date repère informative), actions du jour (retards, blocages à réexaminer,
  dossiers sans prochaine action, immobiles, sans interlocuteur), matrice, pipeline par étape et motifs d'abandon, activité par responsable, zones, réseau.
- **Relances :** en retard, aujourd'hui, blocages à réexaminer, dossiers sans prochaine action, 7 prochains jours, sans date.
- **Export Excel :** dossiers, interlocuteurs, échanges, réseau et utilisateurs dans un classeur .xlsx, qui sert aussi de sauvegarde.

## Études de sourcing (Opportunités)

Une étude part d'un laboratoire (ou d'une adresse) et d'un rayon, et recherche les lieux candidats par typologie : supermarchés, stations-service,
gares, centres commerciaux, parkings, loisirs, hôtels.

1. **Détection :** OpenStreetMap (Overpass), prix des carburants (data.economie.gouv.fr, source officielle), gares SNCF et parkings BNLS (fichiers `data/`).
2. **Fusion** des doublons et **niveau de preuve** : A source officielle, B OpenStreetMap nommé, C OpenStreetMap sans nom, D hypothèse.
3. **Pré-score local** (habitants à 800 m 35, flux propre au lieu 30, commerces et services à 400 m 20, concurrence pizza à 1 km 15, puis malus réseau).
4. **Analyse complète** (moteur v2, distance par la route) des N meilleurs lieux livrables.
5. **Cinq dimensions séparées :** potentiel géographique, faisabilité logistique, technique, commerciale, qualité de l'information.

Chaque lieu peut être retenu, mis en attente ou écarté (motif), comparé à d'autres, affiché sur la carte. « Identifier les acteurs » cherche
l'exploitant (SIRENE), le propriétaire de la parcelle (cadastre + DGFiP personnes morales) et la commune, avec un niveau de certitude.
« Retenir et créer le dossier CRM » crée le dossier positionné, avec son analyse d'entrée et les acteurs comme interlocuteurs « à confirmer ».
Les études sont conservées : une nouvelle étude du même territoire signale les lieux nouveaux.

## Administration

Utilisateurs · **Réseau** (laboratoires avec distance maximale de livraison, distributeurs en service / suspendus / retirés / projets) ·
**Secteurs et objectifs** (cible de signatures, date repère facultative) · **Concurrents** relevés · **Réglages** (seuils du pipeline, malus de proximité).

## Moteur de score (barème v2) et onglet Opportunités

Le moteur (`js/services/moteur.js`) note en direct n'importe quel point de France sur 100 :

| Critère | Points | Mesure | Source |
|---|---|---|---|
| Habitants à 800 m | 15 | habitants, ménages, âges, niveau de vie | INSEE Filosofi 2019, carreaux de 200 m (`data/carreaux/`) |
| Population à 10 min | 10 | habitants dans l'isochrone voiture de 10 min | IGN isochrone × carreaux INSEE (communes en secours) |
| Activité du soir et lieux de vie | 15 | lieux ouverts après 21 h, bars, cinémas, salles de sport ; collèges, lycées, sup, hôpitaux, gares, piscines… | OpenStreetMap (horaires) + INSEE BPE 2025 (`data/bpe/`) |
| Facilité d'arrêt | 10 | places de stationnement à 200 m, station-service | OpenStreetMap + base nationale du stationnement (`data/parkings.json`) |
| Flux de passage | 15 | trafic des routes nationales, gare et fréquentation, lignes de bus | DGITM (`data/tmja.json`), SNCF (`data/gares.json`), OpenStreetMap |
| Environnement commercial | 15 | commerces et restaurants à 500 m, grandes surfaces | SIRENE |
| Concurrence | 15 | pizzerias à 1 km (dont ouvertes après 22 h), distributeurs de pizzas | SIRENE + OpenStreetMap + réglages |
| Emplois à 500 m | 5 | emplois salariés estimés | SIRENE |

Indicateurs sans points, affichés avec le détail : **réseau mobile** (antennes 4G/5G des 4 opérateurs à 1,5 km, ANFR, `data/antennes-4g.json`),
**zone d'urbanisme** (Géoportail de l'urbanisme via API Carto ; zone A ou N signalée), **photo de rue** la plus proche (Panoramax).

Puis : malus de proximité d'un de nos distributeurs (réglable, jamais une exclusion) et bonus / malus terrain de la fiche (accès, visibilité, attractivité).
Score = points obtenus ÷ points mesurables × 100 (fourchette si une donnée manque). P1 ≥ 60, P2 45–59, P3 < 45.

- **Opportunités :** classement unique des 57 zones (calculées avec le moteur v2, `data/zones-v2.json`) et des emplacements repérés ;
  « Recalculer » relance une zone ou une fiche avec les données du jour ; « Analyser une adresse… » note n'importe quelle adresse.
- **Réglages du moteur** (administrateurs) : sites (laboratoires, distributeurs), distance maximale, malus de proximité.
- Les données INSEE (carreaux, équipements) sont préparées pour l'Île-de-France, l'Oise, le Nord et le Pas-de-Calais.
  Pour un autre département : `tools/make_carreaux.py` et `tools/make_bpe.py` avec son numéro, puis ajouter ce numéro à `DEPS_CARREAUX` dans `js/services/moteur.js`.
  Sans ces fichiers, la population passe par les communes et les lieux de vie par OpenStreetMap seul.
- Limites : les routes départementales n'ont pas de comptage public dans le Val-d'Oise ; les horaires d'ouverture d'OpenStreetMap sont incomplets ;
  les pizzerias et distributeurs concurrents peuvent être sous-comptés. Une analyse prend une à deux minutes.

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
- **Utilisateur :** carte, sourcing et CRM. Il voit toutes les fiches. Il modifie celles dont il est responsable et celles qui ne sont pas attribuées. Il crée des fiches, dont il devient responsable, et supprime les fiches dont il est responsable.
