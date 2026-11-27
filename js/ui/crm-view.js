/* Onglet CRM : vue tableau, vue Kanban, recherche, filtres, création rapide. */
window.GA = window.GA || {};

GA.crmView = (function () {
  const { $, $$, esc, fmtDate, statutPill, avatar, zoneChip, overdue, run, modal, zoneOptions } = GA.ui;
  const st = { q: '', statut: '', resp: '', zone: '', mode: 'table', sort: 'updated_at', dir: -1 };
  try { const m = localStorage.getItem('ga.crm.mode'); if (m) st.mode = m; } catch (e) {}
  let visible = [];

  const users = () => GA.store.users;
  const userById = id => users().find(u => u.id === id);

  function filtered() {
    const me = GA.auth.current();
    const q = st.q.toLowerCase();
    let list = GA.store.prospects.filter(p => {
      if (st.statut && p.statut !== st.statut) return false;
      if (st.resp === '__me' && p.responsable_id !== me.id) return false;
      if (st.resp === '__none' && p.responsable_id) return false;
      if (st.resp && !st.resp.startsWith('__') && p.responsable_id !== st.resp) return false;
      if (st.zone && p.zone_id !== st.zone) return false;
      if (q) {
        const z = GA.svc.zone(p.zone_id);
        const hay = [p.nom, p.zone_id, p.commune, p.adresse, p.proprietaire_nom, p.decideur_nom, p.prochaine_action, p.notes, z && z.nom].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const key = st.sort, dir = st.dir;
    const val = p => key === 'statut' ? GA.STATUTS.findIndex(s => s.key === p.statut)
      : key === 'responsable' ? ((userById(p.responsable_id) || {}).nom || '~')
      : (p[key] || (key === 'date_relance' ? '9999' : ''));
    list.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    return list;
  }

  function renderToolbar() {
    const el = $('#crm-toolbar');
    const usedZones = [...new Set(GA.store.prospects.map(p => p.zone_id).filter(Boolean))].sort();
    if (st.zone && !usedZones.includes(st.zone)) usedZones.push(st.zone);
    el.innerHTML = `
      <div class="search"><span aria-hidden="true">⌕</span><input id="crm-q" type="search" placeholder="Rechercher un emplacement, une commune, un contact…" value="${esc(st.q)}"></div>
      <select id="crm-statut" aria-label="Statut"><option value="">Tous les statuts</option>${GA.STATUTS.map(s => `<option value="${s.key}" ${st.statut === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      <select id="crm-resp" aria-label="Responsable"><option value="">Tous les responsables</option><option value="__me" ${st.resp === '__me' ? 'selected' : ''}>Mes dossiers</option><option value="__none" ${st.resp === '__none' ? 'selected' : ''}>Non attribuées</option>${users().map(u => `<option value="${u.id}" ${st.resp === u.id ? 'selected' : ''}>${esc(u.nom)}</option>`).join('')}</select>
      <select id="crm-zone" aria-label="Zone"><option value="">Toutes les zones</option>${usedZones.map(z => { const zz = GA.svc.zone(z); return `<option value="${z}" ${st.zone === z ? 'selected' : ''}>${z}${zz ? ' — ' + esc(zz.com) : ''}</option>`; }).join('')}</select>
      ${st.zone && GA.svc.zone(st.zone) ? '<button class="btn" id="crm-ent" title="Établissements autour de la zone, avec SIREN">Entreprises de la zone ' + esc(st.zone) + '</button>' : ''}
      ${(st.q || st.statut || st.resp || st.zone) ? '<button class="link" id="crm-clear">Effacer les filtres</button>' : ''}`;
    $('#crm-q').addEventListener('input', e => { st.q = e.target.value; renderBody(); });
    $('#crm-statut').addEventListener('change', e => { st.statut = e.target.value; render(); });
    $('#crm-resp').addEventListener('change', e => { st.resp = e.target.value; render(); });
    $('#crm-zone').addEventListener('change', e => { st.zone = e.target.value; render(); });
    const ent = $('#crm-ent'); if (ent) ent.addEventListener('click', () => GA.entreprisesView.open(st.zone));
    const c = $('#crm-clear'); if (c) c.addEventListener('click', () => { st.q = st.statut = st.resp = st.zone = ''; render(); });
  }

  function statusControl(p, editable) {
    if (!editable) return statutPill(p.statut);
    const s = GA.ui.statut(p.statut);
    return `<select class="pill-select" data-status="${p.id}" style="--c:${s.color}" aria-label="Statut">${GA.STATUTS.map(x => `<option value="${x.key}" ${x.key === p.statut ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;
  }

  function renderTable(list) {
    const me = GA.auth.current();
    const th = (key, label) => `<th data-sort="${key}" class="${st.sort === key ? 'sorted' : ''}">${label}${st.sort === key ? (st.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
    if (!list.length) return empty();
    return `<div class="table-wrap"><table class="crm-table">
      <thead><tr>${th('nom', 'Emplacement')}${th('zone_id', 'Zone')}${th('commune', 'Commune')}${th('statut', 'Statut')}${th('responsable', 'Responsable')}${th('prochaine_action', 'Prochaine action')}${th('date_relance', 'Relance')}${th('updated_at', 'Mise à jour')}</tr></thead>
      <tbody>${list.map(p => {
        const u = userById(p.responsable_id), ed = GA.perm.canEditProspect(me, p);
        return `<tr data-id="${p.id}" tabindex="0">
          <td class="t-name"><b>${esc(p.nom)}</b>${ed ? '' : '<span class="lock" title="Lecture seule">🔒</span>'}</td>
          <td>${zoneChip(p.zone_id)}</td><td>${esc(p.commune)}</td>
          <td>${statusControl(p, ed)}</td>
          <td class="t-user">${avatar(u)} <span>${u ? esc(u.nom) : '<span class="muted">Non attribuée</span>'}</span></td>
          <td class="t-next">${esc(p.prochaine_action) || '<span class="muted">—</span>'}</td>
          <td class="${overdue(p.date_relance) && !['accord', 'refuse'].includes(p.statut) ? 'late' : ''}">${fmtDate(p.date_relance) || '<span class="muted">—</span>'}</td>
          <td class="muted">${fmtDate(p.updated_at)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function renderKanban(list) {
    const me = GA.auth.current();
    return `<div class="kanban">${GA.STATUTS.map(s => {
      const items = list.filter(p => p.statut === s.key);
      return `<div class="kcol" data-col="${s.key}"><div class="kcol-h"><span class="kdot" style="background:${s.color}"></span>${esc(s.label)}<span class="kcount">${items.length}</span></div>
        <div class="kcards">${items.map(p => {
          const u = userById(p.responsable_id), ed = GA.perm.canEditProspect(me, p);
          return `<div class="kcard" data-id="${p.id}" draggable="${ed}" tabindex="0">
            <div class="kc-t">${esc(p.nom)}</div>
            <div class="kc-m">${zoneChip(p.zone_id)} <span>${esc(p.commune)}</span></div>
            ${p.prochaine_action ? `<div class="kc-n">${esc(p.prochaine_action)}</div>` : ''}
            <div class="kc-f">${avatar(u, 'sm')}${p.date_relance ? `<span class="${overdue(p.date_relance) && !['accord', 'refuse'].includes(p.statut) ? 'late' : 'muted'}">Relance ${fmtDate(p.date_relance)}</span>` : ''}${ed ? '' : '<span class="lock" title="Lecture seule">🔒</span>'}</div>
          </div>`;
        }).join('')}</div></div>`;
    }).join('')}</div>`;
  }

  function empty() {
    const any = GA.store.prospects.length;
    return `<div class="empty"><p>${any ? 'Aucune fiche ne correspond à ces filtres.' : 'Aucune fiche pour l’instant.'}</p><button class="btn primary" data-new>+ Nouvelle fiche</button></div>`;
  }

  function renderBody() {
    const list = filtered();
    visible = list.map(p => p.id);
    $('#crm-count').textContent = list.length + (list.length > 1 ? ' fiches' : ' fiche') + (list.length !== GA.store.prospects.length ? ' sur ' + GA.store.prospects.length : '');
    const body = $('#crm-body');
    body.innerHTML = st.mode === 'table' ? renderTable(list) : (list.length ? renderKanban(list) : empty());
    bindBody(body);
    GA.panel.markActive();
  }

  function bindBody(body) {
    $$('[data-new]', body).forEach(b => b.addEventListener('click', () => newProspect()));
    $$('th[data-sort]', body).forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = k === 'updated_at' ? -1 : 1; } renderBody();
    }));
    $$('tr[data-id], .kcard', body).forEach(r => {
      r.addEventListener('click', e => { if (e.target.closest('select')) return; GA.app.openProspect(r.dataset.id); });
      r.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('select')) GA.app.openProspect(r.dataset.id); });
    });
    $$('select[data-status]', body).forEach(s => {
      s.addEventListener('click', e => e.stopPropagation());
      s.addEventListener('change', async () => {
        const r = await run(() => GA.svc.changeStatus(s.dataset.status, s.value), 'Statut mis à jour');
        await GA.app.reload(); if (!r) renderBody();
      });
    });
    // Glisser-déposer entre colonnes du Kanban
    $$('.kcard[draggable="true"]', body).forEach(c => {
      c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
    });
    $$('.kcol', body).forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', async e => {
        e.preventDefault(); col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain'); const p = GA.store.prospects.find(x => x.id === id);
        if (!p || p.statut === col.dataset.col) return;
        await run(() => GA.svc.changeStatus(id, col.dataset.col), 'Statut : ' + GA.ui.statut(col.dataset.col).label);
        await GA.app.reload();
      });
    });
  }

  function render() {
    renderToolbar();
    $$('#crm-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    renderBody();
  }

  function newProspect(zoneId) {
    const m = modal('Nouvelle fiche de prospection', `
      <form id="np-form" novalidate>
        <label class="fld"><span>Nom de l’emplacement *</span><input id="np-nom" placeholder="Ex. : parking du supermarché, entrée nord" required></label>
        <label class="fld"><span>Zone de la carte</span><select id="np-zone">${zoneOptions(zoneId || '')}</select></label>
        <div class="np-zinfo" id="np-zinfo"></div>
        <label class="fld"><span>Commune</span><input id="np-com"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" type="submit">Créer et ouvrir</button></div>
      </form>`);
    const zsel = $('#np-zone', m.el), com = $('#np-com', m.el);
    const upd = () => {
      const z = GA.svc.zone(zsel.value); com.value = z ? z.com : com.value;
      $('#np-zinfo', m.el).innerHTML = z ? GA.panel.zoneSummary(z) + '<button type="button" class="link np-ent" id="np-ent">Choisir parmi les entreprises de la zone (SIREN) →</button>' : '';
      const b = $('#np-ent', m.el); if (b) b.addEventListener('click', () => { m.close(); GA.entreprisesView.open(z.id); });
    };
    zsel.addEventListener('change', upd); upd();
    $('#np-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const p = await run(() => GA.svc.createProspect({ nom: $('#np-nom', m.el).value, zone_id: zsel.value, commune: com.value }), 'Fiche créée');
      if (p) { m.close(); await GA.app.reload(); GA.app.openProspect(p.id); }
    });
  }

  return {
    init() {
      $$('#crm-mode button').forEach(b => b.addEventListener('click', () => {
        st.mode = b.dataset.mode; try { localStorage.setItem('ga.crm.mode', st.mode); } catch (e) {} render();
      }));
      $('#crm-new').addEventListener('click', () => newProspect());
      $('#crm-export').addEventListener('click', GA.dashboardView.exportExcel);
    },
    render, newProspect,
    setZoneFilter(id) { st.zone = id; st.q = ''; st.statut = ''; st.resp = ''; },
    setFilters(f) { Object.assign(st, { q: '', statut: '', resp: '', zone: '' }, f); },
    visibleIds: () => visible,
  };
})();
