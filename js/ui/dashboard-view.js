/* Tableau de bord (cockpit) : où en est l'objectif, que faire aujourd'hui, où concentrer l'effort.
   Aucune probabilité de signature : on montre des faits (étapes, intérêt, blocages, dates) et le potentiel géographique séparément. */
window.GA = window.GA || {};

GA.dashboardView = (function () {
  const { $, $$, esc, avatar, zoneChip, run, fmtDate } = GA.ui;
  let exchanges = [];

  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const joursAvant = iso => iso ? Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000) : null;
  const gagne = p => p.statut === 'signe' || p.statut === 'installe';
  const plur = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);

  function tile(label, value, sub, cls, act) {
    return `<${act ? 'button' : 'div'} class="kpi ${cls || ''}${act ? ' kpi-btn' : ''}" ${act || ''}><div class="kpi-l">${label}</div><div class="kpi-v">${value}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</${act ? 'button' : 'div'}>`;
  }

  // 1. L'objectif commercial (la date cible est un repère, la prospection continue après).
  function objectifsHtml(P) {
    const obs = (GA.store.objectifs || []).filter(o => o.statut === 'actif' || o.statut === 'atteint');
    if (!obs.length) return `<section class="card"><h2>Objectif commercial</h2><p class="muted">Aucun objectif actif. ${GA.perm.isAdmin(GA.auth.current()) ? '<a href="#admin">Définir un objectif</a>' : ''}</p></section>`;
    return obs.map(o => {
      const list = P.filter(p => p.objectif_id === o.id);
      const signes = list.filter(gagne).length, installes = list.filter(p => p.statut === 'installe').length;
      const cible = Math.max(1, o.cible || 1), pct = Math.min(100, Math.round(100 * signes / cible));
      const proches = list.filter(p => ['negociation', 'accord'].includes(p.statut));
      const avances = list.filter(p => GA.pipe.estOuvert(p) && GA.pipe.avancement(p).avance);
      const j = joursAvant(o.date_cible);
      const sect = (GA.store.secteurs || []).find(s => s.id === o.secteur_id);
      const echeance = o.date_cible ? (j >= 0 ? `repère au ${fmtDate(o.date_cible)} · ${plur(j, 'jour')}` : `repère du ${fmtDate(o.date_cible)} dépassé`) : 'sans date repère';
      return `<section class="card obj-card"><h2>${esc(o.nom)} ${sect ? `<span class="muted small">· ${esc(sect.nom)}</span>` : ''}
          ${o.statut === 'atteint' || signes >= cible ? '<span class="tag ok">atteint</span>' : ''}</h2>
        <div class="obj-row"><div class="obj-big"><b>${signes}</b><span>/ ${cible} signé${cible > 1 ? 's' : ''}</span></div>
          <div class="obj-bar"><span style="width:${pct}%"></span></div>
          <div class="muted small">${plur(installes, 'installé')} · ${echeance}</div></div>
        <div class="obj-facts">
          <button class="link" data-goto='${JSON.stringify({ vue: 'ouverts' })}'>${plur(proches.length, 'dossier')} en négociation ou accord</button>
          <span>·</span><span>${plur(avances.length, 'dossier avancé', 'dossiers avancés')} (intérêt exprimé, décideur, non bloqué)</span>
        </div>
        ${proches.length ? `<ul class="obj-list">${proches.sort((a, b) => GA.pipe.rangSignature(b) - GA.pipe.rangSignature(a)).slice(0, 4).map(ligne).join('')}</ul>` : ''}
        <p class="hint">La date repère sert à se fixer un rythme ; la prospection continue au-delà.</p></section>`;
    }).join('');
  }

  function ligne(p) {
    const pr = GA.pipe.principal(p), pot = GA.pipe.potentiel(p);
    const int = pr ? GA.INTERETS.find(i => i.key === pr.interet) : null;
    return `<li><button class="link" data-open="${esc(p.id)}">${esc(p.nom)}</button> ${GA.ui.statutPill(p.statut)}
      ${pot ? `<span class="muted small">${pot.total}/100</span>` : ''} ${int ? `<span class="pill" style="--c:${int.color}">${esc(int.label)}</span>` : ''}
      ${p.bloque ? '<span class="tag warn">bloqué</span>' : ''}
      <span class="muted small">${p.prochaine_action ? '→ ' + esc(p.prochaine_action) : '<span class="danger-t">sans prochaine action</span>'}${p.date_relance ? ' · ' + fmtDate(p.date_relance) : ''}</span></li>`;
  }

  // 2. Aujourd'hui.
  function aujourdhuiHtml(P) {
    const me = GA.auth.current(), today = GA.svc.today();
    const mine = P.filter(p => p.responsable_id === me.id);
    const ouverts = P.filter(GA.pipe.estOuvert);
    const n = f => ouverts.filter(f).length, nm = f => mine.filter(f).length;
    const auj = p => GA.pipe.estOuvert(p) && !p.bloque && p.date_relance === today;
    const vide = p => GA.pipe.estOuvert(p) && !GA.pipe.contactsDe(p).length && GA.pipe.ordre(p.statut) >= 2;
    const go = (o) => `data-goto='${JSON.stringify(o)}'`;
    return `<div class="kpis">
      ${tile('Relances en retard', n(GA.pipe.enRetard), `dont ${nm(GA.pipe.enRetard)} pour vous`, n(GA.pipe.enRetard) ? 'warn' : '', 'data-route="relances"')}
      ${tile('À faire aujourd’hui', n(auj), `dont ${nm(auj)} pour vous`, '', 'data-route="relances"')}
      ${tile('Blocages à réexaminer', n(GA.pipe.aReexaminer), 'date de réexamen atteinte', n(GA.pipe.aReexaminer) ? 'warn' : '', 'data-route="relances"')}
      ${tile('Sans prochaine action', n(GA.pipe.sansAction), 'dossiers en cours', n(GA.pipe.sansAction) ? 'warn' : '', go({ vue: 'ouverts', etat: 'sans_action' }))}
      ${tile('Immobiles', n(GA.pipe.immobile), `rien depuis ${GA.pipe.seuils().immobile_jours} jours`, '', go({ vue: 'ouverts', etat: 'immobile' }))}
      ${tile('Sans interlocuteur', n(vide), 'qualifiés sans contact', '', go({ vue: 'ouverts', etat: 'sans_contact' }))}
    </div>`;
  }

  // 3. Matrice potentiel × avancement.
  function matriceHtml(P) {
    const ouverts = P.filter(p => GA.pipe.categorie(p));
    const by = k => ouverts.filter(p => GA.pipe.categorie(p) === k).sort((a, b) => GA.pipe.rangSignature(b) - GA.pipe.rangSignature(a));
    const cell = k => { const c = GA.pipe.CATEGORIES[k], l = by(k); return `<div class="mx-cell" style="--c:${c.color}">
      <button class="mx-h" data-goto='${JSON.stringify({ vue: 'ouverts', cat: k })}'><b>${l.length}</b> ${esc(c.label)}</button>
      <div class="muted small">${esc(c.aide)}</div>
      <ul>${l.slice(0, 3).map(p => `<li><button class="link" data-open="${esc(p.id)}">${esc(p.nom)}</button> <span class="muted small">${esc(GA.pipe.etape(p.statut).court || GA.pipe.etape(p.statut).label)}</span></li>`).join('')}${l.length > 3 ? `<li class="muted small">et ${l.length - 3} autre(s)</li>` : ''}</ul></div>`; };
    const s = GA.pipe.seuils().potentiel_eleve;
    return `<section class="card"><h2>Où concentrer l’effort <span class="muted small">potentiel de l’emplacement × avancement du dossier</span></h2>
      <div class="matrice"><div class="mx-axe-y"><span>Potentiel ≥ ${s}</span><span>Potentiel &lt; ${s}</span></div>
        <div class="mx-grid">${cell('debloquer')}${cell('signer')}${cell('reserve')}${cell('saisir')}</div>
        <div class="mx-axe-x"><span>Dossier peu avancé</span><span>Dossier avancé</span></div></div>
      <p class="hint">Deux mesures indépendantes, jamais additionnées. « Avancé » : en discussion ou au-delà, contact principal intéressé, avec pouvoir de décision, sans blocage. Seuil de potentiel réglable en administration.</p></section>`;
  }

  function entonnoirHtml(P) {
    const etapes = GA.STATUTS.filter(s => s.key !== 'abandonne');
    const max = Math.max(1, ...etapes.map(s => P.filter(p => p.statut === s.key).length));
    const bars = etapes.map(s => { const n = P.filter(p => p.statut === s.key).length; return `<button class="bar-row" data-goto='${JSON.stringify({ statut: s.key })}' title="Voir ces dossiers">
      <span class="bar-l">${esc(s.label)}</span><span class="bar-t"><span class="bar" style="width:${n ? Math.max(2, 100 * n / max) : 0}%;background:${s.color}"></span></span><span class="bar-n">${n}</span></button>`; }).join('');
    const ab = P.filter(p => p.statut === 'abandonne');
    const motifs = GA.MOTIFS_ABANDON.map(m => [m, ab.filter(p => p.motif_abandon === m.key).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    return `<section class="card"><h2>Pipeline par étape</h2><div class="bars">${bars}</div>
      <div class="muted small" style="margin-top:10px"><button class="link" data-goto='${JSON.stringify({ statut: 'abandonne' })}'>${plur(ab.length, 'abandon')}</button>${motifs.length ? ' · ' + motifs.map(([m, n]) => esc(m.label.toLowerCase()) + ' : ' + n).join(' · ') : ''}</div></section>`;
  }

  function responsablesHtml(P, ex30) {
    const users = GA.store.users.filter(u => u.actif || P.some(p => p.responsable_id === u.id));
    const rows = [...users.map(u => ({ u, list: P.filter(p => p.responsable_id === u.id), ex: ex30.filter(e => e.auteur_id === u.id).length })),
      { u: null, list: P.filter(p => !p.responsable_id), ex: null }].filter(r => r.u || r.list.length);
    const body = rows.map(({ u, list, ex }) => { const o = list.filter(GA.pipe.estOuvert); const r = o.filter(GA.pipe.enRetard).length, sa = o.filter(GA.pipe.sansAction).length; return `<tr>
      <td class="t-user">${avatar(u)} ${u ? esc(u.nom) : '<span class="muted">Non attribués</span>'}</td>
      <td>${o.length}</td><td>${o.filter(p => GA.pipe.avancement(p).avance).length}</td><td>${list.filter(gagne).length}</td>
      <td class="${r ? 'late' : ''}">${r}</td><td class="${sa ? 'late' : ''}">${sa}</td><td>${ex == null ? '' : ex}</td></tr>`; }).join('');
    return `<section class="card"><h2>Par responsable</h2><div class="table-wrap"><table class="crm-table stat-table"><thead><tr><th>Responsable</th><th>En cours</th><th>Avancés</th><th>Signés</th><th>En retard</th><th>Sans action</th><th>Échanges 30 j</th></tr></thead>
      <tbody>${body || '<tr><td colspan="7" class="muted">Aucun dossier.</td></tr>'}</tbody></table></div></section>`;
  }

  function zonesHtml(P) {
    const zones = {};
    P.forEach(p => { if (p.zone_id) (zones[p.zone_id] = zones[p.zone_id] || []).push(p); });
    const rows = Object.entries(zones).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([id, list]) => {
      const z = GA.svc.zone(id);
      const best = list.filter(p => p.statut !== 'abandonne').sort((a, b) => GA.pipe.ordre(b.statut) - GA.pipe.ordre(a.statut))[0];
      const zs = GA.store.zonesV2 && GA.store.zonesV2[id];
      return `<tr data-zone="${esc(id)}" tabindex="0"><td>${zoneChip(id)}</td><td>${z ? esc(z.nom) : ''}</td><td class="muted">${z ? esc(z.com) : ''}</td>
        <td>${zs ? zs.score : '—'}</td><td>${list.length}</td><td>${list.filter(GA.pipe.estOuvert).length}</td><td>${best ? GA.ui.statutPill(best.statut) : '<span class="muted">—</span>'}</td></tr>`;
    }).join('');
    return `<section class="card"><h2>Par zone de la carte <span class="muted small">${Object.keys(zones).length} zone(s) travaillée(s) sur ${GA.ZONES.length}</span></h2>
      <div class="table-wrap"><table class="crm-table stat-table zone-table"><thead><tr><th>Zone</th><th>Nom</th><th>Commune</th><th>Score v2</th><th>Dossiers</th><th>En cours</th><th>Le plus avancé</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted">Aucun dossier rattaché à une zone.</td></tr>'}</tbody></table></div></section>`;
  }

  function reseauHtml() {
    const s = GA.store.sites || [];
    const dist = s.filter(x => x.type === 'distributeur'), labos = s.filter(x => x.type === 'laboratoire');
    return `<section class="card"><h2>Réseau</h2><p class="small">${plur(dist.filter(x => x.statut === 'en_service').length, 'distributeur')} en service
      ${dist.some(x => x.statut === 'hypothetique') ? ' · ' + plur(dist.filter(x => x.statut === 'hypothetique').length, 'projet') + ' testé(s)' : ''} · ${plur(labos.length, 'laboratoire')}</p>
      <ul class="obj-list">${dist.filter(x => x.statut !== 'retire').map(x => `<li>${esc(x.nom)} <span class="muted small">${esc(x.commune || '')}${x.date_installation ? ' · installé le ' + fmtDate(x.date_installation) : ''} · ${esc(x.statut.replace('_', ' '))}</span></li>`).join('')}</ul>
      <p class="hint">Chaque distributeur en service applique un malus de proximité aux emplacements voisins (cannibalisation).</p></section>`;
  }

  function render() {
    const P = GA.store.prospects;
    const since = daysAgo(30), ex30 = exchanges.filter(e => e.date >= since);
    const ouverts = P.filter(GA.pipe.estOuvert).length;
    $('#bord-sub').textContent = `${plur(ouverts, 'dossier')} en cours · ${plur(ex30.length, 'échange')} sur 30 jours`;
    $('#bord-body').innerHTML = `
      <div class="bord-grid">${objectifsHtml(P)}${reseauHtml()}</div>
      <h2 class="bord-q">Aujourd’hui</h2>${aujourdhuiHtml(P)}
      ${matriceHtml(P)}
      <div class="bord-grid">${entonnoirHtml(P)}${responsablesHtml(P, ex30)}</div>
      ${zonesHtml(P)}`;

    $$('#bord-body [data-goto]').forEach(b => b.addEventListener('click', () => { GA.crmView.setFilters(JSON.parse(b.dataset.goto)); GA.app.go('crm'); }));
    $$('#bord-body [data-route]').forEach(b => b.addEventListener('click', () => GA.app.go(b.dataset.route)));
    $$('#bord-body [data-open]').forEach(b => b.addEventListener('click', () => GA.app.openProspect(b.dataset.open)));
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
