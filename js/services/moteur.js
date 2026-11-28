/* Moteur de score des emplacements — barème v2 (sur 100), calculé en direct pour n'importe quel point de France :
     Habitants à 800 m 15 · Population à 10 min 10 · Activité du soir et lieux de vie 15 · Facilité d'arrêt 10
     Flux de passage 15 · Environnement commercial 15 · Concurrence 15 · Emplois ≤ 500 m 5
   + distance et temps par la route depuis le(s) laboratoire(s), malus de proximité d'un de nos distributeurs
   (réglable, jamais une exclusion), bonus / malus terrain saisis sur la fiche,
   et des indicateurs sans points : réseau mobile, zone d'urbanisme, photos de rue.
   Sources : SIRENE (recherche-entreprises.api.gouv.fr) · OpenStreetMap (Overpass) · INSEE Filosofi carreaux 200 m
   (data/carreaux/) · INSEE BPE 2025 (data/bpe/) · IGN Géoplateforme (itinéraire, isochrone) · API Carto (communes,
   urbanisme) · SNCF (data/gares.json) · DGITM (data/tmja.json) · stationnement (data/parkings.json) · ANFR
   (data/antennes-4g.json) · Panoramax. */
window.GA = window.GA || {};

GA.moteur = (function () {
  const VERSION = 2;
  const SIRENE = 'https://recherche-entreprises.api.gouv.fr/near_point';
  const NAV = 'https://data.geopf.fr/navigation';
  const COMMUNES = 'https://apicarto.ign.fr/api/limites-administratives/commune';
  const GPU = 'https://apicarto.ign.fr/api/gpu/zone-urba';
  const PANORAMAX = 'https://api.panoramax.xyz/api';
  // Serveurs OpenStreetMap (Overpass), essayés dans l'ordre.
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const DEPS_CARREAUX = ['59', '60', '62', '75', '77', '78', '91', '92', '93', '94', '95'];   // départements préparés (tools/make_carreaux.py)
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const dist = (a, b, c, d) => GA.entreprises.distanceM(a, b, c, d);
  const fr = n => Math.round(n).toLocaleString('fr-FR');
  const km1 = m => (m / 1000).toFixed(1).replace('.', ',') + ' km';

  /* ---------- Réglages (table parametres, sinon valeurs par défaut) ---------- */
  const DEFAUT = {
    sites: [{ nom: 'Laboratoire et distributeur pilote (Baillet-en-France)', lat: 49.06365, lon: 2.32388, laboratoire: true, distributeur: true }],
    distanceMaxKm: 10,
    proximite: [{ km: 1.5, pts: -10 }, { km: 3, pts: -5 }],   // malus si un de nos distributeurs est à moins de…
    concurrents: [],                                          // distributeurs de pizzas concurrents [{ nom, lat, lon }]
  };
  let reglages = null;
  // Sites et concurrents : lus dans le Réseau et la table des concurrents (V2), sinon dans les réglages.
  function sitesReseau() {
    const s = (GA.store && GA.store.sites || []).filter(x => x.statut === 'en_service');
    return s.map(x => ({ nom: x.nom, lat: x.lat, lon: x.lon, laboratoire: x.type === 'laboratoire', distributeur: x.type === 'distributeur', distance_max_km: +x.distance_max_km || 10 }));
  }
  async function getReglages() {
    if (!reglages) {
      reglages = JSON.parse(JSON.stringify(DEFAUT));
      try {
        const v = await GA.repo.getParametre('moteur');
        if (v) reglages = Object.assign(reglages, v);
      } catch (e) { /* table absente : valeurs par défaut */ }
    }
    const r = Object.assign({}, reglages);
    const s = sitesReseau(); if (s.length) r.sites = s;
    const conc = (GA.store && GA.store.concurrents || []).filter(c => c.type === 'distributeur').map(c => ({ nom: c.nom, lat: c.lat, lon: c.lon }));
    r.concurrents = (reglages.concurrents || []).concat(conc);
    return r;
  }
  function reglagesSync() { const r = Object.assign({}, reglages || DEFAUT); const s = sitesReseau(); if (s.length) r.sites = s; return r; }
  // Malus de proximité d'un de nos distributeurs en service, calculé avec le réseau actuel.
  function malusProximite(lat, lon) {
    const R = reglagesSync();
    const d = R.sites.filter(s => s.distributeur).map(s => ({ s, d: dist(lat, lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d)[0];
    if (!d) return [];
    const regle = (R.proximite || []).slice().sort((a, b) => a.km - b.km).find(x => d.d < x.km * 1000);
    return regle ? [{ lab: `Distributeur existant à ${km1(d.d)} (${d.s.nom})`, pts: regle.pts }] : [];
  }
  // Note recalculée avec le profil de pondération d'une typologie (mêmes critères, autres poids).
  function scoreProfil(a, typo) {
    if (!a || !a.det || a.v < 2) return a ? a.score : null;
    const w = GA.PROFILS[typo] || GA.PROFILS.general;
    let s = 0, poids = 0;
    for (const d of a.det) { if (d.pts == null || !(d.k in w)) continue; s += w[d.k] * d.pts / d.mx; poids += w[d.k]; }
    return poids ? Math.round(100 * s / poids) : a.score;
  }
  async function setReglages(v) { await GA.repo.setParametre('moteur', v); reglages = Object.assign(JSON.parse(JSON.stringify(DEFAUT)), v); }

  /* ---------- Accès aux données ---------- */
  const cache = {};
  const loadJson = (url) => cache[url] || (cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); }).catch(e => { delete cache[url]; throw e; }));
  const loadOpt = url => loadJson(url).catch(() => null);

  async function getJson(url, essais = 6, opts) {
    for (let i = 0; i < essais; i++) {
      try {
        const r = await fetch(url, opts);
        if (r.ok) return await r.json();
        if (r.status !== 429 && r.status < 500) throw new Error('HTTP ' + r.status);
      } catch (e) { if (i === essais - 1) throw e; }
      await pause(700 * (i + 1));
    }
    throw new Error('Service indisponible');
  }

  async function overpass(q) {
    let err;
    for (let tour = 0; tour < 2; tour++) for (const url of OVERPASS) {
      {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
        try {
          const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
          clearTimeout(t);
          if (r.ok) return (await r.json()).elements || [];
          err = new Error('HTTP ' + r.status);
        } catch (e) { clearTimeout(t); err = e; }
        await pause(600);
      }
    }
    throw err || new Error('OpenStreetMap indisponible');
  }

  /* ---------- SIRENE : établissements autour du point ---------- */
  async function sirene(lat, lon, radiusKm, extra, maxPages) {
    const rows = []; let page = 1, pages = 1, total = 0;
    do {
      const q = new URLSearchParams({ lat, long: lon, radius: radiusKm, per_page: 25, page, ...extra });
      const d = await getJson(SIRENE + '?' + q);
      pages = d.total_pages || 1; total = d.total_results || 0;
      for (const r of d.results || []) {
        for (const e of (r.matching_etablissements && r.matching_etablissements.length ? r.matching_etablissements : [])) {
          if (e.etat_administratif !== 'A') continue;
          rows.push({ nom: (r.nom_complet || '') + ' ' + ((e.liste_enseignes || []).join(' ')) + ' ' + (e.nom_commercial || ''), naf: e.activite_principale || r.activite_principale || '',
            section: r.section_activite_principale || '', tranche: e.tranche_effectif_salarie || '', lat: +e.latitude, lon: +e.longitude });
        }
      }
      page++;
      if (page <= Math.min(pages, maxPages)) await pause(160);
    } while (page <= Math.min(pages, maxPages));
    return { rows, complet: pages <= maxPages, total };
  }

  // Milieux des tranches d'effectif INSEE.
  const MILIEU = { '00': 0, '01': 1.5, '02': 4, '03': 7.5, 11: 15, 12: 35, 21: 75, 22: 150, 31: 225, 32: 375, 41: 750, 42: 1500, 51: 3500, 52: 7500, 53: 10000 };
  const GRANDES_SURFACES = /^47\.11[BCDEF]$/;   // supérettes, supermarchés, hypermarchés, magasins multi-commerces

  /* ---------- Géométrie ---------- */
  function inRing(lon, lat, ring) {
    let ins = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }
  function inGeom(lon, lat, g) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.some(p => inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h)));
  }
  function bbox(g) {
    let a = [180, 90, -180, -90];
    const walk = c => typeof c[0] === 'number' ? (a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]) : c.forEach(walk);
    walk(g.coordinates); return a;
  }
  function segDist(lat, lon, a1, o1, a2, o2) {
    const k = 111320 * Math.cos(lat * Math.PI / 180);
    const px = (lon - o1) * k, py = (lat - a1) * 110540, sx = (o2 - o1) * k, sy = (a2 - a1) * 110540;
    const l2 = sx * sx + sy * sy; const t = l2 ? Math.max(0, Math.min(1, (px * sx + py * sy) / l2)) : 0;
    return Math.hypot(px - t * sx, py - t * sy);
  }
  // Surface d'un polygone OSM (liste de {lat, lon}) en m².
  function aire(geom) {
    if (!geom || geom.length < 3) return 0;
    const lat0 = geom[0].lat * Math.PI / 180, k = 111320 * Math.cos(lat0);
    let s = 0;
    for (let i = 0, j = geom.length - 1; i < geom.length; j = i++) s += (geom[j].lon * k) * (geom[i].lat * 110540) - (geom[i].lon * k) * (geom[j].lat * 110540);
    return Math.abs(s / 2);
  }

  // Ouvert au-delà de l'heure h au moins un jour ? (lecture simple du format opening_hours d'OpenStreetMap)
  function ouvertApres(oh, h) {
    if (!oh) return false;
    if (/24\/7|00:00-24:00/.test(oh)) return true;
    for (const [, h1, , h2, m2] of oh.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)) {
      const fin = +h2 + (+m2) / 60;
      if (fin >= h || fin < +h1) return true;
    }
    return false;
  }
  const ouvertLeSoir = oh => ouvertApres(oh, 21);

  /* ---------- Données de contexte communes à plusieurs critères ---------- */
  async function contexte(lat, lon, step) {
    const ctx = {};
    step('Lieux autour (OpenStreetMap)…');
    const a = (r, f) => `nwr(around:${r},${lat},${lon})${f};`;
    const q = `[out:json][timeout:40];(${a(500, '[amenity~"^(restaurant|fast_food|bar|pub|cafe|cinema|nightclub|fuel|ice_cream|theatre)$"]')}${a(500, '[shop~"^(supermarket|convenience|bakery|alcohol|mall|department_store)$"]')}${a(500, '[leisure~"^(fitness_centre|sports_centre|bowling_alley|stadium|water_park)$"]')}${a(1000, '[cuisine~"pizza"]')}${a(3000, '[amenity=vending_machine][vending~"pizza"]')}${a(3000, '[amenity=vending_machine][name~"[Pp]izz"]')}node(around:400,${lat},${lon})[highway=bus_stop];);out center tags;(${a(200, '[amenity=parking]')});out tags geom;rel(around:400,${lat},${lon})[route=bus];out tags;`;
    try { ctx.osm = await overpass(q); } catch (e) { ctx.osm = null; }
    step('Isochrone et communes…');
    try {
      const iso = await getJson(`${NAV}/isochrone?resource=bdtopo-valhalla&profile=car&costType=time&costValue=10&timeUnit=minute&point=${lon},${lat}&direction=departure&geometryFormat=geojson`);
      ctx.iso = iso.geometry;
      const ring = (ctx.iso.type === 'Polygon' ? ctx.iso.coordinates[0] : ctx.iso.coordinates[0][0]);
      const st = Math.max(1, Math.floor(ring.length / 80));
      const simple = ring.filter((_, i) => i % st === 0).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]); simple.push(simple[0]);
      ctx.communes = (await getJson(COMMUNES + '?geom=' + encodeURIComponent(JSON.stringify({ type: 'Polygon', coordinates: [simple] })))).features || [];
    } catch (e) { ctx.iso = null; ctx.communes = []; }
    const deps = new Set(ctx.communes.map(f => f.properties.insee_dep));
    // Département du point lui-même (au cas où l'isochrone a échoué).
    if (!deps.size) {
      try { const c = await getJson(COMMUNES + '?geom=' + encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }))); (c.features || []).forEach(f => deps.add(f.properties.insee_dep)); } catch (e) {}
    }
    ctx.deps = [...deps];
    step('Population et équipements (INSEE)…');
    ctx.carreaux = []; ctx.carreauxDeps = [];
    ctx.bpe = [];
    for (const d of ctx.deps) {
      if (DEPS_CARREAUX.includes(d)) {
        const c = await loadOpt(`data/carreaux/${d}.json`);
        if (c) { ctx.carreaux = ctx.carreaux.concat(c.carreaux); ctx.carreauxDeps.push(d); }
      }
      const b = await loadOpt(`data/bpe/${d}.json`);
      if (b) ctx.bpe = ctx.bpe.concat(b.equipements);
    }
    return ctx;
  }

  /* ---------- Critères v2 ---------- */
  function critereHabitants(lat, lon, ctx) {
    const rule = '≥ 8 000 : 15 · 5 000 : 12 · 3 000 : 9 · 1 500 : 6 · 500 : 3 · moins : 1';
    const base = { k: 'hab', lab: 'Habitants à 800 m', mx: 15, rule };
    if (!ctx.carreauxDeps.length) return { ...base, st: 'manquant', pts: null, val: 'carreaux INSEE non disponibles pour ce département', note: 'Ajouter le département avec tools/make_carreaux.py' };
    let hab = 0, men = 0, enf = 0, jeunes = 0, adultes = 0, nv = 0;
    for (const c of ctx.carreaux) {
      if (Math.abs(c[0] - lat) > 0.008) continue;
      if (dist(lat, lon, c[0], c[1]) > 800) continue;
      hab += c[2]; men += c[3]; enf += c[4]; jeunes += c[5]; adultes += c[6]; nv += c[7] * c[2];
    }
    const pts = hab >= 8000 ? 15 : hab >= 5000 ? 12 : hab >= 3000 ? 9 : hab >= 1500 ? 6 : hab >= 500 ? 3 : 1;
    const pc = v => hab ? Math.round(100 * v / hab) + ' %' : '—';
    return { ...base, st: 'connu', pts, val: `${fr(hab)} habitants · ${fr(men)} ménages · moins de 18 ans ${pc(enf)} · 18–39 ans ${pc(jeunes + adultes)}${hab ? ' · niveau de vie ' + fr(nv / hab) + ' €/an' : ''}`,
      note: 'INSEE, Filosofi 2019, carreaux de 200 m (carreaux de moins de 11 ménages non diffusés : légère sous-estimation possible)', info: { hab, men, enf, jeunes, adultes, nv: hab ? nv / hab : 0 } };
  }

  function criterePop10(lat, lon, ctx) {
    const rule = '≥ 60 000 : 10 · 35 000 : 8 · 15 000 : 5 · moins : 2';
    const base = { k: 'pop', lab: 'Population à 10 min en voiture', mx: 10, rule };
    if (!ctx.iso) return { ...base, st: 'manquant', pts: null, val: 'isochrone non calculée' };
    const [x0, y0, x1, y1] = bbox(ctx.iso);
    let pop = 0, methode = 'carreaux de 200 m';
    const couverts = new Set(ctx.carreauxDeps);
    for (const c of ctx.carreaux) {
      if (c[0] < y0 || c[0] > y1 || c[1] < x0 || c[1] > x1) continue;
      if (inGeom(c[1], c[0], ctx.iso)) pop += c[2];
    }
    // Communes de départements sans carreaux : population répartie uniformément (ancienne méthode).
    for (const f of ctx.communes) {
      if (couverts.has(f.properties.insee_dep)) continue;
      methode = 'carreaux et communes';
      const p = +f.properties.population || 0; if (!p) continue;
      const [a0, b0, a1, b1] = bbox(f.geometry); let tot = 0, dans = 0; const N = 14;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = a0 + (a1 - a0) * (i + 0.5) / N, y = b0 + (b1 - b0) * (j + 0.5) / N;
        if (!inGeom(x, y, f.geometry)) continue; tot++; if (inGeom(x, y, ctx.iso)) dans++;
      }
      if (tot) pop += p * dans / tot;
    }
    return { ...base, st: 'connu', pts: pop >= 60000 ? 10 : pop >= 35000 ? 8 : pop >= 15000 ? 5 : 2, val: fr(pop) + ' habitants',
      note: `Isochrone IGN 10 min en voiture × population INSEE (${methode})` };
  }

  const ATTRACTEURS = { C2: 'collège', C3: 'lycée', C5: 'enseignement supérieur', F1: 'équipement sportif', F3: 'cinéma, culture', D1: 'hôpital, clinique', E1: 'gare, transport' };
  function critereSoir(lat, lon, ctx) {
    const rule = 'Lieux ouverts le soir ≤ 500 m : ≥ 8 : 10 · 4–7 : 7 · 2–3 : 5 · 1 : 3 — lieux de vie (BPE) ≤ 500 m : ≥ 5 : 5 · 2–4 : 3 · 1 : 2';
    const base = { k: 'soir', lab: 'Activité du soir et lieux de vie', mx: 15, rule };
    let ptsA = null, valA = 'OpenStreetMap indisponible', noms = [];
    if (ctx.osm) {
      const soir = ctx.osm.filter(e => {
        const t = e.tags; if (!t || t.amenity === 'parking' || t.highway || t.route || t.amenity === 'vending_machine') return false;
        const p = e.center || e; if (p.lat == null || dist(lat, lon, p.lat, p.lon) > 500) return false;
        return ouvertLeSoir(t.opening_hours) || ['bar', 'pub', 'cinema', 'nightclub', 'theatre'].includes(t.amenity) || ['fitness_centre', 'bowling_alley'].includes(t.leisure);
      });
      const n = soir.length; noms = soir.map(e => e.tags.name).filter(Boolean);
      ptsA = n >= 8 ? 10 : n >= 4 ? 7 : n >= 2 ? 5 : n === 1 ? 3 : 0;
      valA = `${n} lieu(x) ouvert(s) le soir${noms.length ? ' (' + noms.slice(0, 4).join(', ') + (noms.length > 4 ? '…' : '') + ')' : ''}`;
    }
    const eq = ctx.bpe.filter(e => ATTRACTEURS[e[2].slice(0, 2)] && Math.abs(e[0] - lat) < 0.006 && dist(lat, lon, e[0], e[1]) <= 500);
    const nb = eq.length;
    const ptsB = ctx.bpe.length ? (nb >= 5 ? 5 : nb >= 2 ? 3 : nb === 1 ? 2 : 0) : null;
    const types = [...new Set(eq.map(e => ATTRACTEURS[e[2].slice(0, 2)]))];
    const valB = ptsB == null ? 'équipements INSEE non disponibles' : `${nb} lieu(x) de vie${types.length ? ' : ' + types.join(', ') : ''}`;
    if (ptsA == null && ptsB == null) return { ...base, st: 'manquant', pts: null, val: valA + ' · ' + valB };
    return { ...base, st: ptsA == null || ptsB == null ? 'incomplet' : 'connu', pts: (ptsA || 0) + (ptsB || 0), val: valA + ' · ' + valB,
      note: 'Horaires d’ouverture OpenStreetMap (souvent incomplets : sous-estimation possible) · INSEE, Base permanente des équipements 2025' };
  }

  async function critereArret(lat, lon, ctx) {
    const rule = 'Places de stationnement ≤ 200 m : ≥ 100 : 10 · 30–99 : 7 · 1–29 : 4 · station-service seule : 4 · rien : 0';
    const base = { k: 'arret', lab: 'Facilité d’arrêt (stationnement)', mx: 10, rule };
    if (!ctx.osm) return { ...base, st: 'manquant', pts: null, val: 'OpenStreetMap indisponible' };
    let places = 0, nb = 0, estime = false;
    for (const e of ctx.osm) {
      if (!e.tags || e.tags.amenity !== 'parking') continue;
      if (e.tags.access && /private|no|customers_only/.test(e.tags.access) && e.tags.access !== 'customers') continue;
      nb++;
      const cap = parseInt(e.tags.capacity, 10);
      if (cap > 0) places += cap;
      else if (e.geometry) { places += Math.max(5, Math.round(aire(e.geometry) / 25)); estime = true; }
      else { places += 10; estime = true; }
    }
    const pk = await loadOpt('data/parkings.json');
    if (pk) for (const [a, o, n] of pk.parkings) if (Math.abs(a - lat) < 0.003 && dist(lat, lon, a, o) <= 200) { places += n; nb++; }
    const fuel = ctx.osm.some(e => e.tags && e.tags.amenity === 'fuel' && dist(lat, lon, (e.center || e).lat, (e.center || e).lon) <= 200);
    const pts = places >= 100 ? 10 : places >= 30 ? 7 : places >= 1 ? 4 : fuel ? 4 : 0;
    return { ...base, st: 'connu', pts, val: nb ? `${nb} parking(s), ${estime ? 'environ ' : ''}${fr(places)} places${fuel ? ' · station-service' : ''}` : (fuel ? 'station-service, pas de parking recensé' : 'aucun parking recensé'),
      note: 'OpenStreetMap (capacité, ou surface ÷ 25 m² par place) + base nationale des lieux de stationnement' };
  }

  async function critereFlux(lat, lon, ctx) {
    const rule = 'Trafic national ≤ 500 m : ≥ 40 000 : 8 · ≥ 20 000 : 6 · moins : 4 — gare ≤ 800 m : ≥ 1,5 M : 4 · ≥ 0,5 M : 3 · moins : 2 — lignes de bus ≤ 400 m : ≥ 5 : 3 · 2–4 : 2 · 1 : 1 (plafond 15)';
    const parts = []; let pts = 0;
    const t = await loadOpt('data/tmja.json');
    let best = null;
    if (t) for (const [route, a1, o1, a2, o2, v] of t.troncons) {
      if (Math.abs(a1 - lat) > 0.02 && Math.abs(a2 - lat) > 0.02) continue;
      const d = segDist(lat, lon, a1, o1, a2, o2);
      if (d <= 500 && (!best || v > best.v)) best = { route, v, d };
    }
    if (best) { pts += best.v >= 40000 ? 8 : best.v >= 20000 ? 6 : 4; parts.push(`${best.route} ${fr(best.v)} véh./j à ${fr(best.d)} m`); }
    else parts.push('pas de route nationale comptée à 500 m');
    const g = await loadOpt('data/gares.json');
    let gare = null;
    if (g) for (const [nom, a, o, v] of g.gares) {
      if (Math.abs(a - lat) > 0.01) continue;
      const d = dist(lat, lon, a, o);
      if (d <= 800 && (!gare || (v || 0) > (gare.v || 0))) gare = { nom, d, v };
    }
    if (gare) { const v = gare.v || 0; pts += v >= 1.5e6 ? 4 : v >= 5e5 ? 3 : 2; parts.push(`gare ${gare.nom} à ${fr(gare.d)} m (${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M voyageurs)`); }
    let lignes = null;
    if (ctx.osm) {
      lignes = new Set(ctx.osm.filter(e => e.type === 'relation' && e.tags && e.tags.route === 'bus').map(e => e.tags.ref || e.tags.name)).size;
      pts += lignes >= 5 ? 3 : lignes >= 2 ? 2 : lignes === 1 ? 1 : 0;
      parts.push(`${lignes} ligne(s) de bus à 400 m`);
    }
    return { k: 'flux', lab: 'Flux de passage', mx: 15, rule, st: ctx.osm ? 'incomplet' : 'incomplet', pts: Math.min(15, pts), val: parts.join(' · '),
      note: 'Trafic des routes nationales (DGITM) ; routes départementales non publiées · gares SNCF · lignes de bus OpenStreetMap' };
  }

  async function critereCommerce(lat, lon) {
    const s = await sirene(lat, lon, 0.5, {}, 20);
    const commerces = s.rows.filter(r => r.section === 'G' || r.section === 'I');
    const gs = s.rows.filter(r => GRANDES_SURFACES.test(r.naf));
    const n = commerces.length;
    const niveau = (gs.length && n >= 20) || n >= 50 ? 'Fort' : (gs.length || n >= 15) ? 'Moyen' : 'Faible';
    const env = { k: 'env', lab: 'Environnement commercial (≤ 500 m)', mx: 15, st: s.complet ? 'connu' : 'incomplet',
      val: `${niveau} · ${s.complet ? '' : '≥ '}${n} commerce(s) et restaurant(s)${gs.length ? ' · ' + gs.length + ' grande(s) surface(s)' : ''}`,
      pts: niveau === 'Fort' ? 15 : niveau === 'Moyen' ? 8 : 0,
      rule: 'Fort 15 (grande surface et ≥ 20 commerces, ou ≥ 50) · moyen 8 (grande surface ou ≥ 15) · faible 0',
      note: 'Établissements actifs SIRENE, sections commerce (G) et hébergement-restauration (I)' };
    const emplois = s.rows.reduce((t, r) => t + (MILIEU[r.tranche] || 0), 0);
    const emp = { k: 'emp', lab: 'Emplois ≤ 500 m', mx: 5, st: 'connu', min: !s.complet,
      val: (s.complet ? '' : '≥ ') + fr(emplois), pts: emplois >= 500 ? 5 : emplois >= 150 ? 3 : 1,
      rule: '≥ 500 : 5 · 150–499 : 3 · moins : 1', note: 'Estimation SIRENE (milieux de tranches d’effectif)' + (s.complet ? '' : ', plafonnée à 500 entreprises lues') };
    return [env, emp];
  }

  async function critereConcurrence(lat, lon, R, ctx) {
    const s = await sirene(lat, lon, 1, { activite_principale: '56.10A,56.10C' }, 8);
    const norm = x => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const piz = new Map();
    s.rows.filter(r => /PIZZ/i.test(r.nom)).forEach(r => piz.set(norm(r.nom).slice(0, 18), { nom: r.nom.trim(), tard: false }));
    let tard = 0;
    const automates = [];
    if (ctx.osm) for (const e of ctx.osm) {
      const t = e.tags || {}; const p = e.center || e;
      if (t.amenity === 'vending_machine') { if (p.lat != null) automates.push({ nom: t.name || t.brand || 'distributeur de pizzas (OSM)', d: dist(lat, lon, p.lat, p.lon) }); continue; }
      if (!/pizza/.test(t.cuisine || '') || p.lat == null || dist(lat, lon, p.lat, p.lon) > 1000) continue;
      const k = norm(t.name || 'pizza' + e.id).slice(0, 18);
      const late = ouvertApres(t.opening_hours, 22);
      if (!piz.has(k)) piz.set(k, { nom: t.name || 'pizzeria', tard: late }); else if (late) piz.get(k).tard = true;
    }
    piz.forEach(v => { if (v.tard) tard++; });
    const n = piz.size;
    let pts = n === 0 ? 15 : n <= 2 ? 11 : n <= 5 ? 6 : 2;
    if (tard) pts = Math.max(0, pts - 2 * Math.min(tard, 3));
    (R.concurrents || []).forEach(c => automates.push({ nom: c.nom, d: dist(lat, lon, c.lat, c.lon) }));
    automates.sort((a, b) => a.d - b.d);
    let distri = '';
    if (automates.length && automates[0].d < 1500) { pts = 0; distri = ` · distributeur concurrent (${automates[0].nom}) à ${fr(automates[0].d)} m`; }
    else if (automates.length && automates[0].d < 3000) { pts = Math.max(0, pts - 6); distri = ` · distributeur concurrent (${automates[0].nom}) à ${km1(automates[0].d)}`; }
    const liste = [...piz.values()].map(v => v.nom.split(/\s+/).slice(0, 3).join(' '));
    return { k: 'conc', lab: 'Concurrence directe', mx: 15, st: ctx.osm ? 'connu' : 'incomplet', pts,
      val: `${n} pizzeria(s) ≤ 1 km${n ? ' (' + liste.slice(0, 3).join(', ') + (n > 3 ? '…' : '') + ')' : ''}${tard ? ` · ${tard} ouverte(s) après 22 h` : ''}${distri}`,
      rule: '0 pizzeria : 15 · 1–2 : 11 · 3–5 : 6 · plus : 2 ; −2 par pizzeria ouverte après 22 h ; distributeur de pizzas < 1,5 km : 0 ; 1,5–3 km : −6',
      note: 'SIRENE (nom « PIZZ ») + OpenStreetMap (cuisine pizza, horaires, distributeurs automatiques) + concurrents déclarés dans les réglages' };
  }

  /* ---------- Indicateurs sans points ---------- */
  async function indicateurs(lat, lon) {
    const ind = {};
    const ant = await loadOpt('data/antennes-4g.json');
    if (ant) {
      let masque = 0, plusProche = null;
      for (const [a, o, m] of ant.sites) {
        if (Math.abs(a - lat) > 0.015) continue;
        const d = dist(lat, lon, a, o);
        if (d <= 1500) masque |= m;
        if (!plusProche || d < plusProche) plusProche = d;
      }
      const ops = Object.entries(ant.operateurs).filter(([k]) => masque & +k).map(([, v]) => v);
      ind.reseau = { ops, plusProche, ok: ops.length >= 2,
        texte: ops.length ? `${ops.length} opérateur(s) avec une antenne 4G/5G à moins de 1,5 km (${ops.join(', ')})` : 'aucune antenne 4G/5G à moins de 1,5 km : vérifier le paiement par carte sur place' };
    }
    try {
      const d = await getJson(GPU + '?geom=' + encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] })), 3);
      const f = d.features && d.features[0];
      if (f) {
        const t = f.properties.typezone || '';
        const sens = { U: 'zone urbaine', AUc: 'à urbaniser', AUs: 'à urbaniser (fermée)', A: 'zone agricole', N: 'zone naturelle' }[t] || t;
        ind.urbanisme = { type: t, libelle: f.properties.libelong || f.properties.libelle || '', texte: `${f.properties.libelle || t} — ${sens}${/^[AN]/.test(t) ? ' : installation probablement difficile' : ''}` };
      } else ind.urbanisme = { texte: 'aucun document d’urbanisme numérisé (règlement national d’urbanisme ou carte communale)' };
    } catch (e) { /* indisponible */ }
    try {
      const d = await getJson(`${PANORAMAX}/search?limit=1&place_position=${lon},${lat}&place_distance=0-80`, 3);
      const f = d.features && d.features[0];
      if (f) ind.photo = { id: f.id, date: (f.properties && f.properties.datetime || '').slice(0, 10),
        vignette: f.assets && f.assets.thumb && f.assets.thumb.href, lien: `https://api.panoramax.xyz/#focus=pic&pic=${f.id}&map=18/${lat}/${lon}` };
    } catch (e) { /* indisponible */ }
    return ind;
  }

  async function distanceLabo(lat, lon, R) {
    const labos = R.sites.filter(s => s.laboratoire);
    let best = null;
    for (const s of labos) {
      const d = await getJson(`${NAV}/itineraire?resource=bdtopo-valhalla&profile=car&optimization=shortest&start=${s.lon},${s.lat}&end=${lon},${lat}&distanceUnit=kilometer&timeUnit=minute&getSteps=false&geometryFormat=geojson`);
      if (!best || d.distance < best.km) best = { site: s.nom, km: +d.distance.toFixed(2), min: Math.round(d.duration), max: s.distance_max_km || R.distanceMaxKm };
    }
    return best;
  }

  /* ---------- Analyse complète ---------- */
  async function analyser(lat, lon, onStep) {
    const R = await getReglages();
    const step = (t) => { if (onStep) onStep(t); };
    step('Distance par la route…');
    const labo = await distanceLabo(lat, lon, R).catch(() => null);
    const ctx = await contexte(lat, lon, step);
    step('Commerces et emplois (SIRENE)…');
    const manque = (k, lab, mx) => ({ k, lab, mx, st: 'manquant', pts: null, val: 'service SIRENE indisponible, réessayer plus tard' });
    const [env, emp] = await critereCommerce(lat, lon).catch(() => [manque('env', 'Environnement commercial (≤ 500 m)', 15), manque('emp', 'Emplois ≤ 500 m', 5)]);
    step('Concurrence…');
    const conc = await critereConcurrence(lat, lon, R, ctx).catch(() => manque('conc', 'Concurrence directe', 15));
    step('Flux, stationnement, population…');
    const det = [critereHabitants(lat, lon, ctx), criterePop10(lat, lon, ctx), critereSoir(lat, lon, ctx), await critereArret(lat, lon, ctx),
      await critereFlux(lat, lon, ctx), env, conc, emp];
    step('Réseau mobile, urbanisme, photos…');
    const ind = await indicateurs(lat, lon);
    const connus = det.filter(d => d.pts != null);
    const brut = connus.reduce((t, d) => t + d.pts, 0);
    const couverture = connus.reduce((t, d) => t + d.mx, 0);
    const manquants = det.filter(d => d.pts == null).reduce((t, d) => t + d.mx, 0) + (emp.min ? emp.mx - emp.pts : 0);
    // Malus de proximité : nos distributeurs existants (jamais une exclusion).
    const malus = [];
    const distris = R.sites.filter(s => s.distributeur).map(s => ({ s, d: dist(lat, lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d);
    if (distris.length) {
      const regle = (R.proximite || []).slice().sort((a, b) => a.km - b.km).find(r => distris[0].d < r.km * 1000);
      if (regle) malus.push({ lab: `Distributeur existant à ${km1(distris[0].d)} (${distris[0].s.nom})`, pts: regle.pts });
    }
    return {
      v: VERSION, date: new Date().toISOString(), lat: +lat.toFixed(6), lon: +lon.toFixed(6),
      det, brut, couverture, score: couverture ? Math.round(brut / couverture * 100) : 0,
      lo: brut, hi: Math.min(100, brut + manquants), labo, distanceMaxKm: R.distanceMaxKm,
      conforme: labo ? labo.km <= (labo.max || R.distanceMaxKm) : null, alerte: labo ? Math.abs(labo.km - (labo.max || R.distanceMaxKm)) <= 0.5 : false,
      malus, ind,
    };
  }

  /* ---------- Bonus / malus terrain (saisis sur la fiche) ---------- */
  const TERRAIN = {
    terrain_acces:        { lab: 'Accès', options: { direct: ['Direct, facile', 5], moyen: ['Correct', 0], difficile: ['Difficile, détour', -10] } },
    terrain_visibilite:   { lab: 'Visibilité depuis l’axe', options: { bonne: ['Bonne', 5], moyenne: ['Moyenne', 0], faible: ['Faible, caché', -5] } },
    terrain_attractivite: { lab: 'Attractivité du lieu', options: { forte: ['Forte, lieu de passage', 5], moyenne: ['Moyenne', 0], faible: ['Faible', -5] } },
  };
  function terrain(p) {
    return Object.entries(TERRAIN).map(([k, c]) => p && p[k] && c.options[p[k]] ? { lab: c.lab + ' : ' + c.options[p[k]][0].toLowerCase(), pts: c.options[p[k]][1] } : null).filter(Boolean);
  }

  // Score final = score du profil de la typologie (sur 100, données connues) + malus de proximité du réseau actuel
  // + bonus / malus terrain, borné 0–100. Ce n'est pas une probabilité : c'est le potentiel géographique.
  function scoreFinal(a, p, typo) {
    if (!a) return null;
    const base = typo ? scoreProfil(a, typo) : a.score;
    const malus = a.lat != null ? malusProximite(a.lat, a.lon) : (a.malus || []);
    const ajust = [...malus, ...terrain(p)];
    const total = Math.max(0, Math.min(100, base + ajust.reduce((t, x) => t + x.pts, 0)));
    return { total, base, ajust, priorite: total >= 60 ? 1 : total >= 45 ? 2 : 3, profil: typo && GA.PROFILS[typo] ? typo : 'general' };
  }

  // Résultat équivalent pour une zone de l'étude du 25/11 (score figé de la carte, ancien barème).
  function depuisZone(z) {
    return { etude: true, score: z.sc, lo: z.lo, hi: z.hi, couverture: z.cov, labo: { km: z.vd, site: 'Laboratoire' }, conforme: z.conf, alerte: z.alert, malus: [], date: '2026-11-25' };
  }

  return { analyser, scoreFinal, scoreProfil, malusProximite, depuisZone, getReglages, setReglages, TERRAIN, DEFAUT, inGeom, VERSION,
    ouvertLeSoir, ouvertApres, overpass, sirene, getJson, loadOpt, aire, segDist, bbox, MILIEU, GRANDES_SURFACES, DEPS_CARREAUX };
})();
