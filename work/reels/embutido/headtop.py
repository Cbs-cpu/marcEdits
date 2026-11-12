"""Mide el top de la cabeza por segmento desde el alpha del cutout -> work/headtop.json (mínimo de 3 muestras)."""
import json, os, subprocess
from PIL import Image

segs = json.load(open('segments.json', encoding='utf-8'))
os.makedirs('work/alpha', exist_ok=True)
out = {}
for s in segs:
    t0, d = s['frame'] / 30, s['frames'] / 30
    tops = []
    for k, f in enumerate((.1, .3, .5, .7, .9)):
        png = f"work/alpha/{s['id']}_{k}.png"
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-c:v', 'libvpx-vp9', '-ss', f'{t0 + d * f:.2f}', '-i', 'assets/subject.webm',
                        '-frames:v', '1', '-vf', 'alphaextract,scale=270:480', png], check=True)
        im = Image.open(png).convert('L')
        px, (w, h) = im.load(), im.size
        ys = [y for y in range(h) if sum(px[x, y] > 128 for x in range(w)) >= 3]
        if ys:
            tops.append(ys[0] * 4)
    out[s['id']] = min(tops) if tops else 560
    print(s['id'], tops)
json.dump(out, open('work/headtop.json', 'w', encoding='utf-8'), indent=1)
print(out)
