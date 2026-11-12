---
name: tiktok-carousel
description: Crear o clonar carruseles (posts de fotos 9:16) para TikTok Shop en la app Marc Edits, en español. Diapositivas HTML 1080x1920 renderizadas a PNG con engine/carousel.py. Úsala para cualquier carrusel, slideshow o post de fotos de TikTok, para clonar una referencia o para cambiar un carrusel ya hecho.
---

# Carruseles de TikTok Shop (Marc Edits)

Trabajas sin nadie al otro lado: **no pidas aprobaciones intermedias**. Decide tú, renderiza, revisa y entrega.
(Las skills `reference-carousel-adapter` y `hook-notes-carousel` piden aprobación paso a paso; aquí NO: toma de
ellas el método y las reglas de texto, no el flujo de aprobación ni ScrapeCreators ni generación de imágenes de pago.)

## Archivos
```
library/carousels/<id>/
  carousel.json        título, formato, producto, diapositivas (ver engine/CAROUSEL.md)
  assets/              fotos del producto que subió el usuario (NO las modifiques; si recortas, guarda copia nueva)
  slides/01.html …     una diapositiva por archivo, 1080x1920, enlazando ../../../tools/carruseles/base.css
  slides/01.png …      salida de: python engine/carousel.py render <id>
  contact.jpg          hoja con todas (la genera el render): MÍRALA siempre
  caption.txt          descripción para TikTok (gancho + 3-5 hashtags + crédito si hace falta)
  meta.json            id, title, format, slides, product, reference, created, caption
library/carousel-refs/<id>/   referencias: 01.jpg, 02.jpg… (+ source.json, analysis.md si ya se analizó)
library/tools/carruseles/formatos.json   formatos en tendencia con estructura por diapositiva
```

## Método
1. **Lee** el formato elegido en `formatos.json`, las fotos de `assets/` (míralas todas con Read) y, si hay
   referencia, TODAS sus diapositivas a tamaño completo.
2. **Referencia (clonar)**: separa la fórmula semántica (gancho → desarrollo → producto → CTA, qué hace cada
   diapositiva) de la visual (tipo de foto, encuadre, fuente, cajas, colores, posición del texto, cantidad de texto).
   Copia la ESTRUCTURA y el LOOK, nunca las frases, la marca ni las afirmaciones del creador original. Escribe
   `library/carousel-refs/<ref>/analysis.md` si no existe (8-12 viñetas: fórmula semántica, fórmula visual, nº de
   diapositivas, fuente, colores, por qué engancha).
3. **Guion**: una idea por diapositiva. Gancho legible en 0,5 s (las 5 primeras palabras mandan), en español de
   España, natural, primera persona si encaja. Da valor real ANTES del producto. El producto entra como uso real
   («lo uso cada mañana…»), no como anuncio. Última diapositiva: CTA al carrito naranja («🧡 en el carrito»), o
   «guárdalo» si es de valor. Si el gancho promete N cosas, entrega N.
4. **Diseño**: HTML a mano con `base.css` (clases `.tt.white/.black/.red/.plain`, `.h1`, `.num`, `.price`, `.cart`,
   `.card`, `.safe`). Texto SIEMPRE dentro de la zona segura `.safe` (TikTok tapa arriba 200 px, abajo 470 px y
   la derecha 150 px). Fuente por defecto: TikTok Sans (nativa). Fotos con `<img class="bg" src="../assets/…">`.
   Lo nativo convierte más que lo «de agencia»: cajas de texto tipo TikTok, capturas de notas/chat dibujadas en
   HTML, fotos reales. Sin fotos del producto: diapositivas tipográficas o capturas dibujadas, nunca inventes la
   apariencia del producto.
   Estilo **ilustrado** (muñecos animados): dibuja personajes y escenas en SVG dentro del HTML (puedes
   reunirlos en `assets/toons.js` y reutilizarlos entre diapositivas). Ejemplo que gustó:
   `library/carousels/pack-de-embutido-iberico-2026-11-12/`.
5. **Render**: `python engine/carousel.py render <id>` (≈1,5 s por diapositiva, en paralelo). Mira `contact.jpg`
   y cada PNG a tamaño real: ortografía y tildes, que nada se salga ni tape caras/producto, contraste, que la
   primera se entienda de un vistazo. Corrige y vuelve a renderizar (`--only N` para una sola).
6. **Entrega**: `caption.txt`, `meta.json` actualizado (slides, caption) y un resumen de 2 líneas.

## Ética (obligatorio)
Nunca inventes reseñas de clientes, cifras, certificados, antes/después falsos ni precios. Si no tienes un dato,
no lo pongas. Capturas de chat/notas: texto tuyo en primera persona, no atribuido a gente real.

## Cambios sobre un carrusel ya hecho
Toca solo las diapositivas que se piden (edita su HTML, `render --only N`), conserva el resto.
