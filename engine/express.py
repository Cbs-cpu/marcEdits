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


# Frases que Whisper se inventa en silencios o al final del audio
HALLU = {'gracias', 'graciasporver', 'subtitulosporlacomunidaddeamaraorg', 'subtitulosrealizadosporlacomunidaddeamaraorg',
         'suscribete', 'nosvemosenelproximovideo', 'muchasgracias'}


def transcribe(audio, hw, prompt=None, offset=0.0):
    """condition_on_previous_text=False es CLAVE: con True, Whisper «limpia» el texto y se salta las tomas repetidas
    («porque aparte de que» dicho 4 veces salía 2), así que nadie podía quitarlas. Probado con large-v3-turbo."""
    segs, _ = model(hw).transcribe(audio, language='es', word_timestamps=True, vad_filter=False, beam_size=5,
                                   condition_on_previous_text=False, initial_prompt=prompt or None)
    words, sents = [], []
    for s in segs:
        if norm(s.text) in HALLU and (s.avg_logprob < -0.6 or s.no_speech_prob > 0.3):
            continue
        a = len(words)
        for w in s.words or []:
            t = w.word.strip()
            if t:
                words.append({'t': t, 's': float(w.start) + offset, 'e': float(w.end) + offset, 'p': float(w.probability)})
        if len(words) > a:
            sents.append([a, len(words) - 1])
    return words, sents


def fill_gaps(words, sents, audio, db, thr, hop, hw, min_len=0.35):
    """Voz sin palabras: tramos con voz donde Whisper no ha escrito nada (suele ser una toma que se ha saltado). Se
    transcriben solos y se meten en su sitio, para que Claude vea TODAS las tomas."""
    act = db > thr
    cov = np.zeros(len(act), bool)
    for w in words:
        cov[max(0, int(w['s'] / hop) - 2):int(w['e'] / hop) + 3] = True
    found, i, n = [], 0, len(act)
    while i < n:
        if act[i] and not cov[i]:
            j = i
            while j < n and (act[j] or (j + 5 < n and act[j:j + 5].any())) and not cov[j]:
                j += 1
            if (j - i) * hop >= min_len:
                found.append((i * hop, j * hop))
            i = j
        else:
            i += 1
    added = []
    for a, b in found:
        a0, b0 = max(0.0, a - 0.3), min(len(audio) / SR, b + 0.3)
        ws, _ = transcribe(audio[int(a0 * SR):int(b0 * SR)], hw, offset=a0)
        ws = [w for w in ws if w['e'] > a - 0.05 and w['s'] < b + 0.05 and norm(w['t'])]
        for w in ws:
            w['gap'] = True
        added += ws
    if not added:
        return words, sents, []
    allw = sorted(words + added, key=lambda w: w['s'])
    # frases otra vez: se corta donde había corte o donde empieza/acaba un trozo recuperado
    starts_old = {id(words[a]) for a, _ in sents}
    new_sents, cur = [], 0
    for k in range(1, len(allw) + 1):
        if k == len(allw) or id(allw[k]) in starts_old or allw[k].get('gap') != allw[k - 1].get('gap'):
            new_sents.append([cur, k - 1]); cur = k
    return allw, new_sents, [f"{a:.1f}-{b:.1f}s" for a, b in found]


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
            # la palabra entera cae en silencio: Whisper la ha colocado mal (suele ir pegada a la siguiente)
            after = [b for a, b in sil if a <= w['s'] + 0.03 and b > w['s']]
            if after:
                s = after[0] - 0.02
                e = max(s + 0.06, min(nxt - 0.01, s + 0.12)) if nxt > s + 0.06 else s + 0.06
            else:
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


def load_reference(rid):
    """Texto del estilo de una referencia ya analizada: analysis.md + SKILL.md (si existe) + receta."""
    if not rid:
        return ''
    parts = []
    for f in (os.path.join(ROOT, 'library', 'references', rid, 'analysis.md'),
              os.path.join(ROOT, '.claude', 'skills', f'ref-{rid}', 'SKILL.md'),
              os.path.join(ROOT, 'library', 'tools', 'recipes', f'ref-{rid}.json')):
        if os.path.exists(f):
            parts.append(open(f, encoding='utf-8').read()[:5000])
    return '\n\n'.join(parts)


def ask_claude(words, sents, gaps, title, notes, ref=''):
    lines = []
    for a, b in sents:
        lines.append(' '.join(f"[{i}]{words[i]['t']}" + (f" ⏸{gaps[i]:.1f}s" if gaps[i] >= 0.6 else '') for i in range(a, b + 1)))
    prompt = f"""Eres el montador de la app Marc Edits. Vídeo vertical de TikTok en español, una persona hablando a cámara.
Debajo está la transcripción palabra a palabra con su índice [n] (⏸ = pausa larga después de esa palabra).
Decide qué sobra para que quede con CORTES PERFECTOS:
- Tomas falsas y repeticiones: si dice una frase o un arranque varias veces, quédate con la ÚLTIMA toma buena y quita las anteriores enteras.
- Autocorrecciones y palabras que se le traban, muletillas (eh, em, este…, «o sea», «bueno», «pues» al arrancar) cuando no aportan.
- Nada de relleno al principio: start_word = índice de la primera palabra del gancho (lo que tiene más fuerza para empezar).
- Los conectores que forman parte de su forma de hablar NO son repeticiones: «y es que», «pero», «y», «porque», «que» al empezar frase se quedan aunque los diga varias veces. Solo es repetición si la MISMA frase (3+ palabras con el mismo sentido) se dice dos veces seguidas.
- Lapsus: una palabra o frase que no tiene sentido ahí o que se le escapa por error (p. ej. «se agotan o se encantan»: «o se encantan» es un lapsus) → quítala. Los cortes los hace el motor en el silencio o valle más cercano, así que no te preocupes por cómo suena la unión.
- Ante la duda con contenido real, NO lo quites: mejor una palabra de más que quitar algo que sí aporta.
- NO quites contenido, ni repeticiones retóricas intencionadas, ni el CTA final, ni las frases que señalan lo que se ve («esto de aquí», «mira esto»: acompañan a enseñar el producto).
- Whisper a veces se inventa palabras en los silencios («¡Gracias!», «Subtítulos por…»): quítalas.
- caption: descripción de TikTok en español de España, 1-2 líneas naturales + 3-5 hashtags al final, sin emojis salvo que encajen mucho. Sin inventar datos.
- title: título corto (máx. 6 palabras) para la biblioteca.
- images: momentos donde una IMAGEN encima ayudaría de verdad y el usuario tendría que dártela (p. ej. «tienes esta variedad de sabores» → foto de todos los sabores; una captura, un precio, un antes/después). Máximo 2 y solo si aportan; si no, lista vacía. Para cada una: word = índice donde empieza a mencionarlo, until = índice donde acaba, what = qué imagen pedirle al usuario (corto, en español, empezando por «Foto de…» o «Captura de…»).
Responde SOLO con un objeto JSON, sin texto alrededor:
{{"drop": [[desde, hasta], ...], "start_word": n, "caption": "...", "title": "...", "images": [{{"word": n, "until": m, "what": "Foto de…"}}], "style": {{"zoom": "push", "strength": 1, "pause": 0.1, "hook_text": ""}}, "notes": "1 frase con lo que has quitado"}}
drop son rangos de índices INCLUSIVOS.
- style: cómo montarlo. zoom = "push" (zoom lento que alterna acercar/alejar, lo normal), "jump" (cada plano a una escala fija distinta: plano medio ↔ primer plano, típico de UGC) o "none"; strength 0.5-1.5 (1 = normal); pause = segundos de respiro entre frases (0.05 muy pegado … 0.25 tranquilo; normal 0.1); hook_text = texto corto en pantalla los 2 primeros segundos SOLO si la referencia usa textos (si no, "").
{f'Indicaciones del usuario (mandan sobre todo lo demás): {notes}' if notes else ''}
{f'''ESTILO DE REFERENCIA (el usuario quiere que se parezca a esto; trasládalo a style y a los cortes):
{ref}''' if ref else 'Sin referencia: style = {{"zoom": "push", "strength": 1, "pause": 0.1, "hook_text": ""}}.'}
Título provisional: {title}

TRANSCRIPCIÓN
""" + '\n'.join(lines)
    cmd = ['claude', '-p', '--model', 'claude-opus-5-5', '--effort', os.environ.get('MARC_EXPRESS_EFFORT', 'medium'),
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


def safe_cuts(clips, words, db, thr, hop, pause=0.1, hard=frozenset()):
    """Un corte solo es limpio si cae en silencio. Si el borde de un tramo cae en plena voz, se busca el silencio más
    cercano (±0,15 s); si no lo hay, la palabra quitada iba pegada a la frase y se DEVUELVE (se juntan los tramos)."""
    n = len(db)
    quiet = lambda t: 0 <= int(t / hop) < n and db[int(t / hop)] < thr
    def find(t, back_first):
        for k in range(0, 8):
            for sgn in ((-1, 1) if back_first else (1, -1)):
                tt = t + sgn * k * hop
                if quiet(tt):
                    return tt
        # sin silencio cerca: el valle más profundo entre palabras (±0,12 s), si baja de verdad (≥ 15 dB bajo la voz)
        i0, i1 = max(0, int((t - 0.12) / hop)), min(n - 1, int((t + 0.12) / hop))
        if i1 > i0:
            k = i0 + int(np.argmin(db[i0:i1 + 1]))
            if db[k] < thr + 15:
                return k * hop
        return None
    def valley(t0, t1, default):
        """punto de menos energía entre dos palabras pegadas (corte sin silencio, el mejor posible)"""
        i0, i1 = max(0, int(t0 / hop)), min(n - 1, int(t1 / hop))
        return default if i1 <= i0 else (i0 + int(np.argmin(db[i0:i1 + 1]))) * hop
    notes, out = [], []
    # 1) cada tramo empieza y acaba donde empieza y acaba la voz de verdad
    act = db > thr
    for c in clips:
        i0, i1 = int(c['in'] / hop), min(n - 1, int(c['out'] / hop))
        idx = np.nonzero(act[i0:i1 + 1])[0]
        if len(idx):
            c['in'] = max(c['in'], (i0 + idx[0]) * hop - 0.03)
            c['out'] = min(c['out'], (i0 + idx[-1] + 1) * hop + 0.05)
    # 2) pausas de más de 0,25 s DENTRO de un tramo: se parte y queda un respiro de ~0,1 s
    split = []
    for c in clips:
        i0, i1 = int(c['in'] / hop), min(n - 1, int(c['out'] / hop))
        cur, run0 = dict(c), None
        for i in range(i0, i1 + 1):
            if not act[i]:
                run0 = i if run0 is None else run0
            else:
                if run0 is not None and (i - run0) * hop >= max(0.25, pause + 0.12):
                    a, b = run0 * hop + pause / 2, i * hop - pause / 2
                    left = dict(cur, out=a, words=[k for k in cur['words'] if words[k]['s2'] < a])
                    right = dict(cur, **{'in': b}, words=[k for k in cur['words'] if words[k]['s2'] >= a])
                    if left['words'] and right['words']:
                        left['last'], right['first'] = left['words'][-1], right['words'][0]
                        split.append(left)
                        cur = right
                run0 = None
        split.append(cur)
    clips = split
    # 3) ningún corte en plena voz: si el borde cae en voz, se recuperan las palabras pegadas (las que Claude quitó)
    #    hasta llegar a un silencio real; si aun así no lo hay, se juntan los tramos
    def grow_back(c):
        got = []
        b0 = find(c['in'], back_first=True)
        if b0 is not None:
            c['in'] = b0
            return got
        while not quiet(c['in'] - 0.02) and c['first'] > 0 and len(got) < 6:
            k = c['first'] - 1
            if words[k]['src'] != c['src'] or (out and out[-1]['src'] == c['src'] and k <= out[-1]['last']) or k in hard:
                break
            c['first'] = k; c['words'].insert(0, k); c['in'] = words[k]['s2'] - 0.03; got.insert(0, words[k]['t'])
        b = find(c['in'], back_first=True)
        if b is not None and b <= c['in'] + 0.02:
            c['in'] = b
        elif not got and c['first'] > 0 and c['first'] - 1 in hard:
            c['in'] = valley(words[c['first'] - 1]['e2'] - 0.04, words[c['first']]['s2'] + 0.02, c['in'])
        return got

    def grow_fwd(c, limit):
        got = []
        a0 = find(c['out'], back_first=False)
        if a0 is not None:
            c['out'] = a0
            return got
        while not quiet(c['out'] + 0.02) and c['last'] + 1 < len(words) and len(got) < 6:
            k = c['last'] + 1
            if words[k]['src'] != c['src'] or k >= limit or k in hard:
                break
            c['last'] = k; c['words'].append(k); c['out'] = words[k]['e2'] + 0.06; got.append(words[k]['t'])
        a = find(c['out'], back_first=False)
        if a is not None and a >= c['out'] - 0.02:
            c['out'] = a
        elif not got and c['last'] + 1 < len(words) and c['last'] + 1 in hard:
            c['out'] = valley(words[c['last']]['e2'] - 0.02, words[c['last'] + 1]['s2'] + 0.04, c['out'])
        return got

    for j, c in enumerate(clips):
        nxt_first = clips[j + 1]['first'] if j + 1 < len(clips) and clips[j + 1]['src'] == c['src'] else len(words)
        if j or c['first'] > 0:
            g = grow_back(c)
            if g:
                notes.append(f'recuperado «{" ".join(g)}»: iba pegado, cortar ahí se comía la frase')
        g = grow_fwd(c, nxt_first)
        if g:
            notes.append(f'recuperado «{" ".join(g)}» al final: iba pegado')
        if out and out[-1]['src'] == c['src'] and c['in'] <= out[-1]['out'] + 0.04:
            p = out[-1]                      # se tocan: un solo tramo
            p['out'], p['last'] = max(p['out'], c['out']), c['last']
            p['words'] += [k for k in c['words'] if k not in p['words']]
            continue
        out.append(c)
    return out, notes


def repeats_left(words, keep, max_gap=2):
    """Frases repetidas que siguen en el montaje («esto de aquí es esto de aquí», «porque aparte de que porque aparte de
    que»): una secuencia de 2+ palabras (8+ letras) seguida, con como mucho max_gap palabras entre medias, de la misma
    secuencia. Devuelve los índices a quitar (la primera toma y lo que hay entre las dos)."""
    seq = [i for i in keep if norm(words[i]['t'])]
    toks = [norm(words[i]['t']) for i in seq]
    drop = set()
    for n in range(8, 1, -1):
        for a in range(len(toks) - n):
            if any(seq[x] in drop for x in range(a, a + n)):
                continue
            ng = toks[a:a + n]
            if len(''.join(ng)) < 8:
                continue
            for g in range(0, max_gap + 1):
                b = a + n + g
                if (b + n <= len(toks) and toks[b:b + n] == ng and words[seq[b]]['src'] == words[seq[a]]['src']
                        and words[seq[b]]['s'] - words[seq[a + n - 1]]['e'] < 8):
                    drop.update(seq[a:b])
                    break
    return drop


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
    top = np.clip(1 - y / 0.20, 0, 1) * 0.28
    bot = np.clip((y - 0.58) / 0.42, 0, 1) ** 1.4 * 0.38
    xx, yy = np.meshgrid(np.linspace(-1, 1, W), np.linspace(-1, 1, H))
    vig = np.clip((np.sqrt((xx / 1.05) ** 2 + ((yy + 0.08) / 1.25) ** 2) - 0.62) / 0.6, 0, 1) * 0.24
    a = np.clip(np.maximum(np.maximum(top, bot), vig), 0, 0.45)
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


def text_card(text, path):
    """Texto de gancho estilo TikTok (cajas blancas, TikTok Sans) en el tercio de arriba."""
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype(os.path.join(ROOT, 'engine', 'fonts', 'TikTokSans.ttf'), 64)
    try:
        font.set_variation_by_axes([400, 0, 100, 700])
    except Exception:
        pass
    words_, lines, cur = text.split(), [], ''
    for w in words_:
        t = (cur + ' ' + w).strip()
        if font.getlength(t) > 820 and cur:
            lines.append(cur); cur = w
        else:
            cur = t
    lines.append(cur)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = 330
    for ln in lines:
        w = font.getlength(ln)
        x = (W - w) / 2
        d.rounded_rectangle([x - 22, y - 8, x + w + 22, y + 78], 16, fill=(255, 255, 255, 255))
        d.text((x, y), ln, font=font, fill=(10, 10, 12, 255))
        y += 90
    img.save(path)
    return path


def image_card(src, path):
    """Tarjeta 1080x1920 transparente con la imagen del usuario: esquinas redondeadas y sombra suave, en la mitad de
    abajo (en un vídeo a cámara la cara suele estar arriba y el producto se enseña a la altura del pecho)."""
    from PIL import Image, ImageDraw, ImageFilter
    im = Image.open(src).convert('RGB')
    im.thumbnail((880, 760), Image.LANCZOS)
    w, h = im.size
    r = 40
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    card = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    x, y = (W - w) // 2, 1210 - h // 2
    sh = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh).rounded_rectangle([x, y + 18, x + w, y + h + 18], r, fill=150)
    card.putalpha(sh.filter(ImageFilter.GaussianBlur(28)))
    card.paste(im, (x, y), mask)
    card.save(path)
    return path


# Zooms aprendidos del vídeo que gustó (crema-de-arroz-expres, «más dinámicos»): cada plano tiene un zoom lento que
# ALTERNA acercar / alejar (arranca rápido y frena: power2.out) y al entrar en cada plano hay un golpe corto.
# Ajuste 0.9 (el usuario: «se van demasiado para atrás y para adelante»): 6-10 % por plano, golpe 1,035 y, uno de
# cada tres, 1,08. Siempre escala ≥ 1 y recorte dentro de la imagen: nunca bordes negros ni deformación.
JUMP = [1.0, 1.16, 1.06, 1.22]   # «a saltos» (referencia UGC): plano medio ↔ primer plano, sin movimiento


def zoom_plan(clips, style=None):
    st = style or {}
    mode = st.get('zoom', 'push')
    k = min(1.5, max(0.5, float(st.get('strength', 1) or 1)))
    for j, c in enumerate(clips):
        d = c['out'] - c['in']
        if mode == 'jump':
            c['scale'] = round(1 + (JUMP[j % len(JUMP)] - 1) * min(k, 1.15), 3)
            c['pushin_amount'], c['transition'] = 0.0, 'none'
            continue
        amt = min(0.12, max(0.04, (0.05 + 0.012 * d) * k))   # 6-10 % normal: se nota sin que la imagen «se vaya»
        c['pushin_amount'] = round(amt if j % 2 == 0 else -amt, 3)
        c['transition'] = 'none' if j == 0 else ('zoom' if j % 3 == 0 else 'punch')
    return clips


def zoom_expr(c):
    d = max(0.05, c['out'] - c['in'])
    if c.get('scale'):
        return f"{c['scale']:.3f}"
    a = c.get('pushin_amount', 0)
    P = f'min(t/{d:.3f},1)'
    push = f'(1+{a:.3f}*(1-pow(1-{P},2)))' if a >= 0 else f'(1+{-a:.3f}*pow(1-{P},2))'
    tr = c.get('transition', 'none')
    hit = {'punch': '(1+0.035*pow(1-min(t/0.3,1),2))', 'zoom': '(1+0.08*pow(1-min(t/0.35,1),3))'}.get(tr, '1')
    return f'{push}*{hit}'


def render(clips, srcs, out, gradient, hw, images=(), zoom=False):
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
        inputs += ['-loop', '1', '-i', gradient_png(os.path.join(prep.CACHE, 'express-gradient-v2.png'))]
    used, cat = {}, ''
    for j, c in enumerate(clips):
        si = srcs.index(c['src']); k = used.get(si, 0); used[si] = k + 1
        d = c['out'] - c['in']
        fd = min(0.012, d / 4)
        zf = ''
        if zoom:   # escala por fotograma y recorte centrado (el punto fijo está un poco por encima del centro, en la cara)
            z = zoom_expr(c)
            zf = (f",scale=w='trunc({W}*{z}/2)*2':h='trunc({H}*{z}/2)*2':eval=frame:flags=bicubic,"
                  f"crop={W}:{H}:'(iw-{W})/2':'(ih-{H})*0.42',setsar=1")
        f.append(f'[v{si}_{k}]trim={c["in"]:.3f}:{c["out"]:.3f},setpts=PTS-STARTPTS{zf}[cv{j}]')
        f.append(f'[a{si}_{k}]atrim={c["in"]:.3f}:{c["out"]:.3f},asetpts=PTS-STARTPTS,'
                 f'afade=t=in:d={fd:.3f},afade=t=out:st={d - fd:.3f}:d={fd:.3f}[ca{j}]')
        cat += f'[cv{j}][ca{j}]'
    f.append(f'{cat}concat=n={len(clips)}:v=1:a=1[vc][ac]')
    last = 'vc'
    if gradient:
        f.append(f'[{gi}:v]format=rgba[g];[vc][g]overlay=0:0:shortest=1[vg]')
        last = 'vg'
    ii = gi + (1 if gradient else 0)
    for n, im in enumerate(images):   # imágenes del usuario: aparecen con un fundido corto en su momento
        d, t = max(1.2, im['dur']), im['t']
        inputs += ['-loop', '1', '-t', f'{d:.3f}', '-i', im['card']]
        f.append(f'[{ii + n}:v]format=rgba,fade=t=in:d=0.18:alpha=1,fade=t=out:st={d - 0.18:.3f}:d=0.18:alpha=1,'
                 f'setpts=PTS-STARTPTS+{t:.3f}/TB[im{n}];[{last}][im{n}]overlay=0:0:eof_action=pass[vi{n}]')
        last = f'vi{n}'
    f.append(f'[{last}]format=yuv420p[vo]')
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


def finish_outputs(out_dir, final):
    run(['ffmpeg', '-v', 'error', '-y', '-i', final, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast',
         '-crf', '26', '-c:a', 'copy', '-movflags', '+faststart', os.path.join(out_dir, 'final-movil.mp4')])
    run(['ffmpeg', '-v', 'error', '-y', '-ss', '1', '-i', final, '-frames:v', '1', '-vf', 'scale=540:-1', os.path.join(out_dir, 'thumb.jpg')])


def rerender(vid):
    """Vuelve a montar un vídeo exprés con las imágenes que ha adjuntado el usuario (meta.needs[].image). Sin transcribir
    ni llamar a Claude: solo ffmpeg (unos segundos)."""
    out_dir = os.path.join(ROOT, 'library', 'edited', vid)
    ex = json.load(open(os.path.join(out_dir, 'work', 'express.json'), encoding='utf-8'))
    meta = json.load(open(os.path.join(out_dir, 'meta.json'), encoding='utf-8'))
    hw = prep.profile()
    images = []
    if ex.get('hook'):
        images.append({'card': text_card(ex['hook'], os.path.join(out_dir, 'work', 'hook.png')), 't': 0.0, 'dur': 2.2})
    for nd in meta.get('needs') or []:
        if nd.get('image'):
            card = image_card(os.path.join(ROOT, nd['image']), os.path.join(out_dir, 'work', f"card-{nd['n']}.png"))
            images.append({'card': card, 't': nd['t'], 'dur': nd['dur']})
    final = os.path.join(out_dir, 'final.mp4')
    tmp = os.path.join(out_dir, 'work', 'rerender.mp4')
    enc = render(ex['clips'], ex['srcs'], tmp, ex.get('gradient', True), hw, images, zoom=ex.get('zoom', False))
    os.replace(tmp, final)
    finish_outputs(out_dir, final)
    log(f'{len(images)} imagen(es) montadas ({enc}) en {time.time() - T0:.1f}s')


def start_word_of(plan, words):
    try:
        return max(0, min(int((plan or {}).get('start_word', 0)), len(words) - 1))
    except (TypeError, ValueError):
        return 0


def final_check(final, hw, fallback):
    """Escucha el vídeo terminado: el texto final sale de aquí (con GPU, large-v3, que acierta más palabras que turbo)
    y se avisa si se oye alguna frase repetida."""
    try:
        a = load_audio(final)
        big = hw.get('device') == 'cuda' and os.environ.get('MARC_FINAL_MODEL', 'large-v3') != 'off'
        if big:
            from faster_whisper import WhisperModel
            m = WhisperModel(os.environ.get('MARC_FINAL_MODEL', 'large-v3'), device='cuda', compute_type='float16')
            segs, _ = m.transcribe(a, language='es', word_timestamps=True, vad_filter=False, beam_size=5,
                                   condition_on_previous_text=False)
            ws = [{'t': w.word.strip(), 's': w.start, 'e': w.end, 'src': 'final'} for sg in segs for w in sg.words if w.word.strip()]
        else:
            ws, _ = transcribe(a, hw)
            for w in ws:
                w['src'] = 'final'
        text = ' '.join(w['t'] for w in ws if norm(w['t']) not in HALLU)
        rep_ = repeats_left(ws, list(range(len(ws))), max_gap=1)
        if rep_:
            said = ' '.join(ws[i]['t'] for i in sorted(rep_))
            log(f'AVISO: en el vídeo final se oye repetido «{said}»')
            return text or fallback, {'repeated': said}
        log('vídeo final escuchado: sin frases repetidas')
        return text or fallback, {'repeated': None}
    except Exception as e:
        log(f'no se pudo escuchar el vídeo final ({str(e)[:100]})')
        return fallback, None


# ------------------------------------------------------------------ principal
def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    a = sys.argv[1:]
    if '--rerender' in a:
        return rerender(a[0])
    opt = lambda k, d=None: (a[a.index(k) + 1] if k in a else d)
    title, notes, ref_id = opt('--title', ''), opt('--notes', ''), opt('--ref', '')
    flags = {'--no-gradient', '--no-claude', '--no-zoom'}
    vals = {opt('--title'), opt('--notes')}
    VALUED = ('--title', '--notes', '--ref')
    pos = [x for i, x in enumerate(a) if x not in flags and not (i > 0 and a[i - 1] in VALUED) and x not in VALUED]
    vid, srcs = pos[0], [p if os.path.isabs(p) else os.path.join(ROOT, p) for p in pos[1:]]
    out_dir = os.path.join(ROOT, 'library', 'edited', vid)
    work = os.path.join(out_dir, 'work')
    os.makedirs(work, exist_ok=True)
    hw = prep.profile()
    log(f'PC: {hw["cores"]} hilos · {hw["ram_gb"]} GB · {hw["model"]} en {hw["device"]}')

    # 1-2. transcripción + energía por vídeo (todos los vídeos se tratan como una lista de palabras con su origen)
    words, sents, audio_by, dur_by, energy_by = [], [], {}, {}, {}
    for s in srcs:
        audio = load_audio(s)
        audio_by[s], dur_by[s] = audio, len(audio) / SR
        ws, ss = transcribe(audio, hw)
        db, thr, floor, speech, hop = energy(audio)
        energy_by[s] = (db, thr, hop)
        ws, ss, gaps_found = fill_gaps(ws, ss, audio, db, thr, hop, hw)
        if gaps_found:
            log(f'voz sin transcribir en {", ".join(gaps_found)}: transcrita aparte ({sum(1 for w in ws if w.get("gap"))} palabras recuperadas)')
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
    ref_text = load_reference(ref_id)
    if ref_id:
        log(f'referencia «{ref_id}»: ' + ('estilo cargado' if ref_text else 'sin analizar, se usa el estilo normal'))
    plan = None if '--no-claude' in a else ask_claude(words, sents, gaps, title, notes, ref_text)
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
    # repeticiones que se le hayan escapado a Claude (o a las reglas): fuera la primera toma
    rl = repeats_left(words, keep)
    if rl:
        log('repetición que seguía en el montaje, quito la primera toma: «' + ' '.join(words[i]['t'] for i in sorted(rl)) + '»')
        drop |= rl
        keep = [i for i in keep if i not in rl]
    # palabras quitadas en bloque (2+ seguidas = toma falsa o repetición): el corte nunca las devuelve
    hard = set()
    for i in drop:
        if i - 1 in drop or i + 1 in drop:
            hard.add(i)
    style = (plan or {}).get('style') or {}
    pause = min(0.3, max(0.04, float(style.get('pause', 0.1) or 0.1)))
    if style:
        log(f"estilo: zoom {style.get('zoom', 'push')} ×{style.get('strength', 1)}, respiro {pause:.2f}s" + (f", texto «{style['hook_text']}»" if style.get('hook_text') else ''))

    # 4. tramos (por vídeo, en orden)
    clips = []
    for s in srcs:
        k = [i for i in keep if words[i]['src'] == s]
        cs = build_clips(words, k, dur_by[s])
        for c in cs:
            c['src'] = s
        cs, sn = safe_cuts(cs, words, *energy_by[s], pause=pause, hard=hard)
        for x in sn:
            log(x)
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

    # momentos donde Claude pide una imagen → tiempo en el vídeo FINAL
    def out_t(i):
        acc = 0.0
        for c in clips:
            if i in c['words']:
                return acc + max(0.0, words[i]['s2'] - c['in'])
            acc += c['out'] - c['in']
        return None
    needs = []
    for im in (plan or {}).get('images') or []:
        try:
            a_, b_ = int(im.get('word')), int(im.get('until', im.get('word')))
        except (TypeError, ValueError):
            continue
        ks = [i for i in keep if a_ <= i <= b_] or [i for i in keep if i >= a_][:1]
        if not ks or out_t(ks[0]) is None:
            continue
        t0_, t1_ = out_t(ks[0]), out_t(ks[-1])
        end = (t1_ if t1_ is not None else t0_) + (words[ks[-1]]['e2'] - words[ks[-1]]['s2'])
        needs.append({'n': len(needs) + 1, 't': round(t0_, 2), 'dur': round(min(4.0, max(1.6, end - t0_ + 0.4)), 2),
                      'what': str(im.get('what') or 'Imagen')[:120],
                      'said': ' '.join(words[i]['t'] for i in ks)[:120], 'image': None})
    if needs:
        log('Claude pide imagen para: ' + ' | '.join(f"{x['t']:.1f}s {x['what']}" for x in needs))
    log(f'{len(clips)} tramos · {total_in:.1f}s → {sum(durs):.1f}s ({100 * (1 - sum(durs) / total_in):.0f}% fuera) · mediana {np.median(durs):.2f}s')

    # 6. render
    final = os.path.join(out_dir, 'final.mp4')
    zoom = '--no-zoom' not in a
    if zoom:
        zoom_plan(clips, style if style.get('zoom') != 'none' else {'zoom': 'push', 'strength': 0.5})
    hook = (style.get('hook_text') or '').strip()
    extra_imgs = [{'card': text_card(hook, os.path.join(work, 'hook.png')), 't': 0.0, 'dur': 2.2}] if hook else []
    enc = render(clips, srcs, final, None if '--no-gradient' in a else True, hw, images=extra_imgs, zoom=zoom)
    finish_outputs(out_dir, final)
    log(f'render ({enc}) hecho')
    kept_text, check = final_check(final, hw, ' '.join(words[i]['t'] for c in clips for i in c['words']))

    # salidas
    rel = lambda p: os.path.relpath(p, ROOT).replace('\\', '/')
    final_title = title or plan.get('title') or vid
    caption = (plan.get('caption') or '').strip()
    if caption:
        open(os.path.join(out_dir, 'caption.txt'), 'w', encoding='utf-8').write(caption + '\n')
    tl = {'version': 1, 'fps': FPS, 'width': W, 'height': H, 'source': rel(srcs[0]),
          'clips': [{'in': round(c['in'], 3), 'out': round(c['out'], 3), 'zoom': 1.0, 'cx': 0.5, 'cy': 0.35, 'punch': False,
                     'transition': c.get('transition', 'none') if zoom else 'none',
                     **({'pushin': True, 'pushin_amount': c['pushin_amount'], 'pushin_ease': 'power2.out'} if zoom and not c.get('scale') else {}),
                     **({'zoom': c['scale']} if zoom and c.get('scale') else {}),
                     **({'src': rel(c['src'])} if c['src'] != srcs[0] else {})} for c in clips],
          'captions': [], 'overlays': [], 'effects': [], 'sfx': [], 'music': None, 'cutout': None,
          'voice': {'gain_db': 0, 'clean': True}, 'grade': 'contrast(1.07) saturate(.9) brightness(.97)',
          'look': 'bold' if '--no-gradient' not in a else 'none', 'progress': {'enabled': False}}
    json.dump(tl, open(os.path.join(out_dir, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    mp = os.path.join(out_dir, 'meta.json')
    meta = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {'id': vid}
    meta.update({'title': final_title, 'source': rel(srcs[0]), 'recipe': 'Exprés · cortes' + (' + zooms' if zoom else '') + (' + degradado' if '--no-gradient' not in a else ''),
                 'duration_in': round(total_in, 2), 'duration_out': round(sum(durs), 2), 'cuts': len(clips), 'zooms': zoom,
                 'transcript': kept_text, 'express': True, 'needs': needs, 'check': check,
                 **({'sources': [rel(s) for s in srcs]} if len(srcs) > 1 else {})})
    meta.setdefault('created', time.strftime('%Y-%m-%dT%H:%M:%S'))
    json.dump(meta, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    os.makedirs(os.path.join(ROOT, 'library', 'scripts'), exist_ok=True)
    open(os.path.join(ROOT, 'library', 'scripts', f'{vid}.md'), 'w', encoding='utf-8').write(f'# {final_title}\n\n{kept_text}\n')
    json.dump({'hw': hw, 'words': words, 'drop': sorted(drop), 'clips': [{k: v for k, v in c.items() if k != 'words'} for c in clips],
               'fixes': fixes, 'claude': plan, 'seconds': round(time.time() - T0, 1), 'srcs': srcs,
               'gradient': '--no-gradient' not in a, 'zoom': zoom, 'style': style, 'hook': hook, 'ref': ref_id},
              open(os.path.join(work, 'express.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
    log(f'LISTO en {time.time() - T0:.1f}s → library/edited/{vid}/final.mp4')


if __name__ == '__main__':
    main()
