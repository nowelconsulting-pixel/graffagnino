/* Visite terrain (pensée pour le téléphone) : position GPS, fiche la plus proche, compte rendu,
   photos prises sur place, statut et prochaine relance — en un seul écran. */
window.GA = window.GA || {};

GA.visiteView = (function () {
  const { $, $$, esc, run, modal, km } = GA.ui;
  const NEW = '__new';

  const localDay = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const plusJours = n => { const d = new Date(); d.setDate(d.getDate() + n); return localDay(d); };

  function open(prospectId) {
    const me = GA.auth.current();
    const editables = GA.store.prospects.filter(p => GA.perm.canEditProspect(me, p) && !['refuse'].includes(p.statut));
    let pos = null, photos = [];

    const m = modal('Visite terrain', `
      <form id="vt-form" novalidate class="vt">
        <div class="vt-gps" id="vt-gps"><span class="dot"></span> Recherche de votre position…</div>
        <label class="fld"><span>Fiche</span><select id="vt-fiche"></select></label>
        <div id="vt-new" hidden>
          <label class="fld"><span>Nom de l’emplacement *</span><input id="vt-nom" placeholder="Ex. : parking du supermarché, entrée nord"></label>
          <label class="fld"><span>Zone de la carte</span><select id="vt-zone">${GA.ui.zoneOptions('')}</select></label>
        </div>
        <label class="fld"><span>Compte rendu *</span><textarea id="vt-text" rows="4" class="notes" placeholder="Emplacement, passage, interlocuteur rencontré, contraintes…"></textarea></label>
        <div class="vt-photos" id="vt-photos"></div>
        <label class="btn block vt-cam"><input type="file" id="vt-file" accept="image/*" capture="environment" multiple hidden>📷 Prendre une photo</label>
        <div class="two">
          <label class="fld"><span>Statut</span><select id="vt-statut">${GA.STATUTS.map(s => `<option value="${s.key}">${esc(s.label)}</option>`).join('')}</select></label>
          <label class="fld"><span>Prochaine relance</span><input id="vt-date" type="date" value="${plusJours(7)}"></label>
        </div>
        <label class="fld"><span>Prochaine action</span><input id="vt-next" placeholder="Ex. : envoyer la proposition au gérant"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" type="submit" id="vt-save">Enregistrer la visite</button></div>
      </form>`, { cls: 'vt-modal' });

    const sel = $('#vt-fiche', m.el);
    function distanceTo(p) {
      const z = GA.svc.zone(p.zone_id);
      return pos && z ? GA.entreprises.distanceM(pos.lat, pos.lon, z.lat, z.lon) : null;
    }
    function nearestZone() {
      if (!pos) return '';
      return GA.ZONES.map(z => [z, GA.entreprises.distanceM(pos.lat, pos.lon, z.lat, z.lon)]).sort((a, b) => a[1] - b[1])[0][0].id;
    }
    function fillFiches() {
      const cur = sel.value || prospectId || '';
      const list = editables.map(p => ({ p, d: distanceTo(p) }))
        .sort((a, b) => (a.d ?? 1e12) - (b.d ?? 1e12) || a.p.nom.localeCompare(b.p.nom));
      sel.innerHTML = `<option value="">— Choisir la fiche —</option><option value="${NEW}">+ Nouvelle fiche</option>` +
        list.map(({ p, d }) => `<option value="${esc(p.id)}">${esc(p.nom)}${p.zone_id ? ' · ' + esc(p.zone_id) : ''}${d != null ? ' · ' + (d < 1000 ? d + ' m' : km(Math.round(d / 100) / 10)) : ''}</option>`).join('');
      if (cur) sel.value = cur;
      else if (list.length && list[0].d != null && list[0].d < 400) sel.value = list[0].p.id;   // fiche à moins de 400 m : présélectionnée
      onFiche();
    }
    function onFiche() {
      const isNew = sel.value === NEW;
      $('#vt-new', m.el).hidden = !isNew;
      if (isNew && !$('#vt-zone', m.el).value) $('#vt-zone', m.el).value = nearestZone();
      const p = GA.store.prospects.find(x => x.id === sel.value);
      $('#vt-statut', m.el).value = p ? p.statut : 'a_prospecter';
      if (p && !$('#vt-next', m.el).dataset.touched) $('#vt-next', m.el).value = '';
    }
    sel.addEventListener('change', onFiche);
    $('#vt-next', m.el).addEventListener('input', e => { e.target.dataset.touched = '1'; });

    // Position GPS (le navigateur demande l'autorisation la première fois).
    const gps = $('#vt-gps', m.el);
    if (!navigator.geolocation) gps.innerHTML = '<span class="dot off"></span> Localisation non disponible sur cet appareil.';
    else navigator.geolocation.getCurrentPosition(r => {
      pos = { lat: r.coords.latitude, lon: r.coords.longitude, acc: r.coords.accuracy };
      const z = GA.svc.zone(nearestZone()), dz = z ? GA.entreprises.distanceM(pos.lat, pos.lon, z.lat, z.lon) : null;
      gps.innerHTML = `<span class="dot on"></span> Position enregistrée (± ${Math.round(pos.acc)} m)${z ? ` · zone la plus proche : <b>${esc(z.id)}</b> ${esc(z.nom)} (${dz < 1000 ? dz + ' m' : km(Math.round(dz / 100) / 10)})` : ''}`;
      if (m.el.isConnected) fillFiches();
    }, err => {
      gps.innerHTML = `<span class="dot off"></span> Position non disponible${err.code === 1 ? ' : autorisez la localisation pour ce site' : ''}. La visite sera enregistrée sans position.`;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    fillFiches();

    // Photos : aperçu avant envoi.
    function renderPhotos() {
      const box = $('#vt-photos', m.el);
      box.innerHTML = photos.map((f, i) => `<figure><img src="${f.url}" alt=""><button type="button" class="icon-btn" data-rm="${i}" aria-label="Retirer la photo">✕</button></figure>`).join('');
      $$('[data-rm]', box).forEach(b => b.addEventListener('click', () => { URL.revokeObjectURL(photos[+b.dataset.rm].url); photos.splice(+b.dataset.rm, 1); renderPhotos(); }));
    }
    $('#vt-file', m.el).addEventListener('change', e => {
      Array.from(e.target.files || []).forEach(f => photos.push({ file: f, url: URL.createObjectURL(f) }));
      e.target.value = ''; renderPhotos();
    });

    $('#vt-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#vt-save', m.el);
      const texte = $('#vt-text', m.el).value.trim();
      if (!sel.value) { GA.ui.toast('Choisissez la fiche visitée.', 'err'); return; }
      if (!texte) { GA.ui.toast('Ajoutez un compte rendu.', 'err'); return; }
      btn.disabled = true; btn.textContent = photos.length ? 'Envoi des photos…' : 'Enregistrement…';
      const ok = await run(async () => {
        let id = sel.value;
        if (id === NEW) {
          const zid = $('#vt-zone', m.el).value, z = GA.svc.zone(zid);
          const p = await GA.svc.createProspect({ nom: $('#vt-nom', m.el).value, zone_id: zid, commune: z ? z.com : '', ...(pos && pos.acc < 150 ? { lat: pos.lat, lon: pos.lon } : {}) });
          id = p.id;
        }
        const ex = await GA.svc.addExchange(id, { type: 'visite', date: GA.svc.today(), commentaire: texte, lat: pos && pos.lat, lon: pos && pos.lon, precision_m: pos && pos.acc });
        if (photos.length) await GA.svc.addDocuments(id, photos.map(x => x.file), { categorie: 'photo', exchangeId: ex.id });
        const cur = GA.store.prospects.find(x => x.id === id);
        const posPatch = pos && pos.acc < 150 && cur && cur.lat == null ? { lat: pos.lat, lon: pos.lon } : {};
        await GA.svc.updateProspect(id, { statut: $('#vt-statut', m.el).value, prochaine_action: $('#vt-next', m.el).value, date_relance: $('#vt-date', m.el).value, ...posPatch });
        return id;
      }, 'Visite enregistrée');
      if (ok) {
        photos.forEach(x => URL.revokeObjectURL(x.url));
        m.close(); await GA.app.reload();
        if (GA.panel.current() === ok) GA.panel.open(ok);
      } else { btn.disabled = false; btn.textContent = 'Enregistrer la visite'; }
    });
  }

  return { open };
})();
