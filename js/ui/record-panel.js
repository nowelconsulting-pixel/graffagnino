/* Fiche de prospection : panneau latéral façon Notion, enregistrement automatique,
   historique des échanges avec ajout rapide, navigation d'une fiche à l'autre. */
window.GA = window.GA || {};

GA.panel = (function () {
  const { $, $$, esc, fmtDate, fmtDateTime, km, avatar, run, zoneOptions, confirmBox } = GA.ui;
  let currentId = null;
  let exType = 'appel';

  const el = () => $('#panel');
  const userById = id => GA.store.users.find(u => u.id === id);

  function zoneSummary(z) {
    const conf = z.conf ? `<span class="tag ok">Conforme · ${km(z.vd)}</span>` : `<span class="tag out">Hors périmètre · ${km(z.vd)}</span>`;
    const al = z.alert ? ' <span class="tag warn">À mesurer (9,5–10,5 km)</span>' : '';
    const prio = z.conf ? (z.cannib ? 'Priorité 3 (cannibalisation)' : 'Priorité ' + z.op) : 'Non classable';
    const fr = z.lo !== z.hi ? ` (fourchette ${z.lo}–${z.hi})` : '';
    return `<div class="zsum"><b>${esc(z.id)} · ${esc(z.nom)}</b><br>${conf}${al}<br>${prio} · score ${z.sc}/100${fr} · confiance ${esc(z.conf_lvl)}<br><span class="muted">Données de la carte, en lecture seule.</span></div>`;
  }

  function prop(label, field, p, ed, type, extra) {
    const v = p[field] == null ? '' : p[field];
    let input;
    if (type === 'select') input = `<select data-f="${field}" ${ed ? '' : 'disabled'}>${extra}</select>`;
    else if (type === 'textarea') input = `<textarea data-f="${field}" rows="1" ${ed ? '' : 'disabled'} placeholder="Vide">${esc(v)}</textarea>`;
    else input = `<input data-f="${field}" type="${type || 'text'}" value="${esc(v)}" ${ed ? '' : 'disabled'} placeholder="Vide">`;
    return `<div class="prop"><label>${label}</label><div class="pv">${input}</div></div>`;
  }

  function responsableOptions(p, me) {
    const opt = (id, label) => `<option value="${id}" ${(p.responsable_id || '') === id ? 'selected' : ''}>${esc(label)}</option>`;
    if (GA.perm.canAssignOthers(me))
      return opt('', 'Non attribuée') + GA.store.users.filter(u => u.actif || u.id === p.responsable_id).map(u => opt(u.id, u.nom + (u.actif ? '' : ' (désactivé)'))).join('');
    const cur = userById(p.responsable_id);
    return p.responsable_id ? opt(p.responsable_id, cur ? cur.nom : '?') : opt('', 'Non attribuée') + opt(me.id, me.nom + ' (moi)');
  }

  async function render() {
    const p = await GA.svc.getProspect(currentId);
    if (!p) { close(); return; }
    const me = GA.auth.current();
    const ed = GA.perm.canEditProspect(me, p);
    const ex = (await GA.svc.listExchanges(p.id)).sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at));
    const z = GA.svc.zone(p.zone_id);
    const ids = GA.crmView.visibleIds(); const i = ids.indexOf(p.id);
    const resp = userById(p.responsable_id);

    el().innerHTML = `
    <div class="panel-top">
      <button class="icon-btn" data-nav="-1" ${i <= 0 ? 'disabled' : ''} title="Fiche précédente (K)" aria-label="Fiche précédente">↑</button>
      <button class="icon-btn" data-nav="1" ${i < 0 || i >= ids.length - 1 ? 'disabled' : ''} title="Fiche suivante (J)" aria-label="Fiche suivante">↓</button>
      <span class="muted small">${i >= 0 ? (i + 1) + ' / ' + ids.length : ''}</span>
      <span class="grow"></span>
      ${ed ? '<button class="btn ghost" data-visite title="Compte rendu de visite avec photos et position">Visite</button>' : ''}
      <button class="btn ghost" data-foncier title="Parcelle cadastrale et propriétaire (sociétés, collectivités)">Propriétaire</button>
      ${z ? '<button class="btn ghost" data-ent title="Établissements autour de la zone, avec SIREN">Entreprises</button><button class="btn ghost" data-map>Voir sur la carte</button>' : ''}
      ${GA.perm.canDeleteProspect(me, p) ? '<button class="btn ghost danger-t" data-del>Supprimer</button>' : ''}
      <button class="icon-btn" data-x title="Fermer (Échap)" aria-label="Fermer">✕</button>
    </div>
    <div class="panel-body">
      <textarea class="title-input" data-f="nom" rows="1" ${ed ? '' : 'disabled'} aria-label="Nom de l’emplacement">${esc(p.nom)}</textarea>
      <div class="meta-line">Créée le ${fmtDate(p.created_at)} · <span id="upd">mise à jour ${fmtDateTime(p.updated_at)}</span></div>
      ${ed ? '' : `<div class="ro">Lecture seule : ce dossier est suivi par ${esc(resp ? resp.nom : 'un autre utilisateur')}. Seuls son responsable et les administrateurs peuvent le modifier.</div>`}

      ${GA.pipeUI.stepper(p, ed)}
      ${GA.pipeUI.barreActions(p, ed)}
      ${GA.pipeUI.bandeaux(p)}

      <div class="props">
        ${prop('Prochaine action', 'prochaine_action', p, ed, 'textarea')}
        ${prop('Date de relance', 'date_relance', p, ed, 'date')}
        ${prop('Responsable', 'responsable_id', p, ed && (GA.perm.canAssignOthers(me) || !p.responsable_id), 'select', responsableOptions(p, me))}
      </div>

      <h4>Interlocuteurs <span class="muted small">${GA.pipe.contactsDe(p).length}</span></h4>
      ${GA.pipeUI.contactsHtml(p, ed)}

      <h4>Potentiel de l’emplacement</h4>
      <div id="score-sec">${GA.scoreView.section(p, ed)}</div>

      ${GA.pipeUI.conditionsHtml(p, ed)}
      <h4>Jalons</h4>
      ${GA.pipeUI.jalonsHtml(p, ex, ed)}

      <h4>Identification</h4>
      <div class="props">
        ${prop('Typologie', 'typologie', p, ed, 'select', '<option value="">—</option>' + GA.TYPOLOGIES.map(x => `<option value="${x.key}" ${x.key === p.typologie ? 'selected' : ''}>${esc(x.icon + ' ' + x.label)}</option>`).join(''))}
        ${prop('Secteur', 'secteur_id', p, ed, 'select', '<option value="">—</option>' + GA.store.secteurs.map(x => `<option value="${x.id}" ${x.id === p.secteur_id ? 'selected' : ''}>${esc(x.nom)}</option>`).join(''))}
        ${prop('Objectif', 'objectif_id', p, ed, 'select', '<option value="">—</option>' + GA.store.objectifs.filter(o => o.statut !== 'archive' || o.id === p.objectif_id).map(x => `<option value="${x.id}" ${x.id === p.objectif_id ? 'selected' : ''}>${esc(x.nom)}</option>`).join(''))}
        ${prop('Zone de la carte', 'zone_id', p, ed, 'select', zoneOptions(p.zone_id))}
        ${z ? `<div class="prop"><label></label><div class="pv">${zoneSummary(z)}</div></div>` : ''}
        ${prop('Adresse', 'adresse', p, ed)}
        ${prop('Commune', 'commune', p, ed)}
        <div class="prop"><label>Position</label><div class="pv pos-line">${p.lat != null && p.lon != null
          ? `<span>📍 Positionnée sur la carte</span> <button class="link" data-showpos>Voir sur la carte</button>${ed ? ' <button class="link" data-locate>Relocaliser depuis l’adresse</button>' : ''}`
          : `<span class="muted">Non positionnée</span>${ed ? ' <button class="link" data-locate>Localiser depuis l’adresse</button>' : ''}`}</div></div>
      </div>

      ${[p.proprietaire_nom, p.proprietaire_type, p.decideur_nom, p.decideur_fonction, p.telephone, p.email].some(Boolean) ? `<details class="ancien"><summary>Saisie avant V2 (lecture seule, reprise dans les interlocuteurs)</summary>
      <div class="props">
        ${prop('Propriétaire / gestionnaire', 'proprietaire_nom', p, false)}
        ${prop('Type de propriétaire', 'proprietaire_type', p, false)}
        ${prop('Décideur', 'decideur_nom', p, false)}
        ${prop('Fonction', 'decideur_fonction', p, false)}
        ${prop('Téléphone', 'telephone', p, false, 'tel')}
        ${prop('Email', 'email', p, false, 'email')}
      </div></details>` : ''}

      <h4>Notes</h4>
      <textarea class="notes" data-f="notes" rows="3" ${ed ? '' : 'disabled'} placeholder="Notes libres…">${esc(p.notes)}</textarea>

      <h4>Photos et documents</h4>
      <div id="docs" class="docs"></div>

      <div class="tabs-h"><button type="button" class="tab on" data-tab="ex">Échanges <span class="muted small">${ex.length}</span></button><button type="button" class="tab" data-tab="jr">Journal</button></div>
      <div id="tab-jr" hidden><div class="muted small">Chargement…</div></div>
      <div id="tab-ex">
      ${ed ? `<form class="composer" id="ex-form">
        <div class="ex-types">${GA.TYPES_ECHANGE.map(t => `<button type="button" class="chip ${t.key === exType ? 'on' : ''}" data-type="${t.key}"><span aria-hidden="true">${t.icon}</span> ${t.label}</button>`).join('')}
          <input type="date" id="ex-date" value="${GA.svc.today()}" aria-label="Date de l’échange"></div>
        <textarea id="ex-text" rows="2" placeholder="Compte rendu de l’échange… (Ctrl + Entrée pour ajouter)"></textarea>
        <div class="ex-actions"><button class="btn primary" type="submit">Ajouter</button></div>
      </form>` : ''}
      <ol class="timeline">${ex.length ? ex.map(e => {
        const t = GA.TYPES_ECHANGE.find(x => x.key === e.type) || GA.TYPES_ECHANGE[4];
        const a = userById(e.auteur_id);
        return `<li><span class="tl-ic t-${e.type}" aria-hidden="true">${t.icon}</span><div class="tl-b">
          <div class="tl-h"><b>${t.label}</b> · ${fmtDate(e.date)} · <span class="muted">${esc(a ? a.nom : '?')}</span>
          ${e.lat != null && e.lon != null ? `<a class="small" href="https://www.google.com/maps/search/?api=1&query=${+e.lat},${+e.lon}" target="_blank" rel="noopener" title="Position enregistrée${e.precision_m ? ' (± ' + e.precision_m + ' m)' : ''}">📍 position</a>` : ''}
          ${GA.perm.canDeleteExchange(me, p, e) ? `<button class="link small" data-delex="${e.id}">Supprimer</button>` : ''}</div>
          <div class="tl-c">${esc(e.commentaire)}</div><div class="tl-docs" data-exdocs="${esc(e.id)}"></div></div></li>`;
      }).join('') : '<li class="muted">Aucun échange enregistré.</li>'}</ol></div>
    </div>`;
    bind(p);
    GA.pipeUI.bindActions(el(), p);
    $$('[data-tab]', el()).forEach(b => b.addEventListener('click', async () => {
      $$('[data-tab]', el()).forEach(x => x.classList.toggle('on', x === b));
      $('#tab-ex').hidden = b.dataset.tab !== 'ex'; $('#tab-jr').hidden = b.dataset.tab !== 'jr';
      if (b.dataset.tab === 'jr') { try { $('#tab-jr').innerHTML = GA.pipeUI.journalHtml(await GA.svc.listEvenements(p.id)); } catch (e) { $('#tab-jr').innerHTML = '<div class="muted small">' + esc(e.message) + '</div>'; } }
    }));
    autosize();
    GA.docsView.mount($('#docs'), p, ed);
    GA.scoreView.bind($('#score-sec'), p, render);
  }

  function autosize() { $$('#panel textarea').forEach(t => { if (t.id === 'ex-text') return; t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }); }

  function bind(p) {
    const root = el();
    $('[data-x]', root).addEventListener('click', close);
    $$('[data-nav]', root).forEach(b => b.addEventListener('click', () => step(+b.dataset.nav)));
    const vb = $('[data-visite]', root); if (vb) vb.addEventListener('click', () => GA.visiteView.open(p.id));
    const sp = $('[data-showpos]', root); if (sp) sp.addEventListener('click', () => GA.mapView.focusProspect(p));
    const lc = $('[data-locate]', root); if (lc) lc.addEventListener('click', async () => {
      const q = [p.adresse, p.commune].filter(Boolean).join(' ');
      if (q.length < 4) { GA.ui.toast('Renseignez d’abord l’adresse et la commune.', 'err'); return; }
      lc.disabled = true; lc.textContent = 'Localisation…';
      const r = await run(async () => {
        const d = await (await fetch('https://data.geopf.fr/geocodage/search?limit=1&q=' + encodeURIComponent(q))).json();
        const f = d.features && d.features[0];
        if (!f || f.properties.score < 0.5) throw new Error('Adresse introuvable : précisez-la (numéro, rue, commune).');
        return GA.svc.updateProspect(p.id, { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
      }, 'Fiche positionnée');
      if (r) { await GA.app.reload({ keepPanel: true }); render(); } else { lc.disabled = false; lc.textContent = 'Localiser depuis l’adresse'; }
    });
    const fb = $('[data-foncier]', root); if (fb) fb.addEventListener('click', () => GA.foncierView.open(p.id));
    const eb = $('[data-ent]', root); if (eb) eb.addEventListener('click', () => GA.entreprisesView.open(p.zone_id));
    const mb = $('[data-map]', root); if (mb) mb.addEventListener('click', () => GA.mapView.focusZone(p.zone_id));
    const db = $('[data-del]', root); if (db) db.addEventListener('click', async () => {
      if (!await confirmBox('Supprimer la fiche', `Supprimer « ${p.nom} » et son historique ? Cette action est définitive.`, 'Supprimer', true)) return;
      await run(() => GA.svc.deleteProspect(p.id), 'Fiche supprimée'); close(); await GA.app.reload();
    });
    // Enregistrement automatique champ par champ
    $$('[data-f]', root).forEach(inp => {
      const f = inp.dataset.f;
      const save = async () => {
        let v = inp.value;
        if (f === 'responsable_id' && !v) v = null;
        if (inp.type === 'number') v = v === '' ? null : +v;
        const cur = p[f] == null ? '' : p[f];
        if ((v == null ? '' : v) === cur) return;
        const r = await run(() => GA.svc.updateProspect(p.id, { [f]: v }));
        if (r) {
          Object.assign(p, r);
          const u = $('#upd'); if (u) u.textContent = 'enregistré · mise à jour ' + fmtDateTime(r.updated_at);
          await GA.app.reload({ keepPanel: true });
          if (['zone_id', 'responsable_id', 'typologie', 'modele_eco'].includes(f)) render();
        } else { inp.value = cur; }
      };
      if (inp.tagName === 'SELECT' || inp.type === 'date') inp.addEventListener('change', save);
      else {
        inp.addEventListener('blur', save);
        inp.addEventListener('input', autosize);
        if (inp.classList.contains('title-input') || inp.tagName === 'INPUT')
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      }
    });
    // Échanges
    $$('.chip[data-type]', root).forEach(c => c.addEventListener('click', () => {
      exType = c.dataset.type; $$('.chip[data-type]', root).forEach(x => x.classList.toggle('on', x === c)); $('#ex-text').focus();
    }));
    const form = $('#ex-form', root);
    if (form) {
      const submit = async () => {
        const r = await run(() => GA.svc.addExchange(p.id, { type: exType, date: $('#ex-date').value, commentaire: $('#ex-text').value }), 'Échange ajouté');
        if (r) { await GA.app.reload({ keepPanel: true }); await render(); const t = $('#ex-text'); if (t) t.focus(); }
      };
      form.addEventListener('submit', e => { e.preventDefault(); submit(); });
      $('#ex-text').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
    }
    $$('[data-delex]', root).forEach(b => b.addEventListener('click', async () => {
      const exs = await GA.svc.listExchanges(p.id); const e = exs.find(x => x.id === b.dataset.delex);
      if (!await confirmBox('Supprimer l’échange', 'Supprimer cette entrée de l’historique ?', 'Supprimer', true)) return;
      await run(() => GA.svc.deleteExchange(p, e), 'Échange supprimé'); await GA.app.reload({ keepPanel: true }); render();
    }));
  }

  function step(d) {
    const ids = GA.crmView.visibleIds(); const i = ids.indexOf(currentId);
    const n = ids[i + d]; if (n) GA.app.openProspect(n);
  }
  function close() {
    currentId = null; el().hidden = true; el().innerHTML = '';
    document.body.classList.remove('panel-open'); markActive();
    if (location.hash.startsWith('#fiche-')) history.replaceState(null, '', '#crm');
  }
  function markActive() { $$('[data-id]').forEach(r => r.classList.toggle('active', r.dataset.id === currentId)); }

  document.addEventListener('keydown', e => {
    if (!currentId || $('.modal-wrap')) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else close(); }
    else if (!typing && (e.key === 'j' || e.key === 'J')) step(1);
    else if (!typing && (e.key === 'k' || e.key === 'K')) step(-1);
  });

  return {
    async open(id) { currentId = id; el().hidden = false; document.body.classList.add('panel-open'); await render(); markActive(); },
    close, markActive, zoneSummary,
    current: () => currentId,
  };
})();
