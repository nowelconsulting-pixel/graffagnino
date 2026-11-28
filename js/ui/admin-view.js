/* Onglet Administration (rôle administrateur) : utilisateurs, réseau (laboratoires et distributeurs),
   secteurs et objectifs commerciaux, concurrents, réglages (seuils du pipeline et du moteur). */
window.GA = window.GA || {};

GA.adminView = (function () {
  const { $, $$, esc, fmtDate, avatar, run, modal, confirmBox } = GA.ui;
  const roleLabel = k => (GA.ROLES.find(r => r.key === k) || {}).label || k;
  const ONGLETS = [['users', 'Utilisateurs'], ['reseau', 'Réseau'], ['objectifs', 'Secteurs et objectifs'], ['concurrents', 'Concurrents'], ['reglages', 'Réglages']];
  const STATUTS_SITE = { en_service: 'En service', suspendu: 'Suspendu', retire: 'Retiré', hypothetique: 'Projet (hypothèse)' };
  const STATUTS_OBJ = { actif: 'Actif', atteint: 'Atteint', pause: 'En pause', archive: 'Archivé' };
  let onglet = 'users';

  async function geocode(q) {
    const d = await GA.moteur.getJson('https://data.geopf.fr/geocodage/search?limit=1&q=' + encodeURIComponent(q), 3);
    const f = d.features && d.features[0]; if (!f) throw new Error('Adresse introuvable.');
    return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], adresse: f.properties.name || '', commune: f.properties.city || '', label: f.properties.label };
  }
  const opts = (obj, v) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  async function apres() { await GA.app.reload(); render(); }

  function render() {
    $('#admin-new').hidden = onglet !== 'users';
    $('#admin-body').innerHTML = `<div class="tabs-h" role="tablist">${ONGLETS.map(([k, l]) => `<button class="tab ${k === onglet ? 'on' : ''}" data-atab="${k}">${l}</button>`).join('')}</div><div id="admin-tab"></div>`;
    $$('[data-atab]').forEach(b => b.addEventListener('click', () => { onglet = b.dataset.atab; render(); }));
    ({ users, reseau, objectifs, concurrents, reglages })[onglet]();
  }

  /* ---------- Utilisateurs ---------- */
  function users() {
    const me = GA.auth.current();
    const list = GA.store.users.slice().sort((a, b) => (b.actif - a.actif) || a.nom.localeCompare(b.nom));
    const nb = id => GA.store.prospects.filter(p => p.responsable_id === id).length;
    $('#admin-tab').innerHTML = `
      <div class="table-wrap"><table class="crm-table admin-table">
        <thead><tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Fonction</th><th>Dossiers</th><th>Statut</th><th></th></tr></thead>
        <tbody>${list.map(u => `<tr class="${u.actif ? '' : 'inactive'}">
          <td class="t-user">${avatar(u)} <b>${esc(u.nom)}</b>${u.id === me.id ? ' <span class="muted">(vous)</span>' : ''}</td>
          <td>${esc(u.email)}</td>
          <td><span class="tag ${u.role === 'admin' ? 'admin' : ''}">${esc(roleLabel(u.role))}</span></td>
          <td>${esc(u.fonction) || '<span class="muted">—</span>'}</td>
          <td>${nb(u.id)}</td>
          <td>${u.actif ? '<span class="tag ok">Actif</span>' : '<span class="tag out">Désactivé</span>'}</td>
          <td class="t-act"><button class="btn ghost" data-edit="${u.id}">Modifier</button>
            ${u.id === me.id ? '' : `<button class="btn ghost" data-toggle="${u.id}">${u.actif ? 'Désactiver' : 'Réactiver'}</button>`}</td>
        </tr>`).join('')}</tbody></table></div>
      <div class="admin-foot"><div class="note">Les utilisateurs désactivés ne peuvent plus se connecter ; leurs dossiers et leurs échanges sont conservés.
        Les comptes, emails et mots de passe sont gérés dans Supabase (Authentication → Users).</div></div>`;
    $$('[data-edit]').forEach(b => b.addEventListener('click', () => editUser(b.dataset.edit)));
    $$('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const u = GA.store.users.find(x => x.id === b.dataset.toggle);
      if (u.actif && !await confirmBox('Désactiver le compte', `${u.nom} ne pourra plus se connecter. Ses dossiers restent visibles.`, 'Désactiver', true)) return;
      await run(() => GA.svc.setUserActive(u.id, !u.actif), u.actif ? 'Compte désactivé' : 'Compte réactivé');
      await apres();
    }));
  }

  // Création d'un compte : dans Supabase, la clé de service ne doit jamais être dans le navigateur.
  function howToCreate() {
    modal('Nouvel utilisateur', `
      <ol class="steps">
        <li>Ouvrez le tableau de bord Supabase du projet, menu <b>Authentication → Users</b>.</li>
        <li>Cliquez sur <b>Add user → Create new user</b>, saisissez l’email et un mot de passe, cochez <b>Auto Confirm User</b>.</li>
        <li>Revenez ici et rechargez la page : le compte apparaît avec le rôle Utilisateur. Cliquez sur <b>Modifier</b> pour indiquer son nom, sa fonction et son rôle.</li>
      </ol>
      <p class="hint">Communiquez le mot de passe à la personne par un autre canal que l’email.</p>
      <div class="modal-actions"><button class="btn primary" data-close>Compris</button></div>`);
  }

  function editUser(id) {
    const u = GA.store.users.find(x => x.id === id);
    const m = modal('Modifier l’utilisateur', `
      <form id="u-form" novalidate>
        <label class="fld"><span>Nom complet *</span><input id="u-nom" value="${esc(u.nom)}" required></label>
        <label class="fld"><span>Email de connexion</span><input id="u-email" type="email" value="${esc(u.email)}" disabled title="Modifiable dans Supabase (Authentication → Users)"></label>
        <div class="two"><label class="fld"><span>Fonction</span><input id="u-fct" value="${esc(u.fonction)}"></label>
        <label class="fld"><span>Téléphone</span><input id="u-tel" value="${esc(u.telephone)}"></label></div>
        <label class="fld"><span>Rôle</span><select id="u-role">${GA.ROLES.map(r => `<option value="${r.key}" ${r.key === u.role ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
        <p class="hint">Administrateur : tous les espaces, gestion des utilisateurs, du réseau et des objectifs. Utilisateur : carte, sourcing et CRM ; modifie ses dossiers et les dossiers non attribués.</p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div>
      </form>`);
    $('#u-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const r = await run(() => GA.svc.saveUser(id, {
        nom: $('#u-nom', m.el).value, email: $('#u-email', m.el).value, fonction: $('#u-fct', m.el).value,
        telephone: $('#u-tel', m.el).value, role: $('#u-role', m.el).value,
      }), 'Utilisateur modifié');
      if (r) { m.close(); await apres(); GA.app.renderUser(); }
    });
  }

  /* ---------- Réseau ---------- */
  function reseau() {
    const s = (GA.store.sites || []).slice().sort((a, b) => (a.type > b.type ? 1 : -1) || (a.nom > b.nom ? 1 : -1));
    $('#admin-tab').innerHTML = `<div class="opp-tools"><span class="muted">Laboratoires : point de départ des livraisons et périmètre (distance maximale par la route).
        Distributeurs en service : malus de proximité pour les emplacements voisins. Un projet « hypothèse » permet de tester l’effet d’un futur site sans l’activer.</span>
        <span class="grow"></span><button class="btn primary" id="ad-site">+ Site</button></div>
      <div class="table-wrap"><table class="crm-table admin-table"><thead><tr><th>Site</th><th>Type</th><th>Statut</th><th>Adresse</th><th>Position</th><th>Installé le</th><th></th></tr></thead>
      <tbody>${s.map(x => `<tr><td><b>${esc(x.nom)}</b>${x.infos ? `<div class="muted small">${esc(x.infos)}</div>` : ''}</td>
        <td>${x.type === 'laboratoire' ? 'Laboratoire · ' + (x.distance_max_km || 10) + ' km max' : 'Distributeur'}</td>
        <td><span class="tag ${x.statut === 'en_service' ? 'ok' : x.statut === 'retire' ? 'out' : 'warn'}">${esc(STATUTS_SITE[x.statut] || x.statut)}</span></td>
        <td>${esc([x.adresse, x.commune].filter(Boolean).join(', ')) || '<span class="muted">—</span>'}</td>
        <td class="muted small">${x.lat != null ? x.lat.toFixed(5) + ', ' + x.lon.toFixed(5) : 'non positionné'}</td>
        <td>${x.date_installation ? fmtDate(x.date_installation) : '<span class="muted">—</span>'}</td>
        <td class="t-act"><button class="btn ghost" data-s="${x.id}">Modifier</button>${x.prospect_id ? `<button class="btn ghost" data-p="${x.prospect_id}">Dossier</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucun site.</td></tr>'}</tbody></table></div>
      <p class="hint">Retirer un site plutôt que le supprimer conserve l’historique. Un dossier passé à « Installé » ajoute automatiquement son distributeur ici.</p>`;
    $('#ad-site').addEventListener('click', () => siteForm(null));
    $$('[data-s]').forEach(b => b.addEventListener('click', () => siteForm(s.find(x => x.id === b.dataset.s))));
    $$('[data-p]').forEach(b => b.addEventListener('click', () => GA.app.openProspect(b.dataset.p)));
  }

  function siteForm(x) {
    const v = x || { type: 'distributeur', statut: 'en_service', distance_max_km: 10 };
    const m = modal(x ? 'Modifier le site' : 'Nouveau site', `<form id="si-f" novalidate>
      <label class="fld"><span>Nom *</span><input id="si-nom" value="${esc(v.nom || '')}"></label>
      <div class="two"><label class="fld"><span>Type</span><select id="si-type">${opts({ distributeur: 'Distributeur', laboratoire: 'Laboratoire' }, v.type)}</select></label>
      <label class="fld"><span>Statut</span><select id="si-st">${opts(STATUTS_SITE, v.statut)}</select></label></div>
      <label class="fld"><span>Adresse ${x && x.lat != null ? '(laisser telle quelle pour garder la position)' : '*'}</span><input id="si-adr" value="${esc([v.adresse, v.commune].filter(Boolean).join(', '))}"></label>
      <div class="two"><label class="fld"><span>Distance maximale de livraison (km, laboratoire)</span><input id="si-km" type="number" min="1" step="0.5" value="${v.distance_max_km || 10}"></label>
      <label class="fld"><span>Date d’installation</span><input id="si-date" type="date" value="${esc(v.date_installation || '')}"></label></div>
      <label class="fld"><span>Informations d’exploitation</span><textarea id="si-inf" rows="3" placeholder="Modèle de machine, contact sur place, électricité, horaires d’accès…">${esc(v.infos || '')}</textarea></label>
      <div class="modal-actions">${x ? '<button type="button" class="btn danger" id="si-del">Supprimer</button><span class="grow"></span>' : ''}<button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
    const adr0 = $('#si-adr', m.el).value;
    $('#si-f', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const r = await run(async () => {
        const d = { nom: $('#si-nom', m.el).value.trim(), type: $('#si-type', m.el).value, statut: $('#si-st', m.el).value,
          distance_max_km: +$('#si-km', m.el).value || 10, date_installation: $('#si-date', m.el).value || null, infos: $('#si-inf', m.el).value.trim() };
        if (!d.nom) throw new Error('Le nom est obligatoire.');
        const adr = $('#si-adr', m.el).value.trim();
        if (!x || adr !== adr0 || x.lat == null) { if (!adr) throw new Error('Indiquez l’adresse du site.'); const g = await geocode(adr); Object.assign(d, { lat: g.lat, lon: g.lon, adresse: g.adresse, commune: g.commune }); }
        return GA.svc.saveRef('sites', d, x && x.id);
      }, 'Site enregistré');
      if (r) { m.close(); await apres(); }
    });
    const del = $('#si-del', m.el);
    if (del) del.addEventListener('click', async () => {
      if (!await confirmBox('Supprimer le site', 'Supprimer définitivement ce site ? Préférez le statut « Retiré » pour garder l’historique.', 'Supprimer', true)) return;
      if (await run(() => GA.svc.deleteRef('sites', x.id).then(() => true), 'Site supprimé')) { m.close(); await apres(); }
    });
  }

  /* ---------- Secteurs et objectifs ---------- */
  function objectifs() {
    const S = GA.store.secteurs || [], O = GA.store.objectifs || [], P = GA.store.prospects;
    const signes = o => P.filter(p => p.objectif_id === o.id && (p.statut === 'signe' || p.statut === 'installe')).length;
    $('#admin-tab').innerHTML = `<div class="bord-grid">
      <section class="card"><h2>Secteurs <button class="btn ghost" id="ad-sec">+ Secteur</button></h2>
        <ul class="obj-list">${S.map(s => `<li><b>${esc(s.nom)}</b> ${s.actif ? '' : '<span class="tag">inactif</span>'} <span class="muted small">${P.filter(p => p.secteur_id === s.id).length} dossier(s)</span> <button class="link" data-sec="${s.id}">Modifier</button></li>`).join('') || '<li class="muted">Aucun secteur.</li>'}</ul>
        <p class="hint">Un secteur regroupe les dossiers d’un territoire (ex. Val-d’Oise, Oise). Il ne change pas le calcul du score.</p></section>
      <section class="card"><h2>Objectifs commerciaux <button class="btn ghost" id="ad-obj">+ Objectif</button></h2>
        <ul class="obj-list">${O.map(o => `<li><b>${esc(o.nom)}</b> <span class="tag ${o.statut === 'actif' ? 'ok' : ''}">${esc(STATUTS_OBJ[o.statut] || o.statut)}</span>
          <span class="muted small">${signes(o)} / ${o.cible} signé(s)${o.date_cible ? ' · repère ' + fmtDate(o.date_cible) : ''}${o.secteur_id ? ' · ' + esc((S.find(s => s.id === o.secteur_id) || {}).nom || '') : ''}</span> <button class="link" data-obj="${o.id}">Modifier</button></li>`).join('') || '<li class="muted">Aucun objectif.</li>'}</ul>
        <p class="hint">La date repère sert au tableau de bord ; elle ne ferme rien. Les nouveaux dossiers sont rattachés au premier objectif actif.</p></section></div>`;
    $('#ad-sec').addEventListener('click', () => secForm(null));
    $('#ad-obj').addEventListener('click', () => objForm(null));
    $$('[data-sec]').forEach(b => b.addEventListener('click', () => secForm(S.find(s => s.id === b.dataset.sec))));
    $$('[data-obj]').forEach(b => b.addEventListener('click', () => objForm(O.find(o => o.id === b.dataset.obj))));
  }
  function secForm(x) {
    const m = modal(x ? 'Modifier le secteur' : 'Nouveau secteur', `<form id="sc-f"><label class="fld"><span>Nom *</span><input id="sc-n" value="${esc(x ? x.nom : '')}"></label>
      <label class="chk"><input type="checkbox" id="sc-a" ${!x || x.actif ? 'checked' : ''}> Actif</label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
    $('#sc-f', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const nom = $('#sc-n', m.el).value.trim(); if (!nom) { GA.ui.toast('Le nom est obligatoire.', 'err'); return; }
      if (await run(() => GA.svc.saveRef('secteurs', { nom, actif: $('#sc-a', m.el).checked }, x && x.id), 'Secteur enregistré')) { m.close(); await apres(); }
    });
  }
  function objForm(x) {
    const v = x || { cible: 1, statut: 'actif' };
    const m = modal(x ? 'Modifier l’objectif' : 'Nouvel objectif', `<form id="ob-f">
      <label class="fld"><span>Nom *</span><input id="ob-n" value="${esc(v.nom || '')}" placeholder="Ex. : Deuxième distributeur"></label>
      <div class="two"><label class="fld"><span>Secteur</span><select id="ob-s"><option value="">Tous secteurs</option>${(GA.store.secteurs || []).map(s => `<option value="${s.id}" ${s.id === v.secteur_id ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></label>
      <label class="fld"><span>Nombre de signatures visées</span><input id="ob-c" type="number" min="1" value="${v.cible || 1}"></label></div>
      <div class="two"><label class="fld"><span>Date repère (facultative)</span><input id="ob-d" type="date" value="${esc(v.date_cible || '')}"></label>
      <label class="fld"><span>Statut</span><select id="ob-st">${opts(STATUTS_OBJ, v.statut)}</select></label></div>
      <label class="fld"><span>Notes</span><textarea id="ob-no" rows="2">${esc(v.notes || '')}</textarea></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
    $('#ob-f', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const d = { nom: $('#ob-n', m.el).value.trim(), secteur_id: $('#ob-s', m.el).value || null, cible: Math.max(1, +$('#ob-c', m.el).value || 1),
        date_cible: $('#ob-d', m.el).value || null, statut: $('#ob-st', m.el).value, notes: $('#ob-no', m.el).value.trim() };
      if (!d.nom) { GA.ui.toast('Le nom est obligatoire.', 'err'); return; }
      if (await run(() => GA.svc.saveRef('objectifs', d, x && x.id), 'Objectif enregistré')) { m.close(); await apres(); }
    });
  }

  /* ---------- Concurrents ---------- */
  function concurrents() {
    const C = GA.store.concurrents || [];
    $('#admin-tab').innerHTML = `<div class="opp-tools"><span class="muted">Distributeurs de pizzas et pizzerias relevés sur le terrain. Les distributeurs concurrents sont comptés dans le critère « concurrence » du moteur et affichés sur la carte.</span>
        <span class="grow"></span><button class="btn primary" id="ad-conc">+ Concurrent</button></div>
      <div class="table-wrap"><table class="crm-table admin-table"><thead><tr><th>Nom</th><th>Type</th><th>Position</th><th>Source</th><th>Notes</th><th>Relevé le</th><th></th></tr></thead>
      <tbody>${C.map(c => `<tr><td><b>${esc(c.nom)}</b> ${c.confirme ? '' : '<span class="tag warn">à confirmer</span>'}</td><td>${esc({ distributeur: 'Distributeur', pizzeria: 'Pizzeria', autre: 'Autre' }[c.type] || c.type)}</td>
        <td class="muted small">${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}</td><td>${esc(c.source || '')}</td><td class="small">${esc(c.notes || '')}</td><td>${fmtDate(c.created_at)}</td>
        <td class="t-act"><button class="btn ghost" data-c="${c.id}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucun concurrent relevé.</td></tr>'}</tbody></table></div>`;
    $('#ad-conc').addEventListener('click', concForm);
    $$('[data-c]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirmBox('Supprimer', 'Supprimer ce concurrent ?', 'Supprimer', true)) return;
      if (await run(() => GA.svc.deleteRef('concurrents', b.dataset.c).then(() => true), 'Concurrent supprimé')) await apres();
    }));
  }
  function concForm() {
    const m = modal('Nouveau concurrent', `<form id="co-f">
      <label class="fld"><span>Nom *</span><input id="co-n" placeholder="Ex. : distributeur Pizza 24/24"></label>
      <div class="two"><label class="fld"><span>Type</span><select id="co-t">${opts({ distributeur: 'Distributeur', pizzeria: 'Pizzeria', autre: 'Autre' }, 'distributeur')}</select></label>
      <label class="fld"><span>Source</span><select id="co-s">${opts({ terrain: 'Relevé terrain', internet: 'Internet', osm: 'OpenStreetMap' }, 'terrain')}</select></label></div>
      <label class="fld"><span>Adresse *</span><input id="co-a"></label>
      <label class="chk"><input type="checkbox" id="co-c" checked> Présence confirmée</label>
      <label class="fld"><span>Notes</span><input id="co-no" placeholder="Prix, horaires, état de la machine…"></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
    $('#co-f', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const r = await run(async () => {
        const nom = $('#co-n', m.el).value.trim(), adr = $('#co-a', m.el).value.trim();
        if (!nom || !adr) throw new Error('Nom et adresse obligatoires.');
        const g = await geocode(adr);
        return GA.svc.saveRef('concurrents', { nom, type: $('#co-t', m.el).value, source: $('#co-s', m.el).value, confirme: $('#co-c', m.el).checked, notes: [$('#co-no', m.el).value.trim(), g.label].filter(Boolean).join(' · '), lat: g.lat, lon: g.lon });
      }, 'Concurrent enregistré');
      if (r) { m.close(); await apres(); }
    });
  }

  /* ---------- Réglages ---------- */
  async function reglages() {
    const s = GA.pipe.seuils(), r = await GA.moteur.getReglages();
    $('#admin-tab').innerHTML = `<div class="bord-grid">
      <section class="card"><h2>Pipeline commercial</h2><form id="rg-seuils" class="reglages">
        <label class="tfld"><span>Seuil de « potentiel élevé » (matrice de priorisation, sur 100)</span><input id="rs-pot" type="number" min="0" max="100" value="${s.potentiel_eleve}"></label>
        <label class="tfld"><span>Dossier immobile après (jours sans activité)</span><input id="rs-imm" type="number" min="1" value="${s.immobile_jours}"></label>
        <label class="tfld"><span>Délai de relance proposé (jours)</span><input id="rs-rel" type="number" min="1" value="${s.relance_jours}"></label>
        <label class="tfld"><span>Réexamen d’un blocage proposé après (jours)</span><input id="rs-ree" type="number" min="1" value="${s.reexamen_jours}"></label>
        <div class="modal-actions"><button class="btn primary">Enregistrer</button></div></form></section>
      <section class="card"><h2>Moteur de score</h2><form id="rg-moteur" class="reglages">
        <label class="tfld"><span>Malus si un distributeur du réseau est à moins de (km / points)</span><span><input id="rg-k1" type="number" step="0.5" style="width:70px" value="${r.proximite[0] ? r.proximite[0].km : 1.5}"> km → <input id="rg-p1" type="number" style="width:70px" value="${r.proximite[0] ? r.proximite[0].pts : -10}"> pts</span></label>
        <label class="tfld"><span>… et à moins de</span><span><input id="rg-k2" type="number" step="0.5" style="width:70px" value="${r.proximite[1] ? r.proximite[1].km : 3}"> km → <input id="rg-p2" type="number" style="width:70px" value="${r.proximite[1] ? r.proximite[1].pts : -5}"> pts</span></label>
        <p class="hint">Les sites (laboratoires, distributeurs) et la distance maximale de livraison se règlent dans l’onglet Réseau. Les profils de pondération par typologie sont décrits dans le README.</p>
        <div class="modal-actions"><button class="btn primary">Enregistrer</button></div></form></section></div>`;
    $('#rg-seuils').addEventListener('submit', async e => {
      e.preventDefault();
      const v = { potentiel_eleve: +$('#rs-pot').value || 60, immobile_jours: +$('#rs-imm').value || 21, relance_jours: +$('#rs-rel').value || 7, reexamen_jours: +$('#rs-ree').value || 30 };
      if (await run(() => GA.svc.saveSeuils(v).then(() => true), 'Réglages enregistrés')) render();
    });
    $('#rg-moteur').addEventListener('submit', async e => {
      e.preventDefault();
      const n = JSON.parse(JSON.stringify(await GA.moteur.getReglages()));
      n.proximite = [{ km: +$('#rg-k1').value, pts: +$('#rg-p1').value }, { km: +$('#rg-k2').value, pts: +$('#rg-p2').value }].filter(x => x.km > 0);
      const lab = (GA.store.sites || []).find(x => x.type === 'laboratoire' && x.statut === 'en_service');
      if (lab) n.distanceMaxKm = lab.distance_max_km || n.distanceMaxKm;
      if (await run(() => GA.moteur.setReglages(n).then(() => true), 'Réglages du moteur enregistrés')) render();
    });
  }

  return {
    init() { $('#admin-new').addEventListener('click', howToCreate); },
    render,
    ouvrir(t) { onglet = t; GA.app.go('admin'); },
  };
})();
