#!/usr/bin/env python3
"""WhatsApp Video 2026 11 08 (embutido ibérico, same raw take): /video-edit, Bold look, readable captions v2.
Based on work/reels/embutido/build.py. Differences: transitions = blur-a-foco at section starts (hook, empresa, cta)
+ corte seco with zoom alterno (1.0 / 1.15 from the EDL) on the other cuts; SFX only click-soft + pop;
"y es que la empresa" (the "y" is spoken, checked with two Whisper passes); evidentemente on its word time.

PY build.py         writes index.html
PY build.py --safe  same + red safe-zone guide (snapshots only)
"""
import json
import os
import shutil
import subprocess
import sys

SAFE = '--safe' in sys.argv or bool(os.environ.get('SAFE'))
DUR = float(subprocess.run([shutil.which('ffprobe') or 'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                            'stream=duration', '-of', 'csv=p=0', 'assets/aroll.mp4'],
                           capture_output=True, encoding='utf-8', errors='replace').stdout.strip().split(',')[0])
YEL = '#FAE67A'
with open('segments.json', encoding='utf-8') as _f:
    SEG = {s['id']: s for s in json.load(_f)}
T = {k: s['frame'] / 30 - .002 if s['frame'] else 0.0 for k, s in SEG.items()}
CUTS = [T['casa'], T['pack'], T['veinte'], T['empresa'], T['cta']]
BOLD_F = 'contrast(1.07) saturate(.9) brightness(.97)'

# Head top (px, 1080x1920) per segment, measured with scripts/headpos.py on the cutout.
HEAD = json.load(open('work/headtop.json', encoding='utf-8')) if os.path.exists('work/headtop.json') else {}


def behind(seg, size):
    """top for a word tucked behind the head: baseline ~30% of the x-height below the head top (layout.md)."""
    ht = HEAD.get(seg, 560)
    # v2: the hair covered ~50% of the letters with the layout.md formula (low-res source, curly hair above the
    # alpha's head top), so the baseline sits right at the head top: only the bottom of the letters gets covered
    return f'top:{max(225, round(ht - .76 * size))}px'


C = 'left:0;right:0;text-align:center;'
LO1, LO2 = C + 'top:1005px', C + 'top:1112px'
B = lambda seg, size=220: C + behind(seg, size)

GROUPS = [  # (start, end, [(t, text, classes, style)])  every word as spoken, lowercase, punch words in yellow
    # hook
    (0.00, 1.30, [(0.00, 'aunque parezca', 'sm', LO1), (0.58, 'que te esté engañando', 'sm', LO2)]),
    (1.30, 1.72, [(1.34, 'con esto', 'big y', C + 'top:1020px')]),
    (1.72, CUTS[0], [(1.74, 'no me dedico a la', 'sm', LO1), (2.40, 'charcutería', 'md back y', B('hook', 150))]),
    # casa
    (CUTS[0], 4.30, [(3.33, 'y es que yo no sé', 'sm', LO1), (3.92, 'en qué momento', 'sm', LO2)]),
    (4.30, 5.56, [(4.32, 'me he encontrado', 'sm', LO1), (4.94, 'con todo este', 'sm', LO2)]),
    (5.56, CUTS[1], [(5.58, 'embutido', 'xl back', B('casa')), (5.92, 'ibérico', 'big y', C + 'top:1000px'),
                     (6.20, 'en mi casa', 'sm', C + 'top:1270px')]),
    # pack
    (CUTS[1], 8.50, [(6.92, 'lo único que hice', 'sm', LO1), (7.48, 'fue pedir un', 'sm', LO2),
                     (8.08, 'pack', 'big y', C + 'top:1195px')]),
    (8.50, 9.50, [(8.50, 'para poder tener', 'sm', LO1), (9.00, 'embutido', 'md y', C + 'top:1110px')]),
    (9.50, CUTS[2], [(9.52, 'para todo el', 'sm', LO1), (9.98, 'invierno', 'xl back', B('pack'))]),
    # veinte
    (CUTS[2], 11.66, [(10.62, 'pero yo pensaba', 'sm', LO1), (11.16, 'que me llegarían', 'sm', LO2)]),
    (11.66, 12.82, [(11.68, '4 o 5', 'big y', C + 'top:990px'), (12.24, 'paquetes', 'sm', C + 'top:1260px')]),
    (12.82, CUTS[3], [(12.84, 'y es que me han', 'sm', LO1), (13.48, 'llegado', 'sm', LO2),
                      (13.86, '20', 'huge back y', B('veinte', 300))]),
    # empresa
    (CUTS[3], 15.58, [(14.44, 'y es que la empresa', 'sm', LO1), (15.02, 'esa magna', 'md y', C + 'top:1110px')]),
    (15.58, 17.14, [(15.60, 'ha lanzado unos packs', 'sm', LO1), (16.58, 'exclusivos', 'md y', C + 'top:1110px')]),
    (17.14, 18.56, [(17.16, 'limitados', 'xl back', B('empresa')), (17.60, 'que van a durar', 'sm', LO1),
                    (18.14, 'muy poco', 'md y', C + 'top:1110px')]),
    (18.56, CUTS[4], [(18.60, 'evidentemente', 'md', C + 'top:1050px;font-size:118px')]),
    # cta
    (CUTS[4], 21.22, [(19.75, 'si a ti te sigue', 'sm', LO1), (20.26, 'apareciendo un', 'sm', LO2),
                      (20.80, 'carrito verde', 'md y', C + 'top:1200px;font-size:128px')]),
    (21.22, 22.54, [(21.24, 'aquí abajo', 'md y', C + 'top:1040px'), (21.80, 'accede corriendo', 'sm', C + 'top:1250px')]),
    (22.54, 23.80, [(22.56, 'que significa que', 'sm', LO1), (23.22, 'todavía quedan', 'sm', LO2)]),
    (23.80, DUR, [(23.82, 'las últimas', 'sm', LO1), (24.26, 'unidades', 'xl back', B('cta')),
                  (24.60, 'disponibles', 'md y', C + 'top:1100px'), (25.14, 'para ti', 'sm', C + 'top:1290px')]),
]


def dude_words():
    html, tw = [], []
    for g, (a, b, words) in enumerate(GROUPS):
        for k, (t, txt, cls, st) in enumerate(words):
            wid = f'w{g}-{k}'
            if cls == 'sm' and len(txt) > 16:   # long lead-in lines shrink so they stay inside the side margins
                st += f';font-size:{max(70, round(94 * 16 / len(txt)))}px'
            html.append(f'<div id="{wid}" class="dw {cls}" style="{st}">{txt}</div>')
            tw.append(f"gsap.set('#{wid}',{{autoAlpha:0}});")
            tw.append(f"tl.fromTo('#{wid}',{{autoAlpha:0,scale:1.22,filter:'blur(22px)'}},{{autoAlpha:1,scale:1,filter:'blur(0px)',"
                      f"duration:.2,ease:'power3.out',immediateRender:false}},{max(a, t - .05):.3f});")
            if b < DUR - .01:
                tw.append(f"tl.to('#{wid}',{{autoAlpha:0,scale:.96,filter:'blur(16px)',duration:.12,ease:'power2.in'}},{b - .12:.3f});")
                tw.append(f"tl.set('#{wid}',{{autoAlpha:0}},{b:.3f});")
    return html, tw


SECTIONS = [0.0, T['empresa'], T['cta']]   # blur a foco opens these; the other cuts are corte seco + zoom alterno


def grades():
    tw = [f"gsap.set('.g',{{filter:'{BOLD_F}'}});", "gsap.set('#stage',{filter:'blur(0px) brightness(1)'});"]
    for t in SECTIONS:   # blur a foco: blur 18px + brillo 1.35 -> nitido en .45s power3.out
        tw.append(f"tl.fromTo('#stage',{{filter:'blur(18px) brightness(1.35)'}},{{filter:'blur(0px) brightness(1)',"
                  f"duration:.45,ease:'power3.out',immediateRender:{'true' if t == 0 else 'false'}}},{t:.3f});")
    return tw


SFX = [('click-soft', .02, .22), ('click-soft', T['empresa'], .22), ('click-soft', T['cta'], .22),
       ('pop', 1.34, .16), ('pop', 11.68, .16), ('pop', 13.86, .2), ('pop', 21.24, .16)]
SFX_LEN = {'whoosh-short': .57, 'pop': .72, 'sparkle': 1.8, 'click': .3, 'click-soft': .37, 'impact-bass-1': 1.2}
SFX_GAIN = 0.75


def audio():
    out, lanes = [], []
    for k, (name, t, vol) in enumerate(sorted(SFX, key=lambda x: x[1])):
        d = min(SFX_LEN[name], DUR - t)
        lane = next((i for i, end in enumerate(lanes) if end <= t), None)
        if lane is None:
            lanes.append(0); lane = len(lanes) - 1
        lanes[lane] = t + d
        out.append(f'<audio id="sfx{k}" src="assets/sfx/{name}.mp3" data-start="{t:.3f}" data-duration="{d:.3f}" '
                   f'data-track-index="{10 + lane}" data-volume="{vol * SFX_GAIN:.3f}"></audio>')
    return out


CSS = f'''
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1080px;height:1920px;overflow:hidden;background:#000}}
#root{{position:relative;width:1080px;height:1920px;overflow:hidden;background:#000}}
#stage{{position:absolute;inset:0;transform-origin:50% 45%}}
.full{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}}
#bgv{{z-index:0}}
.dw.back{{z-index:3}}
#cutwrap{{position:absolute;inset:0;z-index:4}}
.fx{{position:absolute;inset:0;pointer-events:none}}
#dtone{{z-index:7;background:linear-gradient(180deg,rgba(20,55,75,.16),rgba(60,40,20,.08));mix-blend-mode:soft-light}}
#dvig{{z-index:7;background:radial-gradient(95% 62% at 50% 46%,rgba(0,0,0,0) 55%,rgba(0,0,0,.42) 100%)}}
#dgrad{{z-index:7;background:linear-gradient(180deg,rgba(0,0,0,.34) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 50%,rgba(0,0,0,.42) 100%)}}
/* v2 legibility: more space between words (they ran together), dark outline + firmer shadow
   (white text was lost on the white t-shirt and cabinets), lead-in lines a bit bigger */
.dw{{position:absolute;z-index:8;color:#fff;font-family:'Inter Tight';font-weight:900;letter-spacing:-.03em;word-spacing:.14em;line-height:.95;
  -webkit-text-stroke:.07em rgba(10,10,12,.78);paint-order:stroke fill;
  text-shadow:0 8px 30px rgba(0,0,0,.6),0 2px 6px rgba(0,0,0,.55);transform-origin:50% 60%;white-space:nowrap}}
.sm{{font-size:94px;font-weight:900;letter-spacing:-.02em;word-spacing:.18em}}
.sm2{{font-size:62px;font-weight:900;letter-spacing:-.01em;word-spacing:.18em}}
.md{{font-size:150px}}
.big{{font-size:236px}}
.xl{{font-size:220px}}
.huge{{font-size:300px}}
.y{{color:{YEL}}}
'''

# safe zone guide (Reels values; TikTok's UI sits in about the same places)
SAFE_GUIDE = ('<div style="position:absolute;inset:0;z-index:99;pointer-events:none">'
              '<div style="position:absolute;left:0;right:0;top:0;height:220px;background:rgba(255,0,0,.28)"></div>'
              '<div style="position:absolute;left:0;right:0;top:1470px;bottom:0;background:rgba(255,0,0,.28)"></div>'
              '<div style="position:absolute;left:0;width:35px;top:220px;height:1250px;background:rgba(255,0,0,.28)"></div>'
              '<div style="position:absolute;right:0;width:35px;top:220px;height:935px;background:rgba(255,0,0,.28)"></div>'
              '<div style="position:absolute;right:0;width:100px;top:1155px;height:315px;background:rgba(255,0,0,.28)"></div></div>')


def build():
    w_html, w_tw = dude_words()
    back = [h for h in w_html if 'back' in h.split('class="')[1].split('"')[0]]
    front = [h for h in w_html if h not in back]
    tweens = grades() + w_tw
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
  <audio id="bga" src="assets/aroll.mp4" data-start="0" data-media-start="0" data-duration="{DUR:.3f}" data-track-index="2" data-volume="1"></audio>
{nl.join(audio())}
  <div id="stage">
    <video id="bgv" class="full g" src="assets/aroll.mp4" muted playsinline data-start="0" data-media-start="0" data-duration="{DUR:.3f}" data-track-index="0"></video>
{nl.join(back)}
    <div id="cutwrap"><video id="cut" class="full g" src="assets/subject.webm" muted playsinline data-start="0" data-media-start="0" data-duration="{DUR:.3f}" data-track-index="1"></video></div>
  </div>
  <div id="dtone" class="fx"></div><div id="dvig" class="fx"></div><div id="dgrad" class="fx"></div>
{nl.join(front)}
{SAFE_GUIDE if SAFE else ''}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{nl.join(tweens)}
tl.set({{}}, {{}}, {DUR:.3f});
window.__timelines["main"] = tl;
</script>
</body>
</html>
'''


with open('index.html', 'w', encoding='utf-8', newline='\n') as _f:
    _f.write(build())
print(f'wrote index.html {DUR:.3f}s  cuts {[round(c, 3) for c in CUTS]}  head {HEAD}')
