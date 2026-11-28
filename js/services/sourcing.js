/* Moteur de sourcing : études territoriales.
   1. Détection des lieux candidats autour d'un centre (laboratoire ou adresse), par typologie :
      OpenStreetMap (Overpass), prix des carburants (data.economie.gouv.fr, source officielle), gares SNCF (data/gares.json),
      parkings BNLS (data/parkings.json).
   2. Fusion des doublons (même typologie à moins de 120 m) et niveau de preuve : A officiel, B OSM nommé, C OSM sans nom.
   3. Pré-score local, rapide, sans appel réseau par lieu : habitants à 800 m (carreaux INSEE), flux propre au lieu
      (fréquentation de la gare, capacité du parking, type de magasin…), vie locale à 400 m, concurrence pizza à 1 km,
      puis malus de proximité d'un distributeur du réseau.
   4. Analyse complète (moteur v2, 8 critères, distance par la route) des N meilleurs lieux livrables.
   5. Cinq dimensions toujours séparées : potentiel géographique, faisabilité logistique, technique, commerciale,
      qualité de l'information. Aucune probabilité de signature.
   Les études sont enregistrées (etudes, lieux, etude_lieux) : historique et comparaison d'une étude à l'autre. */
window.GA = window.GA || {};

GA.sourcing = (function () {
  const M = () => GA.moteur;
  const RAD = Math.PI / 180;
  const dist = (a, b, c, d) => { const x = (d - b) * RAD * Math.cos((a + c) / 2 * RAD), y = (c - a) * RAD; return Math.round(Math.sqrt(x * x + y * y) * 6371000); };
  const CARBU = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
  const SIRENE = 'https://recherche-entreprises.api.gouv.fr/near_point';
  const APICARTO = 'https://apicarto.ign.fr/api/cadastre/parcelle';
  const GEO = 'https://geo.api.gouv.fr/communes';
  const REVERSE = 'https://data.geopf.fr/geocodage/reverse';
  const VERSION = 1;

  const OSM = {
    supermarche: ['nwr["shop"~"^(supermarket|hypermarket)$"]'],
    station: ['nwr["amenity"="fuel"]'],
    gare: ['nwr["railway"~"^(station|halt)$"]["station"!="subway"]'],
    commercial: ['nwr["shop"="mall"]', 'way["landuse"="retail"]["name"]', 'relation["landuse"="retail"]["name"]'],
    parking: ['nwr["amenity"="parking"]["capacity"]', 'nwr["amenity"="parking"]["parking"~"multi-storey|underground"]', 'nwr["amenity"="parking"]["park_ride"~"yes|bus|train"]'],
    loisirs: ['nwr["leisure"~"^(sports_centre|stadium|water_park|ice_rink|bowling_alley)$"]["name"]', 'nwr["amenity"~"^(cinema|theatre)$"]'],
    hotel: ['nwr["tourism"~"^(hotel|motel|camp_site)$"]'],
  };
  const NAF_EXPLOITANT = {
    supermarche: /^47\.1/, station: /^47\.30/, gare: /^(49\.10|52\.21)/, commercial: /^(68\.|47\.)/,
    parking: /^52\.21/, loisirs: /^(93\.|59\.14|90\.)/, hotel: /^55\./,
  };

  /* ---------------- Détection ---------------- */
  function typoDe(t) {
    if (/^(supermarket|hypermarket)$/.test(t.shop)) return 'supermarche';
    if (t.amenity === 'fuel') return 'station';
    if (/^(station|halt)$/.test(t.railway)) return 'gare';
    if (t.shop === 'mall' || t.landuse === 'retail') return 'commercial';
    if (t.amenity === 'parking') return 'parking';
    if (t.leisure || /^(cinema|theatre)$/.test(t.amenity)) return 'loisirs';
    if (/^(hotel|motel|camp_site)$/.test(t.tourism)) return 'hotel';
    return null;
  }
  function nomOsm(t, typo) {
    const n = t.name || '', b = t.brand || (typo === 'gare' ? '' : t.operator) || '';
    if (typo === 'gare') return n ? (/^gare/i.test(n) ? n : 'Gare de ' + n) : '';
    if (n && b && !n.toLowerCase().includes(b.toLowerCase())) return b + ' ' + n;
    return n || b || '';
  }
  function adresseOsm(t) { return [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '); }

  async function detecterOsm(c, rayon, typos) {
    const sel = typos.flatMap(k => (OSM[k] || []).map(f => `${f}(around:${rayon},${c.lat},${c.lon});`)).join('');
    const q = `[out:json][timeout:120];(${sel}nwr["cuisine"~"pizza"](around:${rayon + 1000},${c.lat},${c.lon});nwr["vending"~"pizza"](around:${rayon + 1000},${c.lat},${c.lon}););out tags center;`;
    const els = await M().overpass(q);
    const lieux = [], pizzas = [];
    for (const e of els) {
      const t = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
      if (lat == null) continue;
      if (/pizza/.test(t.cuisine || '') || /pizza/.test(t.vending || '')) { pizzas.push({ lat, lon, nom: t.name || 'Pizza', distributeur: !!t.vending }); if (!typoDe(t)) continue; }
      const typo = typoDe(t); if (!typo || !typos.includes(typo)) continue;
      if (typo === 'parking' && t.access && /private|customers|no/.test(t.access) && !t.park_ride) continue;
      const cap = +t.capacity || null;
      if (typo === 'parking' && cap != null && cap < 40) continue;
      const nom = nomOsm(t, typo);
      lieux.push({ cle: 'osm:' + e.type[0] + e.id, nom: nom || (GA.TYPOLOGIES.find(x => x.key === typo) || {}).label, typologie: typo, lat, lon,
        adresse: adresseOsm(t), commune: t['addr:city'] || '', preuve: nom ? 'B' : 'C',
        sources: [{ src: 'OpenStreetMap', id: e.type + '/' + e.id }],
        infos: { osm: { shop: t.shop, brand: t.brand, capacity: cap, parking: t.parking, park_ride: t.park_ride, opening_hours: t.opening_hours, leisure: t.leisure, amenity: t.amenity, tourism: t.tourism, stars: t.stars, operator: t.operator } } });
    }
    return { lieux, pizzas };
  }

  async function detecterCarburants(c, rayon) {
    const where = `within_distance(geom,geom'POINT(${c.lon} ${c.lat})',${Math.ceil(rayon / 1000)}km)`;
    const out = [];
    for (let off = 0; off < 400; off += 100) {
      const d = await M().getJson(`${CARBU}?limit=100&offset=${off}&where=${encodeURIComponent(where)}`, 3);
      for (const r of d.results || []) {
        const lat = +r.latitude / 1e5, lon = +r.longitude / 1e5; if (!lat || !lon) continue;
        let h24 = false, services = [];
        try { h24 = JSON.parse(r.horaires || '{}')['@automate-24-24'] === '1'; } catch (e) {}
        try { services = (JSON.parse(r.services || '{}').service) || []; if (!Array.isArray(services)) services = [services]; } catch (e) {}
        out.push({ cle: 'carbu:' + r.id, nom: 'Station-service ' + (r.ville || ''), typologie: 'station', lat, lon, adresse: r.adresse || '', commune: r.ville || '', preuve: 'A',
          sources: [{ src: 'Prix des carburants (ministère de l’Économie)', id: String(r.id) }], infos: { carbu: { h24, services, pop: r.pop } } });
      }
      if (!d.results || d.results.length < 100) break;
    }
    return out;
  }

  async function detecterLocaux(c, rayon, typos) {
    const out = [];
    if (typos.includes('gare')) {
      const g = await M().loadOpt('data/gares.json');
      for (const [nom, lat, lon, freq] of (g && g.gares) || []) if (dist(c.lat, c.lon, lat, lon) <= rayon)
        out.push({ cle: 'sncf:' + nom, nom: 'Gare de ' + nom, typologie: 'gare', lat, lon, adresse: '', commune: '', preuve: 'A', sources: [{ src: 'SNCF Open Data (fréquentation 2025)', id: nom }], infos: { freq } });
    }
    if (typos.includes('parking')) {
      const p = await M().loadOpt('data/parkings.json');
      for (const [lat, lon, cap, nom] of (p && p.parkings) || []) if (cap >= 40 && dist(c.lat, c.lon, lat, lon) <= rayon)
        out.push({ cle: 'bnls:' + lat.toFixed(5) + ',' + lon.toFixed(5), nom: 'Parking ' + (nom || ''), typologie: 'parking', lat, lon, adresse: '', commune: '', preuve: 'A', sources: [{ src: 'Base nationale des lieux de stationnement', id: nom || '' }], infos: { capacity: cap } });
    }
    return out;
  }

  // Fusion : même typologie à moins de 120 m (300 m pour une gare) → un seul lieu, sources cumulées, meilleure preuve.
  function fusionner(list) {
    const rang = { A: 0, B: 1, C: 2, D: 3 };
    list.sort((a, b) => rang[a.preuve] - rang[b.preuve]);
    const out = [];
    for (const l of list) {
      const seuil = l.typologie === 'gare' ? 300 : l.typologie === 'commercial' ? 250 : 120;
      const x = out.find(o => o.typologie === l.typologie && dist(o.lat, o.lon, l.lat, l.lon) < seuil);
      if (!x) { out.push(Object.assign({}, l, { sources: l.sources.slice(), infos: Object.assign({}, l.infos) })); continue; }
      x.sources.push(...l.sources); Object.assign(x.infos, l.infos, x.infos);
      if (l.preuve !== 'C' && l.cle.startsWith('osm:') && (/^Station-service|^Parking |^Gare de /.test(x.nom) || !x.nom)) x.nom = l.nom;
      if (!x.adresse && l.adresse) x.adresse = l.adresse;
      if (!x.commune && l.commune) x.commune = l.commune;
    }
    return out;
  }

  /* ---------------- Pré-score ---------------- */
  async function contexte(c, rayon, onStep) {
    // Départements couverts par le cercle d'étude → carreaux INSEE.
    const pts = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [c.lat + a * rayon / 111000, c.lon + b * rayon / (111000 * Math.cos(c.lat * RAD))]);
    const deps = new Set();
    for (const [la, lo] of pts) { try { const r = await M().getJson(`${GEO}?lat=${la}&lon=${lo}&fields=codeDepartement`, 3); if (r[0]) deps.add(r[0].codeDepartement); } catch (e) {} }
    const carreaux = [], couverts = [];
    for (const d of deps) {
      if (!M().DEPS_CARREAUX.includes(d)) continue;
      onStep && onStep('Population INSEE (' + d + ')…');
      const x = await M().loadOpt(`data/carreaux/${d}.json`); if (x) { carreaux.push(...x.carreaux); couverts.push(d); }
    }
    onStep && onStep('Commerces et services de proximité…');
    let vie = [];
    try {
      const els = await M().overpass(`[out:json][timeout:120];(node["shop"](around:${rayon + 500},${c.lat},${c.lon});node["amenity"~"^(restaurant|fast_food|cafe|bar|pharmacy|bank|post_office|doctors|school|college)$"](around:${rayon + 500},${c.lat},${c.lon}););out skel;`);
      vie = els.map(e => [e.lat, e.lon]);
    } catch (e) { vie = null; }
    return { carreaux, couverts, deps: [...deps], vie };
  }

  const palier = (v, paliers) => { for (const [s, x] of paliers) if (v >= s) return x; return paliers[paliers.length - 1][1]; };

  function fluxPropre(l) {
    const i = l.infos || {}, o = i.osm || {};
    switch (l.typologie) {
      case 'gare': return i.freq != null ? [palier(i.freq, [[3e6, 1], [1e6, .8], [3e5, .6], [1e5, .4], [0, .2]]), `${Math.round(i.freq / 1000).toLocaleString('fr-FR')} k voyageurs / an`] : [.4, 'fréquentation inconnue'];
      case 'parking': { const cap = i.capacity || o.capacity; return cap ? [palier(cap, [[300, 1], [150, .8], [80, .6], [40, .4]]), cap + ' places'] : [.4, 'capacité inconnue']; }
      case 'supermarche': return o.shop === 'hypermarket' ? [1, 'hypermarché'] : [o.brand ? .75 : .6, o.brand ? 'supermarché ' + o.brand : 'supermarché'];
      case 'station': { const c = i.carbu || {}; const boutique = (c.services || []).some(s => /Boutique/.test(s)); return [(c.h24 ? .8 : .6) + (boutique ? .15 : 0), [c.h24 ? 'automate 24 h/24' : '', boutique ? 'boutique' : ''].filter(Boolean).join(', ') || 'station']; }
      case 'commercial': return o.shop === 'mall' ? [1, 'centre commercial'] : [.75, 'zone commerciale'];
      case 'loisirs': return /stadium|cinema/.test((o.leisure || '') + (o.amenity || '')) ? [.8, o.amenity === 'cinema' ? 'cinéma' : 'stade'] : [.6, o.leisure || o.amenity || 'loisirs'];
      case 'hotel': return [.5, o.tourism === 'camp_site' ? 'camping' : 'hôtel'];
      default: return [.4, ''];
    }
  }

  function prescore(l, ctx, pizzas) {
    const f = [];
    let hab = null;
    if (ctx.couverts.length) { hab = 0; for (const c of ctx.carreaux) { if (Math.abs(c[0] - l.lat) > 0.008) continue; if (dist(l.lat, l.lon, c[0], c[1]) <= 800) hab += c[2]; } }
    const sHab = hab == null ? null : palier(hab, [[8000, 1], [5000, .8], [3000, .6], [1500, .4], [500, .2], [0, .07]]);
    const [sFlux, fluxTxt] = fluxPropre(l);
    const vie = ctx.vie ? ctx.vie.filter(([a, b]) => Math.abs(a - l.lat) < 0.004 && dist(l.lat, l.lon, a, b) <= 400).length : null;
    const sVie = vie == null ? null : palier(vie, [[40, 1], [20, .75], [10, .5], [4, .3], [0, .1]]);
    const conc = pizzas.filter(p => dist(l.lat, l.lon, p.lat, p.lon) <= 1000);
    const sConc = palier(-conc.length, [[0, 1], [-1, .7], [-2, .5], [-4, .3], [-1e9, .1]]);
    const crit = [
      { k: 'hab', lab: 'Habitants à 800 m', w: 35, s: sHab, val: hab == null ? 'non mesuré' : hab.toLocaleString('fr-FR') + ' habitants' },
      { k: 'flux', lab: 'Flux propre au lieu', w: 30, s: Math.min(1, sFlux), val: fluxTxt },
      { k: 'vie', lab: 'Commerces et services à 400 m', w: 20, s: sVie, val: vie == null ? 'non mesuré' : vie + ' commerces / services' },
      { k: 'conc', lab: 'Concurrence pizza à 1 km', w: 15, s: sConc, val: conc.length ? conc.length + ' (' + conc.slice(0, 3).map(p => p.nom).join(', ') + ')' : 'aucune repérée' },
    ];
    let s = 0, w = 0;
    for (const c of crit) if (c.s != null) { s += c.w * c.s; w += c.w; }
    const base = w ? Math.round(100 * s / w) : 0;
    const malus = M().malusProximite(l.lat, l.lon);
    const total = Math.max(0, Math.min(100, base + malus.reduce((a, x) => a + x.pts, 0)));
    crit.forEach(c => f.push({ ...c, pts: c.s == null ? null : Math.round(c.w * c.s) }));
    return { total, base, malus, criteres: f, couverture: w };
  }

  /* ---------------- Dimensions ---------------- */
  function labos() {
    const s = (GA.store.sites || []).filter(x => x.type === 'laboratoire' && x.statut !== 'retire' && x.lat != null);
    return s.length ? s : M().reglagesSync().sites.filter(x => x.laboratoire).map(x => ({ ...x, distance_max_km: M().reglagesSync().distanceMaxKm }));
  }
  function logistique(l, a) {
    if (a && a.labo) return { niveau: a.conforme ? 'ok' : 'hors', texte: `${String(a.labo.km).replace('.', ',')} km par la route${a.labo.min != null ? ' · ' + a.labo.min + ' min' : ''}`, km: a.labo.km, mesure: true };
    const L = labos().map(s => ({ s, d: dist(l.lat, l.lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d)[0];
    if (!L) return { niveau: 'inconnu', texte: 'aucun laboratoire déclaré' };
    const est = Math.round(L.d * 1.3 / 100) / 10, max = L.s.distance_max_km || 10;
    return { niveau: est <= max ? 'ok' : est <= max * 1.2 ? 'limite' : 'hors', texte: `≈ ${String(est).replace('.', ',')} km estimés (${L.s.nom})`, km: est, mesure: false };
  }
  const TECH = {
    supermarche: ['favorable', 'Parking privé : électricité souvent disponible, accord de l’enseigne ou de la foncière nécessaire.'],
    station: ['favorable', 'Électricité et éclairage sur place, surveillance ; place à négocier sur la piste ou le parking.'],
    gare: ['a_verifier', 'Domaine ferroviaire : procédure SNCF Gares & Connexions ou mairie (parvis), délais plus longs.'],
    commercial: ['favorable', 'Parking mutualisé : gestionnaire de la zone ou syndic ; électricité à confirmer.'],
    parking: ['a_verifier', 'Électricité rarement disponible ; domaine public possible (autorisation d’occupation).'],
    loisirs: ['a_verifier', 'Fréquentation par créneaux ; électricité et accès en soirée à vérifier.'],
    hotel: ['a_verifier', 'Clientèle captive le soir ; accès public au distributeur à vérifier.'],
  };
  function technique(l, a) {
    const [niv, txt] = TECH[l.typologie] || ['a_verifier', 'À évaluer sur place.'];
    const v = [];
    if (a && a.ind && a.ind.urbanisme && /^[AN]/.test(a.ind.urbanisme.type || '')) v.push('zone ' + a.ind.urbanisme.type + ' au PLU');
    if (a && a.ind && a.ind.reseau && !a.ind.reseau.ok) v.push('réseau mobile faible');
    return { niveau: v.length ? 'contraint' : niv, texte: txt + (v.length ? ' Vigilance : ' + v.join(', ') + '.' : '') };
  }
  function commercial(l) {
    const P = GA.store.prospects || [];
    const ex = P.filter(p => p.lieu_id && p.lieu_id === l.id || (p.lat != null && dist(l.lat, l.lon, p.lat, p.lon) < 150));
    const o = (l.infos && l.infos.osm) || {};
    if (ex.some(p => p.statut === 'installe' || p.statut === 'signe')) return { niveau: 'reseau', texte: 'Déjà dans le réseau', dossiers: ex.map(p => p.id) };
    const ouvert = ex.find(p => GA.pipe.estOuvert(p));
    if (ouvert) return { niveau: 'en_cours', texte: 'Dossier en cours : ' + GA.pipe.etape(ouvert.statut).label, dossiers: ex.map(p => p.id) };
    const ab = ex.find(p => p.statut === 'abandonne');
    if (ab) return { niveau: 'deja_refuse', texte: 'Déjà abandonné : ' + ((GA.MOTIFS_ABANDON.find(m => m.key === ab.motif_abandon) || {}).label || 'motif non précisé'), dossiers: ex.map(p => p.id) };
    const chaine = o.brand || (l.typologie === 'gare' ? 'SNCF' : '');
    return { niveau: 'a_ouvrir', texte: chaine ? `Décision probable au niveau du siège (${chaine}) ou du gérant local` : 'Interlocuteur à identifier', dossiers: [] };
  }
  function information(l, a) {
    const t = { A: 'source officielle', B: 'OpenStreetMap, lieu nommé', C: 'OpenStreetMap, lieu sans nom', D: 'hypothèse' }[l.preuve || l.niveau_preuve];
    return { niveau: l.preuve || l.niveau_preuve, texte: `${t} · ${l.sources.length} source(s)${a ? ' · analyse complète, couverture ' + a.couverture + ' %' : ' · pré-score seulement'}` };
  }
  function dimensions(l, ev) {
    const a = ev.analyse;
    const f = a ? M().scoreFinal(a, null, l.typologie) : null;
    return {
      potentiel: f ? { note: f.total, base: f.base, texte: `score complet ${f.total}/100 (profil ${(GA.TYPOLOGIES.find(x => x.key === f.profil) || {}).label || 'général'})`, complet: true }
        : { note: ev.pre.total, texte: 'pré-score local, à confirmer par l’analyse complète (8 critères, distance par la route)', complet: false },
      logistique: logistique(l, a), technique: technique(l, a), commercial: commercial(l), information: information(l, a),
    };
  }
  function raison(l, ev) {
    const c = ev.pre.criteres.filter(x => x.pts != null).sort((a, b) => b.s - a.s);
    const forts = c.filter(x => x.s >= .7).map(x => x.lab.toLowerCase() + ' (' + x.val + ')');
    const faibles = c.filter(x => x.s <= .3).map(x => x.lab.toLowerCase());
    return [forts.length ? 'Atouts : ' + forts.join(' ; ') : '', faibles.length ? 'Points faibles : ' + faibles.join(', ') : '', ev.pre.malus.map(m => m.lab).join(' ; ')].filter(Boolean).join('. ');
  }

  /* ---------------- Étude ---------------- */
  async function lancer(params, onStep, stop) {
    const { centre, rayon_km, typologies, profondeur } = params;
    const rayon = Math.round(rayon_km * 1000);
    await M().getReglages();
    const etude = await GA.repo.inserer('etudes', { nom: params.nom, params: { ...params, version: VERSION, moteur: M().VERSION }, statut: 'en_cours', synthese: {} });
    try {
      onStep('Lieux OpenStreetMap…');
      const osm = await detecterOsm(centre, rayon, typologies);
      let carbu = [];
      if (typologies.includes('station')) { onStep('Stations-service (source officielle)…'); try { carbu = await detecterCarburants(centre, rayon); } catch (e) { carbu = []; } }
      const locaux = await detecterLocaux(centre, rayon, typologies);
      let lieux = fusionner([...carbu, ...locaux, ...osm.lieux]).filter(l => dist(centre.lat, centre.lon, l.lat, l.lon) <= rayon);
      onStep(lieux.length + ' lieux détectés · contexte local…');
      const ctx = await contexte(centre, rayon, onStep);
      onStep('Pré-score de ' + lieux.length + ' lieux…');
      for (const l of lieux) { l.ev = { pre: prescore(l, ctx, osm.pizzas) }; }
      // Enregistrement des lieux (référentiel durable, dédoublonné par clé).
      onStep('Enregistrement des lieux…');
      const saved = [];
      for (let i = 0; i < lieux.length; i += 200) {
        const rows = lieux.slice(i, i + 200).map(l => ({ cle: l.cle, nom: l.nom.slice(0, 200), typologie: l.typologie, lat: l.lat, lon: l.lon, adresse: l.adresse, commune: l.commune, niveau_preuve: l.preuve, sources: l.sources, infos: l.infos, updated_at: new Date().toISOString() }));
        saved.push(...await GA.repo.upserter('lieux', rows, 'cle'));
      }
      const idByCle = Object.fromEntries(saved.map(r => [r.cle, r.id]));
      lieux.forEach(l => { l.id = idByCle[l.cle]; });
      lieux = lieux.filter(l => l.id);
      const precedentes = await anterieures(etude.id, centre, rayon);
      const ecrire = async (ls) => {
        for (let i = 0; i < ls.length; i += 200) await GA.repo.upserter('etude_lieux', ls.slice(i, i + 200).map(l => ({ etude_id: etude.id, lieu_id: l.id,
          prescore: l.ev.pre.total, raison: raison(l, l.ev),
          evaluation: { lieu: { nom: l.nom, typologie: l.typologie, lat: l.lat, lon: l.lon, adresse: l.adresse, commune: l.commune, preuve: l.preuve, sources: l.sources, infos: l.infos },
            pre: l.ev.pre, analyse: l.ev.analyse || null, dims: dimensions(l, l.ev), nouveau: precedentes.size > 0 && !precedentes.has(l.id) } })), 'etude_id,lieu_id');
      };
      await ecrire(lieux);
      // Analyse complète des N meilleurs lieux livrables.
      const top = lieux.filter(l => logistique(l).niveau !== 'hors').sort((a, b) => b.ev.pre.total - a.ev.pre.total).slice(0, profondeur || 0);
      let n = 0;
      for (const l of top) {
        if (stop && stop()) break;
        n++;
        try {
          l.ev.analyse = await M().analyser(l.lat, l.lon, t => onStep(`Analyse complète ${n}/${top.length} · ${l.nom} · ${t}`));
          if (!l.adresse || !l.commune) { try { const r = await M().getJson(`${REVERSE}?limit=1&lat=${l.lat}&lon=${l.lon}`, 2); const p = r.features && r.features[0] && r.features[0].properties; if (p) { l.adresse = l.adresse || p.name || ''; l.commune = l.commune || p.city || ''; } } catch (e) {} }
          await ecrire([l]);
        } catch (e) { /* lieu suivant */ }
      }
      const synthese = { nb: lieux.length, analyses: top.filter(l => l.ev.analyse).length, par_typo: {}, livrables: lieux.filter(l => logistique(l, l.ev.analyse).niveau === 'ok').length,
        nouveaux: precedentes.size ? lieux.filter(l => !precedentes.has(l.id)).length : null, sources: { osm: osm.lieux.length, carburants: carbu.length, locales: locaux.length }, pizzas: osm.pizzas.length,
        population: ctx.couverts.length ? 'carreaux ' + ctx.couverts.join(', ') : 'non disponible' };
      lieux.forEach(l => { synthese.par_typo[l.typologie] = (synthese.par_typo[l.typologie] || 0) + 1; });
      await GA.repo.modifier('etudes', etude.id, { statut: 'terminee', synthese, updated_at: new Date().toISOString() });
      return etude.id;
    } catch (e) {
      try { await GA.repo.modifier('etudes', etude.id, { statut: 'erreur', synthese: { erreur: String(e.message || e) } }); } catch (x) {}
      throw e;
    }
  }

  // Lieux vus par les études antérieures qui couvrent le même territoire (centre à moins de la moitié du rayon).
  async function anterieures(id, c, rayon) {
    const out = new Set();
    const es = (await GA.repo.lister('etudes', { order: 'created_at' })).filter(e => e.id !== id && e.statut === 'terminee' && e.params && e.params.centre && dist(c.lat, c.lon, e.params.centre.lat, e.params.centre.lon) < rayon / 2);
    for (const e of es.slice(0, 5)) (await GA.repo.lister('etude_lieux', { eq: { etude_id: e.id } })).forEach(r => out.add(r.lieu_id));
    return out;
  }

  const listeEtudes = () => GA.repo.lister('etudes', { order: 'created_at' });
  async function chargerEtude(id) {
    const rows = await GA.repo.lister('etude_lieux', { eq: { etude_id: id } });
    return rows.map(r => {
      const ev = r.evaluation || {}, l = Object.assign({ id: r.lieu_id }, ev.lieu || {});
      // Dimension commerciale recalculée à l'ouverture (le CRM a pu bouger depuis l'étude).
      const dims = Object.assign({}, ev.dims || {}, { commercial: commercial(Object.assign({ sources: [] }, l)) });
      return { id: r.lieu_id, etude_id: id, ...l, prescore: r.prescore, ev, dims, raison: r.raison, decision: r.decision, decision_motif: r.decision_motif, nouveau: !!ev.nouveau,
        note: dims.potentiel ? dims.potentiel.note : r.prescore };
    });
  }
  async function decider(etudeId, lieuId, decision, motif) {
    return GA.repo.upserter('etude_lieux', [{ etude_id: etudeId, lieu_id: lieuId, decision, decision_motif: motif || '', decided_by: GA.auth.current().id, decided_at: new Date().toISOString() }], 'etude_id,lieu_id');
  }
  async function analyserLieu(x, onStep) {
    const a = await M().analyser(x.lat, x.lon, onStep);
    const ev = Object.assign({}, x.ev, { analyse: a });
    const l = { ...x, sources: x.sources || [], preuve: x.preuve };
    ev.dims = dimensions(l, ev);
    await GA.repo.upserter('etude_lieux', [{ etude_id: x.etude_id, lieu_id: x.id, evaluation: ev }], 'etude_id,lieu_id');
    return ev;
  }
  const supprimerEtude = id => GA.repo.supprimer('etudes', id);

  /* ---------------- Acteurs ---------------- */
  async function acteursDe(lieuId) {
    const liens = await GA.repo.lister('lieu_acteurs', { eq: { lieu_id: lieuId } });
    const out = [];
    for (const k of liens) { const a = (await GA.repo.lister('acteurs', { eq: { id: k.acteur_id } }))[0]; if (a) out.push({ ...a, role: k.role, certitude: k.certitude, source: k.source }); }
    return out;
  }
  async function identifierActeurs(x, onStep) {
    const trouves = [];   // { acteur:{cle, siren, nom, type, infos}, role, certitude, source }
    onStep && onStep('Entreprises sur place (SIRENE)…');
    try {
      const d = await M().getJson(`${SIRENE}?lat=${x.lat}&long=${x.lon}&radius=0.15&per_page=25&etat_administratif=A`, 3);
      const re = NAF_EXPLOITANT[x.typologie];
      for (const r of d.results || []) {
        const e = (r.matching_etablissements || []).map(m => ({ m, d: dist(x.lat, x.lon, +m.latitude, +m.longitude) })).sort((a, b) => a.d - b.d)[0];
        if (!e || e.d > 200) continue;
        const naf = e.m.activite_principale || r.activite_principale || '';
        if (!re || !re.test(naf)) continue;
        const ens = (e.m.liste_enseignes || []).join(' ');
        trouves.push({ acteur: { cle: 'siren:' + r.siren, siren: r.siren, nom: r.nom_complet || r.nom_raison_sociale, type: 'entreprise',
          infos: { naf, enseigne: ens, adresse: e.m.adresse, dirigeants: (r.dirigeants || []).slice(0, 3).map(GA.entreprises && GA.entreprises.personne ? GA.entreprises.personne : (z => ({ nom: [z.prenoms, z.nom || z.denomination].filter(Boolean).join(' '), qualite: z.qualite || '' }))) } },
          role: 'exploitant', certitude: e.d < 80 ? 'probable' : 'hypothese', source: `SIRENE, établissement à ${e.d} m (NAF ${naf})` });
      }
    } catch (e) {}
    onStep && onStep('Propriétaire de la parcelle (cadastre, DGFiP)…');
    try {
      const geom = JSON.stringify({ type: 'Point', coordinates: [x.lon, x.lat] });
      const d = await M().getJson(APICARTO + '?geom=' + encodeURIComponent(geom), 3);
      const f = d.features && d.features[0];
      if (f) {
        const pr = f.properties, data = await M().loadOpt('data/parcelles-pm/' + pr.code_insee + '.json');
        const info = data && data.parcelles[pr.idu.slice(5)];
        for (const o of (info && info.o) || []) {
          const type = GA.foncierView ? GA.foncierView.typeProprietaire(o) : 'Privé';
          trouves.push({ acteur: { cle: o[0] ? 'siren:' + o[0] : 'pm:' + o[1], siren: o[0] || null, nom: o[1], type: /Public/.test(type) ? 'collectivite' : /Foncière|Copro/.test(type) ? 'fonciere' : /gare/.test(type) ? 'gestionnaire' : 'entreprise', infos: { forme: o[2], groupe: o[3], droit: o[4] } },
            role: 'proprietaire', certitude: 'probable', source: `DGFiP, parcelle ${pr.idu}${info.c ? ' (' + info.c + ' m²)' : ''} — vérifier que la parcelle est bien celle du site` });
        }
        if (!info) trouves.push(null);
      }
    } catch (e) {}
    onStep && onStep('Commune…');
    try {
      const c = (await M().getJson(`${GEO}?lat=${x.lat}&lon=${x.lon}&fields=nom,code,population`, 3))[0];
      if (c) trouves.push({ acteur: { cle: 'commune:' + c.code, siren: null, nom: 'Mairie de ' + c.nom, type: 'collectivite', infos: { code_insee: c.code, population: c.population } },
        role: 'collectivite', certitude: x.typologie === 'parking' || x.typologie === 'gare' ? 'probable' : 'hypothese', source: 'Commune d’implantation (domaine public, autorisations)' });
    } catch (e) {}
    if (x.typologie === 'gare') trouves.push({ acteur: { cle: 'gestionnaire:sncf-gc', siren: '507523801', nom: 'SNCF Gares & Connexions', type: 'gestionnaire', infos: {} }, role: 'gestionnaire', certitude: 'probable', source: 'Gestionnaire des gares de voyageurs' });
    const brand = x.infos && x.infos.osm && x.infos.osm.brand;
    if (brand) trouves.push({ acteur: { cle: 'enseigne:' + brand.toLowerCase(), siren: null, nom: brand, type: 'enseigne', infos: {} }, role: 'enseigne', certitude: 'verifie', source: 'Enseigne indiquée par OpenStreetMap' });
    const ok = trouves.filter(Boolean);
    if (!ok.length) return [];
    const acts = await GA.repo.upserter('acteurs', ok.map(t => ({ ...t.acteur, updated_at: new Date().toISOString() })).filter((a, i, arr) => arr.findIndex(b => b.cle === a.cle) === i), 'cle');
    const id = Object.fromEntries(acts.map(a => [a.cle, a.id]));
    await GA.repo.upserter('lieu_acteurs', ok.map(t => ({ lieu_id: x.id, acteur_id: id[t.acteur.cle], role: t.role, certitude: t.certitude, source: t.source })).filter(r => r.acteur_id), 'lieu_id,acteur_id,role');
    return acteursDe(x.id);
  }

  /* ---------------- Passage au CRM ---------------- */
  const ROLE_CONTACT = { proprietaire: 'proprietaire', exploitant: 'exploitant', gestionnaire: 'gestionnaire', collectivite: 'collectivite', enseigne: 'immobilier' };
  async function creerDossier(x, acteurs) {
    const nz = GA.ZONES.map(z => [z, dist(x.lat, x.lon, z.lat, z.lon)]).sort((a, b) => a[1] - b[1])[0];
    const p = await GA.svc.createProspect({
      nom: x.nom, lat: x.lat, lon: x.lon, typologie: x.typologie, adresse: x.adresse || '', commune: x.commune || '',
      zone_id: nz && nz[1] <= 1500 ? nz[0].id : '', lieu_id: x.id, analyse: x.ev.analyse || undefined,
      analyse_entree: { etude_id: x.etude_id, date: new Date().toISOString().slice(0, 10), prescore: x.prescore, dims: x.dims, raison: x.raison },
      notes: x.raison ? 'Issu d’une étude de sourcing. ' + x.raison : 'Issu d’une étude de sourcing.',
      prochaine_action: 'Identifier et appeler le décideur', date_relance: GA.pipe.plusJours(3),
    });
    for (const a of acteurs || []) {
      try {
        await GA.svc.saveContact(p, { nom: '', entreprise: a.nom, role: ROLE_CONTACT[a.role] || 'autre', pouvoir: 'a_confirmer', interet: 'non_exprime', principal: false, acteur_id: a.id, source: 'sourcing',
          notes: `${a.source} · certitude : ${a.certitude}${a.siren ? ' · SIREN ' + a.siren : ''}` });
      } catch (e) {}
    }
    await decider(x.etude_id, x.id, 'retenu', 'Dossier CRM créé');
    return p;
  }

  return { lancer, listeEtudes, chargerEtude, decider, analyserLieu, supprimerEtude, acteursDe, identifierActeurs, creerDossier, dimensions,
    fusionner, prescore, fluxPropre, OSM, VERSION };
})();
