# Formato de carrusel (`library/carousels/<id>/carousel.json`)

```json
{
  "id": "serum-noche-2026-11-12",
  "title": "Sérum de noche",
  "format": "problema-solucion",          // id de library/tools/carruseles/formatos.json (o "clon")
  "reference": "tiktok-123456",            // id de library/carousel-refs (opcional)
  "size": [1080, 1920],
  "product": { "name": "…", "price": "19,99 €", "notes": "…" },
  "slides": [
    { "n": 1, "job": "gancho", "text": "Texto exacto que se lee en la diapositiva", "html": "slides/01.html" },
    { "n": 2, "job": "valor", "text": "…", "html": "slides/02.html" }
  ],
  "caption": "Descripción de TikTok con hashtags"
}
```

- Cada `slides/NN.html` es una página de 1080x1920 que enlaza `../../../tools/carruseles/base.css`
  (fuentes TikTok Sans y Montserrat, zona segura `.safe`, cajas de texto tipo TikTok, CTA `.cart`).
- `python engine/carousel.py render <id>` → `slides/NN.png`, `thumb.jpg`, `contact.jpg` y `meta.slides`.
- `python engine/carousel.py render <id> --only 3` → solo la diapositiva 3.
- `python engine/carousel.py fetch <ref-id> <url>` → descarga un post de fotos de TikTok (gallery-dl) en
  `library/carousel-refs/<ref-id>/01.jpg…` + `source.json` (autor, descripción, sonido).
