/* Composants du pipeline commercial : barre d'étapes, contacts, conditions, jalons, journal,
   et fenêtres d'action (avancer, abandonner, bloquer, transmettre, installer, contact). */
window.GA = window.GA || {};

GA.pipeUI = (function () {
  const { $, $$, esc, fmtDate, fmtDateTime, run, modal, avatar } = GA.ui;
  const lab = (liste, k) => (liste.find(x => x.key === k) || {}).label || '';
  const userNom = id => (GA.store.users.find(u => u.id === id) || {}).nom || '—';
  const after = async (p, msg) => { if (msg) GA.ui.toast(msg); await GA.app.reload({ keepPanel: true }); if (GA.panel.current() === p.id) GA.panel.open(p.id); };

  /* ---------- Barre d'étapes ---------- */
  function stepper(p, ed) {
    const cur = GA.pipe.ordre(p.statut);
    const ab = p.statut === 'abandonne';
    return `<div class="stepper ${ab ? 'ab' : ''}">${GA.STATUTS.filter(s => s.key !== 'abandonne').map(s =>
      `<button type="button" class="st ${s.ordre < cur && !ab ? 'done' : ''} ${s.key === p.statut ? 'on' : ''}" data-etape="${s.key}" ${ed && !ab && s.key !== p.statut ? '' : 'disabled'} style="--c:${s.color}" title="${esc(s.label)}">
        <span class="dot"></span><span class="lb">${esc(s.court)}</span></button>`).join('')}
      ${ab ? `<span class="tag out">Abandonné · ${esc(lab(GA.MOTIFS_ABANDON, p.motif_abandon))}${p.motif_abandon_precision ? ' — ' + esc(p.motif_abandon_precision) : ''}</span>` : ''}</div>`;
  }

  function barreActions(p, ed) {
    if (!ed) return '';
    const me = GA.auth.current();
    const suivante = GA.STATUTS.find(s => s.ordre === GA.pipe.ordre(p.statut) + 1 && s.key !== 'abandonne');
    const b = [];
    if (p.statut === 'abandonne') b.push('<button class="btn primary" data-act="rouvrir">Rouvrir le dossier</button>');
    else if (p.statut === 'signe') b.push('<button class="btn primary" data-act="installer">Installé : ajouter au réseau</button>');
    else if (suivante && suivante.key !== 'installe') b.push(`<button class="btn primary" data-act="suivante" data-cible="${suivante.key}">→ ${esc(suivante.label)}</button>`);
    if (GA.pipe.estOuvert(p)) {
      b.push(p.bloque ? '<button class="btn" data-act="debloquer">Débloquer</button>' : '<button class="btn" data-act="bloquer">Bloquer</button>');
      b.push('<button class="btn ghost danger-t" data-act="abandonner">Abandonner</button>');
    }
    if (GA.perm.isAdmin(me) || p.responsable_id === me.id) b.push('<button class="btn ghost" data-act="transmettre">Transmettre</button>');
    return `<div class="actions-bar">${b.join('')}</div>`;
  }

  function bandeaux(p) {
    const out = [];
    if (p.bloque) out.push(`<div class="bandeau warn"><b>Bloqué</b> · ${esc(lab(GA.RAISONS_BLOCAGE, p.blocage_raison))}${p.blocage_precision ? ' — ' + esc(p.blocage_precision) : ''} · réexamen le ${fmtDate(p.reexamen_le)}${GA.pipe.aReexaminer(p) ? ' <b>(à réexaminer)</b>' : ''}</div>`);
    if (GA.pipe.sansAction(p)) out.push('<div class="bandeau">⚠ Aucune prochaine action : indiquez la suite à donner pour ne pas perdre ce dossier.</div>');
    const cat = GA.pipe.categorie(p);
    if (cat) {
      const c = GA.pipe.CATEGORIES[cat], av = GA.pipe.avancement(p);
      out.push(`<div class="bandeau cat" style="--c:${c.color}"><b>${c.label}</b> · ${esc(c.aide)}${av.raisons.length ? '<br><span class="small">À faire avancer : ' + esc(av.raisons.join(' · ')) + '</span>' : ''}</div>`);
    }
    return out.join('');
  }

  /* ---------- Contacts ---------- */
  function contactsHtml(p, ed) {
    const cs = GA.pipe.contactsDe(p).sort((a, b) => (b.principal - a.principal));
    const tel = t => t ? `<a href="tel:${esc(t.replace(/\s/g, ''))}">${esc(t)}</a>` : '';
    const mail = m => m ? `<a href="mailto:${esc(m)}">${esc(m)}</a>` : '';
    const it = c => { const i = GA.INTERETS.find(x => x.key === c.interet) || GA.INTERETS[0]; return `<span class="pill" style="--c:${i.color}">${esc(i.label)}</span>`; };
    return `<div class="contacts">${cs.length ? cs.map(c => `<div class="contact ${c.principal ? 'pr' : ''}" data-contact="${esc(c.id)}">
        <div class="ct-h">${c.principal ? '<span title="Contact principal">★</span>' : ''}<b>${esc(c.nom || c.entreprise)}</b>
          ${c.nom && c.entreprise ? `<span class="muted">· ${esc(c.entreprise)}</span>` : ''}${c.fonction ? `<span class="muted">· ${esc(c.fonction)}</span>` : ''}
          ${ed ? '<button class="link small" data-cedit>Modifier</button>' : ''}</div>
        <div class="ct-m"><span class="tag">${esc(lab(GA.ROLES_CONTACT, c.role))}</span><span class="tag">${esc(lab(GA.POUVOIRS, c.pouvoir))}</span>${it(c)}
          ${tel(c.telephone)} ${mail(c.email)}${c.source && c.source !== 'saisie' ? ` <span class="muted small">source : ${esc(c.source === 'migration_v1' ? 'saisie avant V2' : c.source)}</span>` : ''}</div>
        ${c.notes ? `<div class="small muted">${esc(c.notes)}</div>` : ''}</div>`).join('')
      : '<div class="muted small">Aucun interlocuteur. Utilisez « Propriétaire », « Entreprises » ou ajoutez un contact.</div>'}
      ${ed ? '<button class="btn" data-cadd>+ Contact</button>' : ''}</div>`;
  }

  function contactModal(p, c) {
    c = c || { role: 'decideur', pouvoir: 'a_confirmer', interet: 'non_exprime', principal: !GA.pipe.principal(p) };
    const opts = (liste, v) => liste.map(x => `<option value="${x.key}" ${x.key === v ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
    const m = modal(c.id ? 'Modifier le contact' : 'Nouveau contact', `<form id="ct-form" novalidate>
      <div class="two"><label class="fld"><span>Nom</span><input id="ct-nom" value="${esc(c.nom || '')}"></label>
      <label class="fld"><span>Entreprise / organisme</span><input id="ct-ent" value="${esc(c.entreprise || '')}"></label></div>
      <div class="two"><label class="fld"><span>Fonction</span><input id="ct-fct" value="${esc(c.fonction || '')}"></label>
      <label class="fld"><span>Rôle dans la décision</span><select id="ct-role">${opts(GA.ROLES_CONTACT, c.role)}</select></label></div>
      <div class="two"><label class="fld"><span>Téléphone</span><input id="ct-tel" type="tel" value="${esc(c.telephone || '')}"></label>
      <label class="fld"><span>Email</span><input id="ct-mail" type="email" value="${esc(c.email || '')}"></label></div>
      <div class="two"><label class="fld"><span>Pouvoir de décision</span><select id="ct-pouv">${opts(GA.POUVOIRS, c.pouvoir)}</select></label>
      <label class="fld"><span>Intérêt exprimé</span><select id="ct-int">${opts(GA.INTERETS, c.interet)}</select></label></div>
      <label class="fld"><span>Notes</span><input id="ct-notes" value="${esc(c.notes || '')}"></label>
      <label class="chk"><input type="checkbox" id="ct-pr" ${c.principal ? 'checked' : ''}> Contact principal (son pouvoir et son intérêt définissent l’avancement du dossier)</label>
      <div class="modal-actions">${c.id ? '<button type="button" class="btn ghost danger-t" id="ct-del">Supprimer</button><span class="grow"></span>' : ''}
        <button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`, { wide: true });
    $('#ct-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const v = id => $(id, m.el).value;
      const r = await run(() => GA.svc.saveContact(p, { nom: v('#ct-nom'), entreprise: v('#ct-ent'), fonction: v('#ct-fct'), role: v('#ct-role'), telephone: v('#ct-tel'),
        email: v('#ct-mail'), pouvoir: v('#ct-pouv'), interet: v('#ct-int'), notes: v('#ct-notes'), principal: $('#ct-pr', m.el).checked }, c.id), 'Contact enregistré');
      if (r) { m.close(); await after(p); }
    });
    const del = $('#ct-del', m.el);
    if (del) del.addEventListener('click', async () => {
      if (!await GA.ui.confirmBox('Supprimer le contact', 'Supprimer ce contact ? (l’opération reste tracée dans le journal)', 'Supprimer', true)) return;
      if (await run(() => GA.svc.deleteContact(p, c).then(() => true), 'Contact supprimé')) { m.close(); await after(p); }
    });
  }

  /* ---------- Conditions et jalons ---------- */
  function conditionsHtml(p, ed) {
    const visible = GA.pipe.ordre(p.statut) >= 5 || p.modele_eco || p.montant != null || p.duree_mois != null || p.conditions_particulieres;
    if (!visible) return '';
    const dis = ed ? '' : 'disabled';
    const sel = (f, liste) => `<select data-f="${f}" ${dis}><option value="">—</option>${liste.map(x => `<option value="${x.key}" ${p[f] === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;
    return `<h4>Conditions d’implantation</h4><div class="props">
      <div class="prop"><label>Modèle économique</label><div class="pv">${sel('modele_eco', GA.MODELES_ECO)}</div></div>
      <div class="prop"><label>Montant</label><div class="pv two-inline"><input data-f="montant" type="number" step="0.01" value="${p.montant == null ? '' : p.montant}" ${dis} placeholder="Vide">
        <select data-f="montant_unite" ${dis}><option value="">unité</option>${GA.UNITES_MONTANT.map(u => `<option ${p.montant_unite === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div></div>
      <div class="prop"><label>Durée (mois)</label><div class="pv"><input data-f="duree_mois" type="number" step="1" value="${p.duree_mois == null ? '' : p.duree_mois}" ${dis} placeholder="Vide"></div></div>
      <div class="prop"><label>Électricité</label><div class="pv">${sel('electricite', GA.ELECTRICITE)}</div></div>
      <div class="prop"><label>Emplacement précis</label><div class="pv"><input data-f="emplacement_precis" value="${esc(p.emplacement_precis || '')}" ${dis} placeholder="Ex. : à droite de l’entrée, sous l’auvent"></div></div>
      <div class="prop"><label>Conditions particulières</label><div class="pv"><textarea data-f="conditions_particulieres" rows="1" ${dis} placeholder="Vide">${esc(p.conditions_particulieres || '')}</textarea></div></div>
    </div>${ed ? '<p class="hint">Proposition envoyée ? Ajoutez un échange « Proposition » (avec le document) dans l’historique ci-dessous.</p>' : ''}`;
  }

  function jalonsHtml(p, ex, ed) {
    const premier = t => { const l = ex.filter(e => t.includes(e.type)).map(e => e.date).sort(); return l[0] || ''; };
    const items = [
      ['Premier contact', premier(['appel', 'email', 'rdv', 'visite']), null],
      ['Visite', premier(['visite']), null],
      ['Proposition', premier(['proposition']), null],
      ['Accord', p.date_accord, 'date_accord'],
      ['Signature', p.date_signature, 'date_signature'],
      ['Installation', p.date_installation, 'date_installation'],
    ];
    return `<div class="jalons">${items.map(([l, d, f]) => `<div class="jalon ${d ? 'ok' : ''}"><span class="small muted">${l}</span>
      ${f && ed && d ? `<input type="date" data-f="${f}" value="${esc(d)}">` : `<b>${d ? fmtDate(d) : '—'}</b>`}${f === 'date_accord' && p.date_accord_estimee ? '<span class="small muted">estimée</span>' : ''}</div>`).join('')}</div>`;
  }

  /* ---------- Journal ---------- */
  const TYPES_EV = { creation: 'Création', statut: 'Étape', responsable: 'Responsable', blocage: 'Blocage', deblocage: 'Déblocage', conditions: 'Conditions',
    proposition: 'Proposition', contact_ajout: 'Contact ajouté', contact_modif: 'Contact modifié', contact_suppr: 'Contact supprimé',
    rattachement: 'Secteur / objectif', jalons: 'Dates clés', migration: 'Passage à la V2' };
  function detailEv(e) {
    const a = e.avant || {}, b = e.apres || {};
    const st = k => k ? GA.pipe.etape(k).label : '—';
    switch (e.type) {
      case 'statut': return `${st(a.statut)} → <b>${st(b.statut)}</b>${b.motif ? ' · motif : ' + esc(lab(GA.MOTIFS_ABANDON, b.motif)) + (b.precision ? ' — ' + esc(b.precision) : '') : ''}`;
      case 'migration': return `${esc(a.statut || '—')} → <b>${st(b.statut)}</b>`;
      case 'responsable': return `${esc(userNom(a.responsable_id))} → <b>${esc(userNom(b.responsable_id))}</b>`;
      case 'blocage': return `${esc(lab(GA.RAISONS_BLOCAGE, b.raison))}${b.precision ? ' — ' + esc(b.precision) : ''} · réexamen ${fmtDate(b.reexamen_le)}`;
      case 'proposition': return esc(b.commentaire || '');
      case 'contact_ajout': case 'contact_modif': case 'contact_suppr': { const c = b && b.nom != null ? b : a; return esc([c.nom, c.entreprise].filter(Boolean).join(' · ')) + (e.type === 'contact_modif' && a.interet !== b.interet ? ` · intérêt ${esc(lab(GA.INTERETS, a.interet))} → <b>${esc(lab(GA.INTERETS, b.interet))}</b>` : ''); }
      case 'conditions': return Object.keys(b).filter(k => (a[k] || '') !== (b[k] || '')).map(k => `${esc(k.replace('_', ' '))} : ${esc(String(b[k] ?? '—'))}`).join(' · ');
      case 'jalons': return ['date_accord', 'date_signature', 'date_installation'].filter(k => a[k] !== b[k]).map(k => `${k.replace('date_', '')} : ${fmtDate(b[k]) || '—'}`).join(' · ');
      default: return '';
    }
  }
  function journalHtml(evs) {
    if (!evs.length) return '<div class="muted small">Aucun événement.</div>';
    return `<ol class="journal">${evs.slice().reverse().map(e => `<li><span class="small muted">${fmtDateTime(e.created_at)} · ${esc(e.auteur_id ? userNom(e.auteur_id) : 'système')}</span>
      <div><span class="tag">${esc(TYPES_EV[e.type] || e.type)}</span> ${detailEv(e)}</div></li>`).join('')}</ol>`;
  }

  /* ---------- Fenêtres d'action ---------- */
  function champsAction(defAction) {
    const s = GA.pipe.seuils();
    return `<label class="fld"><span>Prochaine action *</span><input id="pa-act" value="${esc(defAction || '')}" placeholder="Ex. : appeler le gérant pour fixer la visite"></label>
      <label class="fld"><span>Date de relance</span><input id="pa-date" type="date" value="${GA.pipe.plusJours(s.relance_jours)}"></label>
      <div class="quick">${[[1, 'Demain'], [3, '+3 j'], [7, '+1 sem.'], [14, '+2 sem.']].map(([n, l]) => `<button type="button" class="chip" data-plus="${n}">${l}</button>`).join('')}</div>`;
  }
  function bindQuick(m) { $$('[data-plus]', m.el).forEach(b => b.addEventListener('click', () => { $('#pa-date', m.el).value = GA.pipe.plusJours(+b.dataset.plus); })); }

  const SUGGESTIONS = {
    qualifie: 'Identifier le propriétaire et l’exploitant (Propriétaire, Entreprises)', interlocuteur: 'Appeler le décideur pour présenter le concept',
    discussion: 'Obtenir un rendez-vous sur place', negociation: 'Envoyer la proposition chiffrée', accord: 'Préparer la convention', signe: 'Planifier l’installation',
  };
  function etape(p, cible) {
    const e = GA.pipe.etape(cible), recul = GA.pipe.ordre(cible) < GA.pipe.ordre(p.statut);
    const manq = recul ? [] : GA.pipe.manques(p, cible);
    const m = modal((recul ? 'Revenir à « ' : 'Passer à « ') + e.label + ' »', `<form id="et-form" novalidate>
      ${manq.length ? `<div class="bandeau warn">Avant de passer à cette étape : ${esc(manq.join(' ; '))}.</div>` : ''}
      ${recul ? '<label class="fld"><span>Pourquoi le dossier recule-t-il ? *</span><input id="et-com"></label>' : '<label class="fld"><span>Commentaire (facultatif, ajouté à l’historique)</span><input id="et-com"></label>'}
      ${e.ouvert ? champsAction(SUGGESTIONS[cible] || p.prochaine_action) : ''}
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" ${manq.length ? 'disabled' : ''}>Valider</button></div></form>`);
    bindQuick(m);
    $('#et-form', m.el).addEventListener('submit', async ev => {
      ev.preventDefault();
      const r = await run(() => GA.svc.changerEtape(p, cible, { prochaine_action: e.ouvert ? $('#pa-act', m.el).value : '', date_relance: e.ouvert ? $('#pa-date', m.el).value : '', commentaire: $('#et-com', m.el).value }));
      if (r) { m.close(); await after(p, 'Étape : ' + e.label); }
    });
  }
  function abandonner(p) {
    const m = modal('Abandonner le dossier', `<form id="ab-form" novalidate>
      <label class="fld"><span>Motif *</span><select id="ab-motif"><option value="">— Choisir —</option>${GA.MOTIFS_ABANDON.filter(x => x.key !== 'non_precise').map(x => `<option value="${x.key}">${esc(x.label)}</option>`).join('')}</select></label>
      <label class="fld"><span>Précision</span><input id="ab-prec" placeholder="Ex. : la foncière refuse toute installation sur ses parkings"></label>
      <p class="hint">Le dossier reste consultable et peut être rouvert. Le motif sert à comprendre où nous perdons des opportunités.</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn danger">Abandonner</button></div></form>`);
    $('#ab-form', m.el).addEventListener('submit', async ev => {
      ev.preventDefault();
      if (await run(() => GA.svc.abandonner(p, $('#ab-motif', m.el).value, $('#ab-prec', m.el).value))) { m.close(); await after(p, 'Dossier abandonné'); }
    });
  }
  function bloquer(p) {
    const s = GA.pipe.seuils();
    const m = modal('Bloquer le dossier', `<form id="bl-form" novalidate>
      <label class="fld"><span>Raison *</span><select id="bl-r"><option value="">— Choisir —</option>${GA.RAISONS_BLOCAGE.map(x => `<option value="${x.key}">${esc(x.label)}</option>`).join('')}</select></label>
      <label class="fld"><span>Précision</span><input id="bl-p" placeholder="Ex. : comité immobilier du groupe le 15 janvier"></label>
      <label class="fld"><span>Date de réexamen *</span><input id="bl-d" type="date" value="${GA.pipe.plusJours(s.reexamen_jours)}"></label>
      <p class="hint">Le dossier garde son étape et réapparaît dans les relances à la date de réexamen.</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Bloquer</button></div></form>`);
    $('#bl-form', m.el).addEventListener('submit', async ev => {
      ev.preventDefault();
      if (await run(() => GA.svc.bloquer(p, $('#bl-r', m.el).value, $('#bl-p', m.el).value, $('#bl-d', m.el).value))) { m.close(); await after(p, 'Dossier bloqué'); }
    });
  }
  function debloquer(p) {
    const m = modal('Débloquer le dossier', `<form id="db-form" novalidate>${champsAction(p.prochaine_action)}
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Débloquer</button></div></form>`);
    bindQuick(m);
    $('#db-form', m.el).addEventListener('submit', async ev => {
      ev.preventDefault();
      if (await run(() => GA.svc.debloquer(p, { prochaine_action: $('#pa-act', m.el).value, date_relance: $('#pa-date', m.el).value }))) { m.close(); await after(p, 'Dossier débloqué'); }
    });
  }
  function rouvrir(p) {
    const retour = p.statut_avant_abandon && GA.pipe.etape(p.statut_avant_abandon).ouvert ? p.statut_avant_abandon : 'repere';
    const m = modal('Rouvrir le dossier', `<form id="ro-form" novalidate><p>Le dossier reviendra à l’étape « ${esc(GA.pipe.etape(retour).label)} ».</p>${champsAction('Reprendre contact')}
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Rouvrir</button></div></form>`);
    bindQuick(m);
    $('#ro-form', m.el).addEventListener('submit', async ev => {
      ev.preventDefault();
      if (await run(() => GA.svc.rouvrir(p, { prochaine_action: $('#pa-act', m.el).value, date_relance: $('#pa-date', m.el).value }))) { m.close(); await after(p, 'Dossier rouvert'); }
    });
  }
  function transmettre(p) {
    const users = GA.store.users.filter(u => u.actif && u.id !== p.responsable_id);
    if (!users.length) { GA.ui.toast('Aucun autre utilisateur actif.', 'err'); return; }
    const m = modal('Transmettre le dossier', `<form id="tr-form" novalidate>
      <label class="fld"><span>Nouveau responsable *</span><select id="tr-u">${users.map(u => `<option value="${u.id}">${esc(u.nom)}</option>`).join('')}</select></label>
      <label class="fld"><span>Note de transmission *</span><textarea id="tr-n" class="notes" rows="3" placeholder="Où en est le dossier, ce qui a été promis, la prochaine étape…"></textarea></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Transmettre</button></div></form>`);
    $('#tr-form', m.el).addEventListener('submit', async ev => {
      ev.preventDefault();
      if (await run(() => GA.svc.transmettre(p, $('#tr-u', m.el).value, $('#tr-n', m.el).value))) { m.close(); await after(p, 'Dossier transmis'); }
    });
  }
  function installer(p) {
    if (p.lat == null || p.lon == null) { GA.ui.toast('Positionnez d’abord l’emplacement (carte ou adresse).', 'err'); return; }
    const m = modal('Installation : ajouter au réseau', `<form id="in-form" novalidate>
      <label class="fld"><span>Nom du site</span><input id="in-nom" value="${esc(p.nom)}"></label>
      <div class="two"><label class="fld"><span>Date d’installation</span><input id="in-date" type="date" value="${GA.svc.today()}"></label>
      <label class="fld"><span>Commune</span><input id="in-com" value="${esc(p.commune || '')}"></label></div>
      <label class="fld"><span>Informations d’exploitation</span><textarea id="in-inf" class="notes" rows="3" placeholder="Modèle de machine, contact sur place, électricité, accès, horaires…"></textarea></label>
      <p class="hint">Le site rejoint le réseau GRAFFAGNINO : le moteur applique aussitôt le malus de proximité aux emplacements voisins.</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Valider l’installation</button></div></form>`);
    $('#in-form', m.el).addEventListener('submit', async ev => {
      ev.preventDefault();
      const r = await run(() => GA.svc.installer(p, { nom: $('#in-nom', m.el).value, date_installation: $('#in-date', m.el).value, commune: $('#in-com', m.el).value,
        infos: $('#in-inf', m.el).value, lat: p.lat, lon: p.lon }));
      if (r) { m.close(); await after(p, 'Site installé et ajouté au réseau 🎉'); }
    });
  }

  function bindActions(root, p) {
    $$('[data-act]', root).forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'suivante') etape(p, b.dataset.cible);
      else ({ abandonner, bloquer, debloquer, rouvrir, transmettre, installer })[a](p);
    }));
    $$('[data-etape]', root).forEach(b => b.addEventListener('click', () => b.dataset.etape === 'installe' ? (p.statut === 'signe' ? installer(p) : GA.ui.toast('Passez d’abord par « Signé ».', 'err')) : etape(p, b.dataset.etape)));
    const add = $('[data-cadd]', root); if (add) add.addEventListener('click', () => contactModal(p));
    $$('[data-cedit]', root).forEach(b => b.addEventListener('click', () => contactModal(p, GA.pipe.contactsDe(p).find(c => c.id === b.closest('[data-contact]').dataset.contact))));
  }

  return { stepper, barreActions, bandeaux, contactsHtml, contactModal, conditionsHtml, jalonsHtml, journalHtml, bindActions, etape, abandonner, bloquer, transmettre, installer };
})();
