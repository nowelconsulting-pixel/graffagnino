/* Onglet Administration (rôle administrateur) : gestion des utilisateurs. */
window.GA = window.GA || {};

GA.adminView = (function () {
  const { $, $$, esc, fmtDate, avatar, run, modal, confirmBox } = GA.ui;
  const roleLabel = k => (GA.ROLES.find(r => r.key === k) || {}).label || k;

  function render() {
    const me = GA.auth.current();
    const users = GA.store.users.slice().sort((a, b) => (b.actif - a.actif) || a.nom.localeCompare(b.nom));
    const nb = id => GA.store.prospects.filter(p => p.responsable_id === id).length;
    $('#admin-body').innerHTML = `
      <div class="table-wrap"><table class="crm-table admin-table">
        <thead><tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Fonction</th><th>Fiches</th><th>Statut</th><th></th></tr></thead>
        <tbody>${users.map(u => `<tr class="${u.actif ? '' : 'inactive'}">
          <td class="t-user">${avatar(u)} <b>${esc(u.nom)}</b>${u.id === me.id ? ' <span class="muted">(vous)</span>' : ''}</td>
          <td>${esc(u.email)}</td>
          <td><span class="tag ${u.role === 'admin' ? 'admin' : ''}">${esc(roleLabel(u.role))}</span></td>
          <td>${esc(u.fonction) || '<span class="muted">—</span>'}</td>
          <td>${nb(u.id)}</td>
          <td>${u.actif ? '<span class="tag ok">Actif</span>' : '<span class="tag out">Désactivé</span>'}</td>
          <td class="t-act"><button class="btn ghost" data-edit="${u.id}">Modifier</button>
            ${u.id === me.id ? '' : `<button class="btn ghost" data-toggle="${u.id}">${u.actif ? 'Désactiver' : 'Réactiver'}</button>`}</td>
        </tr>`).join('')}</tbody></table></div>
      <div class="admin-foot">
        <div class="note">Les utilisateurs désactivés ne peuvent plus se connecter ; leurs fiches et leurs échanges sont conservés.
        Dans la maquette, les mots de passe sont des mots de passe de démonstration stockés dans le navigateur. Avec Supabase, ils seront gérés par Supabase Auth et l’invitation se fera par email.</div>
        <div class="danger-zone"><b>Données de démonstration</b><p>Restaure les fiches, échanges et utilisateurs d’origine. Toutes les modifications faites dans la maquette seront perdues.</p><button class="btn danger" id="reset-demo">Réinitialiser la démonstration</button></div>
      </div>`;
    $$('[data-edit]').forEach(b => b.addEventListener('click', () => edit(b.dataset.edit)));
    $$('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const u = GA.store.users.find(x => x.id === b.dataset.toggle);
      if (u.actif && !await confirmBox('Désactiver le compte', `${u.nom} ne pourra plus se connecter. Ses fiches restent visibles.`, 'Désactiver', true)) return;
      await run(() => GA.svc.setUserActive(u.id, !u.actif), u.actif ? 'Compte désactivé' : 'Compte réactivé');
      await GA.app.reload();
    }));
    $('#reset-demo').addEventListener('click', async () => {
      if (!await confirmBox('Réinitialiser la démonstration', 'Toutes les modifications faites dans la maquette seront perdues.', 'Réinitialiser', true)) return;
      await run(() => GA.svc.resetDemo(), 'Données de démonstration restaurées');
      const still = await GA.auth.restore();
      if (!still) { GA.app.logout(); return; }
      await GA.app.reload();
    });
  }

  function edit(id) {
    const u = id ? GA.store.users.find(x => x.id === id) : { nom: '', email: '', fonction: '', telephone: '', role: 'user' };
    const m = modal(id ? 'Modifier l’utilisateur' : 'Nouvel utilisateur', `
      <form id="u-form" novalidate>
        <label class="fld"><span>Nom complet *</span><input id="u-nom" value="${esc(u.nom)}" required></label>
        <label class="fld"><span>Email *</span><input id="u-email" type="email" value="${esc(u.email)}" required></label>
        <div class="two"><label class="fld"><span>Fonction</span><input id="u-fct" value="${esc(u.fonction)}"></label>
        <label class="fld"><span>Téléphone</span><input id="u-tel" value="${esc(u.telephone)}"></label></div>
        <label class="fld"><span>Rôle</span><select id="u-role">${GA.ROLES.map(r => `<option value="${r.key}" ${r.key === u.role ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
        <p class="hint">Administrateur : tous les espaces, gestion des utilisateurs et de toutes les fiches. Utilisateur : carte et CRM ; modifie ses fiches et les fiches non attribuées.</p>
        <label class="fld"><span>Mot de passe de démonstration ${id ? '(laisser vide pour ne pas changer)' : '*'}</span><input id="u-pass" type="text" autocomplete="off"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" type="submit">${id ? 'Enregistrer' : 'Créer l’utilisateur'}</button></div>
      </form>`);
    $('#u-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const r = await run(() => GA.svc.saveUser(id, {
        nom: $('#u-nom', m.el).value, email: $('#u-email', m.el).value, fonction: $('#u-fct', m.el).value,
        telephone: $('#u-tel', m.el).value, role: $('#u-role', m.el).value, password: $('#u-pass', m.el).value,
      }), id ? 'Utilisateur modifié' : 'Utilisateur créé');
      if (r) { m.close(); await GA.app.reload(); GA.app.renderUser(); }
    });
  }

  return {
    init() { $('#admin-new').addEventListener('click', () => edit(null)); },
    render,
  };
})();
