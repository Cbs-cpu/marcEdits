"""Manual editor timeline: import an edit into library/edited/<id>/timeline.json and render it.

Usage (from the project root):
  python engine/timeline.py import <id>     creates timeline.json from what Claude did (skill project or engine EDL)
  python engine/timeline.py render <id>     renders timeline.json -> library/edited/<id>/editor/render.mp4

Format (documented in engine/TIMELINE.md):
  source     main original video (relative to the root); clips cut from it
  clips      [{in, out, zoom, cx, cy, punch, src?, gain_db?, mute?, fit?}]  in order; output time = sum of the previous
             durations. src = another video (to join several videos); fit = fill | blur | fit (horizontal videos)
  captions   [{start, end, text, size, color, top, back}]  times on the OUTPUT timeline, px on the 1080x1920 frame
  voice      {gain_db}
  music      null | {file, start, offset, gain_db, duck, fade_in, fade_out}
  sfx        [{file, t, gain_db}]
  broll      [{src, in, start, end, fit?, zoom?, cx?, cy?}]  footage over the main video (output seconds); voice keeps going
  cutout     null | {file, sig}   person cutout (words behind the head); only valid while the clips' sig doesn't change
  grade      CSS filter for the footage
"""
import hashlib
import json
import math
import os
import re
import runpy
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SKILL = os.path.join(ROOT, '.claude', 'skills', 'video-edit')
TEMPLATE = os.path.join(SKILL, 'assets', 'template')
YEL = '#FAE67A'
BOLD_GRADE = 'contrast(1.07) saturate(.9) brightness(.97)'


def log(m):
    print(f'[timeline] {m}', flush=True)


def probe_dur(f):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                         capture_output=True, text=True).stdout.strip()
    return float(out) if out else 0.0


def probe_size(f):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                          '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip()
    w, h = out.split(',')[:2]
    return int(w), int(h)


def sig(clips):
    """Fingerprint of the cuts: the cutout (subject.webm) only matches while this stays the same.
    Speed only counts when it isn't 1 (compatible with the fingerprints saved before speed existed)."""
    def one(c):
        base = ','.join(f"{float(c.get(k, d)):.3f}" for k, d in (('in', 0), ('out', 0), ('zoom', 1), ('cx', .5), ('cy', .5)))
        sp = float(c.get('speed', 1) or 1)
        base = base if abs(sp - 1) < 1e-6 else f'{base},x{sp:.3f}'
        return f"{base},@{c['src']}" if c.get('src') else base   # multi-video: the clip's own source
    return '|'.join(one(c) for c in clips)


_audio = {}
def has_audio(f):
    if f not in _audio:
        out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', f],
                             capture_output=True, text=True).stdout.strip()
        _audio[f] = bool(out)
    return _audio[f]


def db(v):
    return round(20 * math.log10(max(v, 1e-4)), 1)


# ------------------------------------------------------------------ import
def import_skill_project(meta, proj):
    """From a /video-edit project (segments.json + build.py with GROUPS / SFX)."""
    segs = json.load(open(os.path.join(proj, 'segments.json'), encoding='utf-8'))
    src = json.load(open(os.path.join(proj, 'sources.json'), encoding='utf-8'))
    relsrc = lambda key: os.path.relpath(src[key], ROOT).replace('\\', '/')
    source = relsrc(segs[0]['clip'])
    clips = []
    for k, s in enumerate(segs):
        c = {'in': s['src_in'], 'out': s['src_out'], 'zoom': s.get('zoom', 1.0), 'cx': s.get('cx', .5), 'cy': s.get('cy', .5), 'punch': k > 0}
        if relsrc(s['clip']) != source:          # several raw videos in the same project
            c['src'] = relsrc(s['clip'])
        clips.append(c)
    # run the project's build.py to read its data (it rewrites the same index.html, harmless)
    cwd, argv = os.getcwd(), sys.argv
    try:
        os.chdir(proj); sys.argv = ['build.py']
        g = runpy.run_path('build.py')
    finally:
        os.chdir(cwd); sys.argv = argv
    sizes = {'sm': 94, 'sm2': 62, 'md': 150, 'big': 236, 'xl': 220, 'huge': 300}
    dur = g['DUR']
    captions = []
    for a, b, words in g['GROUPS']:
        for t, text, cls, style in words:
            c = cls.split()
            size = next((sizes[x] for x in c if x in sizes), 94)
            m = re.search(r'font-size:(\d+)px', style)
            if m:
                size = int(m.group(1))
            elif 'sm' in c and len(text) > 16:     # same rule as the build: long lines shrink
                size = max(70, round(94 * 16 / len(text)))
            top = int(re.search(r'top:(\d+)px', style).group(1)) if 'top:' in style else 1005
            captions.append({'start': round(max(a, t - .05), 3), 'end': round(min(b, dur), 3), 'text': text, 'size': size,
                             'color': YEL if 'y' in c else '#FFFFFF', 'top': top, 'back': 'back' in c})
    gain = g.get('SFX_GAIN', 1)
    sfx = []
    for name, t, vol in g.get('SFX', []):
        f = f'library/tools/sonidos/{name}.mp3'
        if not os.path.exists(f):
            f = os.path.relpath(os.path.join(proj, 'assets', 'sfx', f'{name}.mp3'), ROOT).replace('\\', '/')
        sfx.append({'file': f, 't': round(t, 3), 'gain_db': db(vol * gain)})
    cut = os.path.join(proj, 'assets', 'subject.webm')
    return {
        'source': source, 'clips': clips, 'captions': captions, 'voice': {'gain_db': 0}, 'music': None, 'sfx': sfx,
        'cutout': {'file': os.path.relpath(cut, ROOT).replace('\\', '/'), 'sig': sig(clips)} if os.path.exists(cut) else None,
        'grade': BOLD_GRADE, 'look': 'bold',
    }


def import_engine_edl(meta, d):
    """From an edit made by engine/edit.py (edl.json with segments and words)."""
    edl = json.load(open(os.path.join(d, 'edl.json'), encoding='utf-8'))
    pattern = [1.0, 1.14]
    clips = [{'in': s['src_start'], 'out': s['src_end'], 'zoom': pattern[k % 2], 'cx': .5, 'cy': .35, 'punch': k > 0}
             for k, s in enumerate(edl['segments'])]
    captions, cur = [], []
    words = edl.get('words', [])
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if len(cur) == 3 or not nxt or nxt['start'] - w['end'] > .3:
            captions.append({'start': round(cur[0]['start'], 3), 'end': round(min(cur[-1]['end'] + .15, nxt['start'] if nxt else 9e9), 3),
                             'text': ' '.join(x['text'] for x in cur).lower(), 'size': 94, 'color': '#FFFFFF', 'top': 1180, 'back': False})
            cur = []
    return {'source': meta.get('source'), 'clips': clips, 'captions': captions, 'voice': {'gain_db': 0}, 'music': None,
            'sfx': [], 'cutout': None, 'grade': BOLD_GRADE, 'look': 'bold'}


def import_engine_work(meta, d):
    """From engine/edit.py's work files (filter.txt with the trims + captions.ass) when there is no edl.json."""
    fc = open(os.path.join(d, 'work', 'filter.txt'), encoding='utf-8').read()
    trims = re.findall(r'\[0:v\]trim=start=([\d.]+):end=([\d.]+).*?scale=(\d+):(\d+)', fc)
    clips = [{'in': float(a), 'out': float(b), 'zoom': round(int(w) / 1080, 2), 'cx': .5, 'cy': .35, 'punch': k > 0}
             for k, (a, b, w, h) in enumerate(trims)]
    def ts(t):
        h, m, s = t.split(':'); return int(h) * 3600 + int(m) * 60 + float(s)
    chunks = {}
    for line in open(os.path.join(d, 'work', 'captions.ass'), encoding='utf-8'):
        if not line.startswith('Dialogue:'):
            continue
        p = line.rstrip('\n').split(',', 9)
        text = re.sub(r'\{[^}]*\}', '', p[9]).strip().lower()
        a, b = ts(p[1]), ts(p[2])
        key = (text, round(a, 0) if text not in chunks else None)
        if text in chunks and a - chunks[text]['end'] < .05:
            chunks[text]['end'] = b   # same block, next highlighted word
        else:
            chunks[text + f'@{a:.2f}' if text in chunks else text] = {'start': a, 'end': b}
    captions = [{'start': round(v['start'], 3), 'end': round(v['end'], 3), 'text': k.split('@')[0], 'size': 94, 'color': '#FFFFFF',
                 'top': 1180, 'back': False} for k, v in sorted(chunks.items(), key=lambda kv: kv[1]['start'])]
    return {'source': meta.get('source'), 'clips': clips, 'captions': captions, 'voice': {'gain_db': 0}, 'music': None,
            'sfx': [], 'cutout': None, 'grade': BOLD_GRADE, 'look': 'bold'}


def import_fallback(meta, d):
    """No project data: edit on top of the current final (copied so renders never read their own output)."""
    base = os.path.join(d, 'editor', 'base.mp4')
    os.makedirs(os.path.dirname(base), exist_ok=True)
    shutil.copyfile(os.path.join(d, 'final.mp4'), base)
    dur = probe_dur(base)
    return {'source': os.path.relpath(base, ROOT).replace('\\', '/'), 'clips': [{'in': 0, 'out': round(dur, 3), 'zoom': 1, 'cx': .5, 'cy': .5, 'punch': False}],
            'captions': [], 'voice': {'gain_db': 0}, 'music': None, 'sfx': [], 'cutout': None, 'grade': 'none', 'look': 'bold',
            'note': 'Importado desde el vídeo final: los subtítulos y sonidos ya están dentro de la imagen y el audio.'}


def do_import(vid):
    d = os.path.join('library', 'edited', vid)
    meta = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))
    proj = meta.get('project')
    if proj and os.path.exists(os.path.join(proj, 'segments.json')) and os.path.exists(os.path.join(proj, 'build.py')):
        tl = import_skill_project(meta, proj); how = f'proyecto {proj}'
    elif os.path.exists(os.path.join(d, 'edl.json')) and meta.get('source') and isinstance(
            json.load(open(os.path.join(d, 'edl.json'), encoding='utf-8')), dict):
        tl = import_engine_edl(meta, d); how = 'EDL del motor'
    elif os.path.exists(os.path.join(d, 'work', 'filter.txt')) and os.path.exists(os.path.join(d, 'work', 'captions.ass')) and meta.get('source'):
        tl = import_engine_work(meta, d); how = 'trabajo del motor'
    else:
        tl = import_fallback(meta, d); how = 'vídeo final'
    tl.update({'version': 1, 'fps': 30, 'width': 1080, 'height': 1920})
    json.dump(tl, open(os.path.join(d, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f'importado desde {how}: {len(tl["clips"])} planos, {len(tl["captions"])} subtítulos, {len(tl["sfx"])} sonidos')


# ------------------------------------------------------------------ render
def cdur(c):
    """Output duration of a clip (speed 2 = half as long)."""
    return (c['out'] - c['in']) / float(c.get('speed', 1) or 1)


def crop(z, cx, cy, sw, sh):
    if z <= 1:
        return ''
    w, h = round(sw / z / 2) * 2, round(sh / z / 2) * 2
    x = min(max(round(cx * sw - w / 2), 0), sw - w)
    y = min(max(round(cy * sh - h / 2), 0), sh - h)
    return f'crop={w}:{h}:{x}:{y},'


def atempo(s):
    """atempo only accepts 0.5-2: chain it outside that range."""
    out, s = [], float(s)
    while s > 2:
        out.append('atempo=2'); s /= 2
    while s < .5:
        out.append('atempo=0.5'); s /= .5
    out.append(f'atempo={s:.4f}')
    return ','.join(out)


def frame_vf(c, sw, sh, enhance, sp=1.0):
    """9:16 video filter for a piece of footage: zoom crop, fill (crop to 9:16) | blur (whole frame over a blurred copy,
    for horizontal videos) | fit (whole frame over black)."""
    pre = 'hqdn3d=1.5:1.5:6:6,' if enhance else ''        # low-res sources (WhatsApp...): gentle denoise before upscaling
    post = ',unsharp=5:5:0.7:5:5:0.0' if enhance else ''  # and a light sharpen after
    cr = crop(c.get('zoom', 1), c.get('cx', .5), c.get('cy', .5), sw, sh)
    fit = c.get('fit', 'fill')
    if fit in ('blur', 'fit'):
        bg = ('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:2,eq=brightness=-0.08'
              if fit == 'blur' else 'scale=1080:1920,drawbox=c=black:t=fill')
        return (f"{cr}{pre}split[a][b];[a]{bg}[bg];[b]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos{post}[fg];"
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,setpts=PTS/{sp},fps=30")
    return (f"{cr}{pre}scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920{post},"
            f"setsar=1,setpts=PTS/{sp},fps=30")


def build_aroll(tl, work, assets):
    """Cuts every clip from ITS source (clips[].src, default tl.source) and joins them. Several videos can be mixed:
    clips[].gain_db = that clip's audio volume, clips[].mute, clips[].fit = fill (crop to 9:16) | blur (whole frame over a
    blurred copy, for horizontal videos) | fit (whole frame over black)."""
    enhance = bool(tl.get('enhance'))
    extra = '|'.join(f"{c.get('gain_db', 0)}{c.get('mute', False)}{c.get('fit', 'fill')}" for c in tl['clips'])
    extra += json.dumps(tl.get('broll') or [], sort_keys=True)
    key = hashlib.sha1((tl['source'] + sig(tl['clips']) + extra + f'|e{enhance}').encode()).hexdigest()[:12]
    aroll = os.path.join(assets, 'aroll.mp4')
    stamp = os.path.join(work, 'aroll.key')
    if os.path.exists(aroll) and os.path.exists(stamp) and open(stamp).read() == key:
        log('cortes sin cambios: reutilizo el montaje')
        return
    sizes = {}
    parts = []
    for k, c in enumerate(tl['clips']):
        src = c.get('src') or tl['source']
        if src not in sizes:
            sizes[src] = probe_size(src)
        sw, sh = sizes[src]
        d = c['out'] - c['in']
        sp = float(c.get('speed', 1) or 1)
        od = d / sp
        out = os.path.join(work, f'seg_{k}.mp4')
        vf = frame_vf(c, sw, sh, enhance, sp)
        fades = f"afade=t=in:d=0.02,afade=t=out:st={max(0, od - 0.03):.3f}:d=0.03"
        vol = '' if not c.get('gain_db') else f"volume={float(c['gain_db'])}dB,"
        af = (f"{atempo(sp)}," if sp != 1 else '') + vol + 'aformat=sample_rates=48000:channel_layouts=stereo,' + fades
        ins = ['-ss', f"{c['in']:.3f}", '-t', f'{d:.3f}', '-i', src]
        if c.get('mute') or not has_audio(src):     # B-roll without sound: silence of the same length
            ins += ['-f', 'lavfi', '-t', f'{d:.3f}', '-i', 'anullsrc=r=48000:cl=stereo']
            amap = '1:a:0'
        else:
            amap = '0:a:0'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *ins, '-map', '0:v:0', '-map', amap,
                        '-vf', vf, '-af', af, '-t', f'{od:.3f}', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                        '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', out], check=True)
        parts.append(out)
        log(f'plano {k + 1}/{len(tl["clips"])}')
    concat = os.path.join(work, 'concat.txt')
    with open(concat, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(''.join(f"file '{os.path.basename(p)}'\n" for p in parts))
    broll = [b for b in (tl.get('broll') or []) if float(b['end']) > float(b['start'])]
    joined = os.path.join(work, 'joined.mp4') if broll else aroll
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concat, '-vf', 'setpts=N/30/TB', '-r', '30',
                    '-fps_mode', 'cfr', '-af', 'asetpts=PTS-STARTPTS', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-g', '30',
                    '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ar', '48000', joined], check=True)
    if broll:
        build_broll(broll, joined, aroll, work, enhance, sizes)
    open(stamp, 'w').write(key)


def build_broll(broll, base, out, work, enhance, sizes):
    """B-roll layer (like CapCut's overlay track): footage from other videos shown OVER the main video between start and
    end (output seconds) while the voice of the main video keeps playing underneath."""
    ins, f, last = ['-i', base], [], '[0:v]'
    for k, b in enumerate(broll):
        src = b['src']
        if src not in sizes:
            sizes[src] = probe_size(src)
        sw, sh = sizes[src]
        a, e = float(b['start']), float(b['end'])
        seg = os.path.join(work, f'broll_{k}.mp4')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f"{float(b.get('in', 0)):.3f}", '-t', f'{e - a:.3f}', '-i', src,
                        '-map', '0:v:0', '-vf', frame_vf(b, sw, sh, enhance), '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium',
                        '-pix_fmt', 'yuv420p', seg], check=True)
        ins += ['-i', seg]
        f.append(f"[{k + 1}:v]setpts=PTS-STARTPTS+{a:.3f}/TB[b{k}]")
        f.append(f"{last}[b{k}]overlay=0:0:eof_action=pass:enable='between(t,{a:.3f},{e:.3f})'[v{k}]")
        last = f'[v{k}]'
        log(f'b-roll {k + 1}/{len(broll)}')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *ins, '-filter_complex', ';'.join(f), '-map', last, '-map', '0:a',
                    '-r', '30', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-g', '30', '-pix_fmt', 'yuv420p',
                    '-c:a', 'copy', out], check=True)


def build_mix(tl, assets, dur):
    """Voice (light clean-up) + music with ducking (voice drives the sidechain) + sound effects, mastered to -14 LUFS."""
    ins = ['-i', os.path.join(assets, 'aroll.mp4')]
    clean = 'highpass=f=80,' if tl.get('voice', {}).get('clean', True) else ''
    f = [f"[0:a]{clean}volume={tl.get('voice', {}).get('gain_db', 0)}dB,asplit=2[voice][vsc]"]
    mixes = ['[voice]']
    n = 1
    m = tl.get('music')
    if m and m.get('file') and os.path.exists(m['file']):
        ins += ['-i', m['file']]
        start, off = float(m.get('start', 0)), float(m.get('offset', 0))
        length = max(0.5, dur - start)
        fi, fo = float(m.get('fade_in', .5)), float(m.get('fade_out', 1))
        chain = (f"[{n}:a]atrim=start={off}:duration={length:.3f},asetpts=PTS-STARTPTS,aresample=48000,volume={m.get('gain_db', -18)}dB,"
                 f"afade=t=in:d={fi},afade=t=out:st={max(0, length - fo):.3f}:d={fo},adelay={int(start * 1000)}|{int(start * 1000)}")
        if m.get('duck', True):
            f.append(chain + '[mraw]')
            f.append('[mraw][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[music]')
        else:
            f.append(chain + '[music]')
            f.append('[vsc]anullsink')
        mixes.append('[music]')
        n += 1
    else:
        f.append('[vsc]anullsink')
    for s in tl.get('sfx', []):
        if not os.path.exists(s['file']) or s['t'] >= dur:
            continue
        ins += ['-i', s['file']]
        ms = int(max(0, float(s['t'])) * 1000)
        f.append(f"[{n}:a]aresample=48000,volume={s.get('gain_db', -10)}dB,adelay={ms}|{ms}[s{n}]")
        mixes.append(f'[s{n}]')
        n += 1
    f.append(f"{''.join(mixes)}amix=inputs={len(mixes)}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[out]")
    out = os.path.join(assets, 'mix.wav')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *ins, '-filter_complex', ';'.join(f), '-map', '[out]', '-t', f'{dur:.3f}', out], check=True)
    log('mezcla de audio lista (voz + música con ducking + sonidos, -14 LUFS)')


FONTS = {'Inter Tight': 900, 'Montserrat': 600, 'DM Serif Display': 400, 'Instrument Serif': 400, 'Caveat': 600, 'Inter': 600}

CSS = '''
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#000}
#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:#000}
#stage{position:absolute;inset:0;transform-origin:50% 45%}
#push{position:absolute;inset:0;transform-origin:50% 40%}
.full{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#bgv{z-index:0}
.cap.back{z-index:3}
#cutwrap{position:absolute;inset:0;z-index:4}
.fx{position:absolute;inset:0;pointer-events:none}
#dtone{z-index:7;background:linear-gradient(180deg,rgba(20,55,75,.16),rgba(60,40,20,.08));mix-blend-mode:soft-light}
#dvig{z-index:7;background:radial-gradient(95% 62% at 50% 46%,rgba(0,0,0,0) 55%,rgba(0,0,0,.42) 100%)}
#dgrad{z-index:7;background:linear-gradient(180deg,rgba(0,0,0,.34) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 50%,rgba(0,0,0,.42) 100%)}
#flash{z-index:20;background:#fff;opacity:0}
.cap{position:absolute;text-align:center;z-index:8;line-height:.95;transform-origin:50% 60%;white-space:nowrap}
.cap span{display:inline-block}
.cap.stroke span{-webkit-text-stroke:.07em rgba(10,10,12,.78);paint-order:stroke fill;text-shadow:0 8px 30px rgba(0,0,0,.6),0 2px 6px rgba(0,0,0,.55)}
.cap.box span{background:rgba(10,10,12,.72);padding:.08em .32em .14em;border-radius:.2em}
.ov{position:absolute;z-index:12;line-height:1;white-space:nowrap}
.ov.title span{display:inline-block;font-family:'Inter Tight';font-weight:900;letter-spacing:-.02em;padding:.12em .42em .18em;border-radius:.3em;
  box-shadow:0 18px 40px rgba(0,0,0,.35)}
.ov svg{display:block;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
.ov.emoji{font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif}
#prog{position:absolute;left:0;z-index:25;width:1080px;transform-origin:0 50%}
'''

ARROW = ('<svg viewBox="0 0 100 120" width="{s}" height="{h}"><path d="M50 112 L8 62 H34 V8 H66 V62 H92 Z" fill="{c}" '
         'stroke="#0b0b0f" stroke-width="6" stroke-linejoin="round"/></svg>')
CART = ('<svg viewBox="0 0 120 110" width="{s}" height="{h}"><rect x="2" y="2" width="116" height="106" rx="26" fill="{c}"/>'
        '<path d="M26 32 H38 L46 70 H86 L94 44 H42" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
        '<circle cx="50" cy="84" r="6" fill="#fff"/><circle cx="82" cy="84" r="6" fill="#fff"/></svg>')
CIRCLE = '<svg viewBox="0 0 120 120" width="{s}" height="{s}"><circle cx="60" cy="60" r="52" fill="none" stroke="{c}" stroke-width="9"/></svg>'


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def anim_in(sel, kind, a, b):
    """Entrance of a caption / overlay at time a (b = end, for the typewriter length)."""
    if kind == 'none':
        return [f"tl.set('{sel}',{{autoAlpha:1}},{a:.3f});"]
    if kind == 'fade':
        return [f"tl.fromTo('{sel}',{{autoAlpha:0}},{{autoAlpha:1,duration:.25,ease:'power1.out',immediateRender:false}},{a:.3f});"]
    if kind == 'up':
        return [f"tl.fromTo('{sel}',{{autoAlpha:0,y:46}},{{autoAlpha:1,y:0,duration:.3,ease:'power3.out',immediateRender:false}},{a:.3f});"]
    if kind == 'type':
        d = max(.2, min(.7, (b - a) * .5))
        return [f"tl.set('{sel}',{{autoAlpha:1}},{a:.3f});",
                f"tl.fromTo('{sel} span',{{clipPath:'inset(0 100% 0 0)'}},{{clipPath:'inset(0 0% 0 0)',duration:{d:.2f},ease:'none',immediateRender:false}},{a:.3f});"]
    if kind == 'bounce':
        return [f"tl.fromTo('{sel}',{{autoAlpha:0,scale:.3}},{{autoAlpha:1,scale:1,duration:.45,ease:'back.out(2.2)',immediateRender:false}},{a:.3f});"]
    # pop (default): scale + blur to focus
    return [f"tl.fromTo('{sel}',{{autoAlpha:0,scale:1.22,filter:'blur(22px)'}},{{autoAlpha:1,scale:1,filter:'blur(0px)',"
            f"duration:.2,ease:'power3.out',immediateRender:false}},{a:.3f});"]


def anim_out(sel, a, b, dur):
    if b >= dur - .01:
        return []
    return [f"tl.to('{sel}',{{autoAlpha:0,scale:.96,filter:'blur(16px)',duration:.12,ease:'power2.in'}},{max(a + .2, b - .12):.3f});",
            f"tl.set('{sel}',{{autoAlpha:0}},{b:.3f});"]


def build_html(tl, dur, cutout_ok):
    html_back, html_front, html_ov, tw = [], [], [], []
    # ---- captions
    for k, c in enumerate(tl['captions']):
        a, b = float(c['start']), min(float(c['end']), dur)
        if b <= a:
            continue
        back = c.get('back') and cutout_ok and not any(float(r['start']) < b and float(r['end']) > a for r in tl.get('broll') or [])
        wid = f'c{k}'
        font = c.get('font', 'Inter Tight')
        weight = c.get('weight', FONTS.get(font, 900))
        x = int(c.get('x', 0))
        italic = 'font-style:italic;' if font in ('Instrument Serif',) or c.get('italic') else ''
        style = (f"top:{int(c.get('top', 1005))}px;left:{x}px;right:{-x}px;font-size:{int(c.get('size', 94))}px;color:{c.get('color', '#FFFFFF')};"
                 f"font-family:'{font}';font-weight:{weight};{italic}letter-spacing:{'-.03em' if font == 'Inter Tight' else '0'};word-spacing:.14em")
        cls = 'cap' + (' back' if back else '') + (' stroke' if c.get('stroke', True) else '') + (' box' if c.get('box') else '')
        (html_back if back else html_front).append(f'<div id="{wid}" class="{cls}" style="{style}"><span>{esc(c["text"])}</span></div>')
        tw.append(f"gsap.set('#{wid}',{{autoAlpha:0}});")
        tw += anim_in(f'#{wid}', c.get('anim', 'pop'), a, b)
        tw += anim_out(f'#{wid}', a, b, dur)
    # ---- stickers / overlays
    for k, o in enumerate(tl.get('overlays', [])):
        a, b = float(o['start']), min(float(o['end']), dur)
        if b <= a:
            continue
        oid = f'o{k}'
        typ, size, col = o.get('type', 'emoji'), int(o.get('size', 160)), o.get('color', '#FFFFFF')
        if typ == 'arrow':
            inner = ARROW.format(s=size, h=int(size * 1.2), c=col)
        elif typ == 'cart':
            inner = CART.format(s=size, h=int(size * 110 / 120), c=o.get('color', '#22C55E'))
        elif typ == 'circle':
            inner = CIRCLE.format(s=size, c=o.get('color', '#FAE67A'))
        elif typ == 'title':
            inner = f'<span style="font-size:{size}px;color:{o.get("color", "#0b0b0f")};background:{o.get("bg", "#FAE67A")}">{esc(o.get("text", ""))}</span>'
        else:
            inner = f'<span style="font-size:{size}px">{esc(o.get("text", "🔥"))}</span>'
        rot = float(o.get('rotate', 0))
        html_ov.append(f'<div id="{oid}" class="ov {typ}" style="left:{int(o.get("x", 540))}px;top:{int(o.get("y", 960))}px">{inner}</div>')
        tw.append(f"gsap.set('#{oid}',{{xPercent:-50,yPercent:-50,rotation:{rot},autoAlpha:0}});")
        tw += anim_in(f'#{oid}', o.get('anim', 'bounce'), a, b)
        if o.get('loop', typ == 'arrow'):
            reps = max(1, int((b - a - .45) / .36))
            tw.append(f"tl.to('#{oid}',{{y:'+=26',duration:.18,ease:'sine.inOut',yoyo:true,repeat:{reps * 2 - 1},immediateRender:false}},{a + .45:.3f});")
        tw += anim_out(f'#{oid}', a, b, dur)
    # ---- clips: transitions at the start of each clip + slow push-in
    tw.insert(0, f"gsap.set('.g',{{filter:'{tl.get('grade') or 'none'}'}});")
    t = 0.0
    for c in tl['clips']:
        d = cdur(c)
        tr = c.get('transition') or ('punch' if c.get('punch') else 'none')
        if t > 0:
            s = t - .002
            if tr == 'punch':
                tw.append(f"tl.fromTo('#stage',{{scale:1.05}},{{scale:1,duration:.32,ease:'power2.out',immediateRender:false}},{s:.3f});")
            elif tr == 'zoom':
                tw.append(f"tl.fromTo('#stage',{{scale:1.18}},{{scale:1,duration:.4,ease:'power3.out',immediateRender:false}},{s:.3f});")
            elif tr == 'flash':
                tw.append(f"tl.fromTo('#flash',{{opacity:.85}},{{opacity:0,duration:.3,ease:'power2.out',immediateRender:false}},{s:.3f});")
            elif tr == 'blur':
                tw.append(f"tl.fromTo('#stage',{{filter:'blur(16px) brightness(1.25)'}},{{filter:'blur(0px) brightness(1)',duration:.38,ease:'power3.out',immediateRender:false}},{s:.3f});")
                tw.append(f"tl.set('#stage',{{filter:'none'}},{s + .4:.3f});")
            elif tr == 'whip':
                tw.append(f"tl.fromTo('#stage',{{x:-160,filter:'blur(14px)'}},{{x:0,filter:'blur(0px)',duration:.28,ease:'power3.out',immediateRender:false}},{s:.3f});")
                tw.append(f"tl.set('#stage',{{filter:'none'}},{s + .3:.3f});")
        if c.get('pushin'):
            tw.append(f"tl.fromTo('#push',{{scale:1}},{{scale:{1 + float(c.get('pushin_amount', .06)):.3f},duration:{d:.3f},ease:'none',immediateRender:false}},{t:.3f});")
            tw.append(f"tl.set('#push',{{scale:1}},{t + d:.3f});")
        t += d
    # ---- effects track
    for e in tl.get('effects', []):
        s, d = float(e['t']), float(e.get('dur', .3))
        typ = e.get('type')
        if typ == 'shake':
            amp = float(e.get('amount', 14))
            n = max(4, int(d / .04))
            for i in range(n):
                k = 1 - i / n
                dx, dy = ((-1) ** i) * amp * k, ((-1) ** (i // 2)) * amp * .6 * k
                tw.append(f"tl.to('#stage',{{x:{dx:.1f},y:{dy:.1f},duration:.04,ease:'none',immediateRender:false}},{s + i * .04:.3f});")
            tw.append(f"tl.to('#stage',{{x:0,y:0,duration:.04,immediateRender:false}},{s + n * .04:.3f});")
        elif typ == 'flash':
            tw.append(f"tl.fromTo('#flash',{{opacity:{float(e.get('amount', .8)):.2f}}},{{opacity:0,duration:{d:.2f},ease:'power2.out',immediateRender:false}},{s:.3f});")
        elif typ == 'zoom':
            tw.append(f"tl.fromTo('#stage',{{scale:{1 + float(e.get('amount', .12)):.3f}}},{{scale:1,duration:{d:.2f},ease:'power3.out',immediateRender:false}},{s:.3f});")
        elif typ == 'blur':
            tw.append(f"tl.fromTo('#stage',{{filter:'blur(14px)'}},{{filter:'blur(0px)',duration:{d:.2f},ease:'power2.out',immediateRender:false}},{s:.3f});")
            tw.append(f"tl.set('#stage',{{filter:'none'}},{s + d + .02:.3f});")
    # ---- the person cutout is hidden while B-roll is on screen
    if cutout_ok:
        for r in tl.get('broll') or []:
            tw.append(f"tl.set('#cutwrap',{{autoAlpha:0}},{float(r['start']):.3f});")
            tw.append(f"tl.set('#cutwrap',{{autoAlpha:1}},{float(r['end']):.3f});")
    # ---- progress bar
    prog = ''
    p = tl.get('progress') or {}
    if p.get('enabled'):
        h = int(p.get('height', 10))
        pos = 'bottom:0' if p.get('pos', 'top') == 'bottom' else 'top:0'
        prog = f'<div id="prog" style="{pos};height:{h}px;background:{p.get("color", "#FAE67A")}"></div>'
        tw.append("gsap.set('#prog',{scaleX:0});")
        tw.append(f"tl.to('#prog',{{scaleX:1,duration:{dur:.3f},ease:'none',immediateRender:false}},0);")
    nl = '\n'
    cut = ('<div id="cutwrap"><video id="cut" class="full g" src="assets/subject.webm" muted playsinline data-start="0" data-media-start="0" '
           f'data-duration="{dur:.3f}" data-track-index="1"></video></div>') if cutout_ok else ''
    look = ('<div id="dtone" class="fx"></div><div id="dvig" class="fx"></div><div id="dgrad" class="fx"></div>'
            if tl.get('look', 'bold') == 'bold' and tl.get('grade') not in (None, 'none') else '')
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
<div id="root" data-composition-id="main" data-start="0" data-duration="{dur:.3f}" data-width="1080" data-height="1920">
  <audio id="mix" src="assets/mix.wav" data-start="0" data-media-start="0" data-duration="{dur:.3f}" data-track-index="2" data-volume="1"></audio>
  <div id="stage">
    <div id="push">
      <video id="bgv" class="full g" src="assets/aroll.mp4" muted playsinline data-start="0" data-media-start="0" data-duration="{dur:.3f}" data-track-index="0"></video>
{nl.join(html_back)}
      {cut}
    </div>
  </div>
  {look}
{nl.join(html_front)}
{nl.join(html_ov)}
  <div id="flash" class="fx"></div>
  {prog}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{nl.join(tw)}
tl.set({{}}, {{}}, {dur:.3f});
window.__timelines["main"] = tl;
</script>
</body>
</html>
'''


def do_render(vid):
    d = os.path.join('library', 'edited', vid)
    tl = json.load(open(os.path.join(d, 'timeline.json'), encoding='utf-8'))
    if not tl['clips']:
        sys.exit('No hay ningún plano en la línea de tiempo.')
    work_proj = os.path.join(d, 'editor')
    assets, work = os.path.join(work_proj, 'assets'), os.path.join(work_proj, 'work')
    os.makedirs(assets, exist_ok=True); os.makedirs(work, exist_ok=True)
    # HyperFrames project skeleton (fonts, config) copied from the skill template
    for f in ('hyperframes.json', 'package.json'):
        if not os.path.exists(os.path.join(work_proj, f)):
            shutil.copyfile(os.path.join(TEMPLATE, f), os.path.join(work_proj, f))
    if not os.path.exists(os.path.join(assets, 'fonts')):
        shutil.copytree(os.path.join(TEMPLATE, 'assets', 'fonts'), os.path.join(assets, 'fonts'))

    log('montando los cortes…')
    build_aroll(tl, work, assets)
    dur = sum(cdur(c) for c in tl['clips'])
    cut = tl.get('cutout')
    cutout_ok = bool(cut and cut.get('sig') == sig(tl['clips']) and os.path.exists(cut['file']) and any(c.get('back') for c in tl['captions']))
    if cutout_ok:
        shutil.copyfile(cut['file'], os.path.join(assets, 'subject.webm'))
    elif any(c.get('back') for c in tl['captions']):
        log('los cortes han cambiado: las palabras «detrás de la cabeza» van delante en este render')
    build_mix(tl, assets, dur)
    open(os.path.join(work_proj, 'index.html'), 'w', encoding='utf-8', newline='\n').write(build_html(tl, dur, cutout_ok))
    log('renderizando con HyperFrames…')
    py = os.path.join(SKILL, '.venv', 'Scripts', 'python.exe')
    if not os.path.exists(py):
        py = os.path.join(SKILL, '.venv', 'bin', 'python')
    if not os.path.exists(py):
        py = sys.executable
    out = os.path.join(work_proj, 'render.mp4')
    if os.path.exists(out):
        os.remove(out)
    r = subprocess.run([py, os.path.join(SKILL, 'scripts', 'hf.py'), 'render', '-o', 'render.mp4', '--quality', 'high'], cwd=work_proj)
    if r.returncode != 0 or not os.path.exists(out):
        sys.exit('El render de HyperFrames ha fallado.')
    log(f'listo: {out} ({dur:.1f}s, {len(tl["clips"])} planos)')


if __name__ == '__main__':
    if len(sys.argv) < 3 or sys.argv[1] not in ('import', 'render'):
        sys.exit(__doc__)
    (do_import if sys.argv[1] == 'import' else do_render)(sys.argv[2])
