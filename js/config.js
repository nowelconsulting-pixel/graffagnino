/* Configuration et référentiels métier (aucune logique ici). */
window.GA = window.GA || {};

GA.config = {
  appName: 'GRAFFAGNINO - To the Moon',
  // Projet Supabase. La clé « publishable » est publique par nature : elle ne donne accès à rien
  // sans compte connecté, grâce aux règles de sécurité de supabase/schema.sql.
  // Ne jamais mettre ici la clé « secret » / service_role.
  supabaseUrl: 'https://unbdwbqdivunpisxnesp.supabase.co',
  supabaseKey: 'sb_publishable_y8j2LeoDIS2HemCqIC6auw_CitjxAEx',
  sessionKey: 'ga.auth.v1',
  // API publique « Recherche d'entreprises » (data.gouv.fr) : sans clé, appelée depuis le navigateur.
  entreprisesApi: 'https://recherche-entreprises.api.gouv.fr',
};

// Pipeline commercial V2 : 7 étapes ouvertes, puis Installé (gagné) ou Abandonné (perdu, motif obligatoire).
GA.STATUTS = [
  { key: 'repere',        label: 'Repéré',                  court: 'Repéré',        color: '#8a8f98', ordre: 1, ouvert: true },
  { key: 'qualifie',      label: 'Qualifié',                court: 'Qualifié',      color: '#7c5cc4', ordre: 2, ouvert: true },
  { key: 'interlocuteur', label: 'Interlocuteur identifié', court: 'Interlocuteur', color: '#3d7ea6', ordre: 3, ouvert: true },
  { key: 'discussion',    label: 'En discussion',           court: 'Discussion',    color: '#1f6fd1', ordre: 4, ouvert: true },
  { key: 'negociation',   label: 'Négociation',             court: 'Négociation',   color: '#d9480f', ordre: 5, ouvert: true },
  { key: 'accord',        label: 'Accord',                  court: 'Accord',        color: '#c77700', ordre: 6, ouvert: true },
  { key: 'signe',         label: 'Signé',                   court: 'Signé',         color: '#2b8a3e', ordre: 7, ouvert: true },
  { key: 'installe',      label: 'Installé',                court: 'Installé',      color: '#1e6b34', ordre: 8, ouvert: false },
  { key: 'abandonne',     label: 'Abandonné',               court: 'Abandonné',     color: '#c92a2a', ordre: 9, ouvert: false },
];
GA.STATUTS_OUVERTS = GA.STATUTS.filter(s => s.ouvert).map(s => s.key);

GA.MOTIFS_ABANDON = [
  { key: 'refus_decideur',      label: 'Refus du propriétaire ou du décideur' },
  { key: 'conditions',          label: 'Conditions financières inacceptables' },
  { key: 'technique',           label: 'Infaisable techniquement (électricité, place, réseau, sécurité)' },
  { key: 'urbanisme',           label: 'Urbanisme ou autorisation refusée' },
  { key: 'injoignable',         label: 'Décideur introuvable ou sans réponse' },
  { key: 'potentiel',           label: 'Potentiel insuffisant après visite' },
  { key: 'cannibalisation',     label: 'Trop proche d’un de nos distributeurs' },
  { key: 'autre',               label: 'Autre' },
  { key: 'non_precise',         label: 'Non précisé (avant la V2)' },
];
GA.RAISONS_BLOCAGE = [
  { key: 'decision_siege',  label: 'Décision du siège ou de la copropriété attendue' },
  { key: 'autorisation',    label: 'Autorisation administrative attendue' },
  { key: 'travaux',         label: 'Travaux ou électricité à prévoir' },
  { key: 'indisponible',    label: 'Interlocuteur indisponible' },
  { key: 'autre',           label: 'Autre' },
];
GA.ROLES_CONTACT = [
  { key: 'decideur',     label: 'Décideur final' },
  { key: 'proprietaire', label: 'Propriétaire foncier' },
  { key: 'exploitant',   label: 'Exploitant (gérant du site)' },
  { key: 'gestionnaire', label: 'Gestionnaire du site' },
  { key: 'directeur',    label: 'Directeur d’établissement' },
  { key: 'immobilier',   label: 'Responsable immobilier' },
  { key: 'collectivite', label: 'Collectivité (mairie)' },
  { key: 'autre',        label: 'Autre' },
];
GA.POUVOIRS = [
  { key: 'decideur',     label: 'Décideur' },
  { key: 'prescripteur', label: 'Prescripteur' },
  { key: 'sans_pouvoir', label: 'Sans pouvoir décisionnel' },
  { key: 'a_confirmer',  label: 'À confirmer' },
];
GA.INTERETS = [
  { key: 'non_exprime',    label: 'Non exprimé',    color: '#8a8f98' },
  { key: 'reserve',        label: 'Réservé',        color: '#c77700' },
  { key: 'interesse',      label: 'Intéressé',      color: '#1f6fd1' },
  { key: 'tres_interesse', label: 'Très intéressé', color: '#2b8a3e' },
];
GA.MODELES_ECO = [
  { key: 'fixe',        label: 'Redevance fixe' },
  { key: 'pourcentage', label: 'Pourcentage du chiffre d’affaires' },
  { key: 'mixte',       label: 'Mixte (fixe + %)' },
  { key: 'gratuit',     label: 'Gratuit (contrepartie service)' },
  { key: 'autre',       label: 'Autre' },
];
GA.UNITES_MONTANT = ['€ / mois', '€ / an', '% du CA'];
GA.ELECTRICITE = [
  { key: 'disponible', label: 'Disponible' },
  { key: 'a_prevoir',  label: 'À prévoir' },
  { key: 'inconnue',   label: 'Inconnue' },
];

// Typologies d'emplacements et profils de pondération du moteur (mêmes 8 critères, total 100).
// Hypothèses de départ, à réviser avec les ventes réelles (voir README).
GA.TYPOLOGIES = [
  { key: 'supermarche',  label: 'Parking de supermarché',         icon: '🛒', color: '#1f6fd1' },
  { key: 'station',      label: 'Station-service',                icon: '⛽', color: '#d9480f' },
  { key: 'gare',         label: 'Gare / pôle de transport',       icon: '🚉', color: '#7c5cc4' },
  { key: 'commercial',   label: 'Centre commercial / retail park', icon: '🏬', color: '#0f8b8d' },
  { key: 'parking',      label: 'Parking public',                 icon: '🅿', color: '#5d6675' },
  { key: 'loisirs',      label: 'Loisirs, sport, cinéma',          icon: '🎬', color: '#c77700' },
  { key: 'hotel',        label: 'Hôtel, camping',                 icon: '🏨', color: '#a61e4d' },
  { key: 'autre',        label: 'Autre / emplacement repéré',      icon: '📍', color: '#8a8f98' },
];
GA.PROFILS = {
  general:     { hab: 15, pop: 10, soir: 15, arret: 10, flux: 15, env: 15, conc: 15, emp: 5 },
  station:     { hab: 5,  pop: 15, soir: 15, arret: 15, flux: 25, env: 10, conc: 10, emp: 5 },
  supermarche: { hab: 10, pop: 15, soir: 15, arret: 15, flux: 10, env: 15, conc: 15, emp: 5 },
  gare:        { hab: 10, pop: 5,  soir: 15, arret: 0,  flux: 30, env: 15, conc: 15, emp: 10 },
  commercial:  { hab: 10, pop: 15, soir: 15, arret: 15, flux: 10, env: 15, conc: 15, emp: 5 },
  parking:     { hab: 20, pop: 10, soir: 15, arret: 10, flux: 10, env: 10, conc: 20, emp: 5 },
  loisirs:     { hab: 10, pop: 15, soir: 25, arret: 15, flux: 10, env: 10, conc: 15, emp: 0 },
  hotel:       { hab: 5,  pop: 10, soir: 20, arret: 15, flux: 20, env: 10, conc: 15, emp: 5 },
};

GA.TYPES_PROPRIETAIRE = [
  'Privé', 'Public / collectivité', 'Enseigne', 'Foncière', 'Copropriété / syndic',
  'Gestionnaire de gare', 'Autre',
];

GA.TYPES_ECHANGE = [
  { key: 'appel',  label: 'Appel',       icon: '☎' },
  { key: 'email',  label: 'Email',       icon: '✉' },
  { key: 'rdv',    label: 'Rendez-vous', icon: '◷' },
  { key: 'visite', label: 'Visite',      icon: '⌖' },
  { key: 'note',   label: 'Note',        icon: '✎' },
  { key: 'proposition', label: 'Proposition', icon: '€' },
];

GA.ROLES = [
  { key: 'admin', label: 'Administrateur' },
  { key: 'user',  label: 'Utilisateur' },
];

GA.ZONE_TYPES = {
  commerce: 'Zone commerciale', activite: "Zone d'activités", gare: 'Gare',
  axe: 'Axe routier / station-service', proximite: 'Centre / commerces de proximité', loisirs: 'Santé, loisirs, hôtel',
};

// Sections de la nomenclature d'activités (NAF rév. 2), pour l'onglet Entreprises.
GA.NAF_SECTIONS = {
  A: 'Agriculture, sylviculture, pêche', B: 'Industries extractives', C: 'Industrie manufacturière',
  D: 'Électricité, gaz, vapeur', E: 'Eau, assainissement, déchets', F: 'Construction',
  G: 'Commerce, réparation automobile', H: 'Transports et entreposage', I: 'Hébergement et restauration',
  J: 'Information et communication', K: 'Finance et assurance', L: 'Activités immobilières (SCI, foncières…)',
  M: 'Activités spécialisées, scientifiques, techniques', N: 'Services administratifs et de soutien',
  O: 'Administration publique', P: 'Enseignement', Q: 'Santé et action sociale',
  R: 'Arts, spectacles, loisirs', S: 'Autres services', T: 'Ménages employeurs', U: 'Organismes extraterritoriaux',
};

// Tranches d'effectif salarié (codes INSEE).
GA.TRANCHES_EFFECTIF = {
  NN: 'non employeur', '00': '0 salarié', '01': '1–2 salariés', '02': '3–5 salariés', '03': '6–9 salariés',
  11: '10–19 salariés', 12: '20–49 salariés', 21: '50–99 salariés', 22: '100–199 salariés', 31: '200–249 salariés',
  32: '250–499 salariés', 41: '500–999 salariés', 42: '1 000–1 999 salariés', 51: '2 000–4 999 salariés',
  52: '5 000–9 999 salariés', 53: '10 000 salariés et plus',
};
