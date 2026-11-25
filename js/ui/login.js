/* Page de connexion (distincte de l'application). */
window.GA = window.GA || {};

GA.loginView = (function () {
  const { $, esc } = GA.ui;
  const DEMO = [
    ['admin@graffagnino.demo', 'admin', 'Administrateur'],
    ['camille@graffagnino.demo', 'demo', 'Utilisateur'],
    ['julien@graffagnino.demo', 'demo', 'Utilisateur'],
  ];

  function render() {
    const el = $('#login');
    el.innerHTML = `
    <div class="login-card">
      <div class="brand big"><span class="logo">G</span><div><b>GRAFFAGNINO</b><small>Prospection des emplacements</small></div></div>
      <form id="login-form" novalidate>
        <label class="fld"><span>Adresse email</span><input type="email" id="lg-email" autocomplete="username" required></label>
        <label class="fld"><span>Mot de passe</span><input type="password" id="lg-pass" autocomplete="current-password" required></label>
        <div class="lg-err" id="lg-err" role="alert"></div>
        <button class="btn primary block" type="submit">Se connecter</button>
      </form>
      <div class="demo-box">
        <b>Maquette : connexion simulée</b>
        <p>Cette connexion ne protège rien : les comptes de démonstration sont inscrits dans le code. La vraie authentification viendra avec Supabase.</p>
        <div class="demo-list">${DEMO.map(d => `<button type="button" class="demo-acc" data-e="${esc(d[0])}" data-p="${esc(d[1])}"><span>${esc(d[0])}</span><small>${esc(d[2])} · mot de passe « ${esc(d[1])} »</small></button>`).join('')}</div>
      </div>
    </div>`;
    el.querySelectorAll('.demo-acc').forEach(b => b.addEventListener('click', () => {
      $('#lg-email').value = b.dataset.e; $('#lg-pass').value = b.dataset.p; $('#lg-pass').focus();
    }));
    $('#login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const r = await GA.auth.signIn($('#lg-email').value, $('#lg-pass').value);
      if (r.error) { $('#lg-err').textContent = r.error; return; }
      $('#lg-err').textContent = '';
      GA.app.enter();
    });
  }
  return { render };
})();
