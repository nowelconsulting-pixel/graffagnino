/* Démarrage, navigation entre espaces et état partagé de l'interface. */
window.GA = window.GA || {};

GA.store = { prospects: [], users: [], contacts: [], sites: [], secteurs: [], objectifs: [], concurrents: [], seuils: {}, zonesV2: null };

GA.app = (function () {
  const { $, $$, esc, avatar } = GA.ui;
  const ROUTES = ['carte', 'opp', 'crm', 'relances', 'bord', 'admin'];
  let route = null;

  // Données de référence V2, chargées en parallèle (une table absente ne bloque pas l'application).
  const sur = (pr, defaut) => pr.catch(() => defaut);
  async function reload(opts) {
    const [prospects, users, contacts, sites, secteurs, objectifs, concurrents, seuils] = await Promise.all([
      GA.svc.listProspects(), GA.svc.listUsers(), sur(GA.svc.listContacts(), []), sur(GA.svc.listSites(), []),
      sur(GA.svc.listSecteurs(), []), sur(GA.svc.listObjectifs(), []), sur(GA.svc.listConcurrents(), []),
      sur(GA.repo.getParametre('seuils'), null)]);
    Object.assign(GA.store, { prospects, users, contacts, sites, secteurs, objectifs, concurrents, seuils: seuils || {} });
    if (!GA.store.zonesV2) { try { GA.store.zonesV2 = (await (await fetch('data/zones-v2.json')).json()).zones; } catch (e) { GA.store.zonesV2 = {}; } }
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
    show(ROUTES.includes(h) ? h : 'bord');
  }

  // La V2 a besoin de la migration 006 : sinon, écran de mise à jour (instructions pour l'administrateur).
  function ecranMiseAJour() {
    const admin = GA.perm.isAdmin(GA.auth.current());
    $('#login').hidden = false; $('#app').hidden = true;
    $('#login').innerHTML = `<div class="login-card maj"><div class="brand big"><span class="logo">G</span><div><b>GRAFFAGNINO</b><small>Mise à jour de la base de données</small></div></div>
      ${admin ? `<p>La nouvelle version de l’application a besoin d’une mise à jour de la base (quelques secondes, sans perte de données : une copie est faite avant).</p>
        <ol class="steps"><li>Ouvrez <a href="https://github.com/nowelconsulting-pixel/graffagnino/blob/main/supabase/006_v2_crm_sourcing.sql" target="_blank" rel="noopener">supabase/006_v2_crm_sourcing.sql</a> et copiez son contenu (bouton « Copy raw file »).</li>
        <li>Dans Supabase : <b>SQL Editor → New query</b>, collez, puis <b>Run</b>. Le résultat affiche 7 lignes « ok = true ».</li>
        <li>Revenez ici et rechargez la page.</li></ol>`
      : '<p>L’application est en cours de mise à jour. Merci de réessayer dans quelques minutes, ou de prévenir l’administrateur.</p>'}
      <button class="btn primary block" onclick="location.reload()">Recharger</button>
      <button class="btn ghost block" id="maj-logout" style="margin-top:6px">Se déconnecter</button></div>`;
    $('#maj-logout').addEventListener('click', logout);
  }

  async function enter() {
    if ((await GA.repo.schemaVersion()) < 6) { ecranMiseAJour(); return; }
    $('#login').hidden = true; $('#app').hidden = false;
    renderUser();
    await reload();
    if (!location.hash || location.hash === '#connexion') history.replaceState(null, '', '#bord');
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
    $('#brand-home').addEventListener('click', e => { e.preventDefault(); go('bord'); });
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
