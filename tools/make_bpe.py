"""Produit data/bpe/<département>.json : équipements qui attirent du monde (INSEE, Base permanente des équipements 2025),
géolocalisés : collèges, lycées, enseignement supérieur, hôpitaux et urgences, grandes gares, piscines, gymnases,
salles de sport, bowlings, cinémas, salles de spectacle, hypermarchés et supermarchés.
Chaque équipement : [lat, lon, code TYPEQU].
Source : INSEE, BPE 2025, https://www.insee.fr/fr/statistiques/8217525 (BPE25.csv).
Usage (depuis la racine du projet) :
  python3 tools/make_bpe.py BPE25.csv 75 77 78 91 92 93 94 95 60 59 62"""
import csv, json, os, sys

src, deps = sys.argv[1], set(sys.argv[2:])
TYPES = {'C201', 'C301', 'C302', 'C303', 'C501', 'C502', 'C503', 'C504', 'C505', 'C509', 'D101', 'D106', 'D107',
         'E107', 'E108', 'F101', 'F114', 'F116', 'F119', 'F120', 'F121', 'F129', 'F303', 'F315', 'B104', 'B105'}
out = {d: set() for d in deps}
with open(src, encoding='utf-8', newline='') as f:
    for r in csv.DictReader(f, delimiter=';'):
        if r['DEP'] not in deps or r['TYPEQU'] not in TYPES:
            continue
        try:
            lat, lon = float(r['LATITUDE']), float(r['LONGITUDE'])
        except ValueError:
            continue
        out[r['DEP']].add((round(lat, 5), round(lon, 5), r['TYPEQU']))
os.makedirs('data/bpe', exist_ok=True)
for d, eq in out.items():
    json.dump({'source': 'INSEE, Base permanente des équipements 2025', 'equipements': sorted(eq)},
              open(f'data/bpe/{d}.json', 'w', encoding='utf-8'), separators=(',', ':'))
    print(d, len(eq), 'équipements')
