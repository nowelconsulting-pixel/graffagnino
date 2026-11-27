# GRAFFAGNINO · Prospection — maquette

Maquette fonctionnelle de l'application de prospection : carte des 57 zones, CRM des emplacements, administration des utilisateurs.

**Maquette :** connexion simulée, données fictives, stockage dans le navigateur. Aucune sécurité réelle.

## Ouvrir la maquette

Ouvrir `index.html` dans Chrome, Edge ou Firefox, ou utiliser `graffagnino-prospection.html`, la version en un seul fichier.
Une connexion internet est nécessaire pour les fonds de carte et les couches en ligne de la carte.

| Compte de démonstration    | Mot de passe | Rôle           |
|----------------------------|--------------|----------------|
| admin@graffagnino.demo     | admin        | Administrateur |
| camille@graffagnino.demo   | demo         | Utilisateur    |
| julien@graffagnino.demo    | demo         | Utilisateur    |

Les modifications sont conservées dans le navigateur (localStorage). Pour repartir des données d'origine : Administration → Réinitialiser la démonstration.

## Structure

```
index.html                    coquille de l'application (connexion + espaces)
carte/carte.html              carte verrouillée, inchangée, avec un bloc de liaison ajouté à la fin
css/app.css                   style
js/config.js                  référentiels : statuts, types de propriétaire, types d'échange, rôles
js/data/zones.js              57 zones extraites de la carte (généré, lecture seule)
js/data/demo-data.js          utilisateurs, fiches et échanges fictifs
js/data/local-repository.js   données de démonstration (localStorage)
js/data/supabase-repository.js  interface Supabase à implémenter (non chargée)
js/data/repository.js         choix de la source de données (GA.config.dataSource)
js/services/auth.js           connexion simulée (→ Supabase Auth)
js/services/permissions.js    droits administrateur / utilisateur
js/services/prospects.js      logique métier : fiches, statuts, échanges, utilisateurs
js/services/entreprises.js    entreprises autour d'une zone (API Recherche d'entreprises)
js/ui/*.js                    écrans : connexion, carte, CRM, fiche, administration
js/app.js                     démarrage et navigation
supabase/schema.sql           tables et règles de sécurité prévues (non exécuté)
tools/make_zones.py           régénère js/data/zones.js depuis la carte
tools/bundle.py               produit la version en un seul fichier
```

L'interface n'accède aux données que par `GA.repo`. Toutes les fonctions sont asynchrones, comme le seront les appels Supabase.

## Entreprises de la zone

Le bouton « Entreprises » (fiche, CRM filtré sur une zone, ou formulaire de nouvelle fiche) liste les établissements situés autour du point de la zone : nom, enseigne, SIREN, SIRET, activité, effectif, dirigeant, distance.
Filtres : rayon (200 m à 2 km), secteur d'activité, texte, établissements fermés. « + Fiche » crée une fiche CRM pré-remplie (SIREN et source dans les notes).
Source : API publique [Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr/docs/) (data.gouv.fr), gratuite et sans clé. La carte n'est pas modifiée.

## Droits

- **Administrateur :** tous les espaces, gestion des utilisateurs, toutes les fiches (modification, attribution, suppression).
- **Utilisateur :** carte et CRM. Il voit toutes les fiches. Il modifie celles dont il est responsable et celles qui ne sont pas attribuées. Il crée des fiches, dont il devient responsable. Il ne supprime pas de fiche.

## Passage à Supabase (étapes suivantes)

1. Créer le projet Supabase et exécuter `supabase/schema.sql`.
2. Ajouter supabase-js dans `index.html` et charger `js/data/supabase-repository.js`.
3. Implémenter les fonctions de `supabase-repository.js`, qui gardent les mêmes noms et renvoient les mêmes champs.
4. Remplacer `GA.auth` par Supabase Auth. La création des comptes passe par une fonction serveur, jamais par le navigateur.
5. Passer `GA.config.dataSource` à `'supabase'`, puis supprimer `demo-data.js` et la réinitialisation de démonstration.
