"""Builds library/edited/<id>/timeline.json from this project's segments.json (Bold look, skill video-edit)."""
import json, os, sys
sys.path.insert(0, os.path.abspath('../../../engine'))
ROOT = os.path.abspath('../../..')
VID = 'whatsapp-video-2026-11-09-at-14-57-06-2026-11-09'
segs = json.load(open('segments.json', encoding='utf-8'))
T = {s['id']: (s['frame'] / 30 - .002 if s['frame'] else 0.0) for s in segs}
DUR = sum(s['frames'] for s in segs) / 30
Y, W = '#FAE67A', '#FFFFFF'
HEAD = {'hook': 350, 'malo': 350, 'agotan': 330, 'suerte': 360, 'reponer': 340, 'cta': 370}
def back(seg, size): return max(225, round(HEAD[seg] - .76 * size))
def line(text, size=94):
    return size if len(text) <= 16 else max(70, round(94 * 16 / len(text)))
caps = []
def cap(a, b, text, size=None, color=W, top=1005, bk=False):
    caps.append({'start': round(a, 3), 'end': round(b, 3), 'text': text, 'size': size or line(text), 'color': color, 'top': top, 'back': bk})
# hook
cap(0.00, 1.15, 'este es el'); cap(0.60, 1.15, 'desayuno', 220, Y, 1105)
cap(1.15, 2.38, 'para ponerse'); cap(1.88, 2.38, 'realmente', 150, W, 1110)
cap(2.38, T['esto'], 'fuerte', 236, Y, 1020)
# esto
cap(T['esto'], 4.52, 'es esto'); cap(4.52, T['energia'], 'de aquí', 150, Y, 1060)
# energia
cap(T['energia'], 6.52, 'te va a aportar'); cap(5.86, 6.52, 'una gran fuente', 94, W, 1112)
cap(6.52, T['proteina'], 'de'); cap(6.58, T['proteina'], 'energía', 220, Y, 1105)
# proteina
cap(T['proteina'], 8.40, 'además de un gran'); cap(7.94, 8.40, 'porcentaje', 150, W, 1112)
cap(8.40, T['sabores'], 'de'); cap(8.52, T['sabores'], 'proteína', 220, Y, 1105)
# sabores
cap(T['sabores'], 10.62, 'lo vas a tener'); cap(9.86, 10.62, 'en un montón', 94, W, 1112)
cap(10.62, T['malo'], 'de'); cap(10.76, T['malo'], 'sabores', 220, Y, 1105)
# malo (behind the head)
cap(T['malo'], T['agotan'], 'pero sí que tiene'); cap(11.84, T['agotan'], 'algo', 94, W, 1112)
cap(12.02, T['agotan'], 'malo', 170, W, back('malo', 170), True)
# agotan
cap(T['agotan'], 13.36, 'cada vez que'); cap(12.98, 13.36, 'sale stock', 150, Y, 1110)
cap(13.36, T['suerte'], 'se'); cap(13.58, T['suerte'], 'agotan', 170, Y, back('agotan', 170), True)
# suerte
cap(T['suerte'], T['reponer'], 'pero justo ahora'); cap(14.60, T['reponer'], 'vas a estar de', 94, W, 1112)
cap(15.20, T['reponer'], 'suerte', 200, Y, back('suerte', 200), True)
# reponer
cap(T['reponer'], T['cta'], 'acaban de reponer'); cap(16.34, T['cta'], 'nuevos stocks', 130, Y, 1110)
# cta
cap(T['cta'], 18.34, 'simplemente si te'); cap(17.60, 18.34, 'aparece un', 94, W, 1112)
cap(17.96, 18.34, 'carrito verde', 128, Y, 1210)
cap(18.34, 19.48, 'aquí abajo', 150, Y, 1040); cap(18.84, 19.48, 'accede corriendo', 94, W, 1250)
cap(19.48, 20.56, 'selecciona tu'); cap(19.96, 20.56, 'sabor favorito', 128, Y, 1110)
cap(20.56, 21.48, 'y si pillas'); cap(21.06, 21.48, 'más de una', 150, W, 1110)
cap(21.48, DUR, 'tienes'); cap(21.70, DUR, 'envío gratis', 140, Y, 1110); cap(22.40, DUR, 'bro', 94, W, 1290)

order = [s['id'] for s in segs]
trans = {'hook': 'none', 'esto': 'punch', 'energia': 'punch', 'proteina': 'punch', 'sabores': 'blur', 'malo': 'zoom',
         'agotan': 'punch', 'suerte': 'punch', 'reponer': 'flash', 'cta': 'punch'}
clips = []
for k, s in enumerate(segs):
    # out = in + exact frame count: the engine's composition length then matches aroll/subject.webm frame for frame
    c = {'in': s['src_in'], 'out': round(s['src_in'] + s['frames'] / 30, 4), 'zoom': s['zoom'], 'cx': s['cx'], 'cy': s['cy'], 'punch': k > 0, 'transition': trans[s['id']]}
    if s['id'] in ('hook', 'cta'):
        c.update({'pushin': True, 'pushin_amount': .04})
    clips.append(c)
from timeline import sig
S = 'library/tools/sonidos/'
sfx = [{'file': S + 'whoosh-short.mp3', 't': 0.05, 'gain_db': -16.5},
       {'file': S + 'pop.mp3', 't': 0.62, 'gain_db': -19},
       {'file': S + 'impact-bass-1.mp3', 't': 2.42, 'gain_db': -16},
       {'file': S + 'whoosh-short.mp3', 't': T['esto'], 'gain_db': -17},
       {'file': S + 'pop.mp3', 't': 6.60, 'gain_db': -19},
       {'file': S + 'whoosh-short.mp3', 't': T['sabores'], 'gain_db': -17},
       {'file': S + 'pop.mp3', 't': 13.60, 'gain_db': -19},
       {'file': S + 'sparkle.mp3', 't': 15.22, 'gain_db': -17},
       {'file': S + 'whoosh-short.mp3', 't': T['cta'], 'gain_db': -17},
       {'file': S + 'click-soft.mp3', 't': 18.36, 'gain_db': -16},
       {'file': S + 'pop.mp3', 't': 21.72, 'gain_db': -19}]
tl = {
 'version': 1, 'fps': 30, 'width': 1080, 'height': 1920,
 'source': 'inputs/' + VID + '.mp4', 'clips': clips, 'captions': caps,
 'voice': {'gain_db': 0, 'clean': True}, 'music': None, 'sfx': sfx,
 'cutout': {'file': 'work/reels/' + VID + '/assets/subject.webm', 'sig': sig(clips)},
 'grade': 'contrast(1.07) saturate(.9) brightness(.97)', 'look': 'bold', 'enhance': True,
 'effects': [{'type': 'shake', 't': 2.42, 'dur': .2, 'amount': 8},
             {'type': 'zoom', 't': 8.52, 'dur': .35, 'amount': .08},
             {'type': 'zoom', 't': 13.58, 'dur': .3, 'amount': .06}],
 'overlays': [
   {'type': 'title', 'text': 'Desayuno de campeón 💪', 'start': 0.0, 'end': 2.38, 'x': 540, 'y': 280, 'size': 70,
    'color': '#0b0b0f', 'bg': Y, 'anim': 'bounce', 'rotate': -2},
   {'type': 'emoji', 'text': '⚡', 'start': 6.60, 'end': T['proteina'], 'x': 880, 'y': 640, 'size': 140, 'anim': 'bounce', 'rotate': 10},
   {'type': 'emoji', 'text': '😬', 'start': 12.04, 'end': T['agotan'], 'x': 900, 'y': 640, 'size': 130, 'anim': 'bounce', 'rotate': -8},
   {'type': 'emoji', 'text': '🍀', 'start': 15.24, 'end': T['reponer'], 'x': 900, 'y': 680, 'size': 130, 'anim': 'bounce', 'rotate': 8},
   {'type': 'arrow', 'start': 18.36, 'end': 20.56, 'x': 540, 'y': 1380, 'size': 110, 'color': Y, 'anim': 'bounce', 'loop': True}],
 'progress': {'enabled': True, 'pos': 'top', 'color': Y, 'height': 8},
}
d = os.path.join(ROOT, 'library', 'edited', VID)
os.makedirs(d, exist_ok=True)
json.dump(tl, open(os.path.join(d, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('timeline ok', round(DUR, 3), len(clips), 'clips', len(caps), 'captions', {k: round(v, 3) for k, v in T.items()})
