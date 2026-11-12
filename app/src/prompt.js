// Construye el prompt EXACTO que se envía a Claude a partir de lo elegido paso a paso.
// Lo que devuelve esta función es lo que el usuario ve (y puede retocar) en la revisión final.

// Mezcla de sonido: va SIEMPRE en el prompt (edición nueva y cambios)
const CHOOSE = "Lo que mejor funcione para este vídeo según el estilo, las referencias analizadas (library/references/*/analysis.md, .claude/skills/ref-*/) y los vídeos ya editados que gustan (work/reels/embutido/build.py).";

export const MIX = `- La voz manda: es lo que más se oye y siempre se entiende.
- Música de fondo con ducking: baja sola cuando se habla (ffmpeg sidechaincompress con la voz como sidechain: threshold 0.02-0.05, ratio 6-10, attack 20 ms, release 300-400 ms) y sube un poco en los huecos sin voz. Antes del ducking, la música ya va 15-20 dB por debajo de la voz. Fade-in 0.5 s y fade-out 0.8-1 s al final.
- Efectos de sonido cortos y por debajo de la voz (unos -8 a -12 dB respecto a ella), alineados al fotograma del corte o de la palabra; nunca dos a la vez encima de una frase.
- Si la voz tiene ruido de fondo o reverberación, límpiala con suavidad (highpass 80 Hz, afftdn suave) sin que suene robótica.
- Master final para TikTok: loudnorm a -14 LUFS integrados, true peak -1.5 dBTP, AAC 192 kbps 48 kHz. Comprueba con ebur128/volumedetect que no hay picos que saturen ni saltos de volumen entre cortes.
- Escucha (analiza) las uniones: sin clics (micro-fades de 10-30 ms) ni cambios bruscos de ruido de fondo entre planos.`;

export const RULES = `REGLAS DE EJECUCIÓN
- Trabaja todo en primer plano y en este mismo turno: nunca uses run_in_background, Monitor, ScheduleWakeup ni tareas programadas. Los comandos largos (cutout, render) ejecútalos en primer plano con timeout alto (hasta 1800000 ms). No termines hasta que el vídeo final exista.
- No hay nadie para responder preguntas: decide tú y sigue hasta el final.`;

// Canción en tendencia de TikTok: tiene copyright, así que NO va dentro del vídeo; se añade desde TikTok al publicar
export const trendMusic = (song) => `- Canción en tendencia de TikTok: «${song.title}» de ${song.artist}. NO la metas en el vídeo (tiene copyright; el usuario la añadirá desde la biblioteca de sonidos de TikTok al publicar, para que cuente en la tendencia y no silencien el vídeo).
- Entrega el vídeo SIN música de fondo, con la voz limpia y el máster a -14 LUFS, para que la canción de TikTok se pueda poner por debajo.
- En tu resumen final recuerda: «Al subirlo, añade el sonido "${song.title}" de ${song.artist} en TikTok, con su volumen al 10-20 %».`;

// Contexto que va delante del PRIMER mensaje de la conversación de un vídeo (se ve en la conversación)
export function buildChatContext(item) {
  const dir = item.dir;
  return `Eres el editor de vídeo de la app "Marc Edits". Vamos a tener una conversación sobre un vídeo de TikTok que ya está editado: el usuario te irá pidiendo cambios y preguntas, mensaje a mensaje.

VÍDEO
- Título: ${item.title}
- Carpeta: ${dir}
- Vídeo actual: ${dir}/final.mp4 (antes de cada mensaje la app guarda la versión actual en ${dir}/versions/; no hace falta que la copies)
- Vídeo original sin editar: ${item.source || 'ver meta.json'}
${item.project ? `- Proyecto de trabajo (build, EDL, subtítulos): ${item.project}` : '- Proyecto de trabajo: búscalo en meta.json o en work/reels/; si no existe, trabaja sobre final.mp4 y el original.'}
- Prompt con el que se editó: ${item.prompt ? `${dir}/prompt.txt` : 'no guardado'}
- Herramientas del usuario: library/tools/{transiciones,canciones,sonidos,efectos} (cada archivo puede tener notas en <archivo>.meta.json) y estilos de subtítulos en library/tools/recipes/.

CÓMO TRABAJAR EN ESTA CONVERSACIÓN
- Responde siempre en español, corto y claro: qué has hecho o qué propones.
- Si el mensaje es una pregunta o una duda, contesta sin tocar el vídeo. Si pide un cambio, hazlo.
- Haz los cambios en el proyecto de trabajo (build.py / EDL / receta) y vuelve a renderizar desde el material limpio; si no hay proyecto, rehaz desde el original o, para algo pequeño, trabaja sobre final.mp4.
- Cambia SOLO lo que se pide; lo demás queda igual.
- Si existe ${dir}/timeline.json (el editor manual de la app), ES la fuente de verdad: haz los cambios en ese JSON (formato en engine/TIMELINE.md) y renderiza con «python engine/timeline.py render ${item.id}»; luego copia ${dir}/editor/render.mp4 a ${dir}/final.mp4. Así el editor manual y tú trabajáis sobre lo mismo.
- Si te piden la descripción, los hashtags o un gancho mejor, sigue .claude/skills/tiktok-hooks/SKILL.md y guarda la descripción en ${dir}/caption.txt.
- Cuando cambies el vídeo: sustituye ${dir}/final.mp4, regenera ${dir}/thumb.jpg (ffmpeg -ss 1, scale=540:-1) y ${dir}/final-movil.mp4 (720p), actualiza meta.json (duration_out, cuts, transcript, project) y comprueba el render (fotogramas de los cortes y transcripción).
- Subtítulos: dicen exactamente lo que se dice, con tildes y nombres bien escritos. Si el usuario te da el texto corregido, respétalo palabra por palabra y mantén los tiempos.
- Canciones en tendencia de TikTok (copyright): nunca las metas en el vídeo; se añaden desde TikTok al publicar.

MEZCLA DE SONIDO
${MIX}

${RULES}`;
}

// Cambios rápidos típicos sobre un vídeo ya editado (se añaden al prompt como viñetas)
export const CHANGE_CHIPS = [
  'Subtítulos más grandes',
  'Subtítulos más pequeños',
  'Quita los subtítulos de palabras detrás de la cabeza',
  'Música más baja',
  'Música más alta',
  'Quita la música',
  'Menos efectos de sonido',
  'Más zoom / punch-ins en los cortes',
  'Ritmo más rápido: corta más las pausas',
  'Corrige un error en los subtítulos (explícalo abajo)',
  'Cambia la canción (dime cuál abajo)',
  'Quita la última frase',
  'Gancho más fuerte en los 3 primeros segundos',
  'Escribe la descripción y los hashtags para TikTok',
];

// Prompt para cambiar un vídeo que ya está editado. Lo que devuelve es lo que se envía, tal cual.
export function buildRevisionPrompt({ item, chips, request, song }) {
  const dir = item.dir;
  const asks = [...chips.map((c) => `- ${c}`)];
  if (request?.trim()) asks.push(`- ${request.trim()}`);
  return `Eres el editor de vídeo de la app "Marc Edits". Hay que hacer CAMBIOS en un vídeo de TikTok que ya está editado.

VÍDEO
- Título: ${item.title}
- Carpeta: ${dir}
- Vídeo actual: ${dir}/final.mp4 (la versión anterior ya está guardada en ${dir}/versions/, no hace falta copiarla)
- Vídeo original sin editar: ${item.source || 'ver meta.json'}
${item.project ? `- Proyecto de trabajo (build, EDL, subtítulos): ${item.project}` : '- Proyecto de trabajo: búscalo en meta.json o en work/reels/; si no existe, trabaja sobre final.mp4 y el original.'}
- Prompt con el que se editó: ${item.prompt ? `${dir}/prompt.txt` : 'no guardado'}

CAMBIOS QUE PIDE EL USUARIO
${asks.join('\n') || '- (ninguno)'}
${song ? `
CANCIÓN NUEVA
- ${song.name} → ${song.path}${song.notes ? `
  Notas: ${song.notes}` : ''}
` : ''}
CÓMO HACERLO
- Si existe el proyecto de trabajo, haz el cambio ahí (build.py / EDL / receta) y vuelve a renderizar desde el material limpio, para no recomprimir el vídeo final una y otra vez. Si no existe, rehaz desde el original o, si es un cambio pequeño, trabaja sobre final.mp4.
- Cambia SOLO lo que se pide; todo lo demás debe quedar igual que en la versión actual.
- Sustituye ${dir}/final.mp4 por el resultado, regenera ${dir}/thumb.jpg (ffmpeg -ss 1, scale=540:-1) y ${dir}/final-movil.mp4 (720p), y actualiza meta.json (duration_out, cuts, transcript si cambia y project).
- Comprueba el render final (fotogramas de los cortes y transcripción) antes de terminar.
- Termina con un resumen de 1-2 líneas de lo que has cambiado.

MEZCLA DE SONIDO
${MIX}

${RULES}`;
}

export const SUGGESTIONS = [
  { id: 'silencios', text: 'Quita los silencios y las pausas muertas, con cortes limpios (confírmalos con silencedetect -40 dB / 0.08 s).', on: true },
  { id: 'tomas', text: 'Quita las tomas falsas, las repeticiones y las palabras que sobran cuando se equivoca; deja solo la toma buena de cada frase.', on: true },
  { id: 'transcripcion', text: 'Transcripción perfecta: revisa cada palabra, tildes, números y nombres de marca; los subtítulos dicen exactamente lo que se dice.', on: true },
  { id: 'hook', text: 'Que el gancho entre en los 2 primeros segundos, sin nada de relleno al principio.' },
  { id: 'max30', text: 'Duración máxima 30 segundos.' },
  { id: 'rapido', text: 'Ritmo rápido: un cambio de plano o punch-in cada 2-3 segundos.' },
  { id: 'grandes', text: 'Subtítulos más grandes de lo normal.' },
  { id: 'amarillo', text: 'Las palabras clave y los números, en grande y en amarillo.' },
  { id: 'sincabeza', text: 'Sin palabras detrás de la cabeza.' },
  { id: 'sinsfx', text: 'Sin efectos de sonido.' },
  { id: 'sinemojis', text: 'Sin emojis ni stickers: look limpio, solo el vídeo.' },
  { id: 'degradado', text: 'Degradado negro suave arriba y abajo con una viñeta ligera, para que se vea más cinematográfico (en timeline.json: "look": "bold" con "grade" activo). Ningún efecto más.' },
];

const list = (items, empty) =>
  items.length ? items.map((t) => `- ${t.name} → ${t.path}${t.notes ? `\n  Notas: ${t.notes}` : ''}`).join('\n') : empty;

const fmtS = (d) => (d >= 60 ? `${Math.floor(d / 60)} min ${Math.round(d % 60)} s` : `${Math.round(d * 10) / 10} s`);
export const ROLES = { principal: 'Principal (habla a cámara / voz)', broll: 'B-roll / recurso', libre: 'Que decida Claude' };
export const LENGTHS = {
  corto: 'Duración final de 15 a 35 segundos: quédate solo con lo mejor.',
  medio: 'Duración final de 35 a 60 segundos.',
  largo: 'Duración final de 1 a 3 minutos.',
  todo: 'Mantén todo el contenido: solo limpia (silencios, tomas falsas, repeticiones) y edita.',
};

// Bloque de vídeos de entrada: uno, varios o largos
function videosBlock({ inputs, input, title, id, mode, length }) {
  const list = inputs?.length ? inputs : [{ path: input, role: 'principal' }];
  const total = list.reduce((a, v) => a + (v.dur || 0), 0);
  const long = list.some((v) => (v.dur || 0) > 180) || total > 300;
  const line = (v, i) => `${i + 1}. ${v.path} · ${ROLES[v.role] || v.role}${v.dur ? ` · ${fmtS(v.dur)}` : ''}${v.w ? ` · ${v.w}x${v.h}${v.w > v.h ? ' (horizontal)' : ''}` : ''}${v.audio === false ? ' · sin audio' : ''}${v.note ? `\n   Qué hay: ${v.note}` : ''}`;
  const head = list.length === 1
    ? `VÍDEO\n- Entrada: ${list[0].path}${list[0].dur ? ` (${fmtS(list[0].dur)})` : ''}\n- Título: ${title}\n- ID de salida: ${id}`
    : `VÍDEOS (${list.length}, ${fmtS(total)} en total)\n${list.map(line).join('\n')}\n- Título: ${title}\n- ID de salida: ${id}`;
  const out = [head];
  if (list.length > 1) {
    out.push(`
MONTAJE CON VARIOS VÍDEOS
- ${mode === 'libre' ? 'Decide tú el orden y qué partes usar de cada vídeo para contar la historia mejor (gancho fuerte al principio).' : 'Júntalos en el orden de la lista; dentro de cada uno quédate con lo bueno.'}
- Analiza TODOS con lo que ya hay en prep.json (transcripción por vídeo y hoja de fotogramas de cada uno, también de los que no tienen voz) para saber qué hay en cada uno.
- Los vídeos «Principal» llevan la voz y el hilo. Los «B-roll» van ENCIMA de la voz para ilustrar lo que se dice (pista "broll" de timeline.json, la voz sigue debajo) o como planos propios sin su audio ("mute": true). Si es «Que decida Claude», elige tú.
- Material horizontal (pantallas, vídeos apaisados): "fit": "blur" para que se vea entero sobre fondo desenfocado, o recorta con zoom/cx/cy si el sujeto cabe en 9:16.
- Iguala el sonido entre vídeos ("gain_db" por plano) para que no haya saltos de volumen, y que las uniones entre vídeos tengan transición o corte en un golpe de voz.
- En timeline.json "source" es el primer vídeo principal y cada plano de otro vídeo lleva "src" (formato en engine/TIMELINE.md, sección v3).`);
  }
  if (long || length) {
    out.push(`
VÍDEO LARGO
- ${LENGTHS[length] || LENGTHS.corto}
${long ? `- La transcripción completa ya está en prep.json (si faltara, transcribe por bloques de 5 min, cada uno en un comando aparte, y suma el desfase de cada bloque).
- Haz primero un mapa del contenido (temas con sus tiempos) y elige los fragmentos con más gancho antes de cortar fino.
- Los planos de timeline.json pueden apuntar a cualquier segundo del original ("in"/"out"); solo se renderiza lo elegido.` : ''}`.trimEnd());
  }
  return out.join('\n');
}

// Análisis previo que hace la app ANTES de llamar a Claude (engine/prep.py, sin gastar Claude)
function prepBlock({ id, isSkill, multi }) {
  const w = `library/edited/${id}/work`;
  return `
ANÁLISIS PREVIO (ya hecho por la app antes de llamarte; NO lo repitas)
- ${w}/prep.json: por cada vídeo, duración, tamaño, fps, palabras con tiempos (Whisper large-v3-turbo, español), frases, silencios (silencedetect -40 dB / 0.08 s) y hoja de fotogramas (${w}/sheet_N.jpg, mírala para saber qué hay en el vídeo).
- Transcripción en formato whisper por vídeo: el campo "transcript" de cada entrada de prep.json (sirve tal cual para engine/edit.py --transcript).${isSkill ? `
- La ingesta de la skill video-edit YA está hecha en work/reels/${id}/ (sources.json, words_cN.json, transcript.txt, work/sheets.jpg): NO ejecutes ingest.py; sigue desde el paso siguiente de la skill.` : ''}
- Si prep.json no existe (el análisis falló), haz tú la transcripción como diga el estilo.
- Revisa la transcripción con criterio (nombres de marca, números, tildes) en vez de volver a transcribir.

VELOCIDAD (el usuario cronometra cada edición)
- Ve directo: lee solo lo que necesitas, no repitas análisis ni renders de prueba completos; comprueba cortes con fotogramas sueltos y renderiza el vídeo final una vez (como mucho una corrección).
- Encadena comandos en un mismo Bash cuando no dependan de mirar el resultado.`;
}

// Bloque de la referencia «quiero que quede así»
function referenceBlock(ref) {
  if (!ref) return '';
  const skill = `.claude/skills/ref-${ref.id}/SKILL.md`;
  if (ref.skill) {
    return `
REFERENCIA: CÓMO TIENE QUE QUEDAR
- El usuario quiere que el vídeo se parezca a la referencia «${ref.title}» (${ref.video}).
- Ya está analizada: lee entera la skill ${skill} (y ${ref.dir}/analysis.md) y SÍGUELA: estructura del montaje, ritmo de cortes, subtítulos, textos, B-roll, transiciones, música y sonidos. Tiene prioridad sobre el estilo base en todo lo que defina.
- Antes de entregar, compara fotogramas de tu render con los de la referencia y ajusta lo que no se parezca.`;
  }
  return `
REFERENCIA: CÓMO TIENE QUE QUEDAR
- El usuario quiere que el vídeo se parezca a la referencia «${ref.title}» (${ref.video}).
${ref.analyse ? `- PASO 0, ANTES DE EDITAR: analiza la referencia y guárdala como skill para reutilizarla:
${(ref.skillPrompt || '').replace(/^[\s\S]*?Analiza la referencia a fondo:\n/, '').replace(/\nPor último[\s\S]*$/, `\nBorra ${ref.dir}/frames al terminar el análisis.`).split('\n').map((l) => `  ${l}`).join('\n')}
- Después edita el vídeo siguiendo esa skill (${skill}): estructura del montaje, ritmo, subtítulos, textos, B-roll, transiciones, música y sonidos. Tiene prioridad sobre el estilo base en todo lo que defina.`
    : `- Analízala antes de editar (ffprobe, cortes con select='gt(scene,0.25)', fotogramas cada 1-2 s, transcripción) y copia su estructura de montaje, ritmo, subtítulos, textos, B-roll, transiciones y sonido. Tiene prioridad sobre el estilo base en todo lo que defina.`}
- Antes de entregar, compara fotogramas de tu render con los de la referencia y ajusta lo que no se parezca.`;
}

export function buildPrompt(s) {
  const { id, input, inputs, mode, length, reference, title, recipe, captions, transitions, song, songVolume, sounds, effects, suggestions, extra } = s;
  const multi = (inputs?.length || 1) > 1;
  const r = recipe.data || {};
  const isSkill = !!r.skill;
  const refSkill = recipe.id.startsWith('ref-') ? `.claude/skills/${recipe.id}/SKILL.md` : null;

  const style = isSkill
    ? `Usa la skill "${r.skill}" (.claude/skills/${r.skill}/SKILL.md): léela entera, con sus references, y síguela.
- Look: ${r.look || 'el defaultLook de su config.json'}.
- Carpeta de proyecto de la skill: work/reels/${id}
- Referencia de cómo debe quedar: work/reels/embutido/build.py (vídeo del embutido ibérico, que al usuario le encanta).
- Audio en ESPAÑOL: sus scripts de transcripción ya usan Whisper large-v3 con language=es. Nunca uses modelos ".en".${multi ? '\n- Varios vídeos: pásaselos todos a la ingesta de la skill (admite varios clips) o usa su análisis por vídeo y monta en timeline.json con "src" por plano.' : ''}`
    : multi
    ? `Estilo «${recipe.name}» → receta library/tools/recipes/${recipe.id}.json (toma de ahí subtítulos, zooms y ritmo)${refSkill ? `\nSkill del estilo (léela entera y síguela): ${refSkill}` : ''}
Con varios vídeos no uses engine/edit.py (solo admite uno): usa las transcripciones y silencios de prep.json, decide los cortes con la energía alrededor de cada corte y escribe directamente timeline.json.`
    : `Estilo «${recipe.name}» → receta library/tools/recipes/${recipe.id}.json${refSkill ? `\nSkill del estilo (léela entera y síguela): ${refSkill}` : ''}
Proceso:
1. La transcripción ya está hecha (ver ANÁLISIS PREVIO): revísala y prepara un JSON de correcciones {"palabra_mal_en_minusculas":"Palabra bien"}.
2. python engine/edit.py --input "${input}" --recipe library/tools/recipes/${recipe.id}.json --id ${id} --title "${title}" --transcript <el "transcript" de prep.json> --corrections '<json>'
3. Lo que el motor no haga (música, sonidos, efectos, transiciones especiales) añádelo después con ffmpeg sobre ese resultado.`;

  const cap = captions?.id === 'none'
    ? 'SIN SUBTÍTULOS: el usuario no quiere subtítulos. No pongas subtítulos ni palabras de lo que se dice en pantalla (en timeline.json, sin pista de subtítulos ni palabras detrás de la cabeza). Los textos de gancho o stickers solo si el estilo los pide y aportan.'
    : captions && captions.id !== recipe.id
    ? `Usa el estilo de subtítulos «${captions.name}» (library/tools/recipes/${captions.id}.json → "captions"${captions.data.captions_notes ? `; notas: ${captions.data.captions_notes}` : ''}).`
    : `Los del estilo elegido${r.captions_notes ? `: ${r.captions_notes}` : '.'}`;

  const vol = { muy_suave: 'muy suave (unos -24 dB por debajo de la voz)', suave: 'suave (unos -18 dB por debajo de la voz)', media: 'media (unos -12 dB por debajo de la voz)' }[songVolume] || 'suave';

  const tips = SUGGESTIONS.filter((x) => suggestions.includes(x.id)).map((x) => `- ${x.text}`);
  if (extra?.trim()) tips.push(`- ${extra.trim()}`);

  return `Eres el editor de vídeo de la app "Marc Edits". ${multi ? 'Monta estos vídeos en un único vídeo vertical (9:16) para TikTok.' : 'Edita este vídeo vertical (9:16) para TikTok.'}

${videosBlock({ inputs, input, title, id, mode, length })}
${prepBlock({ id, isSkill, multi })}
${referenceBlock(reference)}

ESTILO${reference ? ' BASE' : ''}
${style}

SUBTÍTULOS
${cap}

TRANSICIONES
${list(transitions, 'Elígelas tú (library/tools/transiciones/, lee sus notas). ' + CHOOSE)}

MÚSICA DE FONDO
${song?.trend ? trendMusic(song) : song ? `- ${song.name} → ${song.path}${song.notes ? `\n  Notas: ${song.notes}` : ''}\n- Volumen ${vol}, fade-in y fade-out de 0.5 s. Nunca debe tapar la voz.` : 'Sin música.'}

SONIDOS
${suggestions.includes('sinsfx') ? 'Ninguno.' : 'Elígelos tú de library/tools/sonidos/ (cada uno tiene notas en <archivo>.meta.json): ' + CHOOSE + ' Pocos, bien colocados en cortes y palabras clave, siempre sutiles y por debajo de la voz.'}

EFECTOS
${list(effects, 'Elígelos tú (library/tools/efectos/, lee sus notas). ' + CHOOSE)}

INDICACIONES
${tips.length ? tips.join('\n') : '- Ninguna extra.'}

CORTES (la prioridad del cliente)
- Sigue .claude/skills/cut-video/SKILL.md: umbral de silencio relativo al ruido de fondo, muletillas y tomas falsas fuera (te quedas con la última toma buena) y comprobación de CADA unión re-transcribiendo una ventana aislada. No entregues hasta que el escaneo de repeticiones salga limpio.

GANCHO Y RETENCIÓN (skill tiktok-hooks: .claude/skills/tiktok-hooks/SKILL.md, léela)
- Primer fotograma = la frase más fuerte o la tensión: nada de saludos, respiraciones ni intro antes de la primera palabra.
- Texto de gancho en pantalla en los 0-3 s (salvo que el usuario pida no poner textos): 3-7 palabras, DISTINTO de lo que se dice (se ve sin sonido); elige la fórmula de references/hook-formulas.md que mejor encaje. Nunca inventes cifras.
- Las indicaciones del usuario mandan sobre estas reglas generales.
- Sin tramos muertos de más de 3-4 s sin cambio visual (punch-in, B-roll, texto) y final en seco tras la última palabra para que el bucle enganche.

ENTREGA
- El vídeo final va en library/edited/${id}/final.mp4 (1080x1920, 30 fps) y una copia para móvil en library/edited/${id}/final-movil.mp4 (720p).
- Miniatura: library/edited/${id}/thumb.jpg (ffmpeg -ss 1, scale=540:-1).
- library/edited/${id}/meta.json con: id, title, source, recipe ("${recipe.name}"), duration_in, duration_out, cuts (número de planos), created (ISO), transcript (texto final)${multi ? ', sources (la lista de vídeos de entrada)' : ''}${reference ? `, reference ("${reference.id}")` : ''} y project (la carpeta de trabajo con el build/EDL para poder hacer cambios después, p. ej. work/reels/${id}).
- Descripción para TikTok en library/edited/${id}/caption.txt (reglas de la skill tiktok-hooks: 1-3 líneas, 3-5 hashtags al final y una línea «Sonido: …» con una canción de library/tools/tendencias.json que encaje).
- Guion limpio en library/scripts/${id}.md ("# ${title}" y luego hook / desarrollo / CTA).
- Render final con el motor de la app (así el editor manual lo abre entero y se puede retocar): escribe library/edited/${id}/timeline.json (formato en engine/TIMELINE.md: planos, textos, stickers, efectos, música, sonidos y, si hay recorte de la persona, cutout con su sig) y ejecuta «python engine/timeline.py render ${id}»; copia library/edited/${id}/editor/render.mp4 a final.mp4. Ejemplo de reel terminado: library/edited/embutido-reel-pro-2026-11-09/timeline.json. Si usas la skill video-edit, aprovecha su análisis, sus cortes y su recorte (subject.webm), pero el resultado final sale de timeline.json.
- Antes de entregar, comprueba el render final: fotogramas de cada corte y una transcripción del vídeo final para confirmar que no sobra ni falta ninguna palabra.
- Termina con un resumen de 2-3 líneas: qué has cortado y qué palabras sobrantes has quitado.

MEZCLA DE SONIDO
${MIX}

${RULES}`;
}
