/* Fenêtre « Entreprises de la zone » : établissements autour d'une zone de la carte,
   avec SIREN, activité, dirigeant, et création d'une fiche CRM pré-remplie.
   La carte n'est pas modifiée : la recherche part des coordonnées de js/data/zones.js. */
window.GA = window.GA || {};

GA.entreprisesView = (function () {
  const { $, $$, esc, run, modal } = GA.ui;
  const RAYONS = [[0.2, '200 m'], [0.5, '500 m'], [1, '1 km'], [2, '2 km']];
  let rayon = 0.5;

  const fmtSiren = s => String(s).replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');
  const fmtDist = m => m == null ? '' : m < 1000 ? m + ' m' : (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km';

  function prospectFor(row) {
    if (!row.siret && !row.siren) return null;
    return GA.store.prospects.find(p => (p.notes || '').includes(row.siret ? 'SIRET ' + row.siret : 'SIREN ' + row.siren)) || null;
  }

  function rowHtml(row, i, canCreate) {
    const p = prospectFor(row);
    const sec = GA.NAF_SECTIONS[row.section];
    const badges = [
      row.siege ? '<span class="tag">Siège</span>' : '',
      row.actif ? '' : '<span class="tag out">Fermé</span>',
      p ? '<span class="tag ok">Dans le CRM</span>' : '',
    ].join(' ');
    const l2 = [row.enseigne && row.raison_sociale ? esc(row.raison_sociale) : '', 'SIREN <b class="mono">' + esc(fmtSiren(row.siren)) + '</b>',
      row.naf ? esc(row.naf) + (sec ? ' — ' + esc(sec) : '') : ''].filter(Boolean).join(' · ');
    const l3 = [esc(row.adresse), GA.TRANCHES_EFFECTIF[row.effectif] ? esc(GA.TRANCHES_EFFECTIF[row.effectif]) : '',
      row.dirigeant && row.dirigeant.nom ? 'Dirigeant : ' + esc(row.dirigeant.nom) + (row.dirigeant.qualite ? ' (' + esc(row.dirigeant.qualite) + ')' : '') : ''].filter(Boolean).join(' · ');
    const action = p ? `<button class="btn" data-open="${esc(p.id)}">Ouvrir la fiche</button>`
      : canCreate ? `<button class="btn" data-add="${i}">+ Fiche</button>` : '';
    return `<div class="ent-row ${row.actif ? '' : 'closed'}">
      <div class="ent-main"><div class="ent-t"><b>${esc(row.enseigne || row.raison_sociale || '(sans nom)')}</b> ${badges}</div>
        <div class="ent-s">${l2}</div><div class="ent-s muted">${l3}</div></div>
      <div class="ent-d">${fmtDist(row.distance)}</div>
      <div class="ent-a"><a class="btn ghost" href="${esc(GA.entreprises.ficheUrl(row))}" target="_blank" rel="noopener noreferrer" title="Fiche officielle sur l’Annuaire des entreprises">Annuaire ↗</a>${action}</div>
    </div>`;
  }

  function open(zoneId) {
    const zone = GA.svc.zone(zoneId);
    if (!zone) { GA.ui.toast('Zone inconnue.', 'err'); return; }
    const canCreate = GA.perm.canCreateProspect(GA.auth.current());
    const st = { section: '', q: '', closed: false, rows: [], loading: false, error: '', total: 0, page: 0, pages: 0, truncated: false };
    let ctrl = null;

    const m = modal('Entreprises de la zone ' + zone.id, `
      <div class="ent-zone"><b>${esc(zone.id)} · ${esc(zone.nom)}</b> <span class="muted">${esc(zone.com)}</span></div>
      <div class="ent-tools">
        <select id="ent-r" aria-label="Rayon">${RAYONS.map(([v, l]) => `<option value="${v}" ${v === rayon ? 'selected' : ''}>Rayon ${l}</option>`).join('')}</select>
        <select id="ent-sec" aria-label="Activité"><option value="">Toutes les activités</option>${Object.entries(GA.NAF_SECTIONS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <div class="search"><span aria-hidden="true">⌕</span><input id="ent-q" type="search" placeholder="Filtrer : nom, SIREN, adresse, dirigeant…"></div>
        <label class="chk"><input type="checkbox" id="ent-closed"> Afficher les fermés</label>
      </div>
      <div class="ent-status" id="ent-status" aria-live="polite"></div>
      <div class="ent-list" id="ent-list"></div>
      <p class="hint ent-src">Source : Annuaire des entreprises (INSEE, registre national des entreprises), données publiques.
        Distances à vol d’oiseau depuis le point de la zone. Les établissements non géolocalisés n’apparaissent pas.</p>`, { cls: 'xl' });

    const visibleRows = () => {
      const q = st.q.toLowerCase().replace(/\s+/g, ' ').trim(), qd = q.replace(/\s/g, '');
      return st.rows.map((r, i) => [r, i]).filter(([r]) => {
        if (!st.closed && !r.actif) return false;
        if (!q) return true;
        if (qd && /^\d+$/.test(qd) && (r.siren.includes(qd) || r.siret.includes(qd))) return true;
        return [r.enseigne, r.raison_sociale, r.adresse, r.naf, r.dirigeant && r.dirigeant.nom].join(' ').toLowerCase().includes(q);
      });
    };

    function renderList() {
      if (!m.el.isConnected) return;
      const rows = visibleRows();
      const fermes = st.rows.filter(r => !r.actif).length;
      let s;
      if (st.error) s = `<span class="danger-t">${esc(st.error)}</span> <button class="link" id="ent-retry">Réessayer</button>`;
      else if (st.loading) s = `Chargement… ${st.page}/${st.pages || '?'} · ${st.rows.length} établissement(s) trouvés`;
      else s = `<b>${rows.length}</b> établissement(s) affiché(s) sur ${st.rows.length}` +
        (fermes && !st.closed ? ` · ${fermes} fermé(s) masqué(s)` : '') +
        (st.truncated ? ` · <span class="danger-t">résultats limités à 500 entreprises : réduisez le rayon ou filtrez par activité</span>` : '');
      $('#ent-status', m.el).innerHTML = s;
      const retry = $('#ent-retry', m.el); if (retry) retry.addEventListener('click', load);
      const list = $('#ent-list', m.el);
      list.innerHTML = rows.length ? rows.map(([r, i]) => rowHtml(r, i, canCreate)).join('')
        : (st.loading ? '' : `<div class="empty"><p>${st.rows.length ? 'Aucun établissement ne correspond au filtre.' : 'Aucun établissement trouvé dans ce rayon.'}</p></div>`);
      $$('[data-add]', list).forEach(b => b.addEventListener('click', () => add(st.rows[+b.dataset.add], b)));
      $$('[data-open]', list).forEach(b => b.addEventListener('click', () => { m.close(); GA.app.openProspect(b.dataset.open); }));
    }

    async function add(row, btn) {
      btn.disabled = true;
      const p = await run(() => GA.svc.createProspect(GA.entreprises.toProspect(row, zone)), 'Fiche créée : ' + (row.enseigne || row.raison_sociale));
      if (p) await GA.app.reload({ keepPanel: true });
      renderList();
    }

    async function load() {
      if (ctrl) ctrl.abort();
      const mine = ctrl = new AbortController();
      Object.assign(st, { rows: [], loading: true, error: '', page: 0, pages: 0, truncated: false });
      renderList();
      try {
        const r = await GA.entreprises.near(zone, {
          radiusKm: rayon, section: st.section, signal: mine.signal,
          onProgress: pr => {
            if (mine !== ctrl) return;
            if (!m.el.isConnected) { mine.abort(); return; }
            Object.assign(st, { rows: pr.rows.slice().sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9)), page: pr.page, pages: pr.totalPages, total: pr.total });
            renderList();
          },
        });
        if (mine !== ctrl) return;
        st.truncated = r.truncated;
      } catch (e) {
        if (mine.signal.aborted) return;
        st.error = e.message || String(e);
      }
      if (mine !== ctrl) return;
      st.loading = false;
      renderList();
    }

    $('#ent-r', m.el).addEventListener('change', e => { rayon = +e.target.value; load(); });
    $('#ent-sec', m.el).addEventListener('change', e => { st.section = e.target.value; load(); });
    $('#ent-q', m.el).addEventListener('input', e => { st.q = e.target.value; renderList(); });
    $('#ent-closed', m.el).addEventListener('change', e => { st.closed = e.target.checked; renderList(); });
    $('#ent-q', m.el).focus();
    load();
  }

  return { open };
})();
