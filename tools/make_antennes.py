"""Produit data/antennes-4g.json : sites d'antennes 4G / 5G des 4 opérateurs mobiles, en France métropolitaine.
Sert à vérifier qu'un emplacement a du réseau (paiement par carte du distributeur).
Source : ANFR, « Données sur les installations radioélectriques de plus de 5 watts » (data.gouv.fr, Licence Ouverte).
Usage (depuis la racine du projet) :
  python3 tools/make_antennes.py dossier/   (dossier contenant SUP_STATION.txt, SUP_SUPPORT.txt, SUP_EMETTEUR.txt)"""
import csv, json, os, sys

src = sys.argv[1]
OPS = {'23': 1, '137': 2, '6': 4, '240': 8}   # Orange, SFR, Bouygues Telecom, Free Mobile (masque binaire)
lire = lambda f: csv.DictReader(open(os.path.join(src, f), encoding='latin-1', newline=''), delimiter=';')

op = {r['STA_NM_ANFR']: OPS[r['ADM_ID']] for r in lire('SUP_STATION.txt') if r['ADM_ID'] in OPS}
mobile = {r['STA_NM_ANFR'] for r in lire('SUP_EMETTEUR.txt')
          if r['STA_NM_ANFR'] in op and (r['EMR_LB_SYSTEME'].startswith('LTE') or r['EMR_LB_SYSTEME'].startswith('5G'))}
sites = {}
for r in lire('SUP_SUPPORT.txt'):
    s = r['STA_NM_ANFR']
    if s not in mobile:
        continue
    try:
        lat = int(r['COR_NB_DG_LAT']) + int(r['COR_NB_MN_LAT']) / 60 + float(r['COR_NB_SC_LAT']) / 3600
        lon = int(r['COR_NB_DG_LON']) + int(r['COR_NB_MN_LON']) / 60 + float(r['COR_NB_SC_LON']) / 3600
    except ValueError:
        continue
    if r['COR_CD_NS_LAT'] == 'S': lat = -lat
    if r['COR_CD_EW_LON'] == 'W': lon = -lon
    if not (41 < lat < 51.5 and -5.5 < lon < 10):   # métropole
        continue
    k = (round(lat, 4), round(lon, 4))
    sites[k] = sites.get(k, 0) | op[s]
out = sorted([lat, lon, m] for (lat, lon), m in sites.items())
json.dump({'source': 'ANFR, installations radioélectriques (4G / 5G), export ' + os.path.basename(os.path.normpath(src)),
           'operateurs': {'1': 'Orange', '2': 'SFR', '4': 'Bouygues Telecom', '8': 'Free Mobile'}, 'sites': out},
          open('data/antennes-4g.json', 'w', encoding='utf-8'), separators=(',', ':'))
print('ok', len(out), 'sites')
