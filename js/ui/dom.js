/* Petits outils d'interface partagés : échappement, formats, notifications, fenêtres. */
window.GA = window.GA || {};

GA.ui = (function () {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function fmtDate(d) {
    if (!d) return '';
    const [y, m, j] = String(d).slice(0, 10).split('-').map(Number);
    return j + ' ' + MOIS[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : '');
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return fmtDate(iso.slice(0, 10)) + ' à ' + String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
  }
  const km = n => n == null ? '' : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' km';
  const statut = key => GA.STATUTS.find(s => s.key === key) || GA.STATUTS[0];
  const statutPill = key => { const s = statut(key); return `<span class="pill" style="--c:${s.color}">${esc(s.label)}</span>`; };
  const initials = name => String(name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (u, cls) => u ? `<span class="av ${cls || ''}" title="${esc(u.nom)}">${esc(initials(u.nom))}</span>` : `<span class="av none ${cls || ''}" title="Non attribuée">–</span>`;
  const OPC = { 1: '#1f6fd1', 2: '#f08c00', 3: '#8a8f98' };
  function zoneChip(id) {
    if (!id) return '<span class="muted">—</span>';
    const z = GA.svc.zone(id);
    if (!z) return `<span class="zchip">${esc(id)}</span>`;
    const c = z.conf ? OPC[z.op] : '#d62828';
    return `<span class="zchip" style="--c:${c}" title="${esc(z.nom)}">${esc(z.id)}</span>`;
  }
  const overdue = d => d && d < GA.svc.today();

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2600);
  }
  // Exécute une action et affiche l'erreur éventuelle sans planter l'interface.
  async function run(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(e.message || String(e), 'err'); return undefined; }
  }

  // Fenêtre modale simple. body = HTML ; renvoie { el, close }.
  function modal(title, body, opts) {
    opts = opts || {};
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Fermer">✕</button></div>
      <div class="modal-b">${body}</div></div>`;
    root.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    $$('[data-close]', wrap).forEach(b => b.addEventListener('click', close));
    const first = $('input,select,textarea', wrap); if (first) first.focus();
    return { el: wrap, close };
  }
  function confirmBox(title, text, okLabel, danger) {
    return new Promise(res => {
      const m = modal(title, `<p>${esc(text)}</p><div class="modal-actions"><button class="btn" data-close>Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>`);
      $('[data-ok]', m.el).addEventListener('click', () => { m.close(); res(true); });
      $$('[data-close]', m.el).forEach(b => b.addEventListener('click', () => res(false)));
    });
  }

  // Options d'un sélecteur de zone, groupées par conformité.
  function zoneOptions(selected) {
    const grp = (label, list) => `<optgroup label="${esc(label)}">${list.map(z =>
      `<option value="${z.id}" ${z.id === selected ? 'selected' : ''}>${z.id} — ${esc(z.nom)} (${esc(z.com)})</option>`).join('')}</optgroup>`;
    const ok = GA.ZONES.filter(z => z.conf).sort((a, b) => a.id.localeCompare(b.id));
    const out = GA.ZONES.filter(z => !z.conf).sort((a, b) => a.id.localeCompare(b.id));
    return `<option value="">— Aucune zone —</option>` + grp('Dans le périmètre de 10 km', ok) + grp('Hors périmètre', out);
  }

  return { esc, $, $$, fmtDate, fmtDateTime, km, statut, statutPill, avatar, initials, zoneChip, overdue, toast, run, modal, confirmBox, zoneOptions, OPC };
})();
