/* Logique métier des fiches, des échanges et des utilisateurs.
   Vérifie les droits et les règles avant d'appeler le dépôt de données. */
window.GA = window.GA || {};

GA.svc = (function () {
  const me = () => GA.auth.current();
  const deny = () => { throw new Error('Action non autorisée pour votre rôle.'); };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const FIELDS = ['nom', 'zone_id', 'adresse', 'commune', 'statut', 'proprietaire_nom', 'proprietaire_type', 'decideur_nom',
    'decideur_fonction', 'telephone', 'email', 'responsable_id', 'prochaine_action', 'date_relance', 'notes'];

  function zone(id) { return GA.ZONES.find(z => z.id === id) || null; }

  function cleanPatch(patch) {
    const out = {};
    for (const k of FIELDS) if (k in patch) out[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
    if ('nom' in out && !out.nom) throw new Error('Le nom de l’emplacement est obligatoire.');
    if (out.zone_id && !zone(out.zone_id)) throw new Error('Zone inconnue : ' + out.zone_id);
    if (out.statut && !GA.STATUTS.some(s => s.key === out.statut)) throw new Error('Statut inconnu.');
    if (out.email && !EMAIL.test(out.email)) throw new Error('Adresse email invalide.');
    return out;
  }

  return {
    zone, today,

    /* ---- Fiches ---- */
    listProspects: () => GA.repo.listProspects(),
    getProspect: id => GA.repo.getProspect(id),

    async createProspect(data) {
      const u = me(); if (!GA.perm.canCreateProspect(u)) deny();
      const d = cleanPatch({ statut: 'a_prospecter', ...data });
      if (!d.nom) throw new Error('Le nom de l’emplacement est obligatoire.');
      if (!GA.perm.canAssignOthers(u) || !('responsable_id' in d)) d.responsable_id = u.id;
      const z = zone(d.zone_id);
      if (z && !d.commune) d.commune = z.com;
      const base = { nom: '', zone_id: '', adresse: '', commune: '', statut: 'a_prospecter', proprietaire_nom: '', proprietaire_type: '',
        decideur_nom: '', decideur_fonction: '', telephone: '', email: '', responsable_id: u.id, prochaine_action: '', date_relance: '', notes: '' };
      return GA.repo.createProspect({ ...base, ...d });
    },

    async updateProspect(id, patch) {
      const u = me(); const p = await GA.repo.getProspect(id);
      if (!p) throw new Error('Fiche introuvable.');
      if (!GA.perm.canEditProspect(u, p)) deny();
      const d = cleanPatch(patch);
      if ('responsable_id' in d && d.responsable_id !== p.responsable_id && !GA.perm.canAssignOthers(u) && d.responsable_id !== u.id) deny();
      return GA.repo.updateProspect(id, d);
    },

    changeStatus(id, statut) { return this.updateProspect(id, { statut }); },

    async deleteProspect(id) {
      if (!GA.perm.canDeleteProspect(me())) deny();
      return GA.repo.deleteProspect(id);
    },

    /* ---- Échanges ---- */
    listExchanges: id => GA.repo.listExchanges(id),

    async addExchange(prospectId, { type, date, commentaire }) {
      const u = me(); const p = await GA.repo.getProspect(prospectId);
      if (!p || !GA.perm.canEditProspect(u, p)) deny();
      if (!GA.TYPES_ECHANGE.some(t => t.key === type)) throw new Error('Type d’échange inconnu.');
      const c = String(commentaire || '').trim();
      if (!c) throw new Error('Ajoutez un commentaire.');
      return GA.repo.addExchange({ prospect_id: prospectId, type, date: date || today(), commentaire: c, auteur_id: u.id });
    },

    async deleteExchange(prospect, exchange) {
      if (!GA.perm.canDeleteExchange(me(), prospect, exchange)) deny();
      return GA.repo.deleteExchange(exchange.id);
    },

    /* ---- Utilisateurs (administration) ---- */
    listUsers: () => GA.repo.listUsers(),

    async saveUser(id, data) {
      const u = me(); if (!GA.perm.isAdmin(u)) deny();
      const d = {
        nom: String(data.nom || '').trim(), email: String(data.email || '').trim().toLowerCase(),
        fonction: String(data.fonction || '').trim(), telephone: String(data.telephone || '').trim(), role: data.role,
      };
      if (!d.nom) throw new Error('Le nom est obligatoire.');
      if (!EMAIL.test(d.email)) throw new Error('Adresse email invalide.');
      if (!GA.ROLES.some(r => r.key === d.role)) throw new Error('Rôle inconnu.');
      if (!id) return GA.repo.createUser(d);
      const users = await GA.repo.listUsers();
      const target = users.find(x => x.id === id);
      if (target.role === 'admin' && d.role !== 'admin' && users.filter(x => x.role === 'admin' && x.actif).length <= 1 && target.actif)
        throw new Error('Il doit rester au moins un administrateur actif.');
      if (id === u.id && d.role !== 'admin') throw new Error('Vous ne pouvez pas retirer votre propre rôle d’administrateur.');
      const r = await GA.repo.updateUser(id, d);
      if (id === u.id) await GA.auth.refresh();
      return r;
    },

    async setUserActive(id, actif) {
      const u = me(); if (!GA.perm.isAdmin(u)) deny();
      if (id === u.id && !actif) throw new Error('Vous ne pouvez pas désactiver votre propre compte.');
      const users = await GA.repo.listUsers();
      const target = users.find(x => x.id === id);
      if (!actif && target.role === 'admin' && users.filter(x => x.role === 'admin' && x.actif).length <= 1)
        throw new Error('Il doit rester au moins un administrateur actif.');
      return GA.repo.updateUser(id, { actif });
    },
  };
})();
