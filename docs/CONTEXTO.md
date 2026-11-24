# Contexto del proyecto Marc Edits

Resumen de cómo se construyó la app, qué decidió el cliente y por qué, para quien la lleve a otro ordenador o siga
desarrollándola (personas o Claude Code). Las reglas técnicas de edición están en `../CLAUDE.md`; el formato del
editor en `../engine/TIMELINE.md`.

## Objetivo

App de escritorio local para editar vídeos cortos verticales de TikTok en español (creador de referencia:
@marcaltarriba) con Claude Code, usando la **suscripción de Claude** del usuario, nunca tokens de API de pago.

## Preferencias del cliente (pedidas explícitamente)

- Hablar siempre en **español**.
- Modelo de las ediciones: **Opus 5.5** (`claude-opus-5-5`), no Sonnet.
- Prioridad máxima: **cortes limpios** (sin silencios ni aire muerto) y **transcripción perfecta**, quitando las
  tomas falsas y repeticiones del que habla. Los subtítulos dicen exactamente lo que se dice.
- Le encantó la edición hecha con la skill `video-edit` de @tenfoldmarc (look **Bold**), con subtítulos **más
  legibles** (versión v2: espaciado, borde oscuro, líneas largas más pequeñas). Referencia de cómo debe quedar:
  `work/reels/embutido/build.py`.
- Un **ejecutable real** (instalador), no un .bat. Interfaz limpia, sin texto sobrante.
- Herramientas en carpetas editables: subtítulos, transiciones, canciones, sonidos y efectos.
- «Editar vídeo» como un **asistente paso a paso tipo chat** que enseña el prompt exacto antes de enviarlo.
- El asistente **no pregunta qué sonidos** usar: los elige Claude según las referencias y los vídeos que gustan.
  Transiciones y efectos también los elige Claude si el usuario no especifica.
- Cada vídeo editado se trabaja como una **conversación** con Claude (remix, subtítulos, efectos), con versiones.
- Música: canciones de TikTok **actuales** (las clásicas libres «de hace mil años» se rechazaron). Como tienen
  copyright, la app solo las lista y se añaden desde TikTok al publicar. Para música dentro del vídeo se usan pistas
  CC BY de Jamendo (crédito en la descripción).
- Mezcla de sonido cuidada: voz delante, música 15-20 dB por debajo con ducking, máster -14 LUFS.
- **Editor manual profesional** tipo CapCut / Premiere, moldeable y fácil, sobre lo que hizo Claude.
- Vídeos más complejos: **juntar varios vídeos**, **vídeos largos**, y editar a partir de una **referencia**
  (enlace, vídeo descargado o skill ya analizada) que se analiza y se guarda como skill.

## Historia de versiones

| Versión | Qué se añadió |
|---|---|
| 0.1 | App Electron con Vídeos editados, Guiones, Herramientas, Referencias; motor `engine/edit.py`; referencias desde TikTok; «Guardar como skill». |
| 0.2 | Skill video-edit adaptada a español (Whisper large-v3, `language=es`); Opus 5.5; instalador; subtítulos legibles; herramientas por carpetas; asistente paso a paso con el prompt exacto; aviso y botón de inicio de sesión de Claude. |
| 0.3 | Opciones sobre vídeos editados (borrar, cambiar con Claude, ajustes rápidos, reproducción, versiones); canciones en tendencia; conversación por vídeo (`chat.json`, `--resume`); primer editor manual (`timeline.json`). |
| 0.4 | Editor profesional (tira de fotogramas, formas de onda, velocidad, transiciones, stickers, efectos, imán, deshacer, exportar); vídeos con soporte de rangos HTTP (arreglo de «no carga el vídeo»); reel PRO del embutido. |
| 0.5 | Varios vídeos por edición (orden fijo o libre, papel principal / B-roll), vídeos largos (duración objetivo, transcripción por trozos), paso de **referencia** en el asistente (enlace, archivo o skill; analizar y guardar como skill antes de editar); motor con `clips[].src`, `fit` (relleno / desenfocado / negro), volumen por plano y pista **B-roll**; editor con pestaña Vídeos, importar vídeos y pista B-roll. |
| 0.6 | Inicio con dos pestañas **Vídeos / Carruseles**; carruseles para TikTok Shop (formatos en tendencia, referencias desde enlace o capturas, clonar, conversación con Claude, render HTML→PNG con Edge); **cronómetro** por vídeo y carrusel; análisis previo sin Claude (`engine/prep.py`, Whisper turbo: 35 s → 14 s por vídeo de 40 s); Claude en modo Rápido (`--effort medium`); formulario de 9 a 5 preguntas con **Sin subtítulos**; menos RAM (vistas bajo demanda, sin corrector ortográfico, tope de memoria); spec de cuentas y servidor propio en `docs/SPEC.md`. |
| 0.7 | **Modo Exprés** (por defecto): edición completa en ~20 s (`engine/express.py`): Whisper turbo por GPU, Claude en una sola llamada sin herramientas, verificación de uniones y render directo con ffmpeg + degradado negro. Antes, el mismo vídeo tardaba 12:27 con el flujo completo. Skills `cut-video` (cortes) y `tiktok-hooks` (ganchos y descripción). |
| 0.8 | Exprés: Claude pide las imágenes que harían falta («foto de los sabores»), el vídeo sale igual de rápido y al adjuntarla se monta en ~5 s. Interfaz con menos texto y animaciones más vivas (guía de Emil Kowalski). |
| 0.8.1 | Exprés con **zooms** por defecto (casilla «Zooms»), copiados del vídeo que gustó: zoom lento alterno 12-18 % por plano y golpe de zoom al entrar en cada plano (fuerte uno de cada tres). ~26 s por vídeo. |
| 0.9 | Solo modo Exprés (una pantalla). Cortes que nunca caen en plena voz (recupera palabras pegadas como «Y es que», corta en silencio o en el valle entre palabras, sin pausas > 0,25 s). Zooms más suaves (6-10 %) o «a saltos» según la referencia. Referencia en Exprés: si está analizada se aplica en ~20 s; si no, se analiza una vez. Degradado más suave. |

## Cómo funciona por dentro

- La app lanza `claude -p` en la carpeta del proyecto con `--model claude-opus-5-5`, `--permission-mode
  acceptEdits`, herramientas permitidas `Bash,Read,Write,Edit,Glob,Grep,Skill,Agent` y sin tareas en segundo plano
  (si Claude deja algo en segundo plano y termina, el vídeo nunca se acaba). Se borra `ANTHROPIC_API_KEY` del entorno
  para que use la suscripción.
- Todo vídeo nuevo acaba en `library/edited/<id>/timeline.json` y se renderiza con `python engine/timeline.py render
  <id>` (HyperFrames + ffmpeg). Así el editor manual y Claude trabajan sobre lo mismo.
- Antes de llamar a Claude, la app hace el análisis previo (`engine/prep.py`): transcripción, silencios y hojas de
  fotogramas. Así Claude no gasta turnos ni minutos en eso.
- Cliente: solo quiere el **modo Exprés** (~20 s por vídeo) y cortes siempre perfectos; quiere la app **mucho más rápida** y que funcione en cualquier PC, menos preguntas en el formulario, que
  Claude decida más solo, y en el futuro cuentas con suscripción de pago y procesado en un servidor propio
  (`docs/SPEC.md`, pendiente de su aprobado).
- Antes de cualquier cambio la app guarda la versión actual en `versions/vN.mp4`.
- Los archivos del usuario nunca se borran (se mandan a la papelera).

## Pendiente / ideas

- Probar en uso real una edición con varios vídeos + referencia de principio a fin (el motor, el editor y el
  asistente están probados por separado).
- El visor del editor muestra los planos «entero + fondo borroso» con fondo liso (el render sí lo desenfoca).

## Memoria de Claude Code

`docs/memoria/` tiene las notas que Claude Code guardó de este proyecto. En el ordenador nuevo se pueden copiar a
`%USERPROFILE%\.claude\projects\<carpeta-del-proyecto-con-guiones>\memory\` para que Claude Code las recuerde, aunque
`CLAUDE.md` y este documento ya contienen lo importante.
