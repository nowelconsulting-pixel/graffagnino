/* Onglet Opportunités : classement dynamique des 57 zones de l'étude et des emplacements repérés (fiches),
   avec le même barème ; analyse en direct de n'importe quelle adresse (ailleurs en France aussi) ;
   réglages du moteur (sites, distance maximale, malus de proximité). */
window.GA = window.GA || {};

GA.opportunitesView = (function () {
  const { $, $$, esc, run, modal, zoneChip, statutPill } = GA.ui;
  const LS = 'ga.zones.analyses.v2';
  let zonesV2 = null;   // data/zones-v2.json : les 57 zones calculées avec le moteur v2
  const st = { source: '', conformes: false };
  let R = null, zonesLive = {};
  try { zonesLive = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) {}
  const saveLive = () => { try { localStorage.setItem(LS, JSON.stringify(zonesLive)); } catch (e) {} };
  const km = v => v == null ? '—' : String(v).replace('.', ',') + ' km';

  // Malus de proximité pour un score figé de l'étude (même règle que le moteur, distance à vol d'oiseau).
  function malusEtude(lat, lon) {
    const d = (R.sites || []).filter(s => s.distributeur).map(s => ({ s, d: GA.entreprises.distanceM(lat, lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d)[0];
    if (!d) return [];
    const regle = (R.proximite || []).slice().sort((a, b) => a.km - b.km).find(r => d.d < r.km * 1000);
    return regle ? [{ lab: `Distributeur existant à ${(d.d / 1000).toFixed(1).replace('.', ',')} km`, pts: regle.pts }] : [];
  }

  function lignes() {
    const out = [];
    for (const z of GA.ZONES) {
      const live = zonesLive[z.id] || (zonesV2 && zonesV2.zones[z.id]);
      // Malus de proximité recalculé avec les réglages actuels (sites, distances).
      const a = Object.assign({}, live || GA.moteur.depuisZone(z), { malus: malusEtude(z.lat, z.lon) });
      const fiches = GA.store.prospects.filter(p => p.zone_id === z.id);
      out.push({ type: 'zone', id: z.id, nom: z.nom, commune: z.com, lat: z.lat, lon: z.lon, a, live: !!live, f: GA.moteur.scoreFinal(a, null), fiches });
    }
    for (const p of GA.store.prospects) {
      if (p.lat == null || p.lon == null) continue;
      out.push({ type: 'fiche', id: p.id, nom: p.nom, commune: p.commune, lat: p.lat, lon: p.lon, p, a: p.analyse, live: true, f: p.analyse ? GA.moteur.scoreFinal(p.analyse, p) : null });
    }
    return out.filter(l => (!st.source || l.type === st.source) && (!st.conformes || (l.a && l.a.conforme)))
      .sort((x, y) => (y.f ? y.f.total : -1) - (x.f ? x.f.total : -1) || x.nom.localeCompare(y.nom));
  }

  function row(l, i) {
    const f = l.f, a = l.a;
    const score = f ? `${GA.scoreView.badge(f.total, f.priorite)}<span class="opp-bar" style="--c:${GA.scoreView.PRIO[f.priorite]};width:${f.total * 0.6}px"></span>` : '<span class="muted">à calculer</span>';
    const ajust = f && f.ajust.length ? f.ajust.map(x => `${x.pts > 0 ? '+' : ''}${x.pts}`).join(' ') : '';
    const src = l.type === 'zone' ? (zonesLive[l.id] ? '<span class="src-tag live">Zone · calcul direct</span>' : l.live ? `<span class="src-tag live">Zone · moteur v2${zonesV2 && zonesV2.date ? ' du ' + GA.ui.fmtDate(zonesV2.date) : ''}</span>` : '<span class="src-tag">Zone · étude 25/11 (ancien barème)</span>') : `<span class="src-tag live">Emplacement repéré${a && a.v < 2 ? ' · ancien barème' : ''}</span>`;
    const crm = l.type === 'fiche' ? statutPill(l.p.statut) : (l.fiches.length ? `${l.fiches.length} fiche(s)` : '<span class="muted">—</span>');
    const conf = a && a.conforme === false ? ' <span class="tag out">hors périmètre</span>' : a && a.alerte ? ' <span class="tag warn">à remesurer</span>' : '';
    return `<tr data-i="${i}">
      <td class="rang">${f ? i + 1 : ''}</td>
      <td><b>${l.type === 'zone' ? zoneChip(l.id) + ' ' : ''}${esc(l.nom)}</b><div class="muted small">${esc(l.commune || '')} ${src}</div></td>
      <td>${score}</td>
      <td class="muted small">${a ? 'base ' + a.score : ''} ${ajust}</td>
      <td>${a && a.labo ? km(a.labo.km) : '—'}${conf}</td>
      <td>${crm}</td>
      <td class="t-act">
        <button class="btn ghost" data-act="calc">${a && !a.etude ? 'Recalculer' : 'Calculer'}</button>
        ${l.type === 'fiche' ? '<button class="btn ghost" data-act="open">Fiche</button>' : ''}
        <button class="btn ghost" data-act="map">Carte</button></td></tr>`;
  }

  async function render() {
    R = await GA.moteur.getReglages();
    if (!zonesV2) { try { zonesV2 = await (await fetch('data/zones-v2.json')).json(); } catch (e) { zonesV2 = { zones: {} }; } }
    const list = lignes();
    window.__oppList = list;
    const sansScore = GA.store.prospects.filter(p => p.lat != null && (!p.analyse || p.analyse.v < 2)).length;
    $('#opp-body').innerHTML = `
      <div class="opp-tools">
        <select id="opp-src"><option value="">Zones et emplacements</option><option value="zone" ${st.source === 'zone' ? 'selected' : ''}>Zones de l’étude</option><option value="fiche" ${st.source === 'fiche' ? 'selected' : ''}>Emplacements repérés</option></select>
        <label class="chk"><input type="checkbox" id="opp-conf" ${st.conformes ? 'checked' : ''}> À moins de ${R.distanceMaxKm} km du laboratoire</label>
        <span class="grow"></span>
        ${sansScore ? `<button class="btn" id="opp-all">Calculer les ${sansScore} emplacement(s) sans score v2</button>` : ''}
        <button class="btn" id="opp-addr">Analyser une adresse…</button>
        ${GA.perm.isAdmin(GA.auth.current()) ? '<button class="btn ghost" id="opp-set">Réglages du moteur</button>' : ''}
      </div>
      <div class="table-wrap"><table class="crm-table stat-table opp-table"><thead><tr><th></th><th>Emplacement</th><th>Score</th><th>Détail</th><th>Distance labo</th><th>CRM</th><th></th></tr></thead>
      <tbody>${list.map(row).join('')}</tbody></table></div>
      <p class="hint">Barème v2 sur 100 : habitants à 800 m 15 · population à 10 min 10 · activité du soir et lieux de vie 15 · facilité d’arrêt 10 ·
        flux de passage 15 · environnement commercial 15 · concurrence 15 · emplois 5. Puis malus de proximité d’un de vos distributeurs et bonus / malus terrain de la fiche.
        Aucune zone n’est exclue : P1 ≥ 60, P2 45–59, P3 &lt; 45. « Recalculer » relance le calcul avec les données du jour (une à deux minutes).</p>`;
    $('#opp-src').addEventListener('change', e => { st.source = e.target.value; render(); });
    $('#opp-conf').addEventListener('change', e => { st.conformes = e.target.checked; render(); });
    const all = $('#opp-all'); if (all) all.addEventListener('click', () => calcAll(all));
    $('#opp-addr').addEventListener('click', analyseAdresse);
    const set = $('#opp-set'); if (set) set.addEventListener('click', reglages);
    $$('#opp-body tr[data-i]').forEach(tr => {
      const l = list[+tr.dataset.i];
      $$('[data-act]', tr).forEach(b => b.addEventListener('click', () => action(l, b.dataset.act, b)));
    });
  }

  async function action(l, act, b) {
    if (act === 'open') return GA.app.openProspect(l.id);
    if (act === 'map') return l.type === 'zone' ? GA.mapView.focusZone(l.id) : GA.mapView.focusProspect(l.p);
    b.disabled = true; const label = b.textContent; b.textContent = 'Calcul…';
    if (l.type === 'fiche') {
      const r = await run(() => GA.scoreView.analyserFiche(l.p, t => { b.textContent = t; }), 'Score calculé : ' + l.nom);
      if (r) await GA.app.reload(); else { b.disabled = false; b.textContent = label; }
    } else {
      const a = await run(() => GA.moteur.analyser(l.lat, l.lon, t => { b.textContent = t; }), 'Zone ' + l.id + ' recalculée');
      if (a) { zonesLive[l.id] = a; saveLive(); render(); } else { b.disabled = false; b.textContent = label; }
    }
  }

  async function calcAll(btn) {
    const todo = GA.store.prospects.filter(p => p.lat != null && (!p.analyse || p.analyse.v < 2) && GA.perm.canEditProspect(GA.auth.current(), p));
    btn.disabled = true; let n = 0;
    for (const p of todo) {
      btn.textContent = `Calcul ${++n}/${todo.length}…`;
      await run(() => GA.scoreView.analyserFiche(p));
    }
    GA.ui.toast(n + ' emplacement(s) calculé(s)'); await GA.app.reload();
  }

  // Analyse d'une adresse quelconque (y compris hors de la région) sans créer de fiche.
  function analyseAdresse() {
    const m = modal('Analyser une adresse', `
      <form id="aa-form" class="fc-search"><input id="aa-q" type="search" placeholder="Ex. : 12 rue de Béthune, Lille" required><button class="btn primary">Analyser</button></form>
      <div id="aa-res" style="margin-top:12px"></div>`, { wide: true });
    $('#aa-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const q = $('#aa-q', m.el).value.trim(); if (!q) return;
      const res = $('#aa-res', m.el); res.innerHTML = '<p class="muted">Recherche de l’adresse…</p>';
      const out = await run(async () => {
        const d = await (await fetch('https://data.geopf.fr/geocodage/search?limit=1&q=' + encodeURIComponent(q))).json();
        const f = d.features && d.features[0]; if (!f) throw new Error('Adresse introuvable.');
        const [lon, lat] = f.geometry.coordinates;
        const a = await GA.moteur.analyser(lat, lon, t => { res.innerHTML = `<p class="muted">${esc(f.properties.label)} · ${esc(t)}</p>`; });
        return { a, f, lat, lon };
      });
      if (!out) { res.innerHTML = ''; return; }
      res.innerHTML = `<p><b>${esc(out.f.properties.label)}</b></p>${GA.scoreView.resume(out.a, null)}${GA.scoreView.detailHtml(out.a)}
        <div class="modal-actions"><button class="btn primary" id="aa-fiche">Créer une fiche ici</button></div>`;
      $('#aa-fiche', m.el).addEventListener('click', async () => {
        const p = await run(() => GA.svc.createProspect({ nom: out.f.properties.label, adresse: out.f.properties.name || '', commune: out.f.properties.city || '', lat: out.lat, lon: out.lon, analyse: out.a }), 'Fiche créée');
        if (p) { m.close(); await GA.app.reload(); GA.app.openProspect(p.id); }
      });
    });
  }

  // Réglages partagés du moteur (administrateurs) : sites, distance maximale, malus de proximité.
  async function reglages() {
    const r = JSON.parse(JSON.stringify(await GA.moteur.getReglages()));
    const m = modal('Réglages du moteur', `<form id="rg-form" class="reglages">
      <b>Vos sites</b><span class="muted small">Laboratoire : sert au calcul de la distance par la route. Distributeur : applique le malus de proximité aux emplacements voisins.</span>
      <div id="rg-sites"></div>
      <div class="fc-search"><input id="rg-q" placeholder="Ajouter un site : adresse du 2e distributeur, d’un nouveau laboratoire…"><button type="button" class="btn" id="rg-add">Ajouter</button></div>
      <label class="tfld"><span>Distance maximale par la route depuis le laboratoire (km)</span><input id="rg-max" type="number" step="0.5" min="1" value="${r.distanceMaxKm}"></label>
      <label class="tfld"><span>Malus si un distributeur est à moins de (km / points)</span><span><input id="rg-k1" type="number" step="0.5" style="width:70px" value="${r.proximite[0] ? r.proximite[0].km : 1.5}"> km → <input id="rg-p1" type="number" style="width:70px" value="${r.proximite[0] ? r.proximite[0].pts : -10}"> pts</span></label>
      <label class="tfld"><span>… et à moins de</span><span><input id="rg-k2" type="number" step="0.5" style="width:70px" value="${r.proximite[1] ? r.proximite[1].km : 3}"> km → <input id="rg-p2" type="number" style="width:70px" value="${r.proximite[1] ? r.proximite[1].pts : -5}"> pts</span></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div></form>`, { wide: true });
    const draw = () => {
      $('#rg-sites', m.el).innerHTML = r.sites.map((s, i) => `<div class="site"><input data-k="nom" data-i="${i}" value="${esc(s.nom)}">
        <span class="muted small">${s.lat.toFixed(4)}</span><span class="muted small">${s.lon.toFixed(4)}</span>
        <label class="chk"><input type="checkbox" data-k="laboratoire" data-i="${i}" ${s.laboratoire ? 'checked' : ''}> Laboratoire</label>
        <label class="chk"><input type="checkbox" data-k="distributeur" data-i="${i}" ${s.distributeur ? 'checked' : ''}> Distributeur</label>
        <button type="button" class="icon-btn" data-rm="${i}" aria-label="Retirer">✕</button></div>`).join('');
      $$('#rg-sites [data-k]', m.el).forEach(x => x.addEventListener('change', () => { const s = r.sites[+x.dataset.i]; s[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value; }));
      $$('#rg-sites [data-rm]', m.el).forEach(x => x.addEventListener('click', () => { r.sites.splice(+x.dataset.rm, 1); draw(); }));
    };
    draw();
    $('#rg-add', m.el).addEventListener('click', async () => {
      const q = $('#rg-q', m.el).value.trim(); if (!q) return;
      const f = await run(async () => { const d = await (await fetch('https://data.geopf.fr/geocodage/search?limit=1&q=' + encodeURIComponent(q))).json(); if (!d.features || !d.features[0]) throw new Error('Adresse introuvable.'); return d.features[0]; });
      if (f) { r.sites.push({ nom: f.properties.label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], laboratoire: false, distributeur: true }); $('#rg-q', m.el).value = ''; draw(); }
    });
    $('#rg-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      r.distanceMaxKm = +$('#rg-max', m.el).value || 10;
      r.proximite = [{ km: +$('#rg-k1', m.el).value, pts: +$('#rg-p1', m.el).value }, { km: +$('#rg-k2', m.el).value, pts: +$('#rg-p2', m.el).value }].filter(x => x.km > 0);
      if (!r.sites.some(s => s.laboratoire)) { GA.ui.toast('Gardez au moins un laboratoire.', 'err'); return; }
      if (await run(() => GA.moteur.setReglages(r).then(() => true), 'Réglages enregistrés')) { m.close(); render(); }
    });
  }

  // Onglets : études de sourcing (par défaut) / zones et emplacements.
  let onglet = 'etudes';
  try { onglet = localStorage.getItem('ga.opp.onglet') || 'etudes'; } catch (e) {}
  function afficher() {
    $$('.opp-tabs [data-otab]').forEach(b => { b.classList.toggle('on', b.dataset.otab === onglet); b.onclick = () => { onglet = b.dataset.otab; try { localStorage.setItem('ga.opp.onglet', onglet); } catch (e) {} afficher(); }; });
    $('#opp-etudes').hidden = onglet !== 'etudes'; $('#opp-body').hidden = onglet !== 'zones';
    if (onglet === 'etudes') GA.sourcingView.render($('#opp-etudes')); else render();
  }

  return { render: afficher, renderZones: render };
})();
