/* Propriétaire foncier : plan cadastral (IGN), clic sur une parcelle → identifiant, surface,
   et propriétaire quand c'est une personne morale (fichier DGFiP des parcelles des personnes morales).
   Les personnes physiques ne sont pas publiées : la parcelle apparaît alors « sans propriétaire connu ». */
window.GA = window.GA || {};

GA.foncierView = (function () {
  const { $, $$, esc, run, modal } = GA.ui;
  const APICARTO = 'https://apicarto.ign.fr/api/cadastre/parcelle';
  const GEOCODE = 'https://data.geopf.fr/geocodage/search';
  const WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  const communes = {};   // cache des fichiers data/parcelles-pm/<insee>.json

  const surface = m2 => m2 >= 10000 ? (m2 / 10000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ha' : m2.toLocaleString('fr-FR') + ' m²';
  const fmtSiren = s => String(s).replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');

  // Type de propriétaire de la fiche, déduit du groupe DGFiP et de la forme juridique.
  function typeProprietaire(o) {
    const [, , forme, groupe] = o;
    if (/Commune|État|Région|Département|Établissements publics/.test(groupe) || /^(COM|ETAT|DEPT|COLL|EPA|EPIC|REG)$/.test(forme)) return 'Public / collectivité';
    if (/Copropriétaires/.test(groupe) || forme === 'SYMI') return 'Copropriété / syndic';
    if (/^SNCF|RESEAU FERRE|SNCF/.test(o[1])) return 'Gestionnaire de gare';
    if (/^(SCI|SC|SCPI|OPCI)$/.test(forme) || /FONCI/.test(o[1])) return 'Foncière';
    return 'Privé';
  }

  async function loadCommune(insee) {
    if (!(insee in communes)) {
      communes[insee] = fetch('data/parcelles-pm/' + insee + '.json').then(r => r.ok ? r.json() : null).catch(() => null);
    }
    return communes[insee];
  }

  async function getJson(url) {
    for (let i = 0; i < 3; i++) {
      try { const r = await fetch(url); if (r.ok) return r.json(); if (r.status < 500 && r.status !== 429) break; } catch (e) {}
      await new Promise(res => setTimeout(res, 700 * (i + 1)));
    }
    throw new Error('Service du cadastre indisponible. Réessayez dans un instant.');
  }

  async function geocode(q) {
    const d = await getJson(GEOCODE + '?limit=1&q=' + encodeURIComponent(q));
    const f = d.features && d.features[0];
    return f && f.properties.score > 0.4 ? { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label } : null;
  }

  async function parcelleAt(lat, lon) {
    const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] });
    const d = await getJson(APICARTO + '?geom=' + encodeURIComponent(geom));
    return d.features && d.features[0] || null;
  }

  function open(prospectId) {
    if (!window.L) { GA.ui.toast('Carte indisponible.', 'err'); return; }
    const p = GA.store.prospects.find(x => x.id === prospectId);
    const ed = p && GA.perm.canEditProspect(GA.auth.current(), p);
    const z = p && GA.svc.zone(p.zone_id);
    const m = modal('Propriétaire foncier' + (p ? ' · ' + p.nom : ''), `
      <div class="fc">
        <div class="fc-map-wrap">
          <form class="fc-search" id="fc-search"><input id="fc-q" type="search" placeholder="Adresse, lieu-dit…" value="${esc(p && p.adresse ? p.adresse + ' ' + p.commune : '')}"><button class="btn">Aller</button></form>
          <div id="fc-map" class="fc-map"></div>
        </div>
        <div class="fc-side" id="fc-side"><p class="muted">Cliquez sur une parcelle du plan pour afficher son identifiant, sa surface et son propriétaire.</p>
          <p class="hint">Propriétaires connus : sociétés, collectivités et organismes (fichier public de la DGFiP, situation 2026). Les parcelles des particuliers ne sont pas publiées.</p></div>
      </div>`, { cls: 'xl' });

    const start = z ? [z.lat, z.lon] : [49.03, 2.33];
    const map = L.map($('#fc-map', m.el), { zoomControl: true, maxZoom: 20 }).setView(start, z ? 17 : 12);
    const attrib = '© <a href="https://www.ign.fr" target="_blank" rel="noopener">IGN</a> · cadastre DGFiP';
    const plan = L.tileLayer(WMTS + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png', { maxZoom: 20, maxNativeZoom: 19, attribution: attrib });
    const photo = L.tileLayer(WMTS + '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg', { maxZoom: 20, maxNativeZoom: 19, attribution: attrib });
    const parcelles = L.tileLayer(WMTS + '&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=PCI%20vecteur&FORMAT=image/png', { maxZoom: 20, maxNativeZoom: 19, opacity: 0.9 });
    photo.addTo(map); parcelles.addTo(map);
    L.control.layers({ 'Photo aérienne': photo, 'Plan IGN': plan }, { 'Parcelles': parcelles }, { collapsed: false }).addTo(map);
    if (z) L.circleMarker([z.lat, z.lon], { radius: 6, color: '#1d2430', weight: 2, fillColor: '#f08c00', fillOpacity: 1 }).addTo(map).bindTooltip('Zone ' + z.id);
    let selection = null;
    setTimeout(() => map.invalidateSize(), 50);

    async function goTo(q) {
      const r = await run(() => geocode(q));
      if (r) { map.setView([r.lat, r.lon], 18); showAt(r.lat, r.lon); }
      else if (r === null) GA.ui.toast('Adresse introuvable.', 'err');
    }
    $('#fc-search', m.el).addEventListener('submit', e => { e.preventDefault(); const q = $('#fc-q', m.el).value.trim(); if (q) goTo(q); });
    if (p && p.adresse && p.adresse.length > 3) goTo(p.adresse + ' ' + (p.commune || ''));

    async function showAt(lat, lon) {
      const side = $('#fc-side', m.el);
      side.innerHTML = '<p class="muted">Recherche de la parcelle…</p>';
      let f;
      try { f = await parcelleAt(lat, lon); } catch (e) { side.innerHTML = `<p class="danger-t">${esc(e.message)}</p>`; return; }
      if (!m.el.isConnected) return;
      if (selection) map.removeLayer(selection);
      if (!f) { side.innerHTML = '<p class="muted">Pas de parcelle à cet endroit (voie publique, rivière…). Cliquez sur une autre parcelle.</p>'; return; }
      selection = L.geoJSON(f, { style: { color: '#d62828', weight: 3, fillColor: '#d62828', fillOpacity: 0.12 } }).addTo(map);
      const pr = f.properties, idu = pr.idu, insee = pr.code_insee;
      const data = await loadCommune(insee);
      const info = data && data.parcelles[idu.slice(5)];
      const ref = `Section ${pr.section.replace(/^0/, '')} n° ${pr.numero.replace(/^0+/, '')}`;
      const owners = info ? info.o : [];
      side.innerHTML = `
        <div class="fc-parcel"><b>${esc(ref)}</b><span class="muted">${esc(pr.nom_com)} · ${surface(pr.contenance)}</span>
          ${info && info.a ? `<span class="muted">${esc(info.a)}</span>` : ''}<span class="muted small">Identifiant ${esc(idu)}</span></div>
        ${owners.length ? `<h4>Propriétaire${owners.length > 1 ? 's' : ''}</h4>${owners.map((o, i) => `
          <div class="fc-owner"><b>${esc(o[1])}</b>
            <span class="small">${esc(o[4])} · ${esc(o[2])}${o[3] && o[3] !== 'Personnes morales non remarquables' ? ' · ' + esc(o[3]) : ''}</span>
            ${/^\d{9}$/.test(o[0]) ? `<span class="small">SIREN <b class="mono">${fmtSiren(o[0])}</b> · <a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${o[0]}" target="_blank" rel="noopener">Annuaire ↗</a></span>` : ''}
            ${ed ? `<button class="btn" data-use="${i}">Utiliser comme propriétaire de la fiche</button>` : ''}
          </div>`).join('')}`
        : data ? `<div class="note">Aucun propriétaire société ou collectivité dans le fichier DGFiP pour cette parcelle. Deux cas possibles :
            elle appartient à un particulier (nom non publié), ou elle a été créée ou renumérotée après la date du fichier (1er janvier 2026) — essayez alors les parcelles voisines.
            Le relevé de propriété peut être demandé au service des impôts fonciers ou consulté en mairie.</div>`
        : `<div class="note">Commune hors de la zone couverte par les données de propriétaires (communes du Val-d’Oise autour des zones).</div>`}
        <p class="hint">Source : DGFiP, parcelles des personnes morales (situation 2026) ; plan : IGN.</p>`;
      $$('[data-use]', side).forEach(b => b.addEventListener('click', async () => {
        const o = owners[+b.dataset.use];
        const ligne = `Parcelle ${idu} (${ref}, ${pr.nom_com}, ${surface(pr.contenance)}) — ${o[4].toLowerCase()} : ${o[1]}${/^\d{9}$/.test(o[0]) ? ' (SIREN ' + o[0] + ')' : ''} — source DGFiP 2026`;
        const cur = GA.store.prospects.find(x => x.id === p.id) || p;
        const notes = cur.notes && cur.notes.includes(idu) ? cur.notes : [cur.notes, ligne].filter(Boolean).join('\n');
        const r = await run(() => GA.svc.updateProspect(p.id, { proprietaire_nom: o[1], proprietaire_type: typeProprietaire(o), notes }), 'Propriétaire enregistré sur la fiche');
        if (r) { await GA.app.reload({ keepPanel: true }); if (GA.panel.current() === p.id) GA.panel.open(p.id); b.textContent = 'Enregistré ✓'; b.disabled = true; }
      }));
    }
    map.on('click', e => showAt(e.latlng.lat, e.latlng.lng));
  }

  return { open, typeProprietaire };
})();
