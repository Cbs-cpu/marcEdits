---
name: tiktok-hooks
description: Gancho de los 3 primeros segundos, retención y descripción de TikTok para los vídeos y carruseles de Marc Edits (en español). Úsala al editar un vídeo nuevo, al rehacer el principio de uno ya editado o al escribir su descripción y hashtags.
---

# Gancho, retención y descripción (TikTok)

Adaptado de `sergebulaev/tiktok-skills` (MIT, ver LICENSE): solo el conocimiento, sin su código de publicación
(Publora/Apify). En la app no hay aprobaciones intermedias: decide tú y aplícalo.

## Por qué importa
TikTok reparte por **tasa de finalización**: un vídeo de 20 s visto entero gana a uno de 90 s visto a medias.
Deslizar antes de 2 s es la peor señal. Después pesan: volver a verlo (bucle), compartir, guardar y comentar.
Detalle: `references/algorithm-heuristics.md`.

## En la edición (vídeo con la voz del usuario)
No inventas lo que dice: trabajas con su toma. Lo que sí controlas:
1. **Primer fotograma = resultado o tensión.** Empieza en la frase más fuerte del gancho; nada de «hola»,
   respiraciones, logos ni zoom lento antes de la primera palabra. Si el mejor gancho está más adelante en la toma
   y el sentido lo permite, puedes abrir con él (formato T1 «resultado primero» o T8 «en mitad de la historia»).
2. **Texto de gancho en pantalla (0-3 s), 3-7 palabras, DISTINTO de lo que se dice** (mucha gente lo ve sin sonido):
   la promesa o la pregunta del vídeo, con un número concreto si el vídeo lo dice. Nunca inventes cifras.
   Fórmulas (T1-T10) con ejemplos en `references/hook-formulas.md`; anatomía y tiempos en
   `references/hook-anatomy.md`.
3. **Sin tramos muertos:** si la atención puede caer (>3-4 s sin cambio), punch-in, cambio de plano, B-roll o texto.
4. **Bucle:** que el último fotograma enlace con el primero (corta en seco tras la última palabra, sin colas ni
   «chao»), para que al volver a empezar parezca continuo.
5. **Duración:** la más corta que cuente la idea entera; no rellenes.

## Descripción (caption.txt)
- Primera línea con un motivo para leer o una pregunta concreta sobre el vídeo (no repite el gancho).
- Corta (1-3 líneas). 3-5 hashtags al final: 1 amplio, 1-2 del nicho, 1-2 del vídeo. Nunca 10+.
- Si es TikTok Shop o publicidad: recuerda marcar «contenido comercial» al publicar.
- Español natural de España, sin muletillas de IA («sin duda», «descubre», «increíble», «en este vídeo…»).
- Debajo, en una línea aparte: `Sonido: <canción en tendencia de library/tools/tendencias.json que encaje>`
  (solo el nombre; se añade desde TikTok).

## Nunca
«Hola chicos» / «en este vídeo» al principio · intro con logo · leer la descripción como gancho · prometer algo que
el vídeo no enseña · cebos de interacción («comenta SÍ») · inventar números, reseñas o resultados.
