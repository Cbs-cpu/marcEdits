---
name: cut-video
description: Cortes perfectos en vídeos de alguien hablando a cámara, en español y en Windows: quitar silencios, muletillas, tomas falsas y repeticiones, y comprobar cada unión antes de entregar. Úsala en toda edición de Marc Edits (es la prioridad del cliente) o cuando pidan «cortes más limpios», «menos pausas», «quita las repeticiones».
---

# Cortes perfectos (adaptada para Marc Edits)

Basada en `louisedesadeleer/cut-video` (MIT, ver LICENSE; el original, para Mac y en inglés, está en
`references/original-SKILL.md`). Cambios: español, Windows, sin MFA/conda/Tella/videotoolbox, y la transcripción ya
viene hecha por la app en `library/edited/<id>/work/prep.json` (Whisper large-v3-turbo con tiempos por palabra).
Nunca pidas aprobación: planifica, corta, comprueba y entrega.

## 1. Datos de partida (no repitas nada)
- `prep.json`: palabras con tiempos, frases y silencios (-40 dB / 0.08 s) de cada vídeo. Si usas la skill
  video-edit, su ingesta ya está en `work/reels/<id>/` (words_cN.json, transcript.txt).
- **Umbral relativo, nunca fijo.** Mide el ruido de fondo F y el nivel de voz S con ventanas de 0,5 s
  (F ≈ percentil 10, S ≈ percentil 90 del RMS). Silencio = por debajo de **F + 6 dB**. Si `S − F < 8 dB`
  (micro ruidoso), no te fíes de la energía: corta por los inicios de palabra.
- **Ojo con Whisper turbo:** mete las pausas DENTRO de la duración de la palabra (una «palabra» de 1,5 s suele
  ser palabra + pausa) y junta repeticiones («el, el pack» → «el pack»). Por eso existe el paso 3.

## 2. Lista de tramos a conservar (modo agresivo por defecto, ritmo TikTok)
| Hueco entre palabras | Se deja |
|---|---|
| < 0,25 s | entero |
| 0,25-1 s | 0,10 s |
| > 1 s | 0,20 s |
- **Muletillas** (cortar con 50 ms de margen): eh, ehh, em, emm, mmm, ah, este… (de relleno).
- **Rellenos y transiciones flojas** cuando no aportan: «o sea», «bueno», «pues» (al empezar), «vale», «en plan»,
  «¿sabes?», «digamos», «la verdad es que», «básicamente», «literalmente», «es que» repetido, «y nada».
- **Tomas falsas y repeticiones:** autocorrecciones («quiero… quería decir»), arranques repetidos en 3 s, la misma
  frase dicha varias veces (busca coincidencias de 4 palabras en una ventana de 60 s): **quédate con la ÚLTIMA toma
  buena** (la persona repite hasta que le sale) salvo que esté incompleta.
- **Nunca cortes:** risas, reacciones («uf», «ala»), la pausa tras un remate (déjala en 0,4-0,6 s), ni repeticiones
  retóricas intencionadas («es bueno, bueno de verdad»). Antes de cortar un «silencio», mira su energía: si supera
  F + 10 dB hay algo (risa, respiración, reacción).

## 3. Verdad sobre el terreno: comprueba CADA unión (lo que hace los cortes perfectos)
Por cada tramo conservado, re-transcribe una ventana aislada de ±2 s alrededor de su inicio y su final con el
Python de la skill video-edit (faster-whisper, modelo `small` multilingüe, `language="es"`, nunca `.en`):
```python
from faster_whisper import WhisperModel   # .claude/skills/video-edit/.venv/Scripts/python.exe
m = WhisperModel("small", device="cpu", compute_type="int8")
segs, _ = m.transcribe("ventana.wav", language="es", word_timestamps=True)
```
- En una ventana corta los tiempos por palabra son fiables y aparecen palabras/repeticiones que la pasada completa
  se comió. Las palabras pegadas al borde de la ventana están recortadas: mueve la ventana 1 s y repite.
- Márgenes finales: inicio −0,03 s, final +0,04-0,08 s. No acumules márgenes grandes: 20 cortes × 0,1 s = 2 s de
  barro.
- Recorta también las pausas DENTRO de las frases que conservas (> 0,2 s → ~0,1 s).
- Al quitar una palabra, corta hasta el final COMPLETO de la palabra: 15 ms de vocal se siguen oyendo.
- Uniones sin clic: micro-fundido de audio de 10-20 ms en cada corte.

## 4. Autocontrol antes de renderizar
Resume en el log: duración original → final, % cortado, nº de tramos, mediana por tramo, muletillas, tomas
descartadas (frase → tomas en [t1, t2] → me quedo con t2) y pausas protegidas. Guía: mediana 1-1,5 s en monólogo
con muletillas; si hay muchas tomas repetidas, mediana 3-5 s y 60-75 % cortado es correcto.

## 5. Render y verificación
- En Marc Edits el render final sale de `timeline.json` (`python engine/timeline.py render <id>`): los tramos
  conservados son `clips[]` con `in`/`out`. Si renderizas a mano con ffmpeg, usa `trim`+`atrim`+`concat`, nunca
  `select` (desincroniza el audio), y `-preset fast`.
- **Doble verificación** del vídeo final: (a) busca en las palabras conservadas palabras dobles seguidas, bigramas
  repetidos a ambos lados de un corte y arranques de frase duplicados; (b) transcribe por separado cada unión
  sospechosa (Whisper sobre el vídeo final se inventa palabras en las uniones y esconde tartamudeos). Solo
  entregas cuando el escaneo de repeticiones sale limpio y ninguna unión corta una palabra.
- `silencedetect` (-40 dB / 0,3 s) sobre el final no debe encontrar nada salvo las pausas protegidas.
