/* Entreprises autour d'une zone : API publique « Recherche d'entreprises » (data.gouv.fr).
   Gratuite, sans clé, appelée directement depuis le navigateur. Limite : 7 requêtes par seconde.
   Documentation : https://recherche-entreprises.api.gouv.fr/docs/ */
window.GA = window.GA || {};

GA.entreprises = (function () {
  const API = GA.config.entreprisesApi;
  const PER_PAGE = 25;
  const MAX_PAGES = 20;          // au plus 500 entreprises par recherche
  const pause = ms => new Promise(r => setTimeout(r, ms));

  function distanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  // « VILLAINES-SOUS-BOIS » → « Villaines-sous-Bois »
  const PETITS = ['de', 'du', 'des', 'la', 'le', 'les', 'en', 'sous', 'sur', 'lès', 'les', 'aux', 'au', 'et'];
  function communeLabel(s) {
    return String(s || '').toLowerCase().replace(/[a-zà-ÿ]+/g, (w, i) => (i > 0 && PETITS.includes(w)) ? w : w[0].toUpperCase() + w.slice(1));
  }

  function personne(d) {
    if (!d) return null;
    if (d.type_dirigeant === 'personne morale') return { nom: d.denomination || '', qualite: d.qualite || '' };
    const prenom = String(d.prenoms || '').split(/\s+/)[0];
    const nom = [communeLabel(prenom), d.nom].filter(Boolean).join(' ');
    return { nom, qualite: d.qualite || '' };
  }
  // Dirigeant le plus utile pour la prospection : une personne physique d'abord, hors commissaires aux comptes.
  function dirigeantPrincipal(list) {
    const l = (list || []).filter(d => !/commissaire/i.test(d.qualite || ''));
    return personne(l.find(d => d.type_dirigeant === 'personne physique') || l[0]);
  }

  // « COURTOISE MOTORS (COURTOISE MOTORS) » → « COURTOISE MOTORS »
  function nomEntreprise(r) {
    const n = r.nom_complet || r.nom_raison_sociale || '';
    const m = n.match(/^(.*) \((.*)\)$/);
    return m && m[1].trim() === m[2].trim() ? m[1].trim() : n;
  }

  // Une ligne par établissement situé dans le rayon (une entreprise peut en avoir plusieurs).
  function toRows(results, zone) {
    const rows = [];
    for (const r of results || []) {
      const etabs = (r.matching_etablissements && r.matching_etablissements.length) ? r.matching_etablissements : [r.siege || {}];
      for (const e of etabs) {
        const lat = parseFloat(e.latitude), lon = parseFloat(e.longitude);
        const enseigne = (e.liste_enseignes && e.liste_enseignes[0]) || e.nom_commercial || '';
        rows.push({
          siren: r.siren || '',
          siret: e.siret || '',
          raison_sociale: nomEntreprise(r),
          enseigne,
          naf: e.activite_principale || r.activite_principale || '',
          section: r.section_activite_principale || '',
          adresse: e.adresse || '',
          commune: communeLabel(e.libelle_commune),
          effectif: e.tranche_effectif_salarie || r.tranche_effectif_salarie || '',
          siege: !!e.est_siege,
          actif: (e.etat_administratif || r.etat_administratif) === 'A',
          dirigeant: dirigeantPrincipal(r.dirigeants),
          distance: isFinite(lat) && isFinite(lon) ? distanceM(zone.lat, zone.lon, lat, lon) : null,
        });
      }
    }
    return rows;
  }

  async function getPage(params, page, signal) {
    const q = new URLSearchParams({ ...params, page: String(page), per_page: String(PER_PAGE) });
    for (let essai = 0; essai < 3; essai++) {
      let res;
      try { res = await fetch(API + '/near_point?' + q, { signal }); }
      catch (e) { if (signal && signal.aborted) throw e; await pause(800 * (essai + 1)); continue; }
      if (res.status === 429 || res.status >= 500) { await pause(1200 * (essai + 1)); continue; }
      if (!res.ok) throw new Error('Recherche d’entreprises indisponible (erreur ' + res.status + ').');
      return res.json();
    }
    throw new Error('Le service Recherche d’entreprises ne répond pas. Réessayez dans un instant.');
  }

  /* Charge toutes les pages l'une après l'autre et appelle onProgress à chaque page.
     opts : { radiusKm, section, signal, onProgress({ rows, page, totalPages, total }) } */
  async function near(zone, opts) {
    const params = { lat: String(zone.lat), long: String(zone.lon), radius: String(opts.radiusKm) };
    if (opts.section) params.section_activite_principale = opts.section;
    let rows = [], page = 1, totalPages = 1, total = 0;
    do {
      const d = await getPage(params, page, opts.signal);
      totalPages = Math.min(d.total_pages || 1, MAX_PAGES);
      total = d.total_results || 0;
      rows = rows.concat(toRows(d.results, zone));
      if (opts.onProgress) opts.onProgress({ rows, page, totalPages, total });
      page++;
      if (page <= totalPages) await pause(200);
    } while (page <= totalPages && !(opts.signal && opts.signal.aborted));
    return { rows, total, truncated: total > MAX_PAGES * PER_PAGE };
  }

  const ficheUrl = row => /^\d{14}$/.test(row.siret)
    ? 'https://annuaire-entreprises.data.gouv.fr/etablissement/' + row.siret
    : 'https://annuaire-entreprises.data.gouv.fr/entreprise/' + row.siren;

  // Champs d'une nouvelle fiche CRM pré-remplie depuis un établissement.
  function toProspect(row, zone) {
    const naf = row.naf ? row.naf + (GA.NAF_SECTIONS[row.section] ? ' (' + GA.NAF_SECTIONS[row.section] + ')' : '') : '';
    const notes = [
      'SIREN ' + row.siren + (row.siret ? ' · SIRET ' + row.siret : ''),
      row.raison_sociale && row.enseigne ? 'Raison sociale : ' + row.raison_sociale : '',
      naf ? 'Activité : ' + naf : '',
      row.effectif && GA.TRANCHES_EFFECTIF[row.effectif] ? 'Effectif : ' + GA.TRANCHES_EFFECTIF[row.effectif] : '',
      'Source : Annuaire des entreprises, ' + GA.svc.today() + ' — ' + ficheUrl(row),
    ].filter(Boolean).join('\n');
    return {
      nom: row.enseigne || row.raison_sociale,
      zone_id: zone.id,
      adresse: row.adresse,
      commune: row.commune,
      proprietaire_nom: row.raison_sociale,
      decideur_nom: row.dirigeant ? row.dirigeant.nom : '',
      decideur_fonction: row.dirigeant ? row.dirigeant.qualite : '',
      notes,
    };
  }

  return { near, toProspect, ficheUrl, distanceM };
})();
