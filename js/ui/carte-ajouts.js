/* Ajouts de l'application à la carte verrouillée — chargé DANS le cadre de la carte par js/ui/map-view.js.
   carte/carte.html n'est pas modifiée : ce script utilise la carte Leaflet qu'elle a créée (« map »)
   et dialogue avec l'application (window.parent.GA, même site).
   - barre de recherche d'adresse (géocodeur IGN) ;
   - « + Emplacement » : clic sur la carte → marqueur → création d'une fiche positionnée ;
   - calque « Fiches CRM » : toutes les fiches positionnées, couleur du statut, clic → ouvrir la fiche. */
(function () {
  if (window.__gaAjouts) return;
  window.__gaAjouts = true;
  const GA = window.parent && window.parent.GA;
  if (!GA || typeof map === 'undefined') return;
  const GEO = 'https://data.geopf.fr/geocodage';
  const esc = GA.ui.esc;

  /* ---- Styles ---- */
  const css = document.createElement('style');
  css.textContent = `
  .ga-bar{position:absolute;z-index:1001;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;width:min(520px,calc(100% - 120px));font:13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .ga-search{position:relative;flex:1}
  .ga-search input{width:100%;box-sizing:border-box;height:36px;border:1px solid #c9ced6;border-radius:8px;padding:0 12px;font-size:14px;box-shadow:0 2px 8px #0002;background:#fff}
  .ga-sugg{position:absolute;top:40px;left:0;right:0;background:#fff;border:1px solid #c9ced6;border-radius:8px;box-shadow:0 6px 18px #0003;overflow:hidden}
  .ga-sugg button{display:block;width:100%;text-align:left;border:0;background:#fff;padding:8px 12px;cursor:pointer;font:inherit}
  .ga-sugg button:hover,.ga-sugg button.on{background:#f1f3f5}
  .ga-add{height:36px;border:0;border-radius:8px;padding:0 14px;background:#263F1F;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px #0003;white-space:nowrap}
  .ga-add.on{background:#f08c00}
  .ga-hint{position:absolute;z-index:1001;top:54px;left:50%;transform:translateX(-50%);background:#1d2430;color:#fff;border-radius:6px;padding:5px 10px;font:12.5px system-ui,sans-serif}
  .leaflet-container.ga-adding{cursor:crosshair}
  .ga-pop{font:13px system-ui,sans-serif;min-width:220px}
  .ga-pop b{font-size:14px}
  .ga-pop input{width:100%;box-sizing:border-box;border:1px solid #c9ced6;border-radius:6px;padding:6px 8px;margin:6px 0;font-size:14px}
  .ga-pop .muted{color:#5d6675;font-size:12px}
  .ga-pop button{border:0;border-radius:6px;padding:6px 10px;background:#263F1F;color:#fff;cursor:pointer;font:600 12.5px system-ui,sans-serif;margin-top:4px}
  .ga-pop button.sec{background:#fff;color:#1d2430;border:1px solid #c9ced6}
  .ga-pin{width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px #0006}
  @media (max-width:760px){.ga-bar{width:calc(100% - 70px);left:auto;right:10px;transform:none}}`;
  document.head.appendChild(css);

  /* ---- Barre : recherche + ajout ---- */
  const bar = document.createElement('div');
  bar.className = 'ga-bar';
  bar.innerHTML = `<div class="ga-search"><input type="search" placeholder="Rechercher une adresse, une ville, un lieu…" aria-label="Rechercher un lieu"><div class="ga-sugg" hidden></div></div>
    <button class="ga-add" type="button" title="Cliquez ensuite sur la carte pour placer un emplacement">+ Emplacement</button>`;
  document.getElementById('map').appendChild(bar);
  L.DomEvent.disableClickPropagation(bar); L.DomEvent.disableScrollPropagation(bar);
  const input = bar.querySelector('input'), sugg = bar.querySelector('.ga-sugg'), addBtn = bar.querySelector('.ga-add');
  let found = null, items = [], sel = -1, timer = null;

  async function search(q) {
    try {
      const r = await fetch(GEO + '/search?limit=6&q=' + encodeURIComponent(q));
      const d = await r.json();
      return (d.features || []).map(f => ({ label: f.properties.label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], type: f.properties.type }));
    } catch (e) { return []; }
  }
  function showSugg() {
    sugg.hidden = !items.length;
    sugg.innerHTML = items.map((it, i) => `<button type="button" class="${i === sel ? 'on' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('');
    sugg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => choose(items[+b.dataset.i])));
  }
  function choose(it) {
    if (!it) return;
    sugg.hidden = true; input.value = it.label;
    map.flyTo([it.lat, it.lon], it.type === 'municipality' ? 14 : 18, { duration: 0.8 });
    if (found) map.removeLayer(found);
    found = L.marker([it.lat, it.lon]).addTo(map);
    found.bindPopup(newForm(it.lat, it.lon, it.type === 'municipality' ? '' : it.label)).openPopup();
    bindForm(found, it.lat, it.lon);
  }
  input.addEventListener('input', () => {
    clearTimeout(timer); const q = input.value.trim();
    if (q.length < 3) { items = []; showSugg(); return; }
    timer = setTimeout(async () => { items = await search(q); sel = -1; showSugg(); }, 250);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); showSugg(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); showSugg(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[sel >= 0 ? sel : 0]); }
    else if (e.key === 'Escape') { sugg.hidden = true; }
  });

  /* ---- Ajout d'un emplacement ---- */
  let adding = false, hint = null;
  function setAdding(on) {
    adding = on; addBtn.classList.toggle('on', on); addBtn.textContent = on ? 'Annuler' : '+ Emplacement';
    map.getContainer().classList.toggle('ga-adding', on);
    if (on && !hint) { hint = document.createElement('div'); hint.className = 'ga-hint'; hint.textContent = 'Cliquez sur la carte à l’endroit de l’emplacement'; document.getElementById('map').appendChild(hint); }
    if (!on && hint) { hint.remove(); hint = null; }
  }
  addBtn.addEventListener('click', () => setAdding(!adding));

  function nearestZone(lat, lon) {
    let best = null;
    GA.ZONES.forEach(z => { const d = GA.entreprises.distanceM(lat, lon, z.lat, z.lon); if (!best || d < best.d) best = { z, d }; });
    return best;
  }
  function newForm(lat, lon, label) {
    const nz = nearestZone(lat, lon);
    const zoneTxt = nz && nz.d <= 1500 ? `Zone la plus proche : <b>${esc(nz.z.id)}</b> ${esc(nz.z.nom)} (${nz.d} m)` : 'Hors des 57 zones de l’étude';
    return `<form class="ga-pop" data-new><b>Nouvel emplacement</b>
      <div class="muted" data-addr>${label ? esc(label) : 'Recherche de l’adresse…'}</div>
      <input name="nom" placeholder="Nom de l’emplacement (ex. : parking face à…)" required>
      <div class="muted">${zoneTxt}</div>
      <button type="submit">Créer la fiche</button> <button type="button" class="sec" data-cancel>Annuler</button></form>`;
  }
  async function reverse(lat, lon) {
    try {
      const r = await fetch(`${GEO}/reverse?lat=${lat}&lon=${lon}&limit=1`);
      const f = ((await r.json()).features || [])[0];
      if (f && GA.entreprises.distanceM(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) < 150)
        return { adresse: f.properties.name || '', commune: f.properties.city || '', label: f.properties.label };
      // Loin de toute adresse (champ, bord de route) : on garde au moins la commune.
      const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] });
      const r2 = await fetch('https://apicarto.ign.fr/api/limites-administratives/commune?geom=' + encodeURIComponent(geom));
      const c = ((await r2.json()).features || [])[0];
      return c ? { adresse: '', commune: c.properties.nom_com, label: 'Sans adresse · ' + c.properties.nom_com } : null;
    } catch (e) { return null; }
  }
  function bindForm(marker, lat, lon) {
    let addr = null;
    const onOpen = async () => {
      const el = marker.getPopup().getElement(); if (!el) return;
      const form = el.querySelector('[data-new]'); if (!form || form.dataset.bound) return;
      form.dataset.bound = '1';
      form.querySelector('input').focus();
      form.querySelector('[data-cancel]').addEventListener('click', () => { map.removeLayer(marker); if (marker === found) found = null; });
      reverse(lat, lon).then(a => { addr = a; const t = form.querySelector('[data-addr]'); if (t) t.textContent = a ? a.label : 'Adresse non trouvée'; });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const nom = form.querySelector('input').value.trim();
        if (!nom) { form.querySelector('input').focus(); return; }
        const nz = nearestZone(lat, lon);
        const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Création…';
        const p = await GA.ui.run(() => GA.svc.createProspect({
          nom, lat, lon, zone_id: nz && nz.d <= 1500 ? nz.z.id : '',
          adresse: addr ? addr.adresse : '', commune: addr ? addr.commune : (nz && nz.d <= 1500 ? nz.z.com : ''),
        }), 'Fiche créée : ' + nom);
        if (p) {
          map.removeLayer(marker); if (marker === found) found = null; await GA.app.reload(); GA.app.openProspect(p.id);
          // Score calculé en arrière-plan (sans bloquer) ; visible ensuite dans la fiche et dans Opportunités.
          GA.scoreView.analyserFiche(p).then(async () => { await GA.app.reload({ keepPanel: true }); if (GA.panel.current() === p.id) GA.panel.open(p.id); }).catch(() => {});
        }
        else { btn.disabled = false; btn.textContent = 'Créer la fiche'; }
      });
    };
    marker.on('popupopen', onOpen);
    if (marker.isPopupOpen()) onOpen();
  }
  map.on('click', e => {
    if (!adding) return;
    setAdding(false);
    const { lat, lng } = e.latlng;
    const mk = L.marker([lat, lng], { draggable: false }).addTo(map);
    mk.bindPopup(newForm(lat, lng, ''), { closeOnClick: false }).openPopup();
    bindForm(mk, lat, lng);
  });

  /* ---- Calque des fiches CRM positionnées ---- */
  const layer = L.layerGroup().addTo(map);
  function pinIcon(color) {
    return L.divIcon({ className: '', html: `<div class="ga-pin" style="background:${color}"></div>`, iconSize: [16, 16], iconAnchor: [8, 18], popupAnchor: [0, -16] });
  }
  function refresh() {
    layer.clearLayers();
    (GA.store.prospects || []).filter(p => p.lat != null && p.lon != null).forEach(p => {
      const s = GA.ui.statut(p.statut);
      const mk = L.marker([p.lat, p.lon], { icon: pinIcon(s.color), title: p.nom }).addTo(layer);
      const f = p.analyse && GA.moteur ? GA.moteur.scoreFinal(p.analyse, p) : null;
      mk.bindPopup(`<div class="ga-pop"><b>${esc(p.nom)}</b><div class="muted">${esc(s.label)}${p.zone_id ? ' · zone ' + esc(p.zone_id) : ''}${p.commune ? ' · ' + esc(p.commune) : ''}</div>
        ${f ? `<div style="margin-top:4px">Score <b>${f.total}</b>/100 · priorité ${f.priorite}</div>` : ''}
        ${p.prochaine_action ? `<div style="margin-top:4px">${esc(p.prochaine_action)}</div>` : ''}<button type="button" data-open>Ouvrir la fiche</button>
        ${GA.perm.canDeleteProspect(GA.auth.current(), p) ? ' <button type="button" class="sec" data-del style="color:#c92a2a">Supprimer</button>' : ''}</div>`);
      mk.on('popupopen', () => {
        const el = mk.getPopup().getElement();
        const b = el.querySelector('[data-open]'); if (b) b.onclick = () => GA.app.openProspect(p.id);
        const d = el.querySelector('[data-del]'); if (d) d.onclick = async () => {
          if (!await GA.ui.confirmBox('Supprimer la fiche', `Supprimer « ${p.nom} » et son historique ? Cette action est définitive.`, 'Supprimer', true)) return;
          if (await GA.ui.run(() => GA.svc.deleteProspect(p.id).then(() => true), 'Fiche supprimée')) { map.closePopup(); await GA.app.reload(); }
        };
      });
    });
  }
  window.__gaFiches = { refresh, focus(p) { if (p.lat != null) { map.flyTo([p.lat, p.lon], 17, { duration: 0.6 }); } } };
  refresh();
})();
