#!/usr/bin/env python3
"""Carruseles de TikTok (posts de fotos): HTML → PNG 1080x1920 con Edge / Chrome sin ventana.

  python engine/carousel.py render <id> [--only 3]   renderiza library/carousels/<id>/slides/NN.html → NN.png + thumb.jpg
  python engine/carousel.py contact <id>             hoja con todas las diapositivas (contact.jpg) para revisarlas de un vistazo
  python engine/carousel.py fetch <ref-id> <url>     descarga las fotos de un carrusel de TikTok (gallery-dl) en library/carousel-refs/<id>/

Formato en library/carousels/<id>/carousel.json (ver engine/CAROUSEL.md).
Las diapositivas son HTML normales de 1080x1920: pueden usar ../assets/ (fotos del producto), engine/fonts y
library/tools/carruseles/base.css. El navegador se lanza 4 veces en paralelo: ~1,5 s por diapositiva.
"""
import concurrent.futures as cf
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1080, 1920
NOWIN = {'creationflags': 0x08000000} if os.name == 'nt' else {}


def browser():
    cands = [os.environ.get('MARC_BROWSER', ''),
             r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
             r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
             r'C:\Program Files\Google\Chrome\Application\chrome.exe',
             os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
             shutil.which('msedge') or '', shutil.which('chrome') or '', shutil.which('google-chrome') or '', shutil.which('chromium') or '']
    for c in cands:
        if c and os.path.exists(c):
            return c
    sys.exit('No encuentro Edge ni Chrome para renderizar los carruseles.')


def shot(exe, html, png, size=(W, H)):
    prof = tempfile.mkdtemp(prefix='marc-car-')
    try:
        subprocess.run([exe, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                        '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check',
                        '--virtual-time-budget=4000',   # deja cargar fuentes e imágenes antes de la captura
                        f'--window-size={size[0]},{size[1]}', f'--user-data-dir={prof}', f'--screenshot={png}',
                        'file:///' + os.path.abspath(html).replace('\\', '/')],
                       capture_output=True, timeout=90, **NOWIN)
    finally:
        shutil.rmtree(prof, ignore_errors=True)
    return os.path.exists(png)


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True, **NOWIN)


def render(cid, only=None):
    d = os.path.join(ROOT, 'library', 'carousels', cid)
    htmls = sorted(glob.glob(os.path.join(d, 'slides', '[0-9][0-9]*.html')))
    if only:
        htmls = [h for h in htmls if os.path.basename(h).startswith(f'{int(only):02d}')]
    if not htmls:
        sys.exit(f'No hay diapositivas en {d}/slides (01.html, 02.html…)')
    exe = browser()
    print(f'[carrusel] {len(htmls)} diapositivas con {os.path.basename(exe)}', flush=True)
    with cf.ThreadPoolExecutor(max_workers=min(4, os.cpu_count() or 2)) as pool:
        futs = {pool.submit(shot, exe, h, h[:-5] + '.png'): h for h in htmls}
        for f in cf.as_completed(futs):
            print(f'[carrusel] {"ok" if f.result() else "FALLO"} {os.path.basename(futs[f])[:-5]}.png', flush=True)
    # quitar PNG de diapositivas que ya no existen
    keep = {h[:-5] + '.png' for h in glob.glob(os.path.join(d, 'slides', '*.html'))}
    for p in glob.glob(os.path.join(d, 'slides', '[0-9][0-9]*.png')):
        if p not in keep:
            os.remove(p)
    pngs = sorted(glob.glob(os.path.join(d, 'slides', '[0-9][0-9]*.png')))
    if pngs:
        ffmpeg('-i', pngs[0], '-vf', 'scale=540:-1', os.path.join(d, 'thumb.jpg'))
    meta_p = os.path.join(d, 'meta.json')
    meta = json.load(open(meta_p, encoding='utf-8')) if os.path.exists(meta_p) else {'id': cid}
    meta['slides'] = len(pngs)
    json.dump(meta, open(meta_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    contact(cid)
    print(f'[carrusel] listo: {len(pngs)} PNG en library/carousels/{cid}/slides', flush=True)


def contact(cid):
    d = os.path.join(ROOT, 'library', 'carousels', cid)
    pngs = sorted(glob.glob(os.path.join(d, 'slides', '[0-9][0-9]*.png')))
    if not pngs:
        return
    cols = min(5, len(pngs))
    rows = (len(pngs) + cols - 1) // cols
    ins = sum((['-i', p] for p in pngs), [])
    pads = ''.join(f'[{i}:v]scale=270:480[s{i}];' for i in range(len(pngs)))
    lay = '|'.join(f'{(i % cols) * 270}_{(i // cols) * 480}' for i in range(len(pngs)))
    flt = pads + ''.join(f'[s{i}]' for i in range(len(pngs))) + (f'xstack=inputs={len(pngs)}:layout={lay}:fill=black' if len(pngs) > 1 else 'null')
    ffmpeg(*ins, '-filter_complex', flt, '-frames:v', '1', os.path.join(d, 'contact.jpg'))


def fetch(rid, url):
    """Descarga las fotos de un post de fotos de TikTok (o Instagram) con gallery-dl."""
    d = os.path.join(ROOT, 'library', 'carousel-refs', rid)
    os.makedirs(d, exist_ok=True)
    tmp = os.path.join(d, '_dl')
    cmd = [sys.executable, '-m', 'gallery_dl', '-D', tmp, '--write-metadata', url]
    if not shutil.which('gallery-dl') and subprocess.run([sys.executable, '-c', 'import gallery_dl'], capture_output=True).returncode:
        sys.exit('Falta gallery-dl (python -m pip install gallery-dl)')
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', **NOWIN)
    print(r.stdout[-2000:], r.stderr[-2000:], flush=True)
    imgs = sorted(f for f in glob.glob(os.path.join(tmp, '*')) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')))
    auds = [f for f in glob.glob(os.path.join(tmp, '*')) if f.lower().endswith(('.mp3', '.m4a'))]
    if not imgs:
        shutil.rmtree(tmp, ignore_errors=True)
        sys.exit('No se han encontrado fotos en ese enlace (¿es un vídeo y no un carrusel?). Sube capturas de las diapositivas.')
    meta = {}
    for j in glob.glob(os.path.join(tmp, '*.json')):
        try:
            meta = json.load(open(j, encoding='utf-8')); break
        except Exception:
            pass
    for i, f in enumerate(imgs, 1):
        ffmpeg('-i', f, '-q:v', '3', os.path.join(d, f'{i:02d}.jpg'))
    if auds:
        shutil.copy(auds[0], os.path.join(d, 'sound' + os.path.splitext(auds[0])[1]))
    shutil.rmtree(tmp, ignore_errors=True)
    info = {'author': (meta.get('author') or {}).get('uniqueId') if isinstance(meta.get('author'), dict) else meta.get('author'),
            'desc': meta.get('desc') or meta.get('description') or '', 'music': (meta.get('music') or {}).get('title') if isinstance(meta.get('music'), dict) else None}
    json.dump(info, open(os.path.join(d, 'source.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'[carrusel] {len(imgs)} fotos descargadas', flush=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == 'render':
        render(a[1], a[a.index('--only') + 1] if '--only' in a else None)
    elif a[0] == 'contact':
        contact(a[1])
    elif a[0] == 'fetch':
        fetch(a[1], a[2])
    else:
        sys.exit(__doc__)
