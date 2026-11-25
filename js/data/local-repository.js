/* Dépôt de données de démonstration : stocke tout dans le navigateur (localStorage).
   Même interface asynchrone que le futur dépôt Supabase (js/data/supabase-repository.js),
   pour qu'on puisse remplacer l'un par l'autre sans toucher à l'interface.
   Si le navigateur refuse le stockage, les données restent en mémoire le temps de la session. */
window.GA = window.GA || {};

GA.createLocalRepository = function (storageKey, seed) {
  let memory = null;
  let persistent = true;

  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = () => new Date().toISOString();

  function load() {
    if (memory) return memory;
    try {
      const raw = localStorage.getItem(storageKey);
      memory = raw ? JSON.parse(raw) : clone(seed);
      if (!raw) save();
    } catch (e) {
      persistent = false;
      memory = clone(seed);
    }
    return memory;
  }
  function save() {
    if (!persistent) return;
    try { localStorage.setItem(storageKey, JSON.stringify(memory)); }
    catch (e) { persistent = false; }
  }
  const db = () => load();
  const find = (table, id) => db()[table].find(r => r.id === id) || null;
  const publicUser = u => { if (!u) return null; const { password, ...rest } = u; return clone(rest); };

  return {
    isPersistent: () => (load(), persistent),

    /* ---- Authentification (simulée) : remplacée par Supabase Auth plus tard ---- */
    async authenticate(email, password) {
      const u = db().users.find(x => x.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!u || u.password !== password) return { error: 'Email ou mot de passe incorrect.' };
      if (!u.actif) return { error: 'Ce compte est désactivé. Contactez un administrateur.' };
      return { user: publicUser(u) };
    },

    /* ---- Utilisateurs ---- */
    async listUsers() { return db().users.map(publicUser); },
    async getUser(id) { return publicUser(find('users', id)); },
    async createUser(data) {
      if (db().users.some(u => u.email.toLowerCase() === data.email.toLowerCase())) throw new Error('Un utilisateur utilise déjà cet email.');
      const u = { id: uid('u'), actif: true, created_at: now(), fonction: '', telephone: '', ...data };
      db().users.push(u); save(); return publicUser(u);
    },
    async updateUser(id, patch) {
      const u = find('users', id); if (!u) throw new Error('Utilisateur introuvable.');
      if (patch.email && db().users.some(x => x.id !== id && x.email.toLowerCase() === patch.email.toLowerCase())) throw new Error('Un utilisateur utilise déjà cet email.');
      Object.assign(u, patch); save(); return publicUser(u);
    },

    /* ---- Fiches de prospection ---- */
    async listProspects() { return clone(db().prospects); },
    async getProspect(id) { const p = find('prospects', id); return p ? clone(p) : null; },
    async createProspect(data) {
      const t = now();
      const p = { id: uid('p'), created_at: t, updated_at: t, ...data };
      db().prospects.push(p); save(); return clone(p);
    },
    async updateProspect(id, patch) {
      const p = find('prospects', id); if (!p) throw new Error('Fiche introuvable.');
      Object.assign(p, patch, { updated_at: now() }); save(); return clone(p);
    },
    async deleteProspect(id) {
      const d = db();
      d.prospects = d.prospects.filter(p => p.id !== id);
      d.exchanges = d.exchanges.filter(e => e.prospect_id !== id);
      save();
    },

    /* ---- Historique des échanges ---- */
    async listExchanges(prospectId) {
      return clone(db().exchanges.filter(e => !prospectId || e.prospect_id === prospectId));
    },
    async addExchange(data) {
      const e = { id: uid('e'), created_at: now(), ...data };
      db().exchanges.push(e);
      const p = find('prospects', data.prospect_id); if (p) p.updated_at = now();
      save(); return clone(e);
    },
    async deleteExchange(id) {
      const d = db(); d.exchanges = d.exchanges.filter(e => e.id !== id); save();
    },

    /* ---- Maquette uniquement ---- */
    async resetDemo() { memory = clone(seed); save(); },
  };
};
