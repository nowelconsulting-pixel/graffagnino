/* Configuration et référentiels métier (aucune logique ici). */
window.GA = window.GA || {};

GA.config = {
  appName: 'GRAFFAGNINO · Prospection',
  // 'local' = données de démonstration dans le navigateur (localStorage).
  // 'supabase' sera activé quand js/data/supabase-repository.js sera implémenté.
  dataSource: 'local',
  storageKey: 'ga.demo.v1',
  sessionKey: 'ga.session.v1',
  // API publique « Recherche d'entreprises » (data.gouv.fr) : sans clé, appelée depuis le navigateur.
  entreprisesApi: 'https://recherche-entreprises.api.gouv.fr',
};

GA.STATUTS = [
  { key: 'a_prospecter',           label: 'À prospecter',                        color: '#8a8f98' },
  { key: 'decideur_a_identifier',  label: 'Propriétaire / décideur à identifier', color: '#7c5cc4' },
  { key: 'contact_a_etablir',      label: 'Contact à établir',                   color: '#3d7ea6' },
  { key: 'contact_etabli',         label: 'Contact établi',                      color: '#1f6fd1' },
  { key: 'en_discussion',          label: 'En discussion',                       color: '#0f8b8d' },
  { key: 'visite_a_organiser',     label: 'Visite à organiser',                  color: '#c77700' },
  { key: 'negociation',            label: 'Négociation',                         color: '#d9480f' },
  { key: 'accord',                 label: 'Accord obtenu',                       color: '#2b8a3e' },
  { key: 'refuse',                 label: 'Refusé / Abandonné',                  color: '#c92a2a' },
];

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
