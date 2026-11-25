"""Extrait de la carte la liste des 57 zones (lecture seule) pour le CRM.
Usage : python3 tools/make_zones.py   (depuis la racine du projet)"""
import json, re
html = open('carte/carte.html', encoding='utf-8').read()
m = re.search(r'const D = (\{.*?\});\nconst LAB', html, re.S)
D = json.loads(m.group(1))
keep = ['id','nom','com','type','lat','lon','vd','conf','alert','op','sc','lo','hi','cov','conf_lvl','cannib']
Z = [{k: z[k] for k in keep} for z in D['zones']]
out = ("/* Généré par tools/make_zones.py à partir de carte/carte.html — ne pas modifier à la main.\n"
       "   Données de la carte verrouillée : lecture seule dans le CRM. */\n"
       "window.GA = window.GA || {};\nGA.ZONES = " + json.dumps(Z, ensure_ascii=False, separators=(',', ':')) + ";\n")
open('js/data/zones.js', 'w', encoding='utf-8').write(out)
print(len(Z), 'zones')
