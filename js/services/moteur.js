/* Moteur de score des emplacements : recalcule en direct, pour n'importe quel point de France,
   la grille de l'étude du 25/11 (même barème) avec des services publics :
     environnement commercial 30 · concurrence 20 · emplois ≤ 500 m 15 · trafic 15 · gare ≤ 800 m 10 · population à 10 min 10
   + distance et temps par la route depuis le(s) laboratoire(s), malus de proximité d'un distributeur existant
   (réglable, jamais une exclusion) et bonus / malus terrain saisis sur la fiche.
   Sources : SIRENE (recherche-entreprises.api.gouv.fr), IGN Géoplateforme (itinéraire, isochrone),
   API Carto IGN (communes et populations INSEE), SNCF Open Data (data/gares.json), DGITM (data/tmja.json). */
window.GA = window.GA || {};

GA.moteur = (function () {
  const VERSION = 1;
  const SIRENE = 'https://recherche-entreprises.api.gouv.fr/near_point';
  const NAV = 'https://data.geopf.fr/navigation';
  const COMMUNES = 'https://apicarto.ign.fr/api/limites-administratives/commune';
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const dist = (a, b, c, d) => GA.entreprises.distanceM(a, b, c, d);
  const fr = n => Math.round(n).toLocaleString('fr-FR');

  /* ---------- Réglages (table parametres, sinon valeurs par défaut) ---------- */
  const DEFAUT = {
    sites: [{ nom: 'Laboratoire et distributeur pilote (Baillet-en-France)', lat: 49.06365, lon: 2.32388, laboratoire: true, distributeur: true }],
    distanceMaxKm: 10,
    proximite: [{ km: 1.5, pts: -10 }, { km: 3, pts: -5 }],   // malus si un de nos distributeurs est à moins de…
    concurrents: [],                                          // distributeurs de pizzas concurrents [{ nom, lat, lon }]
  };
  let reglages = null;
  async function getReglages() {
    if (reglages) return reglages;
    reglages = JSON.parse(JSON.stringify(DEFAUT));
    try {
      const v = await GA.repo.getParametre('moteur');
      if (v) reglages = Object.assign(reglages, v);
    } catch (e) { /* table absente : valeurs par défaut */ }
    return reglages;
  }
  async function setReglages(v) { await GA.repo.setParametre('moteur', v); reglages = Object.assign(JSON.parse(JSON.stringify(DEFAUT)), v); }

  /* ---------- Données statiques ---------- */
  const cache = {};
  const loadJson = (url) => cache[url] || (cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); }).catch(e => { delete cache[url]; throw e; }));

  async function getJson(url, essais = 6) {
    for (let i = 0; i < essais; i++) {
      try {
        const r = await fetch(url);
        if (r.ok) return await r.json();
        if (r.status !== 429 && r.status < 500) throw new Error('HTTP ' + r.status);
      } catch (e) { if (i === essais - 1) throw e; }
      await pause(700 * (i + 1));
    }
    throw new Error('Service indisponible');
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
    // distance point–segment en mètres (projection locale)
    const k = 111320 * Math.cos(lat * Math.PI / 180);
    const px = (lon - o1) * k, py = (lat - a1) * 110540, sx = (o2 - o1) * k, sy = (a2 - a1) * 110540;
    const l2 = sx * sx + sy * sy; const t = l2 ? Math.max(0, Math.min(1, (px * sx + py * sy) / l2)) : 0;
    return Math.hypot(px - t * sx, py - t * sy);
  }

  /* ---------- Critères ---------- */
  async function critereSirene(lat, lon) {
    const s = await sirene(lat, lon, 0.5, {}, 20);
    const commerces = s.rows.filter(r => r.section === 'G' || r.section === 'I');
    const gs = s.rows.filter(r => GRANDES_SURFACES.test(r.naf));
    const n = commerces.length;
    const niveau = (gs.length && n >= 20) || n >= 50 ? 'Fort' : (gs.length || n >= 15) ? 'Moyen' : 'Faible';
    const env = { k: 'env', lab: 'Environnement commercial (≤ 500 m)', mx: 30, st: s.complet ? 'connu' : 'incomplet',
      val: `${niveau} · ${s.complet ? '' : '≥ '}${n} commerce(s) et restaurant(s)${gs.length ? ' · ' + gs.length + ' grande(s) surface(s)' : ''}`,
      pts: niveau === 'Fort' ? 30 : niveau === 'Moyen' ? 15 : 0,
      rule: 'Fort 30 (grande surface et ≥ 20 commerces, ou ≥ 50) · moyen 15 (grande surface ou ≥ 15) · faible 0',
      note: 'Établissements actifs SIRENE, sections commerce (G) et hébergement-restauration (I)' };
    const emplois = s.rows.reduce((t, r) => t + (MILIEU[r.tranche] || 0), 0);
    const emp = { k: 'emp', lab: 'Emplois ≤ 500 m', mx: 15, st: 'connu', min: !s.complet,
      val: (s.complet ? '' : '≥ ') + fr(emplois), pts: emplois >= 500 ? 15 : emplois >= 150 ? 9 : 3,
      rule: '≥ 500 : 15 · 150–499 : 9 · moins : 3', note: 'Estimation SIRENE (milieux de tranches d’effectif)' + (s.complet ? '' : ', plafonnée à 500 entreprises lues') };
    return [env, emp];
  }

  async function critereConcurrence(lat, lon, R) {
    const s = await sirene(lat, lon, 1, { activite_principale: '56.10A,56.10C' }, 8);
    const piz = s.rows.filter(r => /PIZZ/i.test(r.nom));
    const n = piz.length;
    let pts = n === 0 ? 20 : n <= 2 ? 14 : n <= 5 ? 8 : 3;
    let distri = '';
    const proches = (R.concurrents || []).map(c => ({ c, d: dist(lat, lon, c.lat, c.lon) })).sort((a, b) => a.d - b.d);
    if (proches.length && proches[0].d < 1500) { pts = 0; distri = ` · distributeur concurrent ${proches[0].c.nom} à ${fr(proches[0].d)} m`; }
    else if (proches.length && proches[0].d < 3000) { pts = Math.max(0, pts - 8); distri = ` · distributeur concurrent ${proches[0].c.nom} à ${(proches[0].d / 1000).toFixed(1).replace('.', ',')} km`; }
    return { k: 'conc', lab: 'Concurrence directe', mx: 20, st: 'incomplet', pts,
      val: `${n} pizzeria(s) ≤ 1 km${n ? ' (' + piz.slice(0, 3).map(r => r.nom.trim().split(/\s+/).slice(0, 3).join(' ')).join(', ') + (n > 3 ? '…' : '') + ')' : ''}${distri}`,
      rule: '0 pizzeria 20 · 1–2 : 14 · 3–5 : 8 · plus : 3 ; distributeur de pizzas < 1,5 km : 0 ; 1,5–3 km : −8',
      note: 'Comptage par le nom (« PIZZ ») dans SIRENE : peut omettre des pizzerias' };
  }

  async function critereTrafic(lat, lon) {
    const t = await loadJson('data/tmja.json');
    let best = null;
    for (const [route, a1, o1, a2, o2, v] of t.troncons) {
      if (Math.abs(a1 - lat) > 0.02 && Math.abs(a2 - lat) > 0.02) continue;
      const d = segDist(lat, lon, a1, o1, a2, o2);
      if (d <= 500 && (!best || v > best.v)) best = { route, v, d };
    }
    if (!best) return { k: 'tm', lab: 'Trafic routier', mx: 15, st: 'manquant', pts: null, val: 'non mesuré',
      rule: '≥ 40 000 : 15 · 20 000–39 999 : 10 · moins : 5', note: 'Aucune route nationale comptée à moins de 500 m (routes départementales non publiées) : 0 à 15 points possibles' };
    return { k: 'tm', lab: 'Trafic routier', mx: 15, st: 'connu', pts: best.v >= 40000 ? 15 : best.v >= 20000 ? 10 : 5,
      val: `${best.route} ${fr(best.v)} véh./j (à ${fr(best.d)} m)`, rule: '≥ 40 000 : 15 · 20 000–39 999 : 10 · moins : 5', note: t.source };
  }

  async function critereGare(lat, lon) {
    const g = await loadJson('data/gares.json');
    let best = null;
    for (const [nom, a, o, v] of g.gares) {
      if (Math.abs(a - lat) > 0.01) continue;
      const d = dist(lat, lon, a, o);
      if (d <= 800 && (!best || (v || 0) > (best.v || 0))) best = { nom, d, v };
    }
    const rule = '≥ 1,5 M voyageurs : 10 · 0,5–1,5 M : 6 · moins : 3 · aucune : 0';
    if (!best) return { k: 'gare', lab: 'Gare ≤ 800 m', mx: 10, st: 'connu', pts: 0, val: 'aucune', rule };
    const v = best.v || 0;
    return { k: 'gare', lab: 'Gare ≤ 800 m', mx: 10, st: 'connu', pts: v >= 1.5e6 ? 10 : v >= 5e5 ? 6 : 3,
      val: `${best.nom} (${fr(best.d)} m, ${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M)`, rule, note: g.source };
  }

  async function criterePopulation(lat, lon) {
    const iso = await getJson(`${NAV}/isochrone?resource=bdtopo-valhalla&profile=car&costType=time&costValue=10&timeUnit=minute&point=${lon},${lat}&direction=departure&geometryFormat=geojson`);
    const g = iso.geometry;
    const ring = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]);
    const step = Math.max(1, Math.floor(ring.length / 80));
    const simple = ring.filter((_, i) => i % step === 0).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]); simple.push(simple[0]);
    const d = await getJson(COMMUNES + '?geom=' + encodeURIComponent(JSON.stringify({ type: 'Polygon', coordinates: [simple] })));
    let pop = 0;
    for (const f of d.features || []) {
      const p = +f.properties.population || 0; if (!p) continue;
      // Part de la commune dans l'isochrone : échantillonnage régulier (densité supposée uniforme).
      const [x0, y0, x1, y1] = bbox(f.geometry); let tot = 0, dans = 0; const N = 14;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = x0 + (x1 - x0) * (i + 0.5) / N, y = y0 + (y1 - y0) * (j + 0.5) / N;
        if (!inGeom(x, y, f.geometry)) continue; tot++; if (inGeom(x, y, g)) dans++;
      }
      if (tot) pop += p * dans / tot;
    }
    return { k: 'pop', lab: 'Population à 10 min (indicatif)', mx: 10, st: 'connu', pts: pop >= 35000 ? 10 : pop >= 15000 ? 6 : 3,
      val: fr(pop), rule: '≥ 35 000 : 10 · 15 000–34 999 : 6 · moins : 3', note: 'Isochrone IGN 10 min en voiture × populations INSEE réparties uniformément sur chaque commune' };
  }

  async function distanceLabo(lat, lon, R) {
    const labos = R.sites.filter(s => s.laboratoire);
    let best = null;
    for (const s of labos) {
      const d = await getJson(`${NAV}/itineraire?resource=bdtopo-valhalla&profile=car&optimization=shortest&start=${s.lon},${s.lat}&end=${lon},${lat}&distanceUnit=kilometer&timeUnit=minute&getSteps=false&geometryFormat=geojson`);
      if (!best || d.distance < best.km) best = { site: s.nom, km: +d.distance.toFixed(2), min: Math.round(d.duration) };
    }
    return best;
  }

  /* ---------- Analyse complète ---------- */
  async function analyser(lat, lon, onStep) {
    const R = await getReglages();
    const step = (t) => { if (onStep) onStep(t); };
    step('Distance par la route…');
    const labo = await distanceLabo(lat, lon, R).catch(() => null);
    step('Commerces et emplois (SIRENE)…');
    const [env, emp] = await critereSirene(lat, lon);
    step('Concurrence…');
    const conc = await critereConcurrence(lat, lon, R);
    step('Trafic, gare…');
    const tm = await critereTrafic(lat, lon), gare = await critereGare(lat, lon);
    step('Population à 10 minutes…');
    const pop = await criterePopulation(lat, lon).catch(() => ({ k: 'pop', lab: 'Population à 10 min (indicatif)', mx: 10, st: 'manquant', pts: null, val: 'non calculée', rule: '≥ 35 000 : 10 · 15 000–34 999 : 6 · moins : 3' }));
    const det = [env, conc, emp, tm, gare, pop];
    const connus = det.filter(d => d.pts != null);
    const brut = connus.reduce((t, d) => t + d.pts, 0);
    const couverture = connus.reduce((t, d) => t + d.mx, 0);
    const manquants = det.filter(d => d.pts == null).reduce((t, d) => t + d.mx, 0) + (emp.min ? emp.mx - emp.pts : 0);
    // Malus de proximité : nos distributeurs existants (jamais une exclusion).
    const malus = [];
    const distris = R.sites.filter(s => s.distributeur).map(s => ({ s, d: dist(lat, lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d);
    if (distris.length) {
      const regle = (R.proximite || []).slice().sort((a, b) => a.km - b.km).find(r => distris[0].d < r.km * 1000);
      if (regle) malus.push({ lab: `Distributeur existant à ${(distris[0].d / 1000).toFixed(1).replace('.', ',')} km (${distris[0].s.nom})`, pts: regle.pts });
    }
    return {
      v: VERSION, date: new Date().toISOString(), lat: +lat.toFixed(6), lon: +lon.toFixed(6),
      det, brut, couverture, score: couverture ? Math.round(brut / couverture * 100) : 0,
      lo: brut, hi: Math.min(100, brut + manquants), labo, distanceMaxKm: R.distanceMaxKm,
      conforme: labo ? labo.km <= R.distanceMaxKm : null, alerte: labo ? Math.abs(labo.km - R.distanceMaxKm) <= 0.5 : false,
      malus,
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

  // Score final = score étude (sur 100, données connues) + malus de proximité + bonus / malus terrain, borné 0–100.
  function scoreFinal(a, p) {
    if (!a) return null;
    const ajust = [...(a.malus || []), ...terrain(p)];
    const total = Math.max(0, Math.min(100, a.score + ajust.reduce((t, x) => t + x.pts, 0)));
    return { total, ajust, priorite: total >= 60 ? 1 : total >= 45 ? 2 : 3 };
  }

  // Résultat équivalent pour une zone de l'étude du 25/11 (score figé de la carte).
  function depuisZone(z) {
    return { etude: true, score: z.sc, lo: z.lo, hi: z.hi, couverture: z.cov, labo: { km: z.vd, site: 'Laboratoire' }, conforme: z.conf, alerte: z.alert, malus: [], date: '2026-11-25' };
  }

  return { analyser, scoreFinal, depuisZone, getReglages, setReglages, TERRAIN, DEFAUT, inGeom };
})();
