/* Affichage du score d'un emplacement (fiche) et de son détail, lancement d'une analyse. */
window.GA = window.GA || {};

GA.scoreView = (function () {
  const { $, $$, esc, run, fmtDate } = GA.ui;
  const PRIO = { 1: '#1f6fd1', 2: '#f08c00', 3: '#8a8f98' };
  const ST = { connu: '', incomplet: ' <span class="tag warn">incomplet</span>', manquant: ' <span class="tag">non mesuré</span>' };

  function badge(total, prio) {
    return `<span class="score-badge" style="--c:${PRIO[prio]}"><b>${total}</b><small>/100 · P${prio}</small></span>`;
  }

  // Indicateurs sans points : réseau mobile, urbanisme, photo de rue.
  function indicateursHtml(a) {
    const i = a && a.ind; if (!i) return '';
    const l = [];
    if (i.reseau) l.push(`<li><span class="tag ${i.reseau.ok ? 'ok' : 'warn'}">Réseau mobile</span> ${esc(i.reseau.texte)}</li>`);
    if (i.urbanisme) l.push(`<li><span class="tag ${/^[AN]/.test(i.urbanisme.type || '') ? 'warn' : ''}">Urbanisme</span> ${esc(i.urbanisme.texte)}</li>`);
    if (i.photo) l.push(`<li><span class="tag">Photo de rue</span> <a href="${esc(i.photo.lien)}" target="_blank" rel="noopener">voir la photo la plus proche${i.photo.date ? ' (' + esc(fmtDate(i.photo.date)) + ')' : ''} ↗</a>
      ${i.photo.vignette ? `<a href="${esc(i.photo.lien)}" target="_blank" rel="noopener"><img class="pano" src="${esc(i.photo.vignette)}" alt="Photo de rue Panoramax" loading="lazy"></a>` : ''}</li>`);
    else if (a.v >= 2) l.push('<li><span class="tag">Photo de rue</span> <span class="muted">aucune photo Panoramax à moins de 80 m</span></li>');
    return l.length ? `<ul class="indic">${l.join('')}</ul>` : '';
  }

  function detailHtml(a) {
    if (!a || a.etude) return '';
    const bareme = a.v >= 2 ? 'Barème v2 (habitants, population, activité du soir, stationnement, flux, commerce, concurrence, emplois).'
      : 'Ancien barème de l’étude du 25/11 : cliquez sur « Recalculer » pour passer au barème v2.';
    return `<table class="score-det"><tbody>${a.det.map(d => `<tr><td>${esc(d.lab)}${ST[d.st] || ''}<div class="muted small">${esc(d.val)}</div>${d.rule ? `<div class="muted small rule">${esc(d.rule)}</div>` : ''}</td>
      <td class="pts">${d.pts == null ? '—' : d.pts}<small>/${d.mx}</small></td></tr>`).join('')}</tbody></table>
      ${indicateursHtml(a)}
      <p class="hint">Score affiché = points obtenus ÷ points mesurables × 100 (couverture ${a.couverture} %) ; fourchette ${a.lo}–${a.hi} selon les données manquantes. ${bareme}</p>`;
  }

  function resume(a, p) {
    const f = GA.moteur.scoreFinal(a, p, p && p.typologie);
    const labo = a.labo ? `${String(a.labo.km).replace('.', ',')} km par la route${a.labo.min != null ? ' · ' + a.labo.min + ' min' : ''}` : 'distance non calculée';
    const conf = a.conforme == null ? '' : a.conforme ? `<span class="tag ok">≤ ${a.distanceMaxKm || 10} km du laboratoire</span>` : `<span class="tag out">au-delà de ${a.distanceMaxKm || 10} km</span>`;
    return `<div class="score-head">${badge(f.total, f.priorite)}
      <div class="score-meta"><div>Score de base <b>${f.base}</b>${f.profil !== 'general' ? ' (profil « ' + esc((GA.TYPOLOGIES.find(x => x.key === f.profil) || {}).label || f.profil) + ' »)' : ''} · fourchette ${a.lo}–${a.hi}${f.ajust.length ? ' · ' + f.ajust.map(x => `${x.pts > 0 ? '+' : ''}${x.pts} ${esc(x.lab)}`).join(' · ') : ''}</div>
      <div class="muted small">${labo} ${conf}${a.alerte ? ' <span class="tag warn">à remesurer</span>' : ''} · calculé le ${fmtDate(a.date)}${a.v < 2 ? ' · <span class="tag warn">ancien barème</span>' : ''}</div>
      ${a.ind && a.ind.reseau && !a.ind.reseau.ok ? `<div class="small danger-t">${esc(a.ind.reseau.texte)}</div>` : ''}
      ${a.ind && a.ind.urbanisme && /^[AN]/.test(a.ind.urbanisme.type || '') ? `<div class="small danger-t">Urbanisme : ${esc(a.ind.urbanisme.texte)}</div>` : ''}</div></div>`;
  }

  // Section « Score de l'emplacement » du panneau de fiche.
  function section(p, ed) {
    const a = p.analyse;
    const terrain = Object.entries(GA.moteur.TERRAIN).map(([k, c]) => `<label class="tfld"><span>${esc(c.lab)}</span>
      <select data-terrain="${k}" ${ed ? '' : 'disabled'}><option value="">Non évalué</option>${Object.entries(c.options).map(([v, [l, pts]]) =>
        `<option value="${v}" ${p[k] === v ? 'selected' : ''}>${esc(l)} (${pts > 0 ? '+' : ''}${pts})</option>`).join('')}</select></label>`).join('');
    const pos = p.lat != null && p.lon != null;
    return `<div class="score-box">
      ${a ? resume(a, p) : `<p class="muted small" style="margin:0">${pos ? 'Emplacement pas encore analysé.' : 'Positionnez la fiche (sur la carte ou depuis l’adresse) pour calculer son score.'}</p>`}
      ${pos && ed ? `<div class="score-act"><button class="btn" data-analyse>${a ? 'Recalculer' : 'Calculer le score'}</button><span class="muted small" data-step></span>
        ${a ? '<button class="link" data-det>Voir le détail</button>' : ''}</div>` : (a ? '<div class="score-act"><button class="link" data-det>Voir le détail</button></div>' : '')}
      <div class="score-detail" hidden>${detailHtml(a)}</div>
      <div class="terrain"><div class="muted small">Évaluation terrain (bonus / malus)</div>${terrain}</div>
    </div>`;
  }

  async function analyserFiche(p, onStep) {
    const a = await GA.moteur.analyser(p.lat, p.lon, onStep);
    return GA.svc.updateProspect(p.id, { analyse: a });
  }

  function bind(root, p, rerender) {
    const b = $('[data-analyse]', root);
    if (b) b.addEventListener('click', async () => {
      b.disabled = true; const st = $('[data-step]', root);
      const r = await run(() => analyserFiche(p, t => { st.textContent = t; }), 'Score calculé');
      st.textContent = '';
      if (r) { await GA.app.reload({ keepPanel: true }); rerender(); } else b.disabled = false;
    });
    const d = $('[data-det]', root);
    if (d) d.addEventListener('click', () => { const x = $('.score-detail', root); x.hidden = !x.hidden; d.textContent = x.hidden ? 'Voir le détail' : 'Masquer le détail'; });
    $$('[data-terrain]', root).forEach(s => s.addEventListener('change', async () => {
      const r = await run(() => GA.svc.updateProspect(p.id, { [s.dataset.terrain]: s.value }), 'Évaluation enregistrée');
      if (r) { await GA.app.reload({ keepPanel: true }); rerender(); }
    }));
  }

  return { section, bind, badge, detailHtml, resume, analyserFiche, PRIO, indicateursHtml };
})();
