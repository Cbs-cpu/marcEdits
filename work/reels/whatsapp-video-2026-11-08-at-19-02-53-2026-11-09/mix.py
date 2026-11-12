#!/usr/bin/env python3
"""Mezcla: voz (highpass 80 Hz + afftdn suave) + SFX ~10 dB por debajo de la voz (medido en loudness momentáneo),
master loudnorm 2 pasadas -14 LUFS / -1.5 dBTP, AAC 192k 48 kHz, mux con el render de HyperFrames.

python mix.py renders/basico-bold-v1.mp4 renders/basico-bold-v1-mix.mp4
"""
import json
import re
import subprocess
import sys

VID, OUT = sys.argv[1], sys.argv[2]
TM = json.load(open('work/timing.json', encoding='utf-8'))
W, CUT = TM['words'], TM['cuts']
VOICE_CHAIN = 'highpass=f=80,afftdn=nr=6:nf=-50:tn=1'
BELOW = 10.0   # dB por debajo de la voz

# (nombre, inicio en s, dB extra) — nunca dos a la vez sobre una frase
SFX = [
    ('pop', W['con esto'], 0),
    ('pop', W['4 o 5'], 0),
    ('pop', W['20'], 1),                       # junto al shake
    ('whoosh-short', CUT['empresa'] - .22, -2),  # entra con el flash blanco
    ('sparkle', W['esa magna'] + .05, -1),       # marca: momento "wow"
    ('whoosh-short', CUT['cta'] - .22, -2),      # flash blanco del CTA
    ('click-soft', W['aquí abajo'] + .02, 0),    # señala el carrito (toque en pantalla)
]


def run(args):
    return subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')


def max_momentary(path):
    err = run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'apad=pad_dur=0.5,ebur128', '-f', 'null', '-']).stderr
    ms = [float(x) for x in re.findall(r' M:\s*(-?[\d.]+)', err)]
    return max(ms)


def integrated(path, chain):
    err = run(['ffmpeg', '-hide_banner', '-i', path, '-af', f'{chain},ebur128', '-f', 'null', '-']).stderr
    return float(re.findall(r'I:\s*(-?[\d.]+) LUFS', err)[-1])


voice_i = integrated('work/voice_raw.wav', VOICE_CHAIN)
inputs, parts, labels = ['-i', 'work/voice_raw.wav'], [f'[0:a]{VOICE_CHAIN},aresample=48000[v]'], ['[v]']
for k, (name, t, extra) in enumerate(SFX, 1):
    f = f'assets/sfx/{name}.mp3'
    g = voice_i - BELOW + extra - max_momentary(f)
    inputs += ['-i', f]
    ms = int(round(t * 1000))
    parts.append(f'[{k}:a]aresample=48000,aformat=channel_layouts=stereo,volume={g:.2f}dB,adelay={ms}|{ms}[s{k}]')
    labels.append(f'[s{k}]')
    print(f'{name:13s} @ {t:6.2f}s  gain {g:+.1f} dB')
parts.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first[mix]")
pre = ';'.join(parts)

# pasada 1: medir
err = run(['ffmpeg', '-hide_banner', *inputs, '-filter_complex', pre + ';[mix]loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
           '-f', 'null', '-']).stderr
m = json.loads(err[err.rindex('{'):err.rindex('}') + 1])
ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
      f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
fc = pre + f';[mix]{ln},aresample=48000[aout]'
r = run(['ffmpeg', '-v', 'error', '-y', *inputs, '-i', VID, '-filter_complex', fc,
         '-map', f'{len(SFX) + 1}:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
         '-shortest', '-movflags', '+faststart', OUT])
print(f'voz {voice_i:.1f} LUFS · medido mezcla {m["input_i"]} LUFS / {m["input_tp"]} dBTP', r.stderr[-500:])
