#!/usr/bin/env python3
"""WhatsApp Video 2026 11 08 (embutido ibérico) · receta «Básico TikTok» (engine/edit.py: cortes + zoom alterno
1.0/1.14) con subtítulos «Bold · skill video-edit» (legibles v2, ref. work/reels/embutido/build.py).

aroll = render del motor sin subtítulos (work/filter_aroll.txt); subject.webm = cutout del aroll.
Los tiempos de los subtítulos vienen de la edición Bold anterior (work/build_prev.py, verificados), pasados
por origen -> tiempo nuevo con segments.json.
Extras: flash blanco (2 fotogramas al 70%) en los cortes a «empresa» y «cta»; push-in lento 1 -> 1.05 en los
dos planos largos (empresa, cta); shake 0.15 s / 7 px en «20». El audio (voz + SFX) se mezcla aparte (mix.py).

python build.py          -> index.html
python build.py --safe   -> + guía de zona segura (solo snapshots)
"""
import json
import os
import subprocess
import sys

SAFE = '--safe' in sys.argv
DUR = float(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration',
                            '-of', 'csv=p=0', 'assets/aroll.mp4'], capture_output=True, text=True).stdout.strip())
YEL = '#FAE67A'
SEGS = json.load(open('segments.json', encoding='utf-8'))
SEG = {s['id']: s for s in SEGS}
T = {s['id']: max(0.0, s['frame'] / 30 - .002) for s in SEGS}   # -2 ms: que el set caiga en el fotograma del corte
HEAD = json.load(open('work/headtop.json', encoding='utf-8'))

# edición anterior: inicio (s) y entrada en origen de cada plano
PREV = [(0.0, 2.57), (3.30, 7.03), (6.90, 11.17), (10.60, 15.09), (433 / 30, 22.20), (592 / 30, 29.38)]


def m(tp):
    """tiempo de la edición anterior -> tiempo de esta edición (vía tiempo en origen)."""
    k = max(i for i, (o, _) in enumerate(PREV) if tp >= o - 1e-6)
    src = PREV[k][1] + tp - PREV[k][0]
    for s in SEGS:
        if src < s['src_out'] - 1e-6:
            return s['frame'] / 30 + max(0.0, src - s['src_in'])
    return DUR


def behind(seg, size):
    """palabra detrás de la cabeza: la línea base justo en lo alto de la cabeza (solo tapa la parte baja)."""
    return f'top:{max(225, round(HEAD.get(seg, 560) - .76 * size))}px'


C = 'left:0;right:0;text-align:center;'
LO1, LO2 = C + 'top:1005px', C + 'top:1112px'
B = lambda seg, size=220: C + behind(seg, size)
E = 'END'   # fin de grupo = siguiente corte duro (se resuelve abajo)

# (inicio, fin, [(t, texto, clases, estilo)]) en tiempos de la edición anterior; todo tal cual se dice
G = [
    (0.00, 1.30, [(0.00, 'aunque parezca', 'sm', LO1), (0.58, 'que te esté engañando', 'sm', LO2)]),
    (1.30, 1.72, [(1.34, 'con esto', 'big y', C + 'top:1020px')]),
    (1.72, 'casa', [(1.74, 'no me dedico a la', 'sm', LO1), (2.40, 'charcutería', 'md back y', B('hook', 150))]),
    ('casa', 4.30, [(3.33, 'y es que yo no sé', 'sm', LO1), (3.92, 'en qué momento', 'sm', LO2)]),
    (4.30, 5.56, [(4.32, 'me he encontrado', 'sm', LO1), (4.94, 'con todo este', 'sm', LO2)]),
    (5.56, 'pack', [(5.58, 'embutido', 'xl back', B('casa')), (5.92, 'ibérico', 'big y', C + 'top:1000px'),
                    (6.20, 'en mi casa', 'sm', C + 'top:1270px')]),
    ('pack', 8.50, [(6.92, 'lo único que hice', 'sm', LO1), (7.48, 'fue pedir un', 'sm', LO2),
                    (8.08, 'pack', 'big y', C + 'top:1195px')]),
    (8.50, 9.50, [(8.50, 'para poder tener', 'sm', LO1), (9.00, 'embutido', 'md y', C + 'top:1110px')]),
    (9.50, 'veinte', [(9.52, 'para todo el', 'sm', LO1), (9.98, 'invierno', 'xl back', B('pack'))]),
    ('veinte', 11.66, [(10.62, 'pero yo pensaba', 'sm', LO1), (11.16, 'que me llegarían', 'sm', LO2)]),
    (11.66, 12.82, [(11.68, '4 o 5', 'big y', C + 'top:990px'), (12.24, 'paquetes', 'sm', C + 'top:1260px')]),
    (12.82, 'empresa', [(12.84, 'y es que me han', 'sm', LO1), (13.48, 'llegado', 'sm', LO2),
                        (13.86, '20', 'huge back y', B('veinte', 300))]),
    ('empresa', 15.58, [(14.44, 'y es que la empresa', 'sm', LO1), (15.02, 'esa magna', 'md y', C + 'top:1110px')]),
    (15.58, 17.14, [(15.60, 'ha lanzado unos packs', 'sm', LO1), (16.58, 'exclusivos', 'md y', C + 'top:1110px')]),
    (17.14, 18.80, [(17.16, 'limitados', 'xl back', B('empresa')), (17.60, 'que van a durar', 'sm', LO1),
                    (18.14, 'muy poco', 'md y', C + 'top:1110px')]),
    (18.80, 'cta', [(18.84, 'evidentemente', 'md', C + 'top:1050px;font-size:118px')]),
    ('cta', 21.22, [(19.75, 'si a ti te sigue', 'sm', LO1), (20.26, 'apareciendo un', 'sm', LO2),
                    (20.80, 'carrito verde', 'md y', C + 'top:1200px;font-size:128px')]),
    (21.22, 22.54, [(21.24, 'aquí abajo', 'md y', C + 'top:1040px'), (21.80, 'accede corriendo', 'sm', C + 'top:1250px')]),
    (22.54, 23.80, [(22.56, 'que significa que', 'sm', LO1), (23.22, 'todavía quedan', 'sm', LO2)]),
    (23.80, 'END', [(23.82, 'las últimas', 'sm', LO1), ('cta2', 'unidades', 'xl back', B('cta2')),
                    (24.60, 'disponibles', 'md y', C + 'top:1100px'), (25.14, 'para ti', 'sm', C + 'top:1290px')]),
]


def tt(v):
    if v == 'END':
        return DUR
    return T[v] if isinstance(v, str) else m(v)


GROUPS = [(tt(a), tt(b), [(tt(t), txt, cls, st) for t, txt, cls, st in ws]) for a, b, ws in G]
WORD = {txt: t for _, _, ws in GROUPS for t, txt, _, _ in ws}


def words():
    html, tw = [], []
    for g, (a, b, ws) in enumerate(GROUPS):
        for k, (t, txt, cls, st) in enumerate(ws):
            wid = f'w{g}-{k}'
            if cls == 'sm' and len(txt) > 16:   # líneas largas más pequeñas para no salirse de los márgenes
                st += f';font-size:{max(70, round(94 * 16 / len(txt)))}px'
            html.append(f'<div id="{wid}" class="dw {cls}" style="{st}">{txt}</div>')
            tw.append(f"gsap.set('#{wid}',{{autoAlpha:0}});")
            tw.append(f"tl.fromTo('#{wid}',{{autoAlpha:0,scale:1.22,filter:'blur(22px)'}},{{autoAlpha:1,scale:1,filter:'blur(0px)',"
                      f"duration:.2,ease:'power3.out',immediateRender:false}},{max(a, t - .05):.3f});")
            if b < DUR - .01:
                tw.append(f"tl.to('#{wid}',{{autoAlpha:0,scale:.96,filter:'blur(16px)',duration:.12,ease:'power2.in'}},{b - .12:.3f});")
                tw.append(f"tl.set('#{wid}',{{autoAlpha:0}},{b:.3f});")
    return html, tw


FLASH = [T['empresa'], T['cta']]                         # máx. 2: los cortes de impacto (marca y CTA)
PUSH = [('empresa', 'cta'), ('cta', 'cta2')]             # planos largos: 1 -> 1.05
SHAKE = WORD['20']


def effects():
    tw = ["gsap.set('#flash',{opacity:0});", "gsap.set('#push',{scale:1});", "gsap.set('#stage',{x:0,y:0});"]
    for t in FLASH:
        tw.append(f"tl.set('#flash',{{opacity:.7}},{t:.3f});tl.set('#flash',{{opacity:0}},{t + 2 / 30:.3f});")
    for a, b in PUSH:
        tw.append(f"tl.fromTo('#push',{{scale:1}},{{scale:1.05,duration:{T[b] - T[a]:.3f},ease:'none',immediateRender:false}},{T[a]:.3f});")
        tw.append(f"tl.set('#push',{{scale:1}},{T[b]:.3f});")
    off = [(7, -3), (-6, 4), (5, 2), (-3, -2), (0, 0)]   # 0.15 s, ~7 px
    for i, (x, y) in enumerate(off):
        tw.append(f"tl.to('#stage',{{x:{x},y:{y},duration:.03,ease:'none'}},{SHAKE + i * .03:.3f});")
    return tw


CSS = f'''
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1080px;height:1920px;overflow:hidden;background:#000}}
#root{{position:relative;width:1080px;height:1920px;overflow:hidden;background:#000}}
#stage,#push{{position:absolute;inset:0}}
#push{{transform-origin:50% 35%}}
.full{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}}
#bgv{{z-index:0}}
.dw.back{{z-index:3}}
#cutwrap{{position:absolute;inset:0;z-index:4}}
#flash{{position:absolute;inset:0;z-index:20;background:#fff;pointer-events:none}}
.dw{{position:absolute;z-index:8;color:#fff;font-family:'Inter Tight';font-weight:900;letter-spacing:-.03em;word-spacing:.14em;line-height:.95;
  -webkit-text-stroke:.07em rgba(10,10,12,.78);paint-order:stroke fill;
  text-shadow:0 8px 30px rgba(0,0,0,.6),0 2px 6px rgba(0,0,0,.55);transform-origin:50% 60%;white-space:nowrap}}
.sm{{font-size:94px;font-weight:900;letter-spacing:-.02em;word-spacing:.18em}}
.md{{font-size:150px}}
.big{{font-size:236px}}
.xl{{font-size:220px}}
.huge{{font-size:300px}}
.y{{color:{YEL}}}
'''

SAFE_GUIDE = ('<div style="position:absolute;inset:0;z-index:99;pointer-events:none">'
              '<div style="position:absolute;left:0;right:0;top:0;height:220px;background:rgba(255,0,0,.28)"></div>'
              '<div style="position:absolute;left:0;right:0;top:1470px;bottom:0;background:rgba(255,0,0,.28)"></div>'
              '<div style="position:absolute;right:0;width:100px;top:1155px;height:315px;background:rgba(255,0,0,.28)"></div></div>')


def build():
    w_html, w_tw = words()
    back = [h for h in w_html if 'back' in h.split('class="')[1].split('"')[0]]
    front = [h for h in w_html if h not in back]
    nl = '\n'
    return f'''<!doctype html>
<html lang="es" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<link rel="stylesheet" href="assets/fonts/fonts.css" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>{CSS}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{DUR:.3f}" data-width="1080" data-height="1920">
  <div id="stage"><div id="push">
    <video id="bgv" class="full" src="assets/aroll.mp4" muted playsinline data-start="0" data-media-start="0" data-duration="{DUR:.3f}" data-track-index="0"></video>
{nl.join(back)}
    <div id="cutwrap"><video id="cut" class="full" src="assets/subject.webm" muted playsinline data-start="0" data-media-start="0" data-duration="{DUR:.3f}" data-track-index="1"></video></div>
  </div></div>
{nl.join(front)}
  <div id="flash"></div>
{SAFE_GUIDE if SAFE else ''}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{nl.join(effects() + w_tw)}
tl.set({{}}, {{}}, {DUR:.3f});
window.__timelines["main"] = tl;
</script>
</body>
</html>
'''


if __name__ == '__main__':
    with open('index.html', 'w', encoding='utf-8', newline='\n') as f:
        f.write(build())
    json.dump({'cuts': T, 'flash': FLASH, 'shake': SHAKE, 'words': WORD}, open('work/timing.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f'index.html {DUR:.3f}s cuts {T}')
    for g in GROUPS:
        print(f'{g[0]:6.2f}-{g[1]:6.2f}', [(round(t, 2), x) for t, x, _, _ in g[2]])
