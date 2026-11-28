/* Règles du pipeline commercial V2 : étapes, conditions d'entrée, avancement, potentiel, matrice de priorisation.
   Deux dimensions séparées, jamais additionnées :
   - potentiel géographique (score du moteur, profil de la typologie, terrain, malus de proximité du réseau) ;
   - avancement commercial (étape, contact principal : pouvoir et intérêt, blocage, prochaine action). */
window.GA = window.GA || {};

GA.pipe = (function () {
  const etape = key => GA.STATUTS.find(s => s.key === key) || GA.STATUTS[0];
  const ordre = key => etape(key).ordre;
  const estOuvert = p => etape(p.statut).ouvert;
  const contactsDe = p => (GA.store.contacts || []).filter(c => c.prospect_id === p.id);
  const principal = p => contactsDe(p).find(c => c.principal) || null;
  const seuils = () => Object.assign({ potentiel_eleve: 60, immobile_jours: 21, relance_jours: 7, reexamen_jours: 30 }, GA.store.seuils || {});
  const jours = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

  // Ce qu'il manque pour entrer dans une étape (vide = possible).
  function manques(p, cible) {
    const m = [];
    const cs = contactsDe(p), pr = principal(p);
    const o = ordre(cible);
    if (cible === 'abandonne') return m;
    if (o >= 2 && (p.lat == null || p.lon == null) && !p.zone_id) m.push('positionner l’emplacement (carte ou adresse) ou le rattacher à une zone');
    if (o >= 3 && !cs.some(c => (c.nom || c.entreprise) && (c.telephone || c.email))) m.push('au moins un contact avec un téléphone ou un email');
    if (o >= 4 && !pr) m.push('désigner le contact principal');
    return m;
  }

  // Potentiel géographique : analyse de la fiche (profil de sa typologie), sinon score de sa zone (moteur v2), sinon inconnu.
  function potentiel(p) {
    const a = p.analyse || (p.zone_id && GA.store.zonesV2 && GA.store.zonesV2[p.zone_id]) || null;
    if (!a || a.etude) return null;
    const f = GA.moteur.scoreFinal(a, p, p.typologie);
    return f ? Object.assign(f, { source: p.analyse ? 'fiche' : 'zone ' + p.zone_id }) : null;
  }

  // Dossier « avancé » : en discussion ou au-delà, intérêt exprimé, interlocuteur avec pouvoir, non bloqué.
  function avancement(p) {
    const raisons = [];
    const pr = principal(p);
    if (ordre(p.statut) < 4) raisons.push('pas encore en discussion');
    if (!pr) raisons.push('aucun contact principal');
    else {
      if (!['interesse', 'tres_interesse'].includes(pr.interet)) raisons.push('intérêt ' + (GA.INTERETS.find(i => i.key === pr.interet) || {}).label.toLowerCase());
      if (pr.pouvoir === 'sans_pouvoir') raisons.push('interlocuteur sans pouvoir de décision');
    }
    if (p.bloque) raisons.push('bloqué : ' + ((GA.RAISONS_BLOCAGE.find(r => r.key === p.blocage_raison) || {}).label || 'raison non précisée').toLowerCase());
    return { avance: raisons.length === 0, raisons };
  }

  const CATEGORIES = {
    signer:    { label: 'À signer en priorité', color: '#2b8a3e', aide: 'Potentiel élevé et dossier avancé : tout faire pour conclure.' },
    saisir:    { label: 'Opportunité à saisir', color: '#1f6fd1', aide: 'Dossier avancé sur un potentiel moindre : arbitrer vite, signer si les conditions sont bonnes.' },
    debloquer: { label: 'À débloquer',          color: '#c77700', aide: 'Potentiel élevé, dossier peu avancé : trouver le décideur, obtenir l’intérêt, lever le blocage.' },
    reserve:   { label: 'En réserve',           color: '#8a8f98', aide: 'Potentiel moindre et dossier peu avancé.' },
  };
  // Hors matrice : Signé, Installé, Abandonné.
  function categorie(p) {
    if (!['repere', 'qualifie', 'interlocuteur', 'discussion', 'negociation', 'accord'].includes(p.statut)) return null;
    const pot = potentiel(p), av = avancement(p).avance;
    const eleve = pot != null && pot.total >= seuils().potentiel_eleve;
    return eleve ? (av ? 'signer' : 'debloquer') : (av ? 'saisir' : 'reserve');
  }

  const sansAction = p => estOuvert(p) && !String(p.prochaine_action || '').trim();
  const enRetard = p => estOuvert(p) && !p.bloque && p.date_relance && p.date_relance < GA.svc.today();
  const aReexaminer = p => p.bloque && p.reexamen_le && p.reexamen_le <= GA.svc.today();
  const immobile = p => estOuvert(p) && !(p.bloque && p.reexamen_le && p.reexamen_le > GA.svc.today()) && jours(p.updated_at) >= seuils().immobile_jours;
  const plusJours = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // Tri « le plus proche de la signature » : étape, intérêt du contact principal, potentiel.
  function rangSignature(p) {
    const pr = principal(p), pot = potentiel(p);
    const interet = pr ? ['non_exprime', 'reserve', 'interesse', 'tres_interesse'].indexOf(pr.interet) : 0;
    return ordre(p.statut) * 1000 + (p.bloque ? 0 : 200) + interet * 50 + (pot ? pot.total : 0) / 2;
  }

  return { etape, ordre, estOuvert, contactsDe, principal, manques, potentiel, avancement, categorie, CATEGORIES, seuils,
    sansAction, enRetard, aReexaminer, immobile, jours, plusJours, rangSignature };
})();
