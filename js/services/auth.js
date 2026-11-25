/* Connexion SIMULÉE pour la maquette.
   Aucune sécurité réelle : les comptes et mots de passe de démonstration sont dans le code
   et la session est un simple enregistrement dans le navigateur.
   Sera remplacé par Supabase Auth (session, jetons, règles de sécurité côté base). */
window.GA = window.GA || {};

GA.auth = (function () {
  let current = null;

  function readSession() {
    try { return JSON.parse(localStorage.getItem(GA.config.sessionKey) || 'null'); } catch (e) { return null; }
  }
  function writeSession(id) {
    try { id ? localStorage.setItem(GA.config.sessionKey, JSON.stringify({ userId: id })) : localStorage.removeItem(GA.config.sessionKey); } catch (e) {}
  }

  return {
    current: () => current,
    async restore() {
      const s = readSession();
      if (!s) return null;
      const u = await GA.repo.getUser(s.userId);
      current = u && u.actif ? u : null;
      if (!current) writeSession(null);
      return current;
    },
    async signIn(email, password) {
      const r = await GA.repo.authenticate(email, password);
      if (r.error) return r;
      current = r.user; writeSession(current.id);
      return r;
    },
    signOut() { current = null; writeSession(null); },
    // Après modification de son propre profil par un administrateur.
    async refresh() { if (current) current = await GA.repo.getUser(current.id); return current; },
  };
})();
