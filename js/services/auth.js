/* Connexion : Supabase Auth (email et mot de passe).
   La session est conservée par Supabase dans le navigateur et renouvelée automatiquement.
   Les comptes se créent dans Supabase : Authentication → Users → Add user. */
window.GA = window.GA || {};

GA.auth = (function () {
  let current = null;

  return {
    current: () => current,
    async restore() {
      try {
        const r = await GA.repo.restoreSession();
        current = r.user || null;
        if (r.error) GA.ui.toast(r.error, 'err');
      } catch (e) { current = null; }
      return current;
    },
    async signIn(email, password) {
      if (!String(email).trim() || !password) return { error: 'Saisissez votre email et votre mot de passe.' };
      const r = await GA.repo.authenticate(email, password);
      if (r.error) return r;
      current = r.user;
      return r;
    },
    async signOut() { current = null; try { await GA.repo.signOut(); } catch (e) {} },
    // Après modification de son propre profil par un administrateur.
    async refresh() { if (current) current = await GA.repo.getUser(current.id); return current; },
  };
})();
