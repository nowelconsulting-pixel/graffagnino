/* Démarrage, navigation entre espaces et état partagé de l'interface. */
window.GA = window.GA || {};

GA.store = { prospects: [], users: [] };

GA.app = (function () {
  const { $, $$, esc, avatar } = GA.ui;
  const ROUTES = ['carte', 'opp', 'crm', 'relances', 'bord', 'admin'];
  let route = null;

  async function reload(opts) {
    GA.store.prospects = await GA.svc.listProspects();
    GA.store.users = await GA.svc.listUsers();
    if (route === 'crm') GA.crmView.render();
    if (route === 'admin') GA.adminView.render();
    if (route === 'relances') GA.relancesView.render();
    if (route === 'bord') GA.dashboardView.render();
    if (route === 'opp') GA.opportunitesView.render();
    GA.relancesView.badge();
    GA.mapView.sendCounts();
    if (!(opts && opts.keepPanel) && GA.panel.current() && !GA.store.prospects.some(p => p.id === GA.panel.current())) GA.panel.close();
  }

  function renderUser() {
    const u = GA.auth.current();
    $('#user-box').innerHTML = `${avatar(u)}<div class="ub-t"><b>${esc(u.nom)}</b><small>${u.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</small></div><button class="btn ghost" id="logout">Déconnexion</button>`;
    $('#logout').addEventListener('click', logout);
    $$('.nav a[data-route="admin"]').forEach(a => { a.hidden = !GA.perm.canAccessAdmin(u); });
  }

  function show(r) {
    const u = GA.auth.current();
    if (r === 'admin' && !GA.perm.canAccessAdmin(u)) { GA.ui.toast('Espace réservé aux administrateurs.', 'err'); r = 'carte'; history.replaceState(null, '', '#carte'); }
    route = r;
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + r; });
    $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.route === r));
    document.body.dataset.view = r;
    if (r !== 'crm') GA.panel.close();
    if (r === 'carte') { GA.mapView.mount(); GA.mapView.shown(); }
    if (r === 'crm') GA.crmView.render();
    if (r === 'admin') GA.adminView.render();
    if (r === 'relances') GA.relancesView.render();
    if (r === 'bord') GA.dashboardView.render();
    if (r === 'opp') GA.opportunitesView.render();
  }

  async function onHash() {
    if (!GA.auth.current()) return;
    const h = location.hash.slice(1);
    if (h.startsWith('fiche-')) {
      const id = h.slice(6);
      if (route !== 'crm') show('crm');
      if (GA.store.prospects.some(p => p.id === id)) await GA.panel.open(id);
      else { GA.ui.toast('Fiche introuvable.', 'err'); history.replaceState(null, '', '#crm'); }
      return;
    }
    show(ROUTES.includes(h) ? h : 'carte');
  }

  async function enter() {
    $('#login').hidden = true; $('#app').hidden = false;
    renderUser();
    await reload();
    if (!location.hash || location.hash === '#connexion') history.replaceState(null, '', '#carte');
    await onHash();
  }

  function logout() {
    GA.auth.signOut(); GA.panel.close(); route = null;
    $('#app').hidden = true; $('#login').hidden = false;
    history.replaceState(null, '', '#connexion');
    GA.loginView.render();
  }

  async function start() {
    GA.crmView.init(); GA.adminView.init(); GA.relancesView.init(); GA.dashboardView.init();
    $('#btn-visite').addEventListener('click', () => GA.visiteView.open(GA.panel.current()));
    $$('.nav a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.dataset.route); }));
    window.addEventListener('hashchange', onHash);
    if (!GA.repo.isPersistent()) $('#persist-warn').hidden = false;
    // Session terminée ailleurs (expiration, déconnexion dans un autre onglet) : retour à la connexion.
    GA.repo.onSignedOut(() => { if (GA.auth.current()) logout(); });
    const u = await GA.auth.restore();
    if (u) await enter(); else logout();
  }

  function go(r) { if (location.hash === '#' + r) onHash(); else location.hash = r; }

  return {
    start, enter, logout, reload, renderUser, go,
    openProspect(id) { if (location.hash === '#fiche-' + id) onHash(); else location.hash = 'fiche-' + id; },
  };
})();

document.addEventListener('DOMContentLoaded', () => GA.app.start());
