"""Produit data/tmja.json : tronçons du réseau routier national (autoroutes, nationales) avec leur
trafic moyen journalier annuel (TMJA), positions converties de Lambert-93 en WGS84.
Source : Ministère de la Transition écologique, « Trafic moyen journalier annuel sur le réseau routier national »
(data.gouv.fr, Licence Ouverte). Les routes départementales n'y figurent pas.
Usage (depuis la racine du projet) : python3 tools/make_tmja.py tmja-2019.csv [tmja-rrnc-2024.csv …]
(2019 : tout le réseau national ; années suivantes : réseau concédé seulement.)"""
import csv, json, math, sys

def lambert93_vers_wgs84(x, y):
    # Projection conique conforme Lambert-93 (IGN), ellipsoïde GRS80.
    n = 0.7256077650532670; c = 11754255.426096; xs = 700000.0; ys = 12655612.049876
    e = 0.0818191910428158; lon0 = math.radians(3)
    dx, dy = x - xs, y - ys
    r = math.hypot(dx, dy); gamma = math.atan2(dx, -dy)
    lon = lon0 + gamma / n
    lat_iso = -1 / n * math.log(abs(r / c))
    phi = 2 * math.atan(math.exp(lat_iso)) - math.pi / 2
    for _ in range(12):
        phi = 2 * math.atan(((1 + e * math.sin(phi)) / (1 - e * math.sin(phi))) ** (e / 2) * math.exp(lat_iso)) - math.pi / 2
    return round(math.degrees(phi), 5), round(math.degrees(lon), 5)

num = lambda s: float(s.replace(',', '.')) if s else None
out, annee = [], ''
for src in sys.argv[1:]:
  with open(src, encoding='utf-8', newline='') as f:
    for r in csv.DictReader(f, delimiter=';'):
        t = num(r['TMJA'])
        xd, yd, xf, yf = num(r['xD']), num(r['yD']), num(r['xF']), num(r['yF'])
        if not t or None in (xd, yd, xf, yf):
            continue
        a, b = lambert93_vers_wgs84(xd, yd), lambert93_vers_wgs84(xf, yf)
        route = r['route']
        route = route[0] + str(int(route[1:])) if route[1:].isdigit() else route
        out.append([route, a[0], a[1], b[0], b[1], int(t)])
        annee = max(annee, r['anneeMesureTrafic'])
json.dump({'source': 'TMJA du réseau routier national (DGITM), mesures 2019 à ' + annee, 'troncons': out},
          open('data/tmja.json', 'w', encoding='utf-8'), separators=(',', ':'))
print('ok', len(out), 'tronçons')
