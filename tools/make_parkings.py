"""Produit data/parkings.json : parkings publics hors voirie (position, nombre de places).
Source : transport.data.gouv.fr, « Base nationale des lieux de stationnement » (data.gouv.fr, Licence Ouverte).
Complète les parkings d'OpenStreetMap, interrogés en direct par le moteur.
Usage (depuis la racine du projet) : python3 tools/make_parkings.py base-nationale-des-lieux-de-stationnement.csv"""
import csv, json, sys
out = []
with open(sys.argv[1], encoding='utf-8', newline='') as f:
    for r in csv.DictReader(f, delimiter=';'):
        try:
            lat, lon, n = float(r['Ylat']), float(r['Xlong']), int(float(r['nb_places'] or 0))
        except ValueError:
            continue
        if n > 0 and 41 < lat < 51.5 and -5.5 < lon < 10:
            out.append([round(lat, 5), round(lon, 5), n, r['nom'][:60]])
json.dump({'source': 'Base nationale des lieux de stationnement (transport.data.gouv.fr)', 'parkings': sorted(out)},
          open('data/parkings.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(out), 'parkings')
