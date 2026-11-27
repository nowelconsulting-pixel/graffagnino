/* Export Excel (.xlsx) sans bibliothèque : un classeur Office Open XML minimal,
   empaqueté dans une archive ZIP non compressée. Ouvert par Excel, LibreOffice et Google Sheets. */
window.GA = window.GA || {};

GA.xlsx = (function () {
  const enc = new TextEncoder();
  const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    // caractères de contrôle interdits en XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  /* ---- ZIP (méthode « stored », sans compression) ---- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function zip(files) {
    const parts = [], central = []; let offset = 0;
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, b) => s + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---- Classeur ---- */
  const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  // Nombre de jours depuis le 30/12/1899 : format date d'Excel.
  const excelDate = s => { const [y, m, d] = s.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };

  function cell(v, ref, header) {
    if (v == null || v === '') return '';
    if (header) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${xml(v)}</t></is></c>`;
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    if (typeof v === 'string' && ISO_DATE.test(v)) return `<c r="${ref}" s="2"><v>${excelDate(v)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }

  function sheetXml(sheet) {
    const cols = sheet.columns;
    const rows = [cols.map(c => c.label), ...sheet.rows.map(r => cols.map(c => r[c.key]))];
    const last = col(cols.length - 1) + rows.length;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(v, col(ci) + (ri + 1), ri === 0)).join('')}</row>`).join('')}</sheetData>
${rows.length > 1 ? `<autoFilter ref="A1:${last}"/>` : ''}
</worksheet>`;
  }

  /* sheets : [{ name, columns: [{ key, label, width }], rows: [ {...} ] }] */
  function workbook(sheets) {
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F3F5"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>` },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ];
    return zip(files);
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return { workbook, download };
})();

/* Export complet du CRM : fiches, échanges, utilisateurs. */
GA.exportCrm = async function () {
  const [prospects, exchanges, users] = await Promise.all([GA.svc.listProspects(), GA.svc.listExchanges(), GA.svc.listUsers()]);
  const userName = id => (users.find(u => u.id === id) || {}).nom || '';
  const pById = Object.fromEntries(prospects.map(p => [p.id, p]));
  const day = s => s ? String(s).slice(0, 10) : '';
  const sheets = [
    { name: 'Fiches', columns: [
      { key: 'nom', label: 'Emplacement', width: 34 }, { key: 'zone_id', label: 'Zone', width: 7 }, { key: 'zone_nom', label: 'Nom de la zone', width: 30 },
      { key: 'commune', label: 'Commune', width: 20 }, { key: 'adresse', label: 'Adresse', width: 34 }, { key: 'statut', label: 'Statut', width: 22 },
      { key: 'responsable', label: 'Responsable', width: 18 }, { key: 'prochaine_action', label: 'Prochaine action', width: 34 }, { key: 'date_relance', label: 'Relance', width: 11 },
      { key: 'proprietaire_nom', label: 'Propriétaire / gestionnaire', width: 28 }, { key: 'proprietaire_type', label: 'Type de propriétaire', width: 18 },
      { key: 'decideur_nom', label: 'Décideur', width: 22 }, { key: 'decideur_fonction', label: 'Fonction', width: 22 }, { key: 'telephone', label: 'Téléphone', width: 15 },
      { key: 'email', label: 'Email', width: 26 }, { key: 'notes', label: 'Notes', width: 50 }, { key: 'nb_echanges', label: 'Échanges', width: 9 },
      { key: 'created_at', label: 'Créée le', width: 11 }, { key: 'updated_at', label: 'Mise à jour', width: 11 }, { key: 'id', label: 'Identifiant', width: 38 },
    ], rows: prospects.map(p => {
      const z = GA.svc.zone(p.zone_id);
      return { ...p, zone_nom: z ? z.nom : '', statut: GA.ui.statut(p.statut).label, responsable: userName(p.responsable_id),
        nb_echanges: exchanges.filter(e => e.prospect_id === p.id).length, created_at: day(p.created_at), updated_at: day(p.updated_at) };
    }) },
    { name: 'Échanges', columns: [
      { key: 'date', label: 'Date', width: 11 }, { key: 'fiche', label: 'Emplacement', width: 34 }, { key: 'zone_id', label: 'Zone', width: 7 },
      { key: 'type', label: 'Type', width: 12 }, { key: 'commentaire', label: 'Compte rendu', width: 70 }, { key: 'auteur', label: 'Auteur', width: 18 },
    ], rows: exchanges.slice().sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at)).map(e => ({
      date: e.date, fiche: (pById[e.prospect_id] || {}).nom || '', zone_id: (pById[e.prospect_id] || {}).zone_id || '',
      type: (GA.TYPES_ECHANGE.find(t => t.key === e.type) || {}).label || e.type, commentaire: e.commentaire, auteur: userName(e.auteur_id),
    })) },
    { name: 'Utilisateurs', columns: [
      { key: 'nom', label: 'Nom', width: 22 }, { key: 'email', label: 'Email', width: 28 }, { key: 'role', label: 'Rôle', width: 15 },
      { key: 'fonction', label: 'Fonction', width: 22 }, { key: 'telephone', label: 'Téléphone', width: 15 }, { key: 'actif', label: 'Actif', width: 7 },
    ], rows: users.map(u => ({ ...u, role: (GA.ROLES.find(r => r.key === u.role) || {}).label || u.role, actif: u.actif ? 'oui' : 'non' })) },
  ];
  GA.xlsx.download(GA.xlsx.workbook(sheets), 'graffagnino-prospection-' + GA.svc.today() + '.xlsx');
  return prospects.length;
};
