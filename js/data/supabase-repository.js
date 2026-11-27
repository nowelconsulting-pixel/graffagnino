/* Dépôt de données Supabase : authentification (Supabase Auth) et tables profiles, prospects, exchanges.
   Les règles de sécurité de supabase/schema.sql protègent les données côté serveur ;
   les contrôles de js/services/ servent au confort de l'interface. */
window.GA = window.GA || {};

GA.createSupabaseRepository = function (client) {
  // Champs texte d'une fiche renvoyés '' plutôt que null, comme l'attend l'interface.
  const TEXTES = ['zone_id', 'adresse', 'commune', 'proprietaire_nom', 'proprietaire_type', 'decideur_nom',
    'decideur_fonction', 'telephone', 'email', 'prochaine_action', 'date_relance', 'notes'];
  const PROFIL = ['nom', 'fonction', 'telephone', 'role', 'actif'];

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
  };
};
