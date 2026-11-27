"""Produit data/parcelles-pm/<code INSEE>.json à partir du fichier DGFiP
« Fichiers des parcelles des personnes morales » (data.economie.gouv.fr, Licence Ouverte).

Un fichier par commune, chargé à la demande par l'application : identifiant de parcelle
→ adresse, surface et propriétaires (sociétés, collectivités…). Les personnes physiques
ne figurent pas dans ce fichier public.

Usage (depuis la racine du projet) :
  python3 tools/make_parcelles.py chemin/vers/PM_26_NB_950.csv [communes.json]
communes.json (facultatif) : liste des codes INSEE à garder, par exemple les communes situées
autour des zones de la carte (API Carto IGN, limites administratives)."""
import csv, json, os, sys
from collections import OrderedDict

src = sys.argv[1]
garder = set(json.load(open(sys.argv[2]))) if len(sys.argv) > 2 else None
out_dir = os.path.join('data', 'parcelles-pm')
os.makedirs(out_dir, exist_ok=True)

communes = {}   # code INSEE -> { idu court -> parcelle }
noms = {}
with open(src, encoding='utf-8', newline='') as f:
    r = csv.reader(f, delimiter=';')
    next(r)
    for row in r:
        if len(row) < 24:
            continue
        dep, _dir, com, nom_com, prefixe, section, plan, num_voie, indice, _majic, _rivoli, nature_voie, nom_voie, \
            contenance, _suf, _culture, _cont_suf, droit, _num_majic, siren, groupe, _forme, forme_abr, denom = [c.strip() for c in row[:24]]
        insee = dep + com
        if garder is not None and insee not in garder:
            continue
        # Identifiant cadastral (IDU), identique à celui de l'API Carto de l'IGN : section sur 2 caractères.
        cle = (prefixe or '000').zfill(3) + section.rjust(2, '0') + plan.zfill(4)
        noms[insee] = nom_com
        p = communes.setdefault(insee, {}).get(cle)
        if p is None:
            adresse = ' '.join(x for x in [num_voie.lstrip('0'), indice, nature_voie, nom_voie] if x)
            p = communes[insee][cle] = {'a': adresse, 'c': int(contenance or 0), 'o': []}
        proprietaire = [siren, denom, forme_abr, groupe.split(' - ')[-1].strip(), droit.split(' - ')[-1].strip()]
        if proprietaire not in p['o']:
            p['o'].append(proprietaire)

total = 0
for insee, parcelles in sorted(communes.items()):
    data = OrderedDict([('commune', noms[insee]), ('source', 'DGFiP, fichier des parcelles des personnes morales, situation 2026'),
                        ('parcelles', OrderedDict(sorted(parcelles.items())))])
    with open(os.path.join(out_dir, insee + '.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    total += len(parcelles)
print('ok', len(communes), 'communes,', total, 'parcelles')
