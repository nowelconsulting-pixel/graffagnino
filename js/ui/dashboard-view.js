/* Onglet Tableau de bord : avancement par statut, par responsable et par zone, taux de transformation. */
window.GA = window.GA || {};

GA.dashboardView = (function () {
  const { $, $$, esc, avatar, zoneChip, run } = GA.ui;
  const CLOS = ['accord', 'refuse'];
  let exchanges = [];

  const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '—';
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  function counts(list) {
    const today = GA.svc.today();
    const accords = list.filter(p => p.statut === 'accord').length, refus = list.filter(p => p.statut === 'refuse').length;
    return {
      total: list.length, accords, refus, encours: list.length - accords - refus,
      retard: list.filter(p => !CLOS.includes(p.statut) && p.date_relance && p.date_relance < today).length,
      taux: pct(accords, accords + refus),
    };
  }

  function tile(label, value, sub, cls) {
    return `<div class="kpi ${cls || ''}"><div class="kpi-l">${label}</div><div class="kpi-v">${value}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;
  }

  function render() {
    const P = GA.store.prospects, c = counts(P);
    const since = daysAgo(30), ex30 = exchanges.filter(e => e.date >= since);
    $('#bord-sub').textContent = c.total + (c.total > 1 ? ' fiches' : ' fiche');

    const max = Math.max(1, ...GA.STATUTS.map(s => P.filter(p => p.statut === s.key).length));
    const statuts = GA.STATUTS.map(s => {
      const n = P.filter(p => p.statut === s.key).length;
      return `<button class="bar-row" data-statut="${s.key}" title="Voir ces fiches dans le CRM">
        <span class="bar-l">${esc(s.label)}</span>
        <span class="bar-t"><span class="bar" style="width:${n ? Math.max(2, 100 * n / max) : 0}%;background:${s.color}"></span></span>
        <span class="bar-n">${n}</span></button>`;
    }).join('');

    const users = GA.store.users.filter(u => u.actif || P.some(p => p.responsable_id === u.id));
    const rows = [...users.map(u => ({ u, list: P.filter(p => p.responsable_id === u.id), ex: ex30.filter(e => e.auteur_id === u.id).length })),
      { u: null, list: P.filter(p => !p.responsable_id), ex: null }].filter(r => r.u || r.list.length);
    const resp = rows.map(({ u, list, ex }) => { const k = counts(list); return `<tr>
      <td class="t-user">${avatar(u)} ${u ? esc(u.nom) : '<span class="muted">Non attribuées</span>'}</td>
      <td>${k.total}</td><td>${k.encours}</td><td>${k.accords}</td><td>${k.refus}</td><td>${k.taux}</td>
      <td class="${k.retard ? 'late' : ''}">${k.retard}</td><td>${ex == null ? '' : ex}</td></tr>`; }).join('');

    const zones = {};
    P.forEach(p => { if (p.zone_id) (zones[p.zone_id] = zones[p.zone_id] || []).push(p); });
    const order = s => GA.STATUTS.findIndex(x => x.key === s);
    const zrows = Object.entries(zones).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([id, list]) => {
      const z = GA.svc.zone(id), k = counts(list);
      const best = list.filter(p => p.statut !== 'refuse').sort((a, b) => order(b.statut) - order(a.statut))[0];
      return `<tr data-zone="${esc(id)}" tabindex="0"><td>${zoneChip(id)}</td><td>${z ? esc(z.nom) : ''}</td><td class="muted">${z ? esc(z.com) : ''}</td>
        <td>${k.total}</td><td>${k.encours}</td><td>${k.accords}</td><td>${best ? GA.ui.statutPill(best.statut) : '<span class="muted">—</span>'}</td></tr>`;
    }).join('');
    const sansZone = P.filter(p => !p.zone_id).length;
    const couvertes = Object.keys(zones).length, conformes = GA.ZONES.filter(z => z.conf).length;

    $('#bord-body').innerHTML = `
      <div class="kpis">
        ${tile('Fiches', c.total, `${c.encours} en cours`)}
        ${tile('Accords obtenus', c.accords, `${c.refus} refus / abandons`, 'ok')}
        ${tile('Taux de transformation', c.taux, 'accords / dossiers clos')}
        ${tile('Relances en retard', c.retard, '<a href="#relances">Voir les relances</a>', c.retard ? 'warn' : '')}
        ${tile('Échanges sur 30 jours', ex30.length, ex30.length ? GA.TYPES_ECHANGE.map(t => [t, ex30.filter(e => e.type === t.key).length]).filter(x => x[1]).map(([t, n]) => n + ' ' + t.label.toLowerCase()).join(' · ') : '')}
        ${tile('Zones travaillées', couvertes, `sur ${GA.ZONES.length} (dont ${conformes} conformes)`)}
      </div>
      <div class="bord-grid">
        <section class="card"><h2>Par statut</h2><div class="bars">${statuts}</div></section>
        <section class="card"><h2>Par responsable</h2>
          <div class="table-wrap"><table class="crm-table stat-table"><thead><tr><th>Responsable</th><th>Fiches</th><th>En cours</th><th>Accords</th><th>Refus</th><th>Transfo.</th><th>En retard</th><th>Échanges 30 j</th></tr></thead>
          <tbody>${resp || '<tr><td colspan="8" class="muted">Aucune fiche.</td></tr>'}</tbody></table></div></section>
      </div>
      <section class="card"><h2>Par zone <span class="muted small">${couvertes} zone(s) avec au moins une fiche${sansZone ? ` · ${sansZone} fiche(s) sans zone` : ''}</span></h2>
        <div class="table-wrap"><table class="crm-table stat-table zone-table"><thead><tr><th>Zone</th><th>Nom</th><th>Commune</th><th>Fiches</th><th>En cours</th><th>Accords</th><th>Statut le plus avancé</th></tr></thead>
        <tbody>${zrows || '<tr><td colspan="7" class="muted">Aucune fiche rattachée à une zone.</td></tr>'}</tbody></table></div></section>
      <p class="hint">Taux de transformation : accords obtenus divisés par les dossiers clos (accords + refus / abandons).</p>`;

    $$('#bord-body [data-statut]').forEach(b => b.addEventListener('click', () => { GA.crmView.setFilters({ statut: b.dataset.statut }); GA.app.go('crm'); }));
    $$('#bord-body tr[data-zone]').forEach(r => {
      const go = () => { GA.crmView.setZoneFilter(r.dataset.zone); GA.app.go('crm'); };
      r.addEventListener('click', go); r.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
  }

  async function load() {
    try { exchanges = await GA.svc.listExchanges(); } catch (e) { exchanges = []; }
    render();
  }

  async function exportExcel(e) {
    const b = e && e.currentTarget; if (b) b.disabled = true;
    const n = await run(() => GA.exportCrm());
    if (n != null) GA.ui.toast('Export Excel : ' + n + ' fiche(s)');
    if (b) b.disabled = false;
  }

  return {
    init() { $('#bord-export').addEventListener('click', exportExcel); },
    render() { render(); load(); },
    exportExcel,
  };
})();
