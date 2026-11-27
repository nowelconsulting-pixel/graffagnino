/* Dépôt de données Supabase : authentification (Supabase Auth) et tables profiles, prospects, exchanges.
   Les règles de sécurité de supabase/schema.sql protègent les données côté serveur ;
   les contrôles de js/services/ servent au confort de l'interface. */
window.GA = window.GA || {};

GA.createSupabaseRepository = function (client) {
  // Champs texte d'une fiche renvoyés '' plutôt que null, comme l'attend l'interface.
  const TEXTES = ['zone_id', 'adresse', 'commune', 'proprietaire_nom', 'proprietaire_type', 'decideur_nom',
    'decideur_fonction', 'telephone', 'email', 'prochaine_action', 'date_relance', 'notes'];
  const PROFIL = ['nom', 'fonction', 'telephone', 'role', 'actif'];
  const BUCKET = 'documents';
  const MOTEUR_ABSENT = 'Moteur de score pas encore activé : exécutez supabase/004_moteur.sql dans Supabase.';
  const DOCS_ABSENTS = 'Photos et documents pas encore activés : exécutez supabase/002_documents_visites.sql dans Supabase.';

  function fromDb(p) {
    if (!p) return null;
    const o = { ...p };
    for (const k of TEXTES) if (o[k] == null) o[k] = '';
    return o;
  }
  // Valeurs vides → null pour les colonnes date, zone et responsable.
  function toDb(d) {
    const o = { ...d };
    for (const k of ['date_relance', 'zone_id', 'responsable_id']) if (k in o && !o[k]) o[k] = null;
    delete o.id; delete o.created_at; delete o.updated_at;
    return o;
  }

  function message(error) {
    const m = (error && (error.message || error.error_description)) || String(error);
    if (/invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
    if (/email not confirmed/i.test(m)) return 'Adresse email non confirmée : demandez à l’administrateur de confirmer le compte.';
    if (/row-level security|permission denied/i.test(m)) return 'Action non autorisée pour votre rôle.';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Connexion au serveur impossible. Vérifiez votre connexion internet.';
    if (/jwt expired|invalid jwt/i.test(m)) return 'Votre session a expiré : reconnectez-vous.';
    if (/'(analyse|terrain_\w+)' column|column .*\b(analyse|terrain_\w+)\b/i.test(m)) return 'Moteur de score pas encore activé : exécutez supabase/004_moteur.sql dans Supabase.';
    if (/'(lat|lon)' column|column .*\b(lat|lon)\b/i.test(m)) return 'Position des fiches pas encore activée : exécutez supabase/003_position_fiches.sql dans Supabase.';
    return m;
  }
  // Exécute une requête Supabase et renvoie ses données, ou lève une erreur lisible.
  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(message(error));
    return data;
  }
  const one = rows => { if (!rows || !rows.length) throw new Error('Action non autorisée ou fiche introuvable.'); return rows[0]; };

  return {
    isPersistent: () => true,
    client,

    /* ---- Authentification ---- */
    async authenticate(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
      if (error) return { error: message(error) };
      return this.profileForSession(data.user);
    },
    async restoreSession() {
      const { data } = await client.auth.getSession();
      if (!data || !data.session) return { user: null };
      return this.profileForSession(data.session.user);
    },
    async profileForSession(authUser) {
      const { data, error } = await client.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (error) { await client.auth.signOut(); return { error: message(error) }; }
      if (!data) { await client.auth.signOut(); return { error: 'Ce compte n’a pas de profil. Contactez l’administrateur.' }; }
      if (!data.actif) { await client.auth.signOut(); return { error: 'Ce compte est désactivé. Contactez un administrateur.' }; }
      return { user: data };
    },
    async signOut() { await client.auth.signOut(); },
    onSignedOut(fn) { client.auth.onAuthStateChange(evt => { if (evt === 'SIGNED_OUT') fn(); }); },

    /* ---- Utilisateurs ---- */
    // Les comptes se créent dans Supabase (Authentication → Users) : la création depuis le navigateur
    // demanderait la clé de service, qui ne doit jamais quitter le serveur.
    async listUsers() { return q(client.from('profiles').select('*').order('nom')); },
    async getUser(id) { return q(client.from('profiles').select('*').eq('id', id).maybeSingle()); },
    async createUser() { throw new Error('Créez le compte dans Supabase : Authentication → Users → Add user.'); },
    async updateUser(id, patch) {
      const d = {}; for (const k of PROFIL) if (k in patch) d[k] = patch[k];
      return one(await q(client.from('profiles').update(d).eq('id', id).select()));
    },

    /* ---- Fiches de prospection ---- */
    async listProspects() { return (await q(client.from('prospects').select('*').order('updated_at', { ascending: false }))).map(fromDb); },
    async getProspect(id) { return fromDb(await q(client.from('prospects').select('*').eq('id', id).maybeSingle())); },
    async createProspect(data) { return fromDb(one(await q(client.from('prospects').insert(toDb(data)).select()))); },
    async updateProspect(id, patch) { return fromDb(one(await q(client.from('prospects').update(toDb(patch)).eq('id', id).select()))); },
    async deleteProspect(id) {
      // Fichiers de la fiche : supprimés du stockage avant la fiche (les lignes suivent en cascade).
      const docs = await client.from('documents').select('chemin').eq('prospect_id', id);
      if (!docs.error && docs.data && docs.data.length) await client.storage.from(BUCKET).remove(docs.data.map(d => d.chemin));
      const rows = await q(client.from('prospects').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('Action non autorisée ou fiche introuvable.');
    },

    /* ---- Historique des échanges ---- */
    async listExchanges(prospectId) {
      let req = client.from('exchanges').select('*');
      if (prospectId) req = req.eq('prospect_id', prospectId);
      return q(req.order('date', { ascending: false }));
    },
    async addExchange(data) { return one(await q(client.from('exchanges').insert(toDb(data)).select())); },
    async deleteExchange(id) {
      const rows = await q(client.from('exchanges').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('Action non autorisée ou échange introuvable.');
    },

    /* ---- Réglages partagés (table parametres) ---- */
    async getParametre(cle) {
      const { data, error } = await client.from('parametres').select('valeur').eq('cle', cle).maybeSingle();
      if (error) throw new Error(message(error));
      return data ? data.valeur : null;
    },
    async setParametre(cle, valeur) {
      const { error } = await client.from('parametres').upsert({ cle, valeur, updated_at: new Date().toISOString() });
      if (error) throw new Error(/could not find the table|does not exist/i.test(error.message) ? MOTEUR_ABSENT : message(error));
    },

    /* ---- Photos et documents (table documents + stockage privé « documents ») ---- */
    async listDocuments(prospectId) {
      const { data, error } = await client.from('documents').select('*').eq('prospect_id', prospectId).order('created_at', { ascending: false });
      if (error) {
        if (/could not find the table|does not exist/i.test(error.message)) throw new Error(DOCS_ABSENTS);
        throw new Error(message(error));
      }
      return data;
    },
    async uploadDocument({ prospect_id, exchange_id, file, nom, categorie }) {
      const ext = (String(nom).match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
      const chemin = prospect_id + '/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + ext;
      const up = await client.storage.from(BUCKET).upload(chemin, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) {
        if (/bucket not found/i.test(up.error.message)) throw new Error(DOCS_ABSENTS);
        if (/mime type|not supported/i.test(up.error.message)) throw new Error('Type de fichier non accepté : ' + nom);
        if (/exceeded|too large|maximum allowed size/i.test(up.error.message)) throw new Error('Fichier trop lourd (20 Mo maximum) : ' + nom);
        throw new Error(message(up.error));
      }
      try {
        return one(await q(client.from('documents').insert({
          prospect_id, exchange_id: exchange_id || null, chemin, nom, type_mime: file.type || '', taille: file.size || 0, categorie: categorie || 'autre',
        }).select()));
      } catch (e) { await client.storage.from(BUCKET).remove([chemin]); throw e; }
    },
    async deleteDocument(doc) {
      const rows = await q(client.from('documents').delete().eq('id', doc.id).select('id'));
      if (!rows.length) throw new Error('Action non autorisée ou document introuvable.');
      await client.storage.from(BUCKET).remove([doc.chemin]);
    },
    // Liens temporaires (1 heure) : le stockage est privé.
    async documentUrls(chemins) {
      if (!chemins.length) return {};
      const { data, error } = await client.storage.from(BUCKET).createSignedUrls(chemins, 3600);
      if (error) throw new Error(message(error));
      return Object.fromEntries((data || []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]));
    },
  };
};
