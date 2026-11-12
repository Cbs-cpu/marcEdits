# Spec · Marc Edits (pendiente de aprobación)

Estado: **BORRADOR**. Nada de lo marcado como «Futuro» se implementa hasta que el cliente dé el aprobado.
Lo marcado como «Hecho en 0.6» ya está en la app.

---

## 1. Cuentas y suscripciones de pago (Futuro · NO implementar sin aprobado)

### Objetivo
Vender Marc Edits como producto: cada usuario tiene una cuenta, un plan de pago y unos límites de uso. La edición
sigue ocurriendo en el PC del usuario con **su** Claude Code (su suscripción de Claude), así que nuestro coste por
edición es casi cero; lo que se cobra es la app, las plantillas, las skills y las actualizaciones.

### Piezas
| Pieza | Propuesta | Por qué |
|---|---|---|
| Autenticación | Supabase Auth (email + contraseña, enlace mágico, Google) | Gratis hasta muchos usuarios, SDK JS, funciona en Electron con deep link `marcedits://auth` |
| Pagos | Stripe Checkout + Customer Portal (suscripción mensual / anual) | Sin formularios de tarjeta propios; IVA europeo con Stripe Tax |
| Estado de la suscripción | Webhook de Stripe → tabla `subscriptions` en Supabase | La app solo lee «plan + fecha de fin», nunca toca pagos |
| Licencia offline | JWT firmado de 7 días guardado en `userData/license.json` | Se puede editar sin internet unos días; se renueva al abrir |
| Actualizaciones | electron-updater con GitHub Releases privadas (o R2) | Cada versión llega sola; el instalador ya existe (`npm run dist`) |

### Planes (a validar con el cliente)
| Plan | Precio orientativo | Incluye |
|---|---|---|
| Prueba | 0 € · 7 días | 5 vídeos + 5 carruseles, marca de agua pequeña en carruseles |
| Creador | 19 €/mes | Vídeos y carruseles ilimitados, referencias, skills, editor manual |
| Pro / Agencia | 49 €/mes | Varias marcas (espacios de trabajo), plantillas premium, prioridad en soporte |

El límite real lo pone la suscripción de Claude de cada usuario (Pro o Max). La app avisa si no hay sesión.

### Modelo de datos (Supabase)
```
profiles(id uuid pk = auth.users.id, name, created_at)
subscriptions(user_id fk, stripe_customer, stripe_sub, plan, status, current_period_end)
usage(user_id fk, kind 'video'|'carrusel', created_at, seconds)   -- solo contadores, nunca el contenido
devices(user_id fk, device_id, last_seen)                          -- máx. 2 PCs por cuenta
```
RLS: cada usuario solo lee sus filas. El contenido (vídeos, carruseles, referencias) **nunca sale del PC**.

### Flujo en la app
1. Al abrir: si no hay licencia válida → pantalla «Inicia sesión» (email / Google).
2. Sin plan activo → pantalla de planes → Stripe Checkout en el navegador → vuelve por deep link.
3. Con plan: la app funciona como hoy. Menú de cuenta abajo a la izquierda: plan, uso del mes, «Gestionar
   suscripción» (Customer Portal), cerrar sesión.
4. Cada edición terminada suma una fila en `usage` (para el plan de prueba y estadísticas).

### Procesado en servidor propio (Futuro, va con las cuentas)
Claude ya trabaja en la nube de Anthropic; lo que gasta CPU/RAM del PC es Whisper, el recorte de la persona
(cutout) y el render. Propuesta por fases:
1. **Transcripción en servidor** (la más rentable): la app sube solo el audio (16 kHz mono, ~1 MB/min) a
   `POST /v1/audio/transcriptions` (API compatible OpenAI, `timestamp_granularities=word`), servido por
   faster-whisper en una GPU (p. ej. speaches / faster-whisper-server en RunPod Serverless o Modal, se paga por
   segundo). Respuesta en 2-3 s por vídeo. **Ya preparado en 0.6**: `engine/prep.py` usa el servidor si existe
   `MARC_WHISPER_URL` (+ `MARC_WHISPER_KEY`) y si falla vuelve al PC.
2. **Cutout y render en servidor** (opcional, plan Pro): subir los vídeos (50-200 MB) a almacenamiento temporal
   (R2/S3, borrado a las 24 h), cola de trabajos y GPU. Solo compensa en PCs lentos.
- Autenticación del servidor con el JWT de la cuenta; límites por plan en la tabla `usage`.
- Privacidad: el audio/vídeo se borra al terminar; avisarlo en la política de privacidad.

### Riesgos / decisiones abiertas
- ¿Se permite usar la app sin internet? (propuesta: sí, 7 días con la licencia guardada).
- ¿Cuántos PCs por cuenta? (propuesta: 2).
- Textos legales: términos, privacidad, RGPD (los vídeos no se suben a ningún servidor nuestro).
- Las skills de terceros (p. ej. `video-edit` de @tenfoldmarc) necesitan permiso de su autor para redistribuirse
  dentro de un producto de pago.

---

## 2. Inicio con dos pestañas: Vídeos y Carruseles (Hecho en 0.6)
Arriba del menú lateral hay un selector **Vídeos | Carruseles**. Cada modo tiene su botón principal
(«Editar vídeo» / «Crear carrusel») y sus secciones. La app recuerda el último modo.

## 3. Carruseles para TikTok Shop (Hecho en 0.6)
- Biblioteca: `library/carousels/<id>/` → `carousel.json`, `slides/NN.html` + `slides/NN.png` (1080x1920),
  `thumb.jpg`, `meta.json`, `prompt.txt`, `chat.json`, `assets/` (fotos del producto).
- Referencias: `library/carousel-refs/<id>/` → imágenes `NN.jpg`, `meta.json`, `analysis.md` y, si se analiza,
  `.claude/skills/carrusel-<id>/SKILL.md` (como las referencias de vídeo).
- Formatos en tendencia (plantillas): `library/tools/carruseles/formatos.json`.
- Render: `python engine/carousel.py render <id>` (HTML → PNG con Edge/Chrome sin ventana).
- Skill del proyecto: `.claude/skills/tiktok-carousel/SKILL.md`.
- Clonar un carrusel: referencia (enlace o capturas) → «Clonar» → mismo formato, ritmo y diseño con tu producto.

## 4. Velocidad, cronómetro y memoria (Hecho en 0.6)
- Cronómetro por vídeo y carrusel: `meta.timing = { started, finished, seconds, steps: { analisis, claude } }`.
  Se ve en vivo en el panel de tareas y en cada tarjeta.
- Análisis previo sin Claude (`engine/prep.py`): transcripción con faster-whisper (modelo según el PC: GPU si hay
  CUDA, `large-v3-turbo` int8 en CPU, `small` en PCs con poca RAM), silencios, hoja de fotogramas. Claude ya no
  transcribe: lee `work/prep.json`.
- Nivel de esfuerzo de Claude configurable (Rápido = `--effort medium`, Máxima calidad = `high`).
- Memoria: vistas cargadas bajo demanda, logs de tareas limitados, ventanas en segundo plano estranguladas,
  Whisper con hilos según CPU y modelos más pequeños en PCs con < 12 GB de RAM.

## 5. Formulario de edición más corto (Hecho en 0.6)
De 9 preguntas a 5: vídeos → referencia → estilo y subtítulos (con **Sin subtítulos**) → música → indicaciones.
Transiciones y efectos los elige Claude (se pueden fijar en «Más opciones» dentro del paso de estilo).
