/* Logique métier des fiches, des échanges et des utilisateurs.
   Vérifie les droits et les règles avant d'appeler le dépôt de données. */
window.GA = window.GA || {};

GA.svc = (function () {
  const me = () => GA.auth.current();
  const deny = () => { throw new Error('Action non autorisée pour votre rôle.'); };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const FIELDS = ['nom', 'zone_id', 'adresse', 'commune', 'statut', 'proprietaire_nom', 'proprietaire_type', 'decideur_nom',
    'decideur_fonction', 'telephone', 'email', 'responsable_id', 'prochaine_action', 'date_relance', 'notes', 'lat', 'lon',
    'analyse', 'terrain_acces', 'terrain_visibilite', 'terrain_attractivite',
    'bloque', 'blocage_raison', 'blocage_precision', 'reexamen_le', 'motif_abandon', 'motif_abandon_precision',
    'modele_eco', 'montant', 'montant_unite', 'duree_mois', 'electricite', 'emplacement_precis', 'conditions_particulieres',
    'date_accord', 'date_signature', 'date_installation', 'secteur_id', 'objectif_id', 'lieu_id', 'typologie', 'analyse_entree'];
  const CONTACT = ['nom', 'fonction', 'entreprise', 'telephone', 'email', 'role', 'pouvoir', 'interet', 'principal', 'notes', 'acteur_id', 'source'];

  function zone(id) { return GA.ZONES.find(z => z.id === id) || null; }

  function cleanPatch(patch) {
    const out = {};
    for (const k of FIELDS) if (k in patch) out[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
    if ('nom' in out && !out.nom) throw new Error('Le nom de l’emplacement est obligatoire.');
    if (out.zone_id && !zone(out.zone_id)) throw new Error('Zone inconnue : ' + out.zone_id);
    if (out.statut && !GA.STATUTS.some(s => s.key === out.statut)) throw new Error('Statut inconnu.');
    if (out.email && !EMAIL.test(out.email)) throw new Error('Adresse email invalide.');
    for (const k of ['lat', 'lon']) if (k in out && out[k] != null && !isFinite(out[k])) throw new Error('Position invalide.');
    return out;
  }

  return {
    zone, today,

    /* ---- Fiches ---- */
    listProspects: () => GA.repo.listProspects(),
    getProspect: id => GA.repo.getProspect(id),

    async createProspect(data) {
      const u = me(); if (!GA.perm.canCreateProspect(u)) deny();
      const d = cleanPatch({ statut: 'repere', ...data });
      if (!d.nom) throw new Error('Le nom de l’emplacement est obligatoire.');
      if (!GA.perm.canAssignOthers(u) || !('responsable_id' in d)) d.responsable_id = u.id;
      const z = zone(d.zone_id);
      if (z && !d.commune) d.commune = z.com;
      // Secteur et objectif par défaut : l'objectif actif (le premier) et son secteur.
      const obj = (GA.store.objectifs || []).find(o => o.statut === 'actif');
      const base = { nom: '', zone_id: '', adresse: '', commune: '', statut: 'repere', proprietaire_nom: '', proprietaire_type: '',
        decideur_nom: '', decideur_fonction: '', telephone: '', email: '', responsable_id: u.id, prochaine_action: '', date_relance: '', notes: '',
        secteur_id: obj ? obj.secteur_id : null, objectif_id: obj ? obj.id : null };
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

    /* ---- Pipeline V2 ---- */
    // Faire avancer (ou reculer) un dossier ; la prochaine action est obligatoire pour une étape ouverte.
    async changerEtape(p, cible, { prochaine_action, date_relance, commentaire } = {}) {
      if (cible === 'abandonne') throw new Error('Utilisez « Abandonner » (motif obligatoire).');
      const recul = GA.pipe.ordre(cible) < GA.pipe.ordre(p.statut);
      if (!recul) { const m = GA.pipe.manques(p, cible); if (m.length) throw new Error('Pour passer à « ' + GA.pipe.etape(cible).label + ' » : ' + m.join(' ; ') + '.'); }
      if (recul && !String(commentaire || '').trim()) throw new Error('Indiquez pourquoi le dossier recule.');
      const ouvert = GA.pipe.etape(cible).ouvert;
      if (ouvert && !String(prochaine_action || '').trim()) throw new Error('Indiquez la prochaine action.');
      const patch = { statut: cible };
      if (ouvert) Object.assign(patch, { prochaine_action, date_relance: date_relance || '' });
      else Object.assign(patch, { prochaine_action: '', date_relance: '' });
      const r = await this.updateProspect(p.id, patch);
      if (String(commentaire || '').trim()) await this.addExchange(p.id, { type: 'note', commentaire: (recul ? 'Retour à « ' + GA.pipe.etape(cible).label + ' » : ' : '') + commentaire });
      return r;
    },
    abandonner(p, motif, precision) {
      if (!GA.MOTIFS_ABANDON.some(m => m.key === motif)) throw new Error('Choisissez un motif d’abandon.');
      return this.updateProspect(p.id, { statut: 'abandonne', motif_abandon: motif, motif_abandon_precision: precision || '', prochaine_action: '', date_relance: '', bloque: false });
    },
    rouvrir(p, { prochaine_action, date_relance } = {}) {
      const retour = p.statut_avant_abandon && GA.pipe.etape(p.statut_avant_abandon).ouvert ? p.statut_avant_abandon : 'repere';
      return this.updateProspect(p.id, { statut: retour, prochaine_action: prochaine_action || 'Reprendre le dossier', date_relance: date_relance || GA.pipe.plusJours(2) });
    },
    bloquer(p, raison, precision, reexamen) {
      if (!raison) throw new Error('Choisissez une raison de blocage.');
      if (!reexamen) throw new Error('Indiquez une date de réexamen.');
      return this.updateProspect(p.id, { bloque: true, blocage_raison: raison, blocage_precision: precision || '', reexamen_le: reexamen });
    },
    debloquer(p, { prochaine_action, date_relance } = {}) {
      const patch = { bloque: false };
      if (prochaine_action) Object.assign(patch, { prochaine_action, date_relance: date_relance || '' });
      return this.updateProspect(p.id, patch);
    },
    async transmettre(p, userId, note) {
      const u = me();
      if (!(GA.perm.isAdmin(u) || p.responsable_id === u.id)) throw new Error('Seul le responsable du dossier, ou un administrateur, peut le transmettre.');
      if (!userId || userId === p.responsable_id) throw new Error('Choisissez le nouveau responsable.');
      if (!String(note || '').trim()) throw new Error('Ajoutez une note de transmission.');
      const dest = (GA.store.users || []).find(x => x.id === userId);
      await this.addExchange(p.id, { type: 'note', commentaire: 'Dossier transmis à ' + (dest ? dest.nom : 'un autre utilisateur') + ' : ' + note.trim() });
      return GA.repo.updateProspect(p.id, { responsable_id: userId });
    },
    // Installation : la fiche passe à Installé et le site rejoint le réseau.
    async installer(p, site) {
      await this.updateProspect(p.id, { statut: 'installe', date_installation: site.date_installation || today(), prochaine_action: '', date_relance: '' });
      return GA.repo.inserer('sites', { nom: site.nom || p.nom, type: 'distributeur', statut: 'en_service', adresse: site.adresse || p.adresse, commune: site.commune || p.commune,
        lat: site.lat, lon: site.lon, date_installation: site.date_installation || today(), prospect_id: p.id, secteur_id: p.secteur_id, objectif_id: p.objectif_id, infos: site.infos || '' });
    },

    /* ---- Contacts ---- */
    listContacts: () => GA.repo.lister('contacts', { order: 'created_at', asc: true }),
    async saveContact(p, data, id) {
      const u = me(); if (!GA.perm.canEditProspect(u, p)) deny();
      const d = {}; for (const k of CONTACT) if (k in data) d[k] = typeof data[k] === 'string' ? data[k].trim() : data[k];
      if (!id && !d.nom && !d.entreprise) throw new Error('Indiquez au moins un nom ou une entreprise.');
      if (d.email && !EMAIL.test(d.email)) throw new Error('Adresse email du contact invalide.');
      if (d.principal) {
        // Un seul contact principal par fiche : on retire l'étoile des autres d'abord.
        for (const c of GA.pipe.contactsDe(p)) if (c.principal && c.id !== id) await GA.repo.modifier('contacts', c.id, { principal: false });
      }
      return id ? GA.repo.modifier('contacts', id, d) : GA.repo.inserer('contacts', { prospect_id: p.id, ...d });
    },
    async deleteContact(p, c) {
      const u = me(); if (!(GA.perm.isAdmin(u) || p.responsable_id === u.id)) deny();
      return GA.repo.supprimer('contacts', c.id);
    },
    listEvenements: id => GA.repo.lister('evenements', id ? { eq: { prospect_id: id }, order: 'created_at' } : { order: 'created_at' }),

    /* ---- Référentiels : réseau, secteurs, objectifs, concurrents, seuils ---- */
    listSites: () => GA.repo.lister('sites', { order: 'created_at', asc: true }),
    listSecteurs: () => GA.repo.lister('secteurs', { order: 'nom', asc: true }),
    listObjectifs: () => GA.repo.lister('objectifs', { order: 'created_at', asc: true }),
    listConcurrents: () => GA.repo.lister('concurrents', { order: 'created_at' }),
    saveRef(table, data, id) {
      const u = me();
      if (table !== 'concurrents' && table !== 'sites' && !GA.perm.isAdmin(u)) deny();
      return id ? GA.repo.modifier(table, id, data) : GA.repo.inserer(table, data);
    },
    deleteRef(table, id) { return GA.repo.supprimer(table, id); },
    async saveSeuils(v) { if (!GA.perm.isAdmin(me())) deny(); await GA.repo.setParametre('seuils', v); GA.store.seuils = v; },

    async deleteProspect(id) {
      const p = await GA.repo.getProspect(id);
      if (!p || !GA.perm.canDeleteProspect(me(), p)) deny();
      return GA.repo.deleteProspect(id);
    },

    /* ---- Échanges ---- */
    listExchanges: id => GA.repo.listExchanges(id),

    async addExchange(prospectId, { type, date, commentaire, lat, lon, precision_m }) {
      const u = me(); const p = await GA.repo.getProspect(prospectId);
      if (!p || !GA.perm.canEditProspect(u, p)) deny();
      if (!GA.TYPES_ECHANGE.some(t => t.key === type)) throw new Error('Type d’échange inconnu.');
      const c = String(commentaire || '').trim();
      if (!c) throw new Error('Ajoutez un commentaire.');
      const ex = { prospect_id: prospectId, type, date: date || today(), commentaire: c, auteur_id: u.id };
      if (isFinite(lat) && isFinite(lon)) Object.assign(ex, { lat, lon, precision_m: isFinite(precision_m) ? Math.round(precision_m) : null });
      return GA.repo.addExchange(ex);
    },

    async deleteExchange(prospect, exchange) {
      if (!GA.perm.canDeleteExchange(me(), prospect, exchange)) deny();
      return GA.repo.deleteExchange(exchange.id);
    },

    /* ---- Photos et documents ---- */
    listDocuments: id => GA.repo.listDocuments(id),
    documentUrls: chemins => GA.repo.documentUrls(chemins),

    // Ajoute des fichiers à une fiche ; les photos sont réduites (2000 px, JPEG) avant l'envoi.
    async addDocuments(prospectId, files, { categorie, exchangeId } = {}) {
      const u = me(); const p = await GA.repo.getProspect(prospectId);
      if (!p || !GA.perm.canEditProspect(u, p)) deny();
      const out = [];
      for (const f of files) {
        const file = await GA.images.reduce(f);
        const cat = categorie || (/^image\//.test(file.type) ? 'photo' : 'autre');
        out.push(await GA.repo.uploadDocument({ prospect_id: prospectId, exchange_id: exchangeId, file, nom: file.name || f.name, categorie: cat }));
      }
      return out;
    },

    async deleteDocument(prospect, doc) {
      const u = me();
      if (!(GA.perm.isAdmin(u) || (doc.auteur_id === u.id && GA.perm.canEditProspect(u, prospect)))) deny();
      return GA.repo.deleteDocument(doc);
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
