"""Produit data/gares.json : gares de voyageurs SNCF (position) et fréquentation annuelle.
Sources : SNCF Open Data, jeux « gares-de-voyageurs » et « frequentation-gares » (licence ODbL).
Usage (depuis la racine du projet) :
  python3 tools/make_gares.py gares-de-voyageurs.json frequentation-gares.json
(exports JSON de https://data.sncf.com/api/explore/v2.1/catalog/datasets/<jeu>/exports/json)"""
import json, re, sys

gares = json.load(open(sys.argv[1], encoding='utf-8'))
freq = json.load(open(sys.argv[2], encoding='utf-8'))
voy, annee = {}, ''
for f in freq:
    an = max((k for k in f if re.fullmatch(r'total_voyageurs_\d{4}', k) and f[k] is not None), default=None)
    if an:
        voy[str(f['code_uic_complet'])[-8:]] = int(f[an])
        annee = max(annee, an[-4:])
out = []
for g in gares:
    p = g.get('position_geographique')
    if not p:
        continue
    uic = str(g.get('codes_uic') or '').split(';')[0].strip()[-8:]
    out.append([g['nom'], round(p['lat'], 5), round(p['lon'], 5), voy.get(uic)])
out.sort()
json.dump({'source': 'SNCF Open Data : gares de voyageurs et fréquentation ' + annee, 'gares': out},
          open('data/gares.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(out), 'gares,', sum(1 for g in out if g[3]), 'avec fréquentation', annee)
