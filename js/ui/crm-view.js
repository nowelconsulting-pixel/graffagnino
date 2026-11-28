/* Onglet CRM : pipeline commercial en tableau ou en Kanban, filtres orientés vente, création rapide.
   Les changements d'étape passent toujours par la fenêtre « étape » (prochaine action, conditions d'entrée). */
window.GA = window.GA || {};

GA.crmView = (function () {
  const { $, $$, esc, fmtDate, statutPill, avatar, zoneChip, overdue, run, modal, zoneOptions } = GA.ui;
  const VIDE = { q: '', statut: '', resp: '', zone: '', cat: '', etat: '', secteur: '', typo: '' };
  const st = Object.assign({ mode: 'table', sort: 'signature', dir: -1, vue: 'ouverts' }, VIDE);
  try { const m = localStorage.getItem('ga.crm.mode'); if (m) st.mode = m; } catch (e) {}
  let visible = [];

  const users = () => GA.store.users;
  const userById = id => users().find(u => u.id === id);
  const interet = c => { const i = GA.INTERETS.find(x => x.key === (c && c.interet)) || GA.INTERETS[0]; return c ? `<span class="pill" style="--c:${i.color}">${esc(i.label)}</span>` : ''; };
  const catPill = p => { const k = GA.pipe.categorie(p); if (!k) return ''; const c = GA.pipe.CATEGORIES[k]; return `<span class="pill" style="--c:${c.color}" title="${esc(c.aide)}">${esc(c.label)}</span>`; };
  const potHtml = p => { const f = GA.pipe.potentiel(p); return f ? `<b>${f.total}</b><span class="muted small">/100</span>` : '<span class="muted small">—</span>'; };

  function filtered() {
    const me = GA.auth.current();
    const q = st.q.toLowerCase();
    let list = GA.store.prospects.filter(p => {
      if (st.vue === 'ouverts' && !GA.pipe.estOuvert(p)) return false;
      if (st.vue === 'gagnes' && p.statut !== 'installe' && p.statut !== 'signe') return false;
      if (st.vue === 'perdus' && p.statut !== 'abandonne') return false;
      if (st.statut && p.statut !== st.statut) return false;
      if (st.resp === '__me' && p.responsable_id !== me.id) return false;
      if (st.resp === '__none' && p.responsable_id) return false;
      if (st.resp && !st.resp.startsWith('__') && p.responsable_id !== st.resp) return false;
      if (st.zone && p.zone_id !== st.zone) return false;
      if (st.secteur && p.secteur_id !== st.secteur) return false;
      if (st.typo && p.typologie !== st.typo) return false;
      if (st.cat && GA.pipe.categorie(p) !== st.cat) return false;
      if (st.etat === 'bloque' && !p.bloque) return false;
      if (st.etat === 'sans_action' && !GA.pipe.sansAction(p)) return false;
      if (st.etat === 'retard' && !GA.pipe.enRetard(p)) return false;
      if (st.etat === 'immobile' && !GA.pipe.immobile(p)) return false;
      if (st.etat === 'sans_contact' && GA.pipe.contactsDe(p).length) return false;
      if (q) {
        const z = GA.svc.zone(p.zone_id);
        const cs = GA.pipe.contactsDe(p).map(c => [c.nom, c.entreprise, c.fonction].join(' ')).join(' ');
        const hay = [p.nom, p.zone_id, p.commune, p.adresse, p.proprietaire_nom, p.decideur_nom, p.prochaine_action, p.notes, z && z.nom, cs].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const key = st.sort, dir = st.dir;
    const val = p => key === 'signature' ? GA.pipe.rangSignature(p)
      : key === 'statut' ? GA.pipe.ordre(p.statut)
      : key === 'potentiel' ? ((GA.pipe.potentiel(p) || {}).total ?? -1)
      : key === 'responsable' ? ((userById(p.responsable_id) || {}).nom || '~')
      : (p[key] || (key === 'date_relance' ? '9999' : ''));
    list.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    return list;
  }

  function sel(id, label, options, v) {
    return `<select id="${id}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${options.map(([k, l]) => `<option value="${esc(k)}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }

  function renderToolbar() {
    const el = $('#crm-toolbar');
    const usedZones = [...new Set(GA.store.prospects.map(p => p.zone_id).filter(Boolean))].sort();
    if (st.zone && !usedZones.includes(st.zone)) usedZones.push(st.zone);
    const actif = Object.keys(VIDE).some(k => st[k]);
    el.innerHTML = `
      <div class="seg" id="crm-vue" role="group" aria-label="Dossiers">${[['ouverts', 'En cours'], ['gagnes', 'Signés / installés'], ['perdus', 'Abandonnés'], ['tous', 'Tous']].map(([k, l]) => `<button data-vue="${k}" class="${st.vue === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="search"><span aria-hidden="true">⌕</span><input id="crm-q" type="search" placeholder="Emplacement, commune, interlocuteur…" value="${esc(st.q)}"></div>
      ${sel('crm-cat', 'Toutes priorités', Object.entries(GA.pipe.CATEGORIES).map(([k, c]) => [k, c.label]), st.cat)}
      ${sel('crm-etat', 'Tous les dossiers', [['retard', 'Relance en retard'], ['sans_action', 'Sans prochaine action'], ['bloque', 'Bloqués'], ['immobile', 'Immobiles'], ['sans_contact', 'Sans interlocuteur']], st.etat)}
      ${sel('crm-statut', 'Toutes les étapes', GA.STATUTS.map(s => [s.key, s.label]), st.statut)}
      <select id="crm-resp" aria-label="Responsable"><option value="">Tous les responsables</option><option value="__me" ${st.resp === '__me' ? 'selected' : ''}>Mes dossiers</option><option value="__none" ${st.resp === '__none' ? 'selected' : ''}>Non attribués</option>${users().map(u => `<option value="${u.id}" ${st.resp === u.id ? 'selected' : ''}>${esc(u.nom)}</option>`).join('')}</select>
      ${sel('crm-typo', 'Toutes typologies', GA.TYPOLOGIES.map(x => [x.key, x.label]), st.typo)}
      ${GA.store.secteurs.length > 1 ? sel('crm-sect', 'Tous secteurs', GA.store.secteurs.map(x => [x.id, x.nom]), st.secteur) : ''}
      ${sel('crm-zone', 'Toutes les zones', usedZones.map(z => { const zz = GA.svc.zone(z); return [z, z + (zz ? ' — ' + zz.com : '')]; }), st.zone)}
      ${st.zone && GA.svc.zone(st.zone) ? '<button class="btn" id="crm-ent" title="Établissements autour de la zone, avec SIREN">Entreprises de la zone ' + esc(st.zone) + '</button>' : ''}
      ${actif ? '<button class="link" id="crm-clear">Effacer les filtres</button>' : ''}`;
    $$('#crm-vue button').forEach(b => b.addEventListener('click', () => { st.vue = b.dataset.vue; render(); }));
    $('#crm-q').addEventListener('input', e => { st.q = e.target.value; renderBody(); });
    const bindSel = (id, k) => { const s = $('#' + id); if (s) s.addEventListener('change', e => { st[k] = e.target.value; if (k === 'statut' && st[k]) st.vue = 'tous'; render(); }); };
    bindSel('crm-cat', 'cat'); bindSel('crm-etat', 'etat'); bindSel('crm-statut', 'statut'); bindSel('crm-resp', 'resp'); bindSel('crm-typo', 'typo'); bindSel('crm-sect', 'secteur'); bindSel('crm-zone', 'zone');
    const ent = $('#crm-ent'); if (ent) ent.addEventListener('click', () => GA.entreprisesView.open(st.zone));
    const c = $('#crm-clear'); if (c) c.addEventListener('click', () => { Object.assign(st, VIDE); render(); });
  }

  function renderTable(list) {
    const me = GA.auth.current();
    const th = (key, label) => `<th data-sort="${key}" class="${st.sort === key ? 'sorted' : ''}">${label}${st.sort === key ? (st.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
    if (!list.length) return empty();
    return `<div class="table-wrap"><table class="crm-table">
      <thead><tr>${th('nom', 'Emplacement')}${th('statut', 'Étape')}${th('potentiel', 'Potentiel')}<th>Priorité</th><th>Interlocuteur</th>${th('prochaine_action', 'Prochaine action')}${th('date_relance', 'Relance')}${th('responsable', 'Responsable')}</tr></thead>
      <tbody>${list.map(p => {
        const u = userById(p.responsable_id), ed = GA.perm.canEditProspect(me, p), pr = GA.pipe.principal(p);
        const typo = GA.TYPOLOGIES.find(x => x.key === p.typologie);
        return `<tr data-id="${p.id}" tabindex="0">
          <td class="t-name"><b>${typo ? typo.icon + ' ' : ''}${esc(p.nom)}</b>${p.bloque ? ' <span class="tag warn">bloqué</span>' : ''}${ed ? '' : '<span class="lock" title="Lecture seule">🔒</span>'}
            <div class="muted small">${p.zone_id ? zoneChip(p.zone_id) + ' ' : ''}${esc(p.commune || '')}</div></td>
          <td>${statutPill(p.statut)}</td>
          <td>${potHtml(p)}</td>
          <td>${catPill(p)}</td>
          <td>${pr ? `<div>${esc(pr.nom || pr.entreprise)}</div>${interet(pr)}` : '<span class="muted small">à identifier</span>'}</td>
          <td class="t-next">${p.prochaine_action ? esc(p.prochaine_action) : (GA.pipe.estOuvert(p) ? '<span class="late">à définir</span>' : '<span class="muted">—</span>')}</td>
          <td class="${GA.pipe.enRetard(p) ? 'late' : ''}">${fmtDate(p.date_relance) || '<span class="muted">—</span>'}</td>
          <td class="t-user">${avatar(u)} <span>${u ? esc(u.nom) : '<span class="muted">Non attribué</span>'}</span></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function renderKanban(list) {
    const me = GA.auth.current();
    const cols = GA.STATUTS.filter(s => s.ouvert);
    const fermes = GA.STATUTS.filter(s => !s.ouvert).map(s => `<button class="link" data-statut-ferme="${s.key}">${esc(s.label)} : ${GA.store.prospects.filter(p => p.statut === s.key).length}</button>`).join(' · ');
    return `<div class="kanban">${cols.map(s => {
      const items = list.filter(p => p.statut === s.key).sort((a, b) => GA.pipe.rangSignature(b) - GA.pipe.rangSignature(a));
      return `<div class="kcol" data-col="${s.key}"><div class="kcol-h"><span class="kdot" style="background:${s.color}"></span>${esc(s.label)}<span class="kcount">${items.length}</span></div>
        <div class="kcards">${items.map(p => {
          const u = userById(p.responsable_id), ed = GA.perm.canEditProspect(me, p), pr = GA.pipe.principal(p), f = GA.pipe.potentiel(p);
          return `<div class="kcard" data-id="${p.id}" draggable="${ed}" tabindex="0">
            <div class="kc-t">${esc(p.nom)}</div>
            <div class="kc-m">${p.zone_id ? zoneChip(p.zone_id) : ''} ${f ? `<span class="tag">${f.total}/100</span>` : ''} ${catPill(p)}</div>
            ${pr ? `<div class="kc-n">${esc(pr.nom || pr.entreprise)} ${interet(pr)}</div>` : '<div class="kc-n muted">Interlocuteur à identifier</div>'}
            ${p.prochaine_action ? `<div class="kc-n">→ ${esc(p.prochaine_action)}</div>` : '<div class="kc-n late">Prochaine action à définir</div>'}
            <div class="kc-f">${avatar(u, 'sm')}${p.date_relance ? `<span class="${GA.pipe.enRetard(p) ? 'late' : 'muted'}">Relance ${fmtDate(p.date_relance)}</span>` : ''}${p.bloque ? '<span class="tag warn">bloqué</span>' : ''}${ed ? '' : '<span class="lock" title="Lecture seule">🔒</span>'}</div>
          </div>`;
        }).join('')}</div></div>`;
    }).join('')}</div><p class="hint">${fermes}. Glissez une carte vers une autre étape pour la faire avancer.</p>`;
  }

  function empty() {
    const any = GA.store.prospects.length;
    return `<div class="empty"><p>${any ? 'Aucun dossier ne correspond à ces filtres.' : 'Aucune fiche pour l’instant. Lancez une étude dans Opportunités, ou ajoutez un emplacement.'}</p><button class="btn primary" data-new>+ Nouvelle fiche</button></div>`;
  }

  function renderBody() {
    const list = filtered();
    visible = list.map(p => p.id);
    $('#crm-count').textContent = list.length + (list.length > 1 ? ' dossiers' : ' dossier') + (list.length !== GA.store.prospects.length ? ' sur ' + GA.store.prospects.length : '');
    const body = $('#crm-body');
    body.innerHTML = st.mode === 'table' ? renderTable(list) : renderKanban(list);
    bindBody(body);
    GA.panel.markActive();
  }

  function bindBody(body) {
    $$('[data-new]', body).forEach(b => b.addEventListener('click', () => newProspect()));
    $$('th[data-sort]', body).forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = ['updated_at', 'potentiel', 'statut'].includes(k) ? -1 : 1; } renderBody();
    }));
    $$('tr[data-id], .kcard', body).forEach(r => {
      r.addEventListener('click', () => GA.app.openProspect(r.dataset.id));
      r.addEventListener('keydown', e => { if (e.key === 'Enter') GA.app.openProspect(r.dataset.id); });
    });
    $$('[data-statut-ferme]', body).forEach(b => b.addEventListener('click', () => { st.vue = 'tous'; st.statut = b.dataset.statutFerme; st.mode = 'table'; render(); }));
    // Glisser-déposer : ouvre la fenêtre de passage d'étape (prochaine action, conditions d'entrée).
    $$('.kcard[draggable="true"]', body).forEach(c => {
      c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
    });
    $$('.kcol', body).forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', e => {
        e.preventDefault(); col.classList.remove('over');
        const p = GA.store.prospects.find(x => x.id === e.dataTransfer.getData('text/plain'));
        if (p && p.statut !== col.dataset.col) GA.pipeUI.etape(p, col.dataset.col);
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
        <div class="two"><label class="fld"><span>Typologie</span><select id="np-typo"><option value="">—</option>${GA.TYPOLOGIES.map(x => `<option value="${x.key}">${esc(x.icon + ' ' + x.label)}</option>`).join('')}</select></label>
        <label class="fld"><span>Zone de la carte</span><select id="np-zone">${zoneOptions(zoneId || '')}</select></label></div>
        <div class="np-zinfo" id="np-zinfo"></div>
        <div class="two"><label class="fld"><span>Adresse</span><input id="np-adr" placeholder="Pour placer la fiche sur la carte"></label>
        <label class="fld"><span>Commune</span><input id="np-com"></label></div>
        <p class="hint">Astuce : Opportunités → Études trouve automatiquement les emplacements et leurs propriétaires.</p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" type="submit">Créer et ouvrir</button></div>
      </form>`, { wide: true });
    const zsel = $('#np-zone', m.el), com = $('#np-com', m.el);
    const upd = () => {
      const z = GA.svc.zone(zsel.value); com.value = z ? z.com : com.value;
      $('#np-zinfo', m.el).innerHTML = z ? GA.panel.zoneSummary(z) + '<button type="button" class="link np-ent" id="np-ent">Choisir parmi les entreprises de la zone (SIREN) →</button>' : '';
      const b = $('#np-ent', m.el); if (b) b.addEventListener('click', () => { m.close(); GA.entreprisesView.open(z.id); });
    };
    zsel.addEventListener('change', upd); upd();
    $('#np-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const p = await run(async () => {
        const data = { nom: $('#np-nom', m.el).value, zone_id: zsel.value, commune: com.value, adresse: $('#np-adr', m.el).value, typologie: $('#np-typo', m.el).value };
        const q = [data.adresse, data.commune].filter(Boolean).join(' ');
        if (data.adresse && q.length > 5) {
          try { const d = await (await fetch('https://data.geopf.fr/geocodage/search?limit=1&q=' + encodeURIComponent(q))).json(); const f = d.features && d.features[0];
            if (f && f.properties.score > 0.5) Object.assign(data, { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }); } catch (err) { /* position facultative */ }
        }
        return GA.svc.createProspect(data);
      }, 'Fiche créée');
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
    setZoneFilter(id) { Object.assign(st, VIDE, { zone: id, vue: 'tous' }); },
    setFilters(f) { Object.assign(st, VIDE, { vue: 'tous' }, f); },
    visibleIds: () => visible,
  };
})();
