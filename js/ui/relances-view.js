/* Onglet Relances : dossiers en retard, à faire aujourd'hui, dans les 7 jours, et dossiers sans relance.
   « Fait » enregistre l'échange et programme la suite ; « Reporter » décale la date. */
window.GA = window.GA || {};

GA.relancesView = (function () {
  const { $, $$, esc, fmtDate, statutPill, avatar, zoneChip, run, modal } = GA.ui;
  const CLOS = ['accord', 'refuse'];
  let who = null;   // 'me' | 'all'
  try { who = localStorage.getItem('ga.rel.who'); } catch (e) {}

  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const userById = id => GA.store.users.find(u => u.id === id);

  function groups() {
    const today = GA.svc.today(), in7 = addDays(today, 7), me = GA.auth.current();
    const list = GA.store.prospects.filter(p => !CLOS.includes(p.statut) && (who !== 'me' || p.responsable_id === me.id));
    const by = (a, b) => (a.date_relance || '').localeCompare(b.date_relance || '') || a.nom.localeCompare(b.nom);
    return {
      retard: list.filter(p => p.date_relance && p.date_relance < today).sort(by),
      jour: list.filter(p => p.date_relance === today).sort(by),
      semaine: list.filter(p => p.date_relance > today && p.date_relance <= in7).sort(by),
      sans: list.filter(p => !p.date_relance).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
    };
  }

  function late(d) {
    const n = Math.round((new Date(GA.svc.today() + 'T12:00:00') - new Date(d + 'T12:00:00')) / 86400000);
    return n === 1 ? 'hier' : 'il y a ' + n + ' jours';
  }

  function row(p, kind) {
    const me = GA.auth.current(), ed = GA.perm.canEditProspect(me, p), u = userById(p.responsable_id);
    const when = kind === 'retard' ? `<span class="late">${fmtDate(p.date_relance)} · ${late(p.date_relance)}</span>`
      : kind === 'sans' ? '<span class="muted">Aucune date</span>' : fmtDate(p.date_relance);
    return `<div class="rel-row" data-id="${esc(p.id)}" tabindex="0">
      <div class="rel-main"><div class="rel-t"><b>${esc(p.nom)}</b> ${zoneChip(p.zone_id)} ${statutPill(p.statut)}</div>
        <div class="rel-n">${p.prochaine_action ? esc(p.prochaine_action) : '<span class="muted">Prochaine action non définie</span>'}</div>
        <div class="rel-m">${when} · ${avatar(u, 'sm')} ${u ? esc(u.nom) : '<span class="muted">Non attribuée</span>'}${p.commune ? ' · ' + esc(p.commune) : ''}</div></div>
      ${ed ? `<div class="rel-a"><button class="btn primary" data-done>Fait</button>${kind !== 'sans' ? `<button class="btn" data-snooze="1">+1 j</button><button class="btn" data-snooze="7">+7 j</button>` : `<button class="btn" data-plan>Planifier</button>`}</div>` : ''}
    </div>`;
  }

  function section(title, list, kind, emptyText) {
    if (!list.length && kind === 'sans') return '';
    return `<section class="rel-sec ${kind}"><h2>${title} <span class="kcount">${list.length}</span></h2>
      ${list.length ? list.map(p => row(p, kind)).join('') : `<div class="rel-empty">${emptyText}</div>`}</section>`;
  }

  function render() {
    if (!who) who = GA.store.prospects.some(p => p.responsable_id === GA.auth.current().id) ? 'me' : 'all';
    $$('#rel-who button').forEach(b => b.classList.toggle('on', b.dataset.who === who));
    const g = groups();
    $('#rel-count').textContent = (g.retard.length + g.jour.length) ? `${g.retard.length} en retard · ${g.jour.length} aujourd’hui` : 'Rien d’urgent';
    $('#rel-body').innerHTML =
      section('En retard', g.retard, 'retard', 'Aucune relance en retard.') +
      section('Aujourd’hui', g.jour, 'jour', 'Aucune relance prévue aujourd’hui.') +
      section('7 prochains jours', g.semaine, 'semaine', 'Rien de prévu cette semaine.') +
      section('Dossiers en cours sans date de relance', g.sans, 'sans', '');
    bind();
  }

  function bind() {
    $$('#rel-body .rel-row').forEach(r => {
      const p = GA.store.prospects.find(x => x.id === r.dataset.id);
      r.addEventListener('click', e => { if (!e.target.closest('button')) GA.app.openProspect(p.id); });
      r.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('button')) GA.app.openProspect(p.id); });
      const done = $('[data-done]', r); if (done) done.addEventListener('click', () => doneDialog(p, true));
      const plan = $('[data-plan]', r); if (plan) plan.addEventListener('click', () => doneDialog(p, false));
      $$('[data-snooze]', r).forEach(b => b.addEventListener('click', async () => {
        const base = p.date_relance && p.date_relance > GA.svc.today() ? p.date_relance : GA.svc.today();
        const d = addDays(base, +b.dataset.snooze);
        if (await run(() => GA.svc.updateProspect(p.id, { date_relance: d }), 'Relance reportée au ' + fmtDate(d))) await GA.app.reload();
      }));
    });
  }

  // withExchange : « Fait » (compte rendu + suite) ; sinon simple planification.
  function doneDialog(p, withExchange) {
    let type = 'appel';
    const quick = [[3, '+3 j'], [7, '+1 sem.'], [14, '+2 sem.'], [30, '+1 mois']];
    const m = modal(withExchange ? 'Relance effectuée' : 'Planifier une relance', `
      <p class="muted" style="margin-top:0"><b>${esc(p.nom)}</b>${p.prochaine_action ? ' · ' + esc(p.prochaine_action) : ''}</p>
      <form id="rd-form" novalidate>
        ${withExchange ? `<div class="ex-types" id="rd-types">${GA.TYPES_ECHANGE.map(t => `<button type="button" class="chip ${t.key === type ? 'on' : ''}" data-type="${t.key}">${t.icon} ${t.label}</button>`).join('')}</div>
        <label class="fld"><span>Compte rendu *</span><textarea id="rd-text" rows="3" class="notes" placeholder="Ce qui a été fait, la réponse obtenue…"></textarea></label>` : ''}
        <label class="fld"><span>Statut</span><select id="rd-statut">${GA.STATUTS.map(s => `<option value="${s.key}" ${s.key === p.statut ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
        <label class="fld"><span>Prochaine action</span><input id="rd-next" value="${esc(withExchange ? '' : p.prochaine_action)}" placeholder="Ex. : rappeler pour fixer la visite"></label>
        <label class="fld"><span>Prochaine relance</span><input id="rd-date" type="date" value="${addDays(GA.svc.today(), 7)}"></label>
        <div class="quick">${quick.map(([n, l]) => `<button type="button" class="chip" data-add="${n}">${l}</button>`).join('')}<button type="button" class="chip" data-add="">Aucune</button></div>
        <div class="modal-actions"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div>
      </form>`);
    $$('#rd-types .chip', m.el).forEach(c => c.addEventListener('click', () => { type = c.dataset.type; $$('#rd-types .chip', m.el).forEach(x => x.classList.toggle('on', x === c)); }));
    $$('[data-add]', m.el).forEach(b => b.addEventListener('click', () => { $('#rd-date', m.el).value = b.dataset.add ? addDays(GA.svc.today(), +b.dataset.add) : ''; }));
    const t = $('#rd-text', m.el); if (t) t.focus();
    $('#rd-form', m.el).addEventListener('submit', async e => {
      e.preventDefault();
      const ok = await run(async () => {
        if (withExchange) await GA.svc.addExchange(p.id, { type, date: GA.svc.today(), commentaire: $('#rd-text', m.el).value });
        return GA.svc.updateProspect(p.id, { statut: $('#rd-statut', m.el).value, prochaine_action: $('#rd-next', m.el).value, date_relance: $('#rd-date', m.el).value });
      }, withExchange ? 'Relance enregistrée' : 'Relance planifiée');
      if (ok) { m.close(); await GA.app.reload(); }
    });
  }

  // Pastille du menu : relances en retard ou du jour sur mes dossiers.
  function badge() {
    const el = $('#nav-relances'); const me = GA.auth.current(); if (!el || !me) return;
    const today = GA.svc.today();
    const n = GA.store.prospects.filter(p => !CLOS.includes(p.statut) && p.responsable_id === me.id && p.date_relance && p.date_relance <= today).length;
    el.textContent = n; el.hidden = !n;
  }

  return {
    init() {
      $$('#rel-who button').forEach(b => b.addEventListener('click', () => {
        who = b.dataset.who; try { localStorage.setItem('ga.rel.who', who); } catch (e) {} render();
      }));
    },
    render, badge,
  };
})();
