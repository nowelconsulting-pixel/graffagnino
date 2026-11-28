/* Onglet Carte : la carte verrouillée est chargée telle quelle dans un cadre.
   Le dialogue avec elle passe uniquement par des messages (voir la fin de carte/carte.html). */
window.GA = window.GA || {};

GA.mapView = (function () {
  let frame = null, ready = false, pendingFocus = null;

  function post(msg) { if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, '*'); }
  function sendCounts() {
    const counts = {};
    (GA.store.prospects || []).forEach(p => { if (p.zone_id) counts[p.zone_id] = (counts[p.zone_id] || 0) + 1; });
    post({ type: 'ga:crmCounts', counts });
    try { const f = frame && frame.contentWindow && frame.contentWindow.__gaFiches; if (f) f.refresh(); } catch (e) {}
  }

  window.addEventListener('message', ev => {
    const m = ev.data || {};
    if (!frame || ev.source !== frame.contentWindow) return;
    if (m.type === 'ga:mapReady') {
      ready = true; sendCounts();
      if (pendingFocus) { post({ type: 'ga:focus', id: pendingFocus }); pendingFocus = null; }
    } else if (m.type === 'ga:openZone') {
      GA.crmView.setZoneFilter(m.id); GA.app.go('crm');
    } else if (m.type === 'ga:newForZone') {
      GA.app.go('crm'); GA.crmView.newProspect(m.id);
    }
  });

  // Ajustements d'affichage appliqués depuis l'application, sans modifier le fichier verrouillé
  // carte/carte.html (même origine : la page du cadre est accessible). Masque le titre de la carte.
  function adjust() {
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.head || !doc.getElementById('side') || doc.URL === 'about:blank') return false;
      if (doc.getElementById('ga-ajustements')) return true;
      const st = doc.createElement('style');
      st.id = 'ga-ajustements';
      st.textContent = '#side header > h1{display:none}' +
        // Téléphone : la carte prend plus de place que le panneau des zones.
        '@media (max-width:760px){#side{height:34%!important}#status{display:none}}';
      doc.head.appendChild(st);
      // Recherche, ajout d'emplacements et fiches CRM sur la carte (js/ui/carte-ajouts.js).
      const sc = doc.createElement('script');
      sc.src = new URL('js/ui/carte-ajouts.js', window.location.href).href;
      doc.body.appendChild(sc);
      return true;
    } catch (e) { return true; /* cadre inaccessible : la carte s'affiche telle quelle */ }
  }

  return {
    mount() {
      if (frame) return;
      frame = document.getElementById('mapframe');
      // Appliqué dès que la page de la carte est construite, sans attendre le chargement des fonds de plan.
      const poll = setInterval(() => { if (adjust()) clearInterval(poll); }, 50);
      setTimeout(() => clearInterval(poll), 20000);
      frame.addEventListener('load', adjust);
      // Version « fichier unique » : la carte est intégrée en base64 dans la page.
      const inline = document.getElementById('carte-inline');
      if (inline) {
        const bin = atob(inline.textContent.trim());
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        frame.srcdoc = new TextDecoder('utf-8').decode(bytes);
      } else {
        frame.src = frame.dataset.src;
      }
    },
    shown() { post({ type: 'ga:invalidate' }); sendCounts(); },
    focusZone(id) {
      GA.app.go('carte');
      if (ready) post({ type: 'ga:focus', id }); else pendingFocus = id;
    },
    sendCounts,
    // Affiche les lieux d'une étude de sourcing sur la carte (calque « Étude de sourcing »).
    showLieux(list, opts) {
      GA.app.go('carte');
      const tryShow = (n) => {
        try { const f = frame.contentWindow.__gaFiches; if (f && f.showLieux) { f.showLieux(list, opts); return; } } catch (e) {}
        if (n > 0) setTimeout(() => tryShow(n - 1), 200);
      };
      setTimeout(() => tryShow(50), 100);
    },
    // Centre la carte sur une fiche positionnée.
    focusProspect(p) {
      GA.app.go('carte');
      const tryFocus = (n) => {
        try { const f = frame.contentWindow.__gaFiches; if (f) { f.focus(p); return; } } catch (e) {}
        if (n > 0) setTimeout(() => tryFocus(n - 1), 200);
      };
      setTimeout(() => tryFocus(40), 100);
    },
  };
})();
