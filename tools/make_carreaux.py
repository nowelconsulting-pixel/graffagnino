"""Produit data/carreaux/<département>.json : population par carreau de 200 m (INSEE, Filosofi 2019).
Chaque carreau : [lat, lon, habitants, ménages, 0–17 ans, 18–24 ans, 25–39 ans, niveau de vie moyen (€/an)].
Le moteur additionne les carreaux autour d'un emplacement (rayon de 800 m, isochrone de 10 min) au lieu de répartir
la population d'une commune uniformément sur sa surface.
Source : INSEE, « Revenus, pauvreté et niveau de vie en 2019 — données carroyées » (Filosofi), carreaux de 200 m,
https://www.insee.fr/fr/statistiques/7655475 (fichier carreaux_200m_met.csv).
Usage (depuis la racine du projet) :
  python3 tools/make_carreaux.py carreaux_200m_met.csv 75 77 78 91 92 93 94 95 60 59 62"""
import csv, json, math, os, sys

src, deps = sys.argv[1], set(sys.argv[2:])

def laea_vers_wgs84(x, y):
    # Projection azimutale équivalente de Lambert, Europe (EPSG:3035), ellipsoïde GRS80 — formules de Snyder.
    a, e2 = 6378137.0, 0.00669438002290; e = math.sqrt(e2)
    lat0, lon0, x0, y0 = math.radians(52), math.radians(10), 4321000.0, 3210000.0
    q = lambda p: (1 - e2) * (math.sin(p) / (1 - e2 * math.sin(p) ** 2) - 1 / (2 * e) * math.log((1 - e * math.sin(p)) / (1 + e * math.sin(p))))
    qp, q0 = q(math.pi / 2), q(lat0)
    b1 = math.asin(q0 / qp); rq = a * math.sqrt(qp / 2)
    d = a * math.cos(lat0) / math.sqrt(1 - e2 * math.sin(lat0) ** 2) / (rq * math.cos(b1))
    dx, dy = x - x0, y - y0
    rho = math.hypot(dx / d, d * dy)
    ce = 2 * math.asin(rho / (2 * rq))
    qq = qp * (math.cos(ce) * math.sin(b1) + d * dy * math.sin(ce) * math.cos(b1) / rho)
    lon = lon0 + math.atan2(dx * math.sin(ce), d * rho * math.cos(b1) * math.cos(ce) - d * d * dy * math.sin(b1) * math.sin(ce))
    beta = math.asin(qq / qp)
    lat = beta + (e2 / 3 + 31 * e2 ** 2 / 180 + 517 * e2 ** 3 / 5040) * math.sin(2 * beta) \
        + (23 * e2 ** 2 / 360 + 251 * e2 ** 3 / 3780) * math.sin(4 * beta) + (761 * e2 ** 3 / 45360) * math.sin(6 * beta)
    return math.degrees(lat), math.degrees(lon)

out = {d: [] for d in deps}
f = lambda r, k: float(r[k] or 0)
with open(src, encoding='utf-8', newline='') as fh:
    for r in csv.DictReader(fh):
        dep = r['lcog_geo'][:2]
        if dep not in deps:
            continue
        idc = r['idcar_200m']                      # CRS3035RES200mN2890000E3760000 (coin sud-ouest)
        n = int(idc[idc.index('mN') + 2:idc.rindex('E')]); ea = int(idc[idc.rindex('E') + 1:])
        lat, lon = laea_vers_wgs84(ea + 100, n + 100)
        ind = f(r, 'ind')
        enf = f(r, 'ind_0_3') + f(r, 'ind_4_5') + f(r, 'ind_6_10') + f(r, 'ind_11_17')
        nv = round(f(r, 'ind_snv') / ind) if ind else 0
        out[dep].append([round(lat, 5), round(lon, 5), round(ind, 1), round(f(r, 'men'), 1), round(enf, 1),
                         round(f(r, 'ind_18_24'), 1), round(f(r, 'ind_25_39'), 1), nv])
os.makedirs('data/carreaux', exist_ok=True)
for d, cells in out.items():
    cells.sort()
    json.dump({'source': 'INSEE, Filosofi 2019, carreaux de 200 m', 'champs': ['lat', 'lon', 'habitants', 'menages', 'age_0_17', 'age_18_24', 'age_25_39', 'niveau_vie'],
               'carreaux': cells}, open(f'data/carreaux/{d}.json', 'w', encoding='utf-8'), separators=(',', ':'))
    print(d, len(cells), 'carreaux')
