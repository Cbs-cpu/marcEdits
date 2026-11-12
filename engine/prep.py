#!/usr/bin/env python3
"""Análisis previo de una edición, SIN Claude (lo lanza la app antes de llamar a Claude, para que no gaste
turnos transcribiendo ni sacando datos).

Uso (con el Python de la skill video-edit, que tiene faster-whisper):
  python engine/prep.py <id> <vídeo1> [<vídeo2> ...] [--skill-project work/reels/<id>]

Escribe:
  library/edited/<id>/work/prep.json      perfil del PC, modelo usado, tiempos y, por vídeo: duración, tamaño,
                                          palabras con tiempos, frases, silencios (-40 dB / 0.08 s) y hoja de fotogramas
  library/edited/<id>/work/<nombre>.json  transcripción en formato openai-whisper (para engine/edit.py --transcript)
  con --skill-project: sources.json, words_cN.json, transcript.txt y work/sheets.jpg con el MISMO formato que
  .claude/skills/video-edit/scripts/ingest.py, así Claude se salta la ingesta.

Transcripción (la parte lenta), en este orden:
  1. Servidor propio si existe MARC_WHISPER_URL (API compatible OpenAI; solo se sube el audio).
  2. GPU NVIDIA con CUDA si funciona de verdad (se prueba una vez y se guarda en library/.cache/hw.json).
  3. CPU: large-v3-turbo int8 (2,5x más rápido que large-v3, mismo texto en español); en PCs con poca RAM, small.
  MARC_WHISPER_MODEL fuerza un modelo.
"""
import json
import os
import subprocess
import sys
import time
import uuid
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'library', '.cache')
FF = os.environ.get('FFMPEG', 'ffmpeg')
FP = os.environ.get('FFPROBE', 'ffprobe')
TEXT = {'capture_output': True, 'encoding': 'utf-8', 'errors': 'replace'}
NOWIN = {'creationflags': 0x08000000} if os.name == 'nt' else {}   # sin ventanas de consola


def log(msg):
    print(f'[prep] {msg}', flush=True)


# ------------------------------------------------------------------ perfil del PC
def ram_gb():
    try:
        if os.name == 'nt':
            import ctypes

            class MS(ctypes.Structure):
                _fields_ = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong),
                            ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                            ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong),
                            ('ullTotalVirtual', ctypes.c_ulonglong), ('ullAvailVirtual', ctypes.c_ulonglong),
                            ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]
            m = MS(); m.dwLength = ctypes.sizeof(MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            return round(m.ullTotalPhys / 2**30, 1)
        return round(os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES') / 2**30, 1)
    except Exception:
        return 8.0


def cuda_works():
    """Prueba CUDA en un proceso aparte (si faltan las DLL de cuBLAS el error es tardío y a veces mata el proceso)."""
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() < 1:
            return False
    except Exception:
        return False
    code = ('import numpy as np\nfrom faster_whisper import WhisperModel\n'
            'm = WhisperModel("tiny", device="cuda", compute_type="float16")\n'
            'list(m.transcribe(np.zeros(16000, dtype=np.float32))[0])\nprint("OK")')
    try:
        r = subprocess.run([sys.executable, '-c', code], timeout=180, **TEXT, **NOWIN)
        return 'OK' in r.stdout
    except Exception:
        return False


def profile():
    path = os.path.join(CACHE, 'hw.json')
    try:
        hw = json.load(open(path, encoding='utf-8'))
        if hw.get('schema') == 2:
            return hw
    except Exception:
        pass
    cores = os.cpu_count() or 4
    ram = ram_gb()
    gpu = cuda_works()
    if gpu:
        model, device, ctype = 'large-v3', 'cuda', 'float16'
    elif ram >= 6:
        model, device, ctype = 'large-v3-turbo', 'cpu', 'int8'
    else:
        model, device, ctype = 'small', 'cpu', 'int8'
    hw = {'schema': 2, 'cores': cores, 'ram_gb': ram, 'cuda': gpu, 'model': model, 'device': device,
          'compute_type': ctype, 'threads': max(2, min(16, cores // 2))}
    os.makedirs(CACHE, exist_ok=True)
    json.dump(hw, open(path, 'w', encoding='utf-8'), indent=1)
    return hw


# ------------------------------------------------------------------ datos de cada vídeo
def probe(f):
    j = json.loads(subprocess.run([FP, '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate',
                                   '-of', 'json', f], **TEXT, **NOWIN).stdout or '{}')
    v = next((s for s in j.get('streams', []) if s.get('codec_type') == 'video'), {})
    return {'dur': round(float(j.get('format', {}).get('duration', 0)), 3), 'w': v.get('width', 0), 'h': v.get('height', 0),
            'fps': v.get('r_frame_rate', ''), 'audio': any(s.get('codec_type') == 'audio' for s in j.get('streams', []))}


def silences(f, db=-40, d=0.08):
    err = subprocess.run([FF, '-hide_banner', '-i', f, '-af', f'silencedetect=n={db}dB:d={d}', '-f', 'null', '-'], **TEXT, **NOWIN).stderr
    out, start = [], None
    for l in err.splitlines():
        if 'silence_start:' in l:
            start = float(l.split('silence_start:')[1].split()[0])
        elif 'silence_end:' in l and start is not None:
            out.append([round(max(0, start), 3), round(float(l.split('silence_end:')[1].split()[0]), 3)])
            start = None
    return out


def sheet(f, dur, out):
    subprocess.run([FF, '-loglevel', 'error', '-y', '-i', f, '-vf', f'fps=8/{max(dur, 0.5)},scale=200:-2,tile=8x1',
                    '-frames:v', '1', out], **TEXT, **NOWIN)
    return out if os.path.exists(out) else None


# ------------------------------------------------------------------ transcripción
_model = None


def transcribe_local(wav, hw, prompt):
    global _model
    from faster_whisper import WhisperModel
    name = os.environ.get('MARC_WHISPER_MODEL') or hw['model']
    if _model is None:
        t = time.time()
        _model = WhisperModel(name, device=hw['device'], compute_type=hw['compute_type'], cpu_threads=hw['threads'])
        log(f'modelo {name} ({hw["device"]}) cargado en {time.time() - t:.1f}s')
    segs, _ = _model.transcribe(wav, word_timestamps=True, vad_filter=False, language='es', initial_prompt=prompt or None,
                                beam_size=5)
    out = []
    for s in segs:
        out.append({'start': round(s.start, 3), 'end': round(s.end, 3), 'text': s.text.strip(),
                    'words': [{'word': w.word, 'start': round(w.start, 3), 'end': round(w.end, 3),
                               'probability': round(w.probability, 3)} for w in (s.words or [])]})
    return out, f'{name}@{hw["device"]}'


def transcribe_remote(wav, prompt):
    """Servidor propio (API compatible OpenAI /v1/audio/transcriptions). Solo se sube el audio."""
    url = os.environ['MARC_WHISPER_URL'].rstrip('/')
    if not url.endswith('/audio/transcriptions'):
        url += '/v1/audio/transcriptions'
    b = uuid.uuid4().hex
    fields = {'model': os.environ.get('MARC_WHISPER_REMOTE_MODEL', 'large-v3'), 'language': 'es',
              'response_format': 'verbose_json', 'timestamp_granularities[]': 'word'}
    if prompt:
        fields['prompt'] = prompt
    body = b''.join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items())
    body += f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()
    body += open(wav, 'rb').read() + f'\r\n--{b}--\r\n'.encode()
    req = urllib.request.Request(url, data=body, headers={'Content-Type': f'multipart/form-data; boundary={b}',
                                                          **({'Authorization': f'Bearer {os.environ["MARC_WHISPER_KEY"]}'}
                                                             if os.environ.get('MARC_WHISPER_KEY') else {})})
    j = json.loads(urllib.request.urlopen(req, timeout=300).read())
    words = j.get('words') or [w for s in j.get('segments', []) for w in s.get('words', [])]
    segs = []
    for s in j.get('segments', []):
        ws = [{'word': w['word'], 'start': w['start'], 'end': w['end'], 'probability': w.get('probability', 1)}
              for w in words if s['start'] - 0.01 <= w['start'] < s['end'] + 0.01]
        segs.append({'start': s['start'], 'end': s['end'], 'text': s['text'].strip(), 'words': ws})
    return segs, 'servidor'


def transcribe(f, work, hw, prompt):
    wav = os.path.join(work, os.path.splitext(os.path.basename(f))[0] + '.wav')
    subprocess.run([FF, '-loglevel', 'error', '-y', '-i', f, '-vn', '-ac', '1', '-ar', '16000', wav], check=True, **TEXT, **NOWIN)
    try:
        if os.environ.get('MARC_WHISPER_URL'):
            try:
                return transcribe_remote(wav, prompt)
            except Exception as e:   # el servidor no responde: se hace en el PC
                log(f'servidor de transcripción no disponible ({e}); se transcribe en este PC')
        return transcribe_local(wav, hw, prompt)
    finally:
        try:
            os.remove(wav)
        except OSError:
            pass


# ------------------------------------------------------------------ principal
def main():
    args = sys.argv[1:]
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    skill_proj = None
    if '--skill-project' in args:
        i = args.index('--skill-project'); skill_proj = os.path.join(ROOT, args[i + 1]); args = args[:i] + args[i + 2:]
    prompt = None
    if '--prompt' in args:
        i = args.index('--prompt'); prompt = args[i + 1]; args = args[:i] + args[i + 2:]
    vid, files = args[0], [f if os.path.isabs(f) else os.path.join(ROOT, f) for f in args[1:]]
    work = os.path.join(ROOT, 'library', 'edited', vid, 'work')
    os.makedirs(work, exist_ok=True)
    t0 = time.time()
    hw = profile()
    log(f'PC: {hw["cores"]} hilos, {hw["ram_gb"]} GB RAM, {"GPU CUDA" if hw["cuda"] else "sin GPU CUDA"} → {hw["model"]}')

    res = {'id': vid, 'hw': hw, 'inputs': []}
    for k, f in enumerate(files):
        rel = os.path.relpath(f, ROOT).replace('\\', '/')
        info = probe(f)
        log(f'{k + 1}/{len(files)} {os.path.basename(f)} · {info["dur"]:.1f}s · {info["w"]}x{info["h"]}')
        item = {'path': rel, **info, 'sheet': None, 'silences': [], 'segments': [], 'words': []}
        sh = sheet(f, info['dur'], os.path.join(work, f'sheet_{k + 1}.jpg'))
        item['sheet'] = os.path.relpath(sh, ROOT).replace('\\', '/') if sh else None
        if info['audio']:
            t = time.time()
            item['silences'] = silences(f)
            segs, engine = transcribe(f, work, hw, prompt)
            item['segments'] = [{'start': s['start'], 'end': s['end'], 'text': s['text']} for s in segs]
            item['words'] = [{'text': w['word'].strip(), 'start': w['start'], 'end': w['end'], 'p': w['probability']}
                             for s in segs for w in s['words']]
            item['engine'] = engine
            item['transcript'] = os.path.relpath(os.path.join(work, os.path.splitext(os.path.basename(f))[0] + '.json'), ROOT).replace('\\', '/')
            json.dump({'text': ' '.join(s['text'] for s in segs), 'segments': segs, 'language': 'es'},
                      open(os.path.join(ROOT, item['transcript']), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            log(f'   transcrito en {time.time() - t:.1f}s ({len(item["words"])} palabras, {len(item["silences"])} silencios)')
        res['inputs'].append(item)

    if skill_proj:   # mismo formato que ingest.py de la skill video-edit
        os.makedirs(os.path.join(skill_proj, 'work'), exist_ok=True)
        sources, lines = {}, []
        for k, it in enumerate(res['inputs']):
            cid = f'c{k + 1}'
            sources[cid] = os.path.join(ROOT, it['path']).replace('\\', '/')
            words = []
            for w in it['words']:
                t = w['text']
                if words and t[:1] in '-.' and len(t) > 1 and t[1:2].isdigit():
                    words[-1]['text'] += t; words[-1]['end'] = w['end']; continue
                words.append({'text': t, 'start': w['start'], 'end': w['end']})
            json.dump(words, open(os.path.join(skill_proj, f'words_{cid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            lines.append(f'===== {cid}  {os.path.basename(it["path"])}')
            lines += [f'[{s["start"]:6.2f}-{s["end"]:6.2f}] {s["text"]}' for s in it['segments']]
            lines.append('words: ' + ' '.join(f"{w['text']}@{w['start']:.2f}" for w in words))
            lines.append('speech map: ' + ' '.join(f'S{a:.2f} E{b:.2f}' for a, b in it['silences']))
            if it['sheet']:
                import shutil
                shutil.copy(os.path.join(ROOT, it['sheet']), os.path.join(skill_proj, 'work', f'sheet_{cid}.jpg'))
        json.dump(sources, open(os.path.join(skill_proj, 'sources.json'), 'w', encoding='utf-8'), indent=1)
        open(os.path.join(skill_proj, 'transcript.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
        sheets = [os.path.join(skill_proj, 'work', f'sheet_c{k + 1}.jpg') for k in range(len(res['inputs']))]
        sheets = [s for s in sheets if os.path.exists(s)]
        if sheets:
            ins = sum((['-i', s] for s in sheets), [])
            stack = ['-filter_complex', f'vstack={len(sheets)}'] if len(sheets) > 1 else []
            subprocess.run([FF, '-loglevel', 'error', '-y', *ins, *stack, os.path.join(skill_proj, 'work', 'sheets.jpg')], **TEXT, **NOWIN)
        res['skill_project'] = os.path.relpath(skill_proj, ROOT).replace('\\', '/')
        log(f'ingesta de la skill hecha en {res["skill_project"]}')

    res['seconds'] = round(time.time() - t0, 1)
    json.dump(res, open(os.path.join(work, 'prep.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f'análisis listo en {res["seconds"]}s → library/edited/{vid}/work/prep.json')


if __name__ == '__main__':
    main()
