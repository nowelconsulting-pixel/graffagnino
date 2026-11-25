/* Configuration et référentiels métier (aucune logique ici). */
window.GA = window.GA || {};

GA.config = {
  appName: 'GRAFFAGNINO · Prospection',
  // 'local' = données de démonstration dans le navigateur (localStorage).
  // 'supabase' sera activé quand js/data/supabase-repository.js sera implémenté.
  dataSource: 'local',
  storageKey: 'ga.demo.v1',
  sessionKey: 'ga.session.v1',
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
