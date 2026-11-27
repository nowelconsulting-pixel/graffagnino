/* Photos et documents d'une fiche (section du panneau) : vignettes, liste, ajout, suppression.
   Les fichiers sont privés : l'affichage passe par des liens temporaires. */
window.GA = window.GA || {};

GA.docsView = (function () {
  const { $, $$, esc, fmtDate, run, confirmBox } = GA.ui;
  const CATS = { photo: 'Photo', plan: 'Plan d’implantation', convention: 'Convention / contrat', autre: 'Autre document' };
  const isImg = d => /^image\//.test(d.type_mime);
  const taille = n => n > 1048576 ? (n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';

  function itemHtml(d, url, canDel) {
    const del = canDel ? `<button class="icon-btn doc-del" data-del="${esc(d.id)}" title="Supprimer" aria-label="Supprimer ${esc(d.nom)}">✕</button>` : '';
    if (isImg(d)) return `<figure class="doc-photo"><a href="${esc(url || '#')}" target="_blank" rel="noopener" title="${esc(d.nom)}"><img src="${esc(url || '')}" alt="${esc(d.nom)}" loading="lazy"></a>
      <figcaption>${esc(CATS[d.categorie] || '')} · ${fmtDate(d.created_at)}</figcaption>${del}</figure>`;
    return `<div class="doc-file"><span class="doc-ic" aria-hidden="true">${/pdf/.test(d.type_mime) ? 'PDF' : 'DOC'}</span>
      <div class="doc-f"><a href="${esc(url || '#')}" target="_blank" rel="noopener">${esc(d.nom)}</a><small>${esc(CATS[d.categorie] || '')} · ${taille(d.taille)} · ${fmtDate(d.created_at)}</small></div>${del}</div>`;
  }

  async function mount(root, p, ed) {
    if (!root) return;
    const me = GA.auth.current();
    root.innerHTML = `<div class="muted small">Chargement…</div>`;
    let docs;
    try { docs = await GA.svc.listDocuments(p.id); }
    catch (e) { root.innerHTML = `<div class="muted small">${esc(e.message)}</div>`; return; }
    if (!root.isConnected) return;
    let urls = {};
    try { urls = await GA.svc.documentUrls(docs.map(d => d.chemin)); } catch (e) {}
    const canDel = d => GA.perm.isAdmin(me) || (d.auteur_id === me.id && ed);
    const photos = docs.filter(isImg), fichiers = docs.filter(d => !isImg(d));
    root.innerHTML = `
      ${photos.length ? `<div class="doc-grid">${photos.map(d => itemHtml(d, urls[d.chemin], canDel(d))).join('')}</div>` : ''}
      ${fichiers.length ? `<div class="doc-list">${fichiers.map(d => itemHtml(d, urls[d.chemin], canDel(d))).join('')}</div>` : ''}
      ${!docs.length ? '<div class="muted small">Aucune photo ni document.</div>' : ''}
      ${ed ? `<div class="doc-add">
        <select id="doc-cat" aria-label="Catégorie"><option value="">Type automatique</option>${Object.entries(CATS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <label class="btn"><input type="file" id="doc-file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" hidden>Ajouter des fichiers…</label>
        <span class="muted small" id="doc-status"></span></div>` : ''}`;

    // Photos rattachées aux échanges : vignettes dans l'historique.
    $$('[data-exdocs]').forEach(box => {
      const list = docs.filter(d => d.exchange_id === box.dataset.exdocs && isImg(d));
      box.innerHTML = list.map(d => `<a href="${esc(urls[d.chemin] || '#')}" target="_blank" rel="noopener"><img src="${esc(urls[d.chemin] || '')}" alt="${esc(d.nom)}" loading="lazy"></a>`).join('');
    });

    $$('[data-del]', root).forEach(b => b.addEventListener('click', async () => {
      const d = docs.find(x => x.id === b.dataset.del);
      if (!await confirmBox('Supprimer le fichier', `Supprimer « ${d.nom} » ? Cette action est définitive.`, 'Supprimer', true)) return;
      if (await run(() => GA.svc.deleteDocument(p, d).then(() => true), 'Fichier supprimé')) mount(root, p, ed);
    }));
    const input = $('#doc-file', root);
    if (input) input.addEventListener('change', async () => {
      const files = Array.from(input.files || []); if (!files.length) return;
      const st = $('#doc-status', root); st.textContent = files.length > 1 ? `Envoi de ${files.length} fichiers…` : 'Envoi…';
      const cat = $('#doc-cat', root).value;
      const r = await run(() => GA.svc.addDocuments(p.id, files, { categorie: cat || undefined }), files.length > 1 ? files.length + ' fichiers ajoutés' : 'Fichier ajouté');
      if (r) mount(root, p, ed); else { st.textContent = ''; input.value = ''; }
    });
  }

  return { mount, CATS };
})();
