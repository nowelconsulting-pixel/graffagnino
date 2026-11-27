/* Page de connexion (distincte de l'application). */
window.GA = window.GA || {};

GA.loginView = (function () {
  const { $, esc } = GA.ui;

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
      <p class="hint lg-hint">Accès réservé à l’équipe. Compte ou mot de passe oublié : contactez l’administrateur.</p>
    </div>`;
    $('#login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#login-form button[type=submit]'); btn.disabled = true; btn.textContent = 'Connexion…';
      const r = await GA.auth.signIn($('#lg-email').value, $('#lg-pass').value);
      btn.disabled = false; btn.textContent = 'Se connecter';
      if (r.error) { $('#lg-err').textContent = r.error; return; }
      $('#lg-err').textContent = '';
      GA.app.enter();
    });
  }
  return { render };
})();
