/* Opportunités › Études de sourcing : lancer une étude territoriale, trier les lieux, décider, identifier les acteurs,
   créer le dossier CRM. Cinq dimensions affichées séparément, sans note globale ni probabilité. */
window.GA = window.GA || {};

GA.sourcingView = (function () {
  const { $, $$, esc, run, modal, fmtDate } = GA.ui;
  const st = { etude: null, lieux: [], typo: '', decision: 'a_trier', livrables: true, preuve: '', q: '', sel: new Set(), etudes: [] };
  let root = null;
  const T = k => GA.TYPOLOGIES.find(t => t.key === k) || GA.TYPOLOGIES[GA.TYPOLOGIES.length - 1];
  const DEC = { '': ['À trier', '#8a8f98'], retenu: ['Retenu', '#2b8a3e'], attente: ['En attente', '#c77700'], ecarte: ['Écarté', '#adb5bd'] };
  const NIV = {
    ok: ['livrable', 'ok'], limite: ['limite', 'warn'], hors: ['hors périmètre', 'out'], inconnu: ['inconnu', ''],
    favorable: ['favorable', 'ok'], a_verifier: ['à vérifier', 'warn'], contraint: ['contraint', 'out'],
    a_ouvrir: ['à ouvrir', ''], en_cours: ['dossier en cours', 'ok'], deja_refuse: ['déjà refusé', 'out'], reseau: ['dans le réseau', 'ok'],
    A: ['A · officiel', 'ok'], B: ['B · OSM nommé', ''], C: ['C · OSM sans nom', 'warn'], D: ['D · hypothèse', 'warn'],
  };
  const tag = (d, title) => { if (!d) return '<span class="muted">—</span>'; const [l, c] = NIV[d.niveau] || [d.niveau, '']; return `<span class="tag ${c}" title="${esc(title || d.texte || '')}">${esc(l)}</span>`; };
  const ROLES = { proprietaire: 'propriétaire', exploitant: 'exploitant', gestionnaire: 'gestionnaire', collectivite: 'collectivité', enseigne: 'enseigne' };
  const CERT = { verifie: 'vérifié', probable: 'probable', hypothese: 'hypothèse' };
  const decPill = d => { const [l, c] = DEC[d || '']; return `<span class="pill" style="--c:${c}">${esc(l)}</span>`; };
  const potHtml = x => { const p = x.dims.potentiel || { note: x.prescore }; return `<b>${p.note != null ? Math.round(p.note) : '—'}</b><span class="muted small">/100 ${p.complet ? 'complet' : 'pré-score'}</span>`; };

  /* ---------- Liste des études ---------- */
  async function renderListe() {
    st.etude = null;
    st.etudes = await GA.sourcing.listeEtudes().catch(() => []);
    const me = GA.auth.current();
    root.innerHTML = `<div class="opp-tools"><span class="muted">Une étude détecte les lieux candidats d’un territoire (supermarchés, stations, gares, parkings…), les pré-classe, puis analyse en détail les meilleurs.</span>
        <span class="grow"></span><button class="btn primary" id="et-new">Nouvelle étude</button></div>
      ${st.etudes.length ? `<div class="etudes">${st.etudes.map(e => { const s = e.synthese || {}, p = e.params || {}; return `<div class="etude-card" data-id="${esc(e.id)}">
        <div class="ec-h"><b>${esc(e.nom)}</b>${e.statut === 'en_cours' ? ' <span class="tag warn">en cours ou interrompue</span>' : e.statut === 'erreur' ? ' <span class="tag out">erreur</span>' : ''}</div>
        <div class="muted small">${fmtDate(e.created_at)} · rayon ${String(p.rayon_km || '').replace('.', ',')} km autour de ${esc((p.centre && p.centre.label) || '')} · ${(p.typologies || []).map(k => T(k).icon).join(' ')}</div>
        <div class="small">${s.nb != null ? `<b>${s.nb}</b> lieux · ${s.livrables || 0} livrables · ${s.analyses || 0} analysés en détail${s.nouveaux != null ? ' · <b>' + s.nouveaux + '</b> nouveaux depuis l’étude précédente' : ''}` : esc(s.erreur || '')}</div>
        <div class="ec-a"><button class="btn" data-open>Ouvrir</button>${GA.perm.isAdmin(me) || e.created_by === me.id ? '<button class="btn ghost" data-del>Supprimer</button>' : ''}</div></div>`; }).join('')}</div>`
        : '<div class="empty-state"><p>Aucune étude pour l’instant.</p><p class="muted">Lancez une première étude autour du laboratoire : une à deux minutes pour la détection, environ une minute par lieu analysé en détail.</p></div>'}`;
    $('#et-new', root).addEventListener('click', assistant);
    $$('.etude-card', root).forEach(c => {
      $('[data-open]', c).addEventListener('click', () => ouvrir(c.dataset.id));
      const d = $('[data-del]', c); if (d) d.addEventListener('click', async () => {
        if (!await GA.ui.confirmBox('Supprimer l’étude', 'Supprimer cette étude et ses décisions ? Les lieux restent dans le référentiel et les dossiers CRM créés ne sont pas touchés.', 'Supprimer', true)) return;
        if (await run(() => GA.sourcing.supprimerEtude(c.dataset.id).then(() => true), 'Étude supprimée')) renderListe();
      });
    });
  }

  /* ---------- Assistant de nouvelle étude ---------- */
  function assistant() {
    const labos = (GA.store.sites || []).filter(s => s.type === 'laboratoire' && s.lat != null && s.statut !== 'retire');
    const today = new Date().toLocaleDateString('fr-FR');
    const m = modal('Nouvelle étude de sourcing', `<form id="ws-form" class="ws">
      <label class="fld"><span>Centre de l’étude</span><select id="ws-centre">${labos.map((s, i) => `<option value="${i}">${esc(s.nom)} (laboratoire)</option>`).join('')}<option value="adr">Une autre adresse…</option></select></label>
      <label class="fld" id="ws-adr-l" ${labos.length ? 'hidden' : ''}><span>Adresse</span><input id="ws-adr" placeholder="Ex. : Taverny, place de la gare"></label>
      <label class="fld"><span>Rayon (km)</span><input id="ws-r" type="number" min="1" max="25" step="0.5" value="${labos[0] ? labos[0].distance_max_km || 10 : 10}"></label>
      <fieldset class="fld"><span>Typologies recherchées</span><div class="ws-typos">${GA.TYPOLOGIES.filter(t => t.key !== 'autre').map(t => `<label class="chk"><input type="checkbox" value="${t.key}" checked> ${t.icon} ${esc(t.label)}</label>`).join('')}</div></fieldset>
      <label class="fld"><span>Analyse complète (moteur v2, distance par la route) des meilleurs lieux livrables</span>
        <select id="ws-n"><option value="0">Aucune (pré-score seulement)</option><option value="5">5 lieux (≈ 5 min)</option><option value="10" selected>10 lieux (≈ 10 min)</option><option value="20">20 lieux (≈ 20 min)</option></select></label>
      <label class="fld"><span>Nom</span><input id="ws-nom" value=""></label>
      <p class="hint">Gardez l’onglet ouvert pendant l’analyse. Vous pouvez l’arrêter à tout moment : les lieux déjà traités sont enregistrés.</p>
      <div id="ws-prog" class="ws-prog" hidden></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Fermer</button><button type="button" class="btn" id="ws-stop" hidden>Arrêter les analyses</button><button class="btn primary" id="ws-go">Lancer l’étude</button></div></form>`, { wide: true });
    const nomAuto = () => { const v = $('#ws-centre', m.el).value; return `Étude ${v === 'adr' ? ($('#ws-adr', m.el).value || 'adresse') : labos[+v].nom} · ${$('#ws-r', m.el).value} km · ${today}`; };
    const syncNom = () => { const n = $('#ws-nom', m.el); if (!n.dataset.touched) n.value = nomAuto(); };
    $('#ws-nom', m.el).addEventListener('input', e => { e.target.dataset.touched = '1'; });
    $('#ws-centre', m.el).addEventListener('change', e => { $('#ws-adr-l', m.el).hidden = e.target.value !== 'adr'; if (e.target.value !== 'adr') $('#ws-r', m.el).value = labos[+e.target.value].distance_max_km || 10; syncNom(); });
    ['#ws-r', '#ws-adr'].forEach(s => $(s, m.el).addEventListener('input', syncNom));
    if (!labos.length) $('#ws-centre', m.el).value = 'adr';
    syncNom();
    let stop = false;
    $('#ws-stop', m.el).addEventListener('click', () => { stop = true; $('#ws-stop', m.el).disabled = true; $('#ws-stop', m.el).textContent = 'Arrêt après le lieu en cours…'; });
    $('#ws-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const typologies = $$('.ws-typos input:checked', m.el).map(x => x.value);
      if (!typologies.length) { GA.ui.toast('Choisissez au moins une typologie.', 'err'); return; }
      const rayon_km = Math.min(25, Math.max(1, +$('#ws-r', m.el).value || 10));
      const go = $('#ws-go', m.el), prog = $('#ws-prog', m.el);
      go.disabled = true; prog.hidden = false; $('#ws-stop', m.el).hidden = false;
      const id = await run(async () => {
        let centre;
        const v = $('#ws-centre', m.el).value;
        if (v === 'adr') {
          const q = $('#ws-adr', m.el).value.trim(); if (!q) throw new Error('Indiquez l’adresse du centre.');
          const d = await GA.moteur.getJson('https://data.geopf.fr/geocodage/search?limit=1&q=' + encodeURIComponent(q), 3);
          const f = d.features && d.features[0]; if (!f) throw new Error('Adresse introuvable.');
          centre = { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label };
        } else { const s = labos[+v]; centre = { lat: s.lat, lon: s.lon, label: s.nom, site_id: s.id }; }
        return GA.sourcing.lancer({ nom: $('#ws-nom', m.el).value.trim() || nomAuto(), centre, rayon_km, typologies, profondeur: +$('#ws-n', m.el).value },
          t => { prog.textContent = t; }, () => stop);
      }, 'Étude terminée');
      if (id) { m.close(); ouvrir(id); } else { go.disabled = false; $('#ws-stop', m.el).hidden = true; prog.textContent = ''; }
    });
  }

  /* ---------- Une étude ---------- */
  async function ouvrir(id) {
    root.innerHTML = '<p class="muted">Chargement de l’étude…</p>';
    if (!st.etudes.length) st.etudes = await GA.sourcing.listeEtudes().catch(() => []);
    st.etude = st.etudes.find(e => e.id === id) || { id, nom: 'Étude', params: {}, synthese: {} };
    st.lieux = await GA.sourcing.chargerEtude(id);
    st.sel.clear();
    renderEtude();
  }

  function filtres() {
    const q = st.q.toLowerCase();
    return st.lieux.filter(x => (!st.typo || x.typologie === st.typo)
      && (st.decision === 'tous' || (st.decision === 'a_trier' ? !x.decision : x.decision === st.decision))
      && (!st.livrables || !x.dims.logistique || x.dims.logistique.niveau !== 'hors')
      && (!st.preuve || 'ABCD'.indexOf(x.preuve || 'D') <= 'ABCD'.indexOf(st.preuve))
      && (!q || (x.nom + ' ' + (x.commune || '') + ' ' + (x.adresse || '')).toLowerCase().includes(q)))
      .sort((a, b) => (b.note || 0) - (a.note || 0));
  }

  function renderEtude() {
    const e = st.etude, s = e.synthese || {}, p = e.params || {};
    const list = filtres();
    const nDec = k => st.lieux.filter(x => (x.decision || '') === k).length;
    root.innerHTML = `<div class="opp-tools"><button class="btn ghost" id="et-back">← Études</button><b>${esc(e.nom)}</b>
        <span class="muted small">${fmtDate(e.created_at)} · ${st.lieux.length} lieux · ${nDec('retenu')} retenus · ${nDec('attente')} en attente · ${nDec('ecarte')} écartés${s.nouveaux != null ? ' · ' + s.nouveaux + ' nouveaux' : ''}</span>
        <span class="grow"></span><button class="btn" id="et-map">Voir sur la carte</button><button class="btn" id="et-cmp" ${st.sel.size >= 2 ? '' : 'disabled'}>Comparer (${st.sel.size})</button></div>
      <div class="opp-tools">
        <input id="et-q" type="search" placeholder="Rechercher un lieu, une commune…" value="${esc(st.q)}">
        <select id="et-typo"><option value="">Toutes typologies</option>${GA.TYPOLOGIES.filter(t => st.lieux.some(x => x.typologie === t.key)).map(t => `<option value="${t.key}" ${st.typo === t.key ? 'selected' : ''}>${t.icon} ${esc(t.label)} (${st.lieux.filter(x => x.typologie === t.key).length})</option>`).join('')}</select>
        <select id="et-dec">${[['a_trier', 'À trier'], ['retenu', 'Retenus'], ['attente', 'En attente'], ['ecarte', 'Écartés'], ['tous', 'Toutes décisions']].map(([k, l]) => `<option value="${k}" ${st.decision === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="et-pr"><option value="">Toute qualité d’info</option><option value="A" ${st.preuve === 'A' ? 'selected' : ''}>Officielle (A)</option><option value="B" ${st.preuve === 'B' ? 'selected' : ''}>A ou B</option></select>
        <label class="chk"><input type="checkbox" id="et-liv" ${st.livrables ? 'checked' : ''}> Livrables seulement</label>
      </div>
      <div class="table-wrap"><table class="crm-table stat-table et-table"><thead><tr><th></th><th>#</th><th>Lieu</th><th>Potentiel</th><th>Logistique</th><th>Technique</th><th>Commercial</th><th>Info</th><th>Décision</th><th></th></tr></thead>
      <tbody>${list.map((x, i) => `<tr data-id="${esc(x.id)}">
        <td><input type="checkbox" data-sel ${st.sel.has(x.id) ? 'checked' : ''} aria-label="Sélectionner pour comparer"></td><td class="rang">${i + 1}</td>
        <td><b>${T(x.typologie).icon} ${esc(x.nom)}</b>${x.nouveau ? ' <span class="tag ok">nouveau</span>' : ''}<div class="muted small">${esc([x.adresse, x.commune].filter(Boolean).join(', ') || T(x.typologie).label)}</div></td>
        <td>${potHtml(x)}</td><td>${tag(x.dims.logistique)}<div class="muted small">${esc(x.dims.logistique ? x.dims.logistique.texte.replace(/ \(.*\)$/, '') : '')}</div></td>
        <td>${tag(x.dims.technique)}</td><td>${tag(x.dims.commercial)}</td><td>${tag({ niveau: x.preuve || 'D', texte: x.dims.information && x.dims.information.texte })}</td>
        <td>${decPill(x.decision)}</td><td class="t-act"><button class="btn ghost" data-det>Détail</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">Aucun lieu avec ces filtres.</td></tr>'}</tbody></table></div>
      <p class="hint">Potentiel : pré-score local (habitants 35, flux propre au lieu 30, commerces et services 20, concurrence 15, puis malus de proximité du réseau) ou score complet du moteur v2 quand le lieu a été analysé.
        Logistique : distance au laboratoire (estimée à vol d’oiseau × 1,3, mesurée par la route après analyse). Technique, commercial et information sont des repères qualitatifs : ils ne sont jamais additionnés au potentiel.</p>`;
    $('#et-back', root).addEventListener('click', renderListe);
    $('#et-q', root).addEventListener('input', e => { st.q = e.target.value; const pos = e.target.selectionStart; renderEtude(); const n = $('#et-q', root); n.focus(); n.setSelectionRange(pos, pos); });
    $('#et-typo', root).addEventListener('change', e => { st.typo = e.target.value; renderEtude(); });
    $('#et-dec', root).addEventListener('change', e => { st.decision = e.target.value; renderEtude(); });
    $('#et-pr', root).addEventListener('change', e => { st.preuve = e.target.value; renderEtude(); });
    $('#et-liv', root).addEventListener('change', e => { st.livrables = e.target.checked; renderEtude(); });
    $('#et-map', root).addEventListener('click', () => GA.mapView.showLieux(list.map(x => ({ id: x.id, nom: x.nom, lat: x.lat, lon: x.lon, note: x.note != null ? Math.round(x.note) : null, decision: x.decision, color: T(x.typologie).color })),
      { centre: p.centre ? { lat: p.centre.lat, lon: p.centre.lon, rayon: (p.rayon_km || 10) * 1000 } : null, onClick: id => { GA.app.go('opp'); detail(id); } }));
    $('#et-cmp', root).addEventListener('click', comparer);
    $$('tr[data-id]', root).forEach(tr => {
      $('[data-det]', tr).addEventListener('click', () => detail(tr.dataset.id));
      $('[data-sel]', tr).addEventListener('change', e => { if (e.target.checked) { if (st.sel.size >= 4) { e.target.checked = false; GA.ui.toast('Quatre lieux au plus.', 'err'); return; } st.sel.add(tr.dataset.id); } else st.sel.delete(tr.dataset.id); const b = $('#et-cmp', root); b.disabled = st.sel.size < 2; b.textContent = `Comparer (${st.sel.size})`; });
    });
  }

  function dimsHtml(x) {
    const d = x.dims, row = (lab, v, extra) => `<tr><th>${lab}</th><td>${v}${extra ? `<div class="muted small">${extra}</div>` : ''}</td></tr>`;
    return `<table class="dims"><tbody>
      ${row('Potentiel géographique', potHtml(x), esc(d.potentiel ? d.potentiel.texte : ''))}
      ${row('Faisabilité logistique', tag(d.logistique), esc(d.logistique ? d.logistique.texte : ''))}
      ${row('Faisabilité technique', tag(d.technique), esc(d.technique ? d.technique.texte : ''))}
      ${row('Faisabilité commerciale', tag(d.commercial), esc(d.commercial ? d.commercial.texte : ''))}
      ${row('Qualité de l’information', tag({ niveau: x.preuve || 'D' }), esc(d.information ? d.information.texte : ''))}</tbody></table>`;
  }

  async function detail(id) {
    const x = st.lieux.find(l => l.id === id); if (!x) return;
    const pre = x.ev.pre || { criteres: [] }, a = x.ev.analyse;
    const m = modal(`${T(x.typologie).icon} ${x.nom}`, `<div class="lieu-det">
      <p class="muted small">${esc(T(x.typologie).label)}${x.adresse || x.commune ? ' · ' + esc([x.adresse, x.commune].filter(Boolean).join(', ')) : ''} · ${decPill(x.decision)}${x.decision_motif ? ' <span class="muted small">' + esc(x.decision_motif) + '</span>' : ''}</p>
      ${dimsHtml(x)}
      ${x.raison ? `<p class="small">${esc(x.raison)}</p>` : ''}
      <details ${a ? '' : 'open'}><summary>Pré-score : ${pre.total}/100</summary><table class="score-det"><tbody>${pre.criteres.map(c => `<tr><td>${esc(c.lab)}<div class="muted small">${esc(c.val)}</div></td><td class="pts">${c.pts == null ? '—' : c.pts}<small>/${c.w}</small></td></tr>`).join('')}
        ${(pre.malus || []).map(mm => `<tr><td>${esc(mm.lab)}</td><td class="pts">${mm.pts}</td></tr>`).join('')}</tbody></table></details>
      ${a ? `<details open><summary>Analyse complète (moteur v2)</summary>${GA.scoreView.resume(a, { typologie: x.typologie })}${GA.scoreView.detailHtml(a)}</details>` : ''}
      <h3>Acteurs</h3><div id="ld-act" class="small muted">Chargement…</div>
      <p class="muted small">Sources : ${(x.sources || []).map(s => esc(s.src)).join(' · ')}</p>
      <div class="modal-actions lieu-act">
        <button class="btn" data-a="analyse">${a ? 'Recalculer' : 'Analyse complète'}</button>
        <button class="btn" data-a="carte">Carte</button>
        <span class="grow"></span>
        <button class="btn" data-a="ecarte">Écarter</button><button class="btn" data-a="attente">En attente</button>
        ${x.dims.commercial && x.dims.commercial.dossiers && x.dims.commercial.dossiers.length ? `<button class="btn primary" data-a="dossier-ouvrir">Ouvrir le dossier CRM</button>` : `<button class="btn primary" data-a="crm">Retenir et créer le dossier CRM</button>`}
      </div><div class="muted small" data-step></div></div>`, { wide: true });
    let acteurs = [];
    const drawActeurs = () => {
      const box = $('#ld-act', m.el); if (!box) return;
      box.classList.remove('muted');
      box.innerHTML = (acteurs.length ? `<ul class="acteurs">${acteurs.map(a2 => `<li><b>${esc(a2.nom)}</b> <span class="tag">${esc(ROLES[a2.role] || a2.role)}</span> <span class="tag ${a2.certitude === 'verifie' ? 'ok' : a2.certitude === 'hypothese' ? 'warn' : ''}">${esc(CERT[a2.certitude] || a2.certitude)}</span>
          ${a2.siren ? `<a class="small" href="https://annuaire-entreprises.data.gouv.fr/entreprise/${esc(a2.siren)}" target="_blank" rel="noopener">fiche ↗</a>` : ''}<div class="muted small">${esc(a2.source || '')}${a2.infos && a2.infos.dirigeants && a2.infos.dirigeants.length ? ' · dirigeants : ' + a2.infos.dirigeants.map(dd => esc([dd.nom, dd.qualite].filter(Boolean).join(', '))).join(' ; ') : ''}</div></li>`).join('')}</ul>`
        : '<p class="muted">Aucun acteur identifié pour ce lieu.</p>') + '<button class="btn ghost" id="ld-find">Identifier les acteurs (SIRENE, cadastre, commune)</button>';
      $('#ld-find', m.el).addEventListener('click', async ev => {
        ev.target.disabled = true;
        const r = await run(() => GA.sourcing.identifierActeurs(x, t => { ev.target.textContent = t; }), 'Acteurs identifiés');
        if (r) { acteurs = r; drawActeurs(); } else ev.target.disabled = false;
      });
    };
    GA.sourcing.acteursDe(x.id).then(r => { acteurs = r; drawActeurs(); }).catch(() => drawActeurs());
    const step = $('[data-step]', m.el);
    $$('[data-a]', m.el).forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.a;
      if (act === 'carte') { m.close(); return GA.mapView.showLieux([{ id: x.id, nom: x.nom, lat: x.lat, lon: x.lon, note: x.note, decision: x.decision }], { fit: true }); }
      if (act === 'dossier-ouvrir') { m.close(); return GA.app.openProspect(x.dims.commercial.dossiers[0]); }
      if (act === 'analyse') {
        b.disabled = true;
        const ev = await run(() => GA.sourcing.analyserLieu(x, t => { step.textContent = t; }), 'Analyse terminée');
        step.textContent = '';
        if (ev) { x.ev = ev; x.dims = Object.assign({}, ev.dims, { commercial: x.dims.commercial }); x.note = x.dims.potentiel.note; m.close(); renderEtude(); detail(x.id); } else b.disabled = false;
        return;
      }
      if (act === 'ecarte' || act === 'attente') {
        const motif = act === 'ecarte' ? await demanderMotif() : '';
        if (motif === null) return;
        if (await run(() => GA.sourcing.decider(x.etude_id, x.id, act, motif), act === 'ecarte' ? 'Lieu écarté' : 'Lieu mis en attente')) { x.decision = act; x.decision_motif = motif; m.close(); renderEtude(); }
        return;
      }
      if (act === 'crm') {
        b.disabled = true;
        const p = await run(() => GA.sourcing.creerDossier(x, acteurs), 'Dossier CRM créé : ' + x.nom);
        if (p) { x.decision = 'retenu'; m.close(); await GA.app.reload(); GA.app.openProspect(p.id); } else b.disabled = false;
      }
    }));
  }

  function demanderMotif() {
    return new Promise(res => {
      const m = modal('Écarter ce lieu', `<form id="dm-f"><label class="fld"><span>Motif</span><select id="dm-s">
        ${['Potentiel insuffisant', 'Trop loin du laboratoire', 'Emplacement inadapté (accès, place, électricité)', 'Concurrence déjà installée', 'Doublon ou lieu inexistant', 'Autre'].map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="fld"><span>Précision</span><input id="dm-p"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Écarter</button></div></form>`);
      let done = false;
      $('#dm-f', m.el).addEventListener('submit', e => { e.preventDefault(); done = true; const v = [$('#dm-s', m.el).value, $('#dm-p', m.el).value.trim()].filter(Boolean).join(' : '); m.close(); res(v); });
      const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (!done) res(null); } });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  function comparer() {
    const xs = [...st.sel].map(id => st.lieux.find(l => l.id === id)).filter(Boolean);
    const crit = [...new Set(xs.flatMap(x => (x.ev.pre ? x.ev.pre.criteres : []).map(c => c.lab)))];
    const l = (lab, f) => `<tr><th>${lab}</th>${xs.map(x => `<td>${f(x)}</td>`).join('')}</tr>`;
    modal('Comparer les lieux', `<div class="table-wrap"><table class="crm-table cmp-table"><thead><tr><th></th>${xs.map(x => `<th>${T(x.typologie).icon} ${esc(x.nom)}<div class="muted small">${esc(x.commune || '')}</div></th>`).join('')}</tr></thead><tbody>
      ${l('Potentiel', potHtml)}
      ${l('Logistique', x => tag(x.dims.logistique) + `<div class="muted small">${esc(x.dims.logistique ? x.dims.logistique.texte : '')}</div>`)}
      ${l('Technique', x => tag(x.dims.technique))}${l('Commercial', x => tag(x.dims.commercial) + `<div class="muted small">${esc(x.dims.commercial ? x.dims.commercial.texte : '')}</div>`)}
      ${l('Information', x => tag({ niveau: x.preuve || 'D' }))}
      ${crit.map(c => l(esc(c), x => { const k = (x.ev.pre ? x.ev.pre.criteres : []).find(y => y.lab === c); return k ? `${k.pts == null ? '—' : k.pts}<small>/${k.w}</small><div class="muted small">${esc(k.val)}</div>` : '—'; })).join('')}
      ${l('Malus réseau', x => (x.ev.pre && x.ev.pre.malus || []).map(mm => mm.pts).join(' ') || '—')}
      ${l('Décision', x => decPill(x.decision))}</tbody></table></div>`, { wide: true });
  }

  return {
    async render(el) { root = el; if (st.etude) renderEtude(); else await renderListe(); },
    ouvrir, detail,
  };
})();
