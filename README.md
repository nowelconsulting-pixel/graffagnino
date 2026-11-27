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
js/vendor/                    supabase-js (copie du paquet npm officiel, licence MIT)
js/services/auth.js           connexion (Supabase Auth)
js/services/permissions.js    droits administrateur / utilisateur
js/services/prospects.js      logique métier : fiches, statuts, échanges, utilisateurs
js/services/entreprises.js    entreprises autour d'une zone (API Recherche d'entreprises)
js/ui/*.js                    écrans : connexion, carte, CRM, fiche, administration
js/app.js                     démarrage et navigation
supabase/schema.sql           tables, déclencheurs et règles de sécurité de la base
tools/make_zones.py           régénère js/data/zones.js depuis la carte
tools/bundle.py               produit la version en un seul fichier
```

L'interface n'accède aux données que par `GA.repo`. La clé publique Supabase de `js/config.js` est faite pour être visible : sans compte connecté et actif, les règles de sécurité de la base ne donnent accès à rien. La clé secrète (service_role) ne doit jamais apparaître dans le dépôt.

## Entreprises de la zone

Le bouton « Entreprises » (fiche, CRM filtré sur une zone, ou formulaire de nouvelle fiche) liste les établissements situés autour du point de la zone : nom, enseigne, SIREN, SIRET, activité, effectif, dirigeant, distance.
Filtres : rayon (200 m à 2 km), secteur d'activité, texte, établissements fermés. « + Fiche » crée une fiche CRM pré-remplie (SIREN et source dans les notes).
Source : API publique [Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr/docs/) (data.gouv.fr), gratuite et sans clé. La carte n'est pas modifiée.

## Droits

- **Administrateur :** tous les espaces, gestion des utilisateurs, toutes les fiches (modification, attribution, suppression).
- **Utilisateur :** carte et CRM. Il voit toutes les fiches. Il modifie celles dont il est responsable et celles qui ne sont pas attribuées. Il crée des fiches, dont il devient responsable. Il ne supprime pas de fiche.
