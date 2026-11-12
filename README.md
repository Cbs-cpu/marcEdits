# Marc Edits

Aplicación de escritorio (Windows) para editar vídeos verticales de TikTok en español con **Claude Code**, usando la
**suscripción de Claude** (nunca una API key de pago). Corta silencios y tomas falsas, transcribe y subtitula,
añade zooms, transiciones, música con ducking, efectos y stickers, y entrega el vídeo en 1080x1920 a -14 LUFS.

Versión actual: **0.7.0**

## Qué hace

| Sección | Para qué |
|---|---|
| **Editar vídeo** | Asistente paso a paso: uno o **varios vídeos** (se juntan, en orden o como decida Claude), vídeos largos (elige la duración final), **referencia** de cómo debe quedar (enlace, vídeo descargado o skill ya analizada), estilo, subtítulos, transiciones, música, efectos e indicaciones. Al final enseña el prompt exacto que recibe Claude (Opus 5.5). |
| **Vídeos editados** | Reproductor, conversación con Claude por vídeo (cambios, subtítulos, efectos), ajustes rápidos, versiones anteriores. |
| **Editor** | Editor manual tipo CapCut/Premiere: planos de varios vídeos, pista de **B-roll** encima de la voz, textos, stickers, efectos, música y sonidos, deshacer/rehacer, exportar. |
| **Guiones** | Guiones guardados (gancho / desarrollo / CTA). |
| **Herramientas** | Estilos de subtítulos, transiciones, canciones, sonidos, efectos y canciones en tendencia (solo lista). |
| **Referencias** | Vídeos de referencia (TikTok, Instagram, YouTube o archivo). «Guardar como skill» hace que Claude los analice y los convierta en un estilo reutilizable. |
| **Carruseles** (2.ª pestaña) | Posts de fotos 9:16 para TikTok Shop: sube las fotos del producto, elige un formato en tendencia o **clona** un carrusel (enlace de TikTok o capturas) y Claude escribe y diseña las diapositivas (PNG 1080x1920 + descripción). Conversación para cambios. |

Cada vídeo y carrusel lleva un **cronómetro** (cuánto tardó de principio a fin). Abajo a la izquierda eliges
**Rápido** (por defecto) o **Máx. calidad** para Claude.

## Instalar en otro ordenador

Requisitos: Windows 10/11, conexión a internet, una cuenta de Claude con suscripción (Pro o Max) y ~5 GB libres.

1. Descarga el proyecto:
   ```powershell
   git clone <URL-del-repositorio> "marc edits"
   ```
   (o descarga el ZIP desde GitHub y descomprímelo). Ponlo en una ruta fija, por ejemplo el Escritorio: la app
   guarda la ruta de esta carpeta.
2. Dentro de la carpeta, doble clic en **`INSTALAR.bat`**
   (o `powershell -ExecutionPolicy Bypass -File .\instalar.ps1`). Instala ffmpeg, Node.js, Python, yt-dlp, Git,
   Claude Code, Whisper, el entorno de la skill de edición y compila e instala la app. Tarda 10-20 minutos la primera
   vez. Si algún paso pide reiniciar la consola, ciérrala y vuelve a ejecutar el script: solo instala lo que falta.
3. Inicia sesión en Claude: `claude auth login --claudeai` (o el botón «Iniciar sesión en Claude» de la app).
4. Abre **Marc Edits** desde el acceso directo del escritorio.

Si la app pregunta por la carpeta del proyecto, elige esta carpeta (la que contiene `library`).

## Demostración rápida (5 minutos)

1. **Vídeos editados** → abre «Pack de embutido ibérico · Reel PRO»: el reel terminado (música, transiciones, stickers,
   palabras detrás de la cabeza).
2. **Editor** → abre ese mismo reel: mueve un texto en el visor, cambia el volumen de la música, añade un sticker
   y pulsa **Exportar vídeo** (la versión anterior queda en *Versiones*).
3. **Vídeos editados** → un vídeo → *Conversación*: pídele a Claude «subtítulos más grandes» y mira cómo lo cambia.
4. **Editar vídeo** → arrastra dos vídeos, elige la referencia «Milloneti o Albañil» y revisa el prompt final
   (enviarlo hace la edición real: unos 10-20 minutos según la duración).

## Estructura

```
app/                 App Electron + React + Tailwind (npm start = compilar y abrir; npm run dist = instalador)
engine/edit.py       Motor rápido (Whisper → cortes → zooms → subtítulos)
engine/timeline.py   Render desde timeline.json (editor manual y Claude): varios vídeos, B-roll, mezcla -14 LUFS
engine/TIMELINE.md   Formato de timeline.json
engine/prep.py       Análisis previo sin Claude (transcripción rápida, silencios, hojas de fotogramas)
engine/carousel.py   Carruseles: HTML → PNG 1080x1920 (Edge/Chrome), descarga de referencias (gallery-dl)
library/carousels/   Carruseles hechos · library/carousel-refs/ referencias · library/tools/carruseles/ formatos
docs/SPEC.md         Spec pendiente de aprobado (cuentas, suscripciones, servidor propio)
library/edited/      Vídeos editados (final.mp4, thumb.jpg, meta.json, timeline.json, chat.json, prompt.txt)
library/references/  Referencias (vídeo, análisis)
library/scripts/     Guiones
library/tools/       Herramientas: recetas de subtítulos, transiciones, canciones, sonidos, efectos, tendencias
inputs/              Copias de los vídeos originales (el original nunca se toca)
work/reels/          Proyectos de la skill video-edit (build.py, cortes, recorte de la persona)
.claude/skills/      Skill video-edit (adaptada a español) y skills generadas desde referencias
CLAUDE.md            Instrucciones que lee Claude en cada edición
docs/CONTEXTO.md     Historia del proyecto, decisiones y preferencias del cliente
```

## Lo que NO está en el repositorio (y se regenera solo)

- `app/node_modules`, el entorno de Python de la skill y el instalador `.exe` → los crea `instalar.ps1`.
- Versiones anteriores de cada vídeo y cachés del editor → se vuelven a generar al editar o exportar.
- Los 6 efectos de sonido de la skill (Pixabay: su licencia no permite redistribuirlos) → `instalar.ps1` los
  descarga y los copia a `library/tools/sonidos/`.

## Licencias de la música

Las canciones de `library/tools/canciones/` son de Jamendo con licencia **CC BY 3.0**: el crédito (está en su
`.meta.json`) va en la descripción de TikTok. Las canciones en tendencia de TikTok tienen copyright: la app solo las
lista y se añaden desde TikTok al publicar.
