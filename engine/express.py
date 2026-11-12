#!/usr/bin/env python3
"""Modo Exprés: edición completa en < 1 minuto, en UN solo proceso.

  python engine/express.py <id> <vídeo1> [<vídeo2> ...] [--title T] [--notes "indicaciones"] [--no-gradient] [--no-claude]

(con el Python de la skill video-edit, que tiene faster-whisper)

Pasos, todos aquí dentro y con el modelo de voz cargado UNA vez:
  1. Transcripción con tiempos por palabra (faster-whisper; GPU si funciona, si no large-v3-turbo int8).
  2. Energía del audio (ventanas de 20 ms) → umbral de silencio RELATIVO al ruido de fondo; recorta las pausas que
     Whisper mete dentro de las palabras.
  3. Claude en UNA llamada sin herramientas (claude -p, salida JSON): qué palabras sobran (tomas falsas,
     repeticiones, muletillas), con qué palabra empieza el gancho y la descripción de TikTok. Si falla, reglas.
  4. Lista de tramos: huecos > 0,25 s fuera (quedan ~0,1 s), márgenes −0,03 / +0,06 s.
  5. Verificación de TODAS las uniones en una sola transcripción (se pegan los trozos de cada unión con silencio
     entre medias): si falta una palabra en el borde se abre el corte; si se repite, se quita la primera.
  6. Render directo con ffmpeg en una pasada: 1080x1920, degradado negro arriba/abajo + viñeta, micro-fundidos de
     audio en cada corte, limpieza de voz y máster a -14 LUFS (NVENC si hay GPU NVIDIA).
Salida: library/edited/<id>/{final.mp4, final-movil.mp4, thumb.jpg, meta.json, timeline.json, caption.txt,
work/express.json} y library/scripts/<id>.md. El timeline.json permite seguir retocándolo en el editor manual.
"""
import json
import os
import re
import subprocess
import sys
import time
import unicodedata

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep  # noqa: E402  (perfil del PC, ffprobe, rutas)

ROOT = prep.ROOT
NOWIN = prep.NOWIN
SR = 16000
W, H, FPS = 1080, 1920, 30
FILLERS = {'eh', 'ehh', 'ehhh', 'em', 'emm', 'emmm', 'mm', 'mmm', 'mhm', 'ah', 'ahh', 'uh', 'um', 'hmm'}
T0 = time.time()


def log(msg):
    print(f'[express] {time.time() - T0:5.1f}s  {msg}', flush=True)


def norm(w):
    w = unicodedata.normalize('NFD', w.lower())
    return re.sub(r'[^a-z0-9ñ]', '', ''.join(c for c in w if unicodedata.category(c) != 'Mn'))


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', **NOWIN, **kw)


# ------------------------------------------------------------------ 1. audio + transcripción
def load_audio(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vn', '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         capture_output=True, **NOWIN).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


_model = None


def model(hw):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        name = os.environ.get('MARC_WHISPER_MODEL') or hw['model']
        try:
            _model = WhisperModel(name, device=hw['device'], compute_type=hw['compute_type'], cpu_threads=hw['threads'])
        except Exception as e:   # GPU que falla al cargar → CPU
            log(f'GPU no disponible ({e}); CPU')
            _model = WhisperModel('large-v3-turbo', device='cpu', compute_type='int8', cpu_threads=hw['threads'])
        log(f'modelo {name} en {hw["device"]} listo')
    return _model


def transcribe(audio, hw, prompt=None):
    segs, _ = model(hw).transcribe(audio, language='es', word_timestamps=True, vad_filter=False, beam_size=5,
                                   initial_prompt=prompt or None)
    words, sents = [], []
    for s in segs:
        a = len(words)
        for w in s.words or []:
            t = w.word.strip()
            if t:
                words.append({'t': t, 's': float(w.start), 'e': float(w.end), 'p': float(w.probability)})
        if len(words) > a:
            sents.append([a, len(words) - 1])
    return words, sents


# ------------------------------------------------------------------ 2. energía y límites reales de cada palabra
def energy(audio, hop=0.02):
    n = int(SR * hop)
    k = len(audio) // n
    fr = audio[:k * n].reshape(k, n)
    db = 20 * np.log10(np.sqrt((fr ** 2).mean(1)) + 1e-9)
    floor, speech = np.percentile(db, 10), np.percentile(db, 90)
    # 6 dB sobre el ruido de fondo; pero si el audio tiene silencio digital (WhatsApp, micro con puerta de ruido) el
    # «ruido» es -80 dB y el umbral quedaría absurdo: nunca por debajo de 32 dB bajo la voz
    thr = max(floor + 6, speech - 32) if speech - floor >= 8 else floor + (speech - floor) * 0.5
    return db, thr, floor, speech, hop


def tighten(words, db, thr, hop, min_sil=0.12):
    """Límites REALES de cada palabra a partir de los silencios del audio (Whisper turbo se equivoca de dos formas:
    mete las pausas dentro de la palabra y a veces corta la palabra antes de que acabe la voz)."""
    act = db > thr
    sil, i, n = [], 0, len(act)
    while i < n:                                    # silencios ≥ min_sil
        if not act[i]:
            j = i
            while j < n and not act[j]:
                j += 1
            if (j - i) * hop >= min_sil:
                sil.append((i * hop, j * hop))
            i = j
        else:
            i += 1
    for k, w in enumerate(words):
        s, e = w['s'], w['e']
        nxt = words[k + 1]['s'] if k + 1 < len(words) else n * hop
        for a, b in sil:
            if b <= s or a >= e:
                continue
            if a <= s + 0.03:                       # silencio al principio de la palabra → empieza al acabar
                s = max(s, b - 0.02)
            elif b >= e - 0.03:                     # silencio al final → acaba al empezar el silencio
                e = min(e, a + 0.02)
            elif (a - s) >= (e - b):                # silencio en medio: se queda la parte más larga
                e = a + 0.02
            else:
                s = b - 0.02
        if e - s < 0.06:
            s, e = w['s'], w['e']
        # la voz sigue después del final de Whisper: se alarga hasta el siguiente silencio (máx. 0,35 s)
        fi = int(e / hop)
        lim = min(nxt - 0.02, e + 0.35)
        while fi < n and fi * hop < lim and act[fi]:
            fi += 1
        w['s2'], w['e2'] = round(s, 3), round(max(e, min(fi * hop + 0.02, lim)), 3)
    return words


# ------------------------------------------------------------------ 3. Claude en una llamada
SCHEMA = {
    'type': 'object',
    'properties': {
        'drop': {'type': 'array', 'items': {'type': 'array', 'items': {'type': 'integer'}, 'minItems': 2, 'maxItems': 2}},
        'start_word': {'type': 'integer'},
        'caption': {'type': 'string'},
        'title': {'type': 'string'},
        'notes': {'type': 'string'},
    },
    'required': ['drop', 'start_word', 'caption'],
}


def ask_claude(words, sents, gaps, title, notes):
    lines = []
    for a, b in sents:
        lines.append(' '.join(f"[{i}]{words[i]['t']}" + (f" ⏸{gaps[i]:.1f}s" if gaps[i] >= 0.6 else '') for i in range(a, b + 1)))
    prompt = f"""Eres el montador de la app Marc Edits. Vídeo vertical de TikTok en español, una persona hablando a cámara.
Debajo está la transcripción palabra a palabra con su índice [n] (⏸ = pausa larga después de esa palabra).
Decide qué sobra para que quede con CORTES PERFECTOS:
- Tomas falsas y repeticiones: si dice una frase o un arranque varias veces, quédate con la ÚLTIMA toma buena y quita las anteriores enteras.
- Autocorrecciones y palabras que se le traban, muletillas (eh, em, este…, «o sea», «bueno», «pues» al arrancar) cuando no aportan.
- Nada de relleno al principio: start_word = índice de la primera palabra del gancho (lo que tiene más fuerza para empezar).
- NO quites contenido, ni repeticiones retóricas intencionadas, ni el CTA final, ni las frases que señalan lo que se ve («esto de aquí», «mira esto»: acompañan a enseñar el producto).
- Whisper a veces se inventa palabras en los silencios («¡Gracias!», «Subtítulos por…»): quítalas.
- caption: descripción de TikTok en español de España, 1-2 líneas naturales + 3-5 hashtags al final, sin emojis salvo que encajen mucho. Sin inventar datos.
- title: título corto (máx. 6 palabras) para la biblioteca.
Responde SOLO con un objeto JSON, sin texto alrededor:
{{"drop": [[desde, hasta], ...], "start_word": n, "caption": "...", "title": "...", "notes": "1 frase con lo que has quitado"}}
drop son rangos de índices INCLUSIVOS.
{f'Indicaciones del usuario: {notes}' if notes else ''}
Título provisional: {title}

TRANSCRIPCIÓN
""" + '\n'.join(lines)
    cmd = ['claude', '-p', '--model', 'claude-opus-5-5', '--effort', os.environ.get('MARC_EXPRESS_EFFORT', 'low'),
           '--tools', '', '--no-session-persistence', '--output-format', 'json']
    env = {k: v for k, v in os.environ.items() if k != 'ANTHROPIC_API_KEY'}
    try:
        r = subprocess.run(['cmd.exe', '/d', '/s', '/c', subprocess.list2cmdline(cmd)] if os.name == 'nt' else cmd,
                           input=prompt, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env,
                           timeout=180, cwd=ROOT, **NOWIN)
        d = json.loads(r.stdout[r.stdout.index('{'):])
        res = d.get('result', '')
        out = d.get('structured_output') or json.loads(res[res.index('{'):res.rindex('}') + 1])
        if d.get('is_error') or 'drop' not in out:
            raise ValueError(d.get('result', 'sin JSON'))
        return out
    except Exception as e:
        log(f'Claude no ha respondido bien ({str(e)[:120]}); uso las reglas automáticas')
        return None


def rule_drops(words, sents):
    """Plan B sin Claude: muletillas, palabra repetida seguida y frases que se repiten (gana la última)."""
    drop = set(i for i, w in enumerate(words) if norm(w['t']) in FILLERS)
    for i in range(1, len(words)):
        if norm(words[i]['t']) and norm(words[i]['t']) == norm(words[i - 1]['t']):
            drop.add(i - 1)
    opener = lambda s: ' '.join(norm(words[k]['t']) for k in range(s[0], min(s[0] + 3, s[1] + 1)))
    for x in range(len(sents)):
        for y in range(x + 1, len(sents)):
            if words[sents[y][0]]['s'] - words[sents[x][1]]['e'] > 60:
                break
            if len(opener(sents[x])) > 6 and opener(sents[x]) == opener(sents[y]):
                drop.update(range(sents[x][0], sents[x][1] + 1))
                break
    return drop


# ------------------------------------------------------------------ 4. tramos
def build_clips(words, keep, src_dur):
    clips = []
    for i in keep:
        w = words[i]
        if clips and clips[-1]['last'] == i - 1 and w['s2'] - words[i - 1]['e2'] <= 0.25:
            clips[-1]['out'] = w['e2']; clips[-1]['last'] = i; clips[-1]['words'].append(i)
        else:
            clips.append({'in': w['s2'], 'out': w['e2'], 'first': i, 'last': i, 'words': [i]})
    for c in clips:
        prev_end = words[c['first'] - 1]['e2'] if c['first'] > 0 else 0
        nxt = words[c['last'] + 1]['s2'] if c['last'] + 1 < len(words) else src_dur
        c['in'] = max(prev_end + 0.01, c['in'] - 0.03, 0)
        c['out'] = min(nxt - 0.01, c['out'] + 0.06, src_dur)
        # pausas internas largas dentro del tramo: se parten (queda ~0,1 s)
    out = []
    for c in clips:
        if out and c['in'] - out[-1]['out'] < 0.04 and out[-1]['src'] == c.get('src'):
            out[-1]['out'] = c['out']; out[-1]['words'] += c['words']; out[-1]['last'] = c['last']
        else:
            out.append(c)
    return out


# ------------------------------------------------------------------ 5. verificación de uniones (una transcripción)
def verify(clips, words, audio, hw):
    if len(clips) < 2:
        return clips, []
    gap = np.zeros(int(SR * 0.8), np.float32)
    parts, spans, t = [], [], 0.0
    for k in range(len(clips) - 1):
        a, b = clips[k], clips[k + 1]
        a0, b1 = max(a['in'], a['out'] - 1.4), min(b['out'], b['in'] + 1.4)
        seg = np.concatenate([audio[int(a0 * SR):int(a['out'] * SR)], audio[int(b['in'] * SR):int(b1 * SR)]])
        spans.append((k, t, t + len(seg) / SR, t + (a['out'] - a0)))
        parts += [seg, gap]
        t += (len(seg) + len(gap)) / SR
    heard, _ = transcribe(np.concatenate(parts), hw)
    fixes = []
    for k, s0, s1, tj in spans:
        got = [norm(w['t']) for w in heard if s0 - 0.05 <= w['s'] < s1]
        got_a = [norm(w['t']) for w in heard if s0 - 0.05 <= w['s'] < tj - 0.02]
        got_b = [norm(w['t']) for w in heard if tj - 0.08 <= w['s'] < s1]
        a, b = clips[k], clips[k + 1]
        tail = [norm(words[i]['t']) for i in a['words'] if words[i]['e2'] > a['out'] - 1.4]
        head = [norm(words[i]['t']) for i in b['words'] if words[i]['s2'] < b['in'] + 1.4]
        if tail and tail[-1] and tail[-1] not in got_a[-3:] and tail[-1] not in got:
            a['out'] = min(a['out'] + 0.08, words[a['last'] + 1]['s2'] - 0.01 if a['last'] + 1 < len(words) else a['out'] + 0.08)
            fixes.append(f'unión {k + 1}: «{tail[-1]}» se cortaba, final abierto +0,08 s')
        if head and head[0] and head[0] not in got_b[:3] and head[0] not in got:
            b['in'] = max(b['in'] - 0.05, words[b['first'] - 1]['e2'] + 0.01 if b['first'] > 0 else 0)
            fixes.append(f'unión {k + 1}: «{head[0]}» se cortaba, inicio abierto −0,05 s')
        for x in range(1, len(got)):
            if got[x] and got[x] == got[x - 1] and len(got[x]) > 2 and got[x] in tail[-1:] and got[x] in head[:1]:
                fixes.append(f'unión {k + 1}: «{got[x]}» repetida a los dos lados → fuera la primera')
                if len(a['words']) > 1:
                    i = a['words'].pop()
                    a['out'] = words[a['words'][-1]]['e2'] + 0.06
                break
    return clips, fixes


# ------------------------------------------------------------------ 6. render
def gradient_png(path):
    if os.path.exists(path):
        return path
    from PIL import Image
    y = np.linspace(0, 1, H)[:, None]
    top = np.clip(1 - y / 0.22, 0, 1) * 0.36
    bot = np.clip((y - 0.55) / 0.45, 0, 1) ** 1.3 * 0.48
    xx, yy = np.meshgrid(np.linspace(-1, 1, W), np.linspace(-1, 1, H))
    vig = np.clip((np.sqrt((xx / 1.05) ** 2 + ((yy + 0.08) / 1.25) ** 2) - 0.55) / 0.6, 0, 1) * 0.40
    a = np.clip(np.maximum(np.maximum(top, bot), vig), 0, 0.62)
    img = np.zeros((H, W, 4), np.uint8)
    img[..., 3] = (a * 255).astype(np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(img, 'RGBA').save(path)
    return path


def has_nvenc(hw):
    if 'nvenc' not in hw:
        r = run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-'])
        hw['nvenc'] = r.returncode == 0
        json.dump(hw, open(os.path.join(prep.CACHE, 'hw.json'), 'w', encoding='utf-8'), indent=1)
    return hw['nvenc']


def render(clips, srcs, out, gradient, hw):
    by_src = {}
    for c in clips:
        by_src.setdefault(c['src'], []).append(c)
    inputs, f = [], []
    for si, s in enumerate(srcs):
        inputs += ['-i', s]
        n = len(by_src.get(s, []))
        if not n:
            continue
        f.append(f'[{si}:v]scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},fps={FPS},setsar=1,'
                 f'eq=contrast=1.06:saturation=0.92:brightness=-0.012,split={n}' + ''.join(f'[v{si}_{k}]' for k in range(n)))
        f.append(f'[{si}:a]aresample=48000,asplit={n}' + ''.join(f'[a{si}_{k}]' for k in range(n)))
    gi = len(srcs)
    if gradient:
        inputs += ['-loop', '1', '-i', gradient_png(os.path.join(prep.CACHE, 'express-gradient.png'))]
    used, cat = {}, ''
    for j, c in enumerate(clips):
        si = srcs.index(c['src']); k = used.get(si, 0); used[si] = k + 1
        d = c['out'] - c['in']
        fd = min(0.012, d / 4)
        f.append(f'[v{si}_{k}]trim={c["in"]:.3f}:{c["out"]:.3f},setpts=PTS-STARTPTS[cv{j}]')
        f.append(f'[a{si}_{k}]atrim={c["in"]:.3f}:{c["out"]:.3f},asetpts=PTS-STARTPTS,'
                 f'afade=t=in:d={fd:.3f},afade=t=out:st={d - fd:.3f}:d={fd:.3f}[ca{j}]')
        cat += f'[cv{j}][ca{j}]'
    f.append(f'{cat}concat=n={len(clips)}:v=1:a=1[vc][ac]')
    if gradient:
        f.append(f'[{gi}:v]format=rgba[g];[vc][g]overlay=0:0:shortest=1,format=yuv420p[vo]')
    else:
        f.append('[vc]format=yuv420p[vo]')
    f.append('[ac]highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[ao]')
    script = out + '.filter.txt'
    open(script, 'w', encoding='utf-8').write(';\n'.join(f))
    venc = (['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '19', '-b:v', '0']
            if has_nvenc(hw) else ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19'])
    r = run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex_script', script, '-map', '[vo]', '-map', '[ao]',
             *venc, '-r', str(FPS), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
             '-movflags', '+faststart', out])
    os.remove(script)
    if r.returncode:
        sys.exit('ffmpeg: ' + r.stderr[-1500:])
    return 'NVENC' if has_nvenc(hw) else 'x264'


# ------------------------------------------------------------------ principal
def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    a = sys.argv[1:]
    opt = lambda k, d=None: (a[a.index(k) + 1] if k in a else d)
    title, notes = opt('--title', ''), opt('--notes', '')
    flags = {'--no-gradient', '--no-claude'}
    vals = {opt('--title'), opt('--notes')}
    pos = [x for i, x in enumerate(a) if x not in flags and not (i > 0 and a[i - 1] in ('--title', '--notes')) and x not in ('--title', '--notes')]
    vid, srcs = pos[0], [p if os.path.isabs(p) else os.path.join(ROOT, p) for p in pos[1:]]
    out_dir = os.path.join(ROOT, 'library', 'edited', vid)
    work = os.path.join(out_dir, 'work')
    os.makedirs(work, exist_ok=True)
    hw = prep.profile()
    log(f'PC: {hw["cores"]} hilos · {hw["ram_gb"]} GB · {hw["model"]} en {hw["device"]}')

    # 1-2. transcripción + energía por vídeo (todos los vídeos se tratan como una lista de palabras con su origen)
    words, sents, audio_by, dur_by = [], [], {}, {}
    for s in srcs:
        audio = load_audio(s)
        audio_by[s], dur_by[s] = audio, len(audio) / SR
        ws, ss = transcribe(audio, hw)
        db, thr, floor, speech, hop = energy(audio)
        tighten(ws, db, thr, hop)
        base = len(words)
        for w in ws:
            w['src'] = s
        words += ws
        sents += [[x + base, y + base] for x, y in ss]
        log(f'{os.path.basename(s)}: {dur_by[s]:.1f}s, {len(ws)} palabras · ruido {floor:.0f} dB, voz {speech:.0f} dB, umbral {thr:.0f} dB')
    if not words:
        sys.exit('No se ha oído ninguna palabra en el vídeo.')
    gaps = [(words[i + 1]['s2'] - words[i]['e2']) if i + 1 < len(words) and words[i + 1]['src'] == words[i]['src'] else 0
            for i in range(len(words))]

    # 3. decisión editorial
    t_cl = time.time()
    plan = None if '--no-claude' in a else ask_claude(words, sents, gaps, title, notes)
    if plan:
        drop = set()
        for r in plan['drop']:
            if len(r) == 2:
                drop.update(range(max(0, min(r)), min(len(words) - 1, max(r)) + 1))
        start = max(0, min(int(plan.get('start_word', 0)), len(words) - 1))
        drop.update(range(0, start))
        drop |= {i for i, w in enumerate(words) if norm(w['t']) in FILLERS}
        log(f'Claude ha decidido en {time.time() - t_cl:.1f}s: {len(drop)} palabras fuera, empieza en «{words[start]["t"]}»')
    else:
        drop = rule_drops(words, sents)
        plan = {'caption': '', 'title': title}
    keep = [i for i in range(len(words)) if i not in drop]

    # 4. tramos (por vídeo, en orden)
    clips = []
    for s in srcs:
        k = [i for i in keep if words[i]['src'] == s]
        cs = build_clips(words, k, dur_by[s])
        for c in cs:
            c['src'] = s
        clips += cs
    # 5. verificación
    t_v = time.time()
    fixes = []
    for s in srcs:
        cs = [c for c in clips if c['src'] == s]
        _, fx = verify(cs, words, audio_by[s], hw)
        fixes += fx
    log(f'uniones comprobadas en {time.time() - t_v:.1f}s: ' + ('; '.join(fixes) if fixes else 'todas limpias'))
    durs = [c['out'] - c['in'] for c in clips]
    total_in = sum(dur_by.values())
    log(f'{len(clips)} tramos · {total_in:.1f}s → {sum(durs):.1f}s ({100 * (1 - sum(durs) / total_in):.0f}% fuera) · mediana {np.median(durs):.2f}s')

    # 6. render
    final = os.path.join(out_dir, 'final.mp4')
    enc = render(clips, srcs, final, None if '--no-gradient' in a else True, hw)
    log(f'render ({enc}) hecho')
    movil = run(['ffmpeg', '-v', 'error', '-y', '-i', final, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast',
                 '-crf', '26', '-c:a', 'copy', '-movflags', '+faststart', os.path.join(out_dir, 'final-movil.mp4')])
    run(['ffmpeg', '-v', 'error', '-y', '-ss', '1', '-i', final, '-frames:v', '1', '-vf', 'scale=540:-1', os.path.join(out_dir, 'thumb.jpg')])

    # salidas
    rel = lambda p: os.path.relpath(p, ROOT).replace('\\', '/')
    kept_text = ' '.join(words[i]['t'] for c in clips for i in c['words'])
    final_title = title or plan.get('title') or vid
    caption = (plan.get('caption') or '').strip()
    if caption:
        open(os.path.join(out_dir, 'caption.txt'), 'w', encoding='utf-8').write(caption + '\n')
    tl = {'version': 1, 'fps': FPS, 'width': W, 'height': H, 'source': rel(srcs[0]),
          'clips': [{'in': round(c['in'], 3), 'out': round(c['out'], 3), 'zoom': 1.0, 'cx': 0.5, 'cy': 0.35, 'punch': False,
                     'transition': 'none', **({'src': rel(c['src'])} if c['src'] != srcs[0] else {})} for c in clips],
          'captions': [], 'overlays': [], 'effects': [], 'sfx': [], 'music': None, 'cutout': None,
          'voice': {'gain_db': 0, 'clean': True}, 'grade': 'contrast(1.07) saturate(.9) brightness(.97)',
          'look': 'bold' if '--no-gradient' not in a else 'none', 'progress': {'enabled': False}}
    json.dump(tl, open(os.path.join(out_dir, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    mp = os.path.join(out_dir, 'meta.json')
    meta = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {'id': vid}
    meta.update({'title': final_title, 'source': rel(srcs[0]), 'recipe': 'Exprés · cortes + degradado',
                 'duration_in': round(total_in, 2), 'duration_out': round(sum(durs), 2), 'cuts': len(clips),
                 'transcript': kept_text, 'express': True,
                 **({'sources': [rel(s) for s in srcs]} if len(srcs) > 1 else {})})
    meta.setdefault('created', time.strftime('%Y-%m-%dT%H:%M:%S'))
    json.dump(meta, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    os.makedirs(os.path.join(ROOT, 'library', 'scripts'), exist_ok=True)
    open(os.path.join(ROOT, 'library', 'scripts', f'{vid}.md'), 'w', encoding='utf-8').write(f'# {final_title}\n\n{kept_text}\n')
    json.dump({'hw': hw, 'words': words, 'drop': sorted(drop), 'clips': [{k: v for k, v in c.items() if k != 'words'} for c in clips],
               'fixes': fixes, 'claude': plan, 'seconds': round(time.time() - T0, 1)},
              open(os.path.join(work, 'express.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
    log(f'LISTO en {time.time() - T0:.1f}s → library/edited/{vid}/final.mp4')


if __name__ == '__main__':
    main()
