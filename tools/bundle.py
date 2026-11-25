"""Produit graffagnino-prospection.html : toute l'application en un seul fichier
(styles et scripts intégrés, carte intégrée en base64 dans un cadre srcdoc).
Usage : python3 tools/bundle.py   (depuis la racine du projet)"""
import base64, re

root = open('index.html', encoding='utf-8').read()
css = open('css/app.css', encoding='utf-8').read()
root = root.replace('<link rel="stylesheet" href="css/app.css">', '<style>\n' + css + '\n</style>')

def inline(m):
    js = open(m.group(1), encoding='utf-8').read().replace('</script', '<\\/script')
    return '<script>\n/* ' + m.group(1) + ' */\n' + js + '\n</script>'
root = re.sub(r'<script src="([^"]+)"></script>', inline, root)

carte = base64.b64encode(open('carte/carte.html', 'rb').read()).decode()
root = root.replace('<div id="modal-root"></div>',
                    '<script id="carte-inline" type="application/octet-stream">' + carte + '</script>\n<div id="modal-root"></div>')
open('graffagnino-prospection.html', 'w', encoding='utf-8').write(root)
print('ok', len(root))
