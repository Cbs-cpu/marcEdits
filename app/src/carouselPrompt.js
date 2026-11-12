// Prompts EXACTOS que se envían a Claude para carruseles (el usuario los ve y puede retocarlos antes de enviar).
import { RULES } from './prompt.js';

export const TONES = {
  nativo: 'Nativo de TikTok: parece una publicación normal (fotos reales, cajas de texto de TikTok, capturas), nada de diseño de agencia.',
  limpio: 'Limpio y premium: mucho aire, tipografía grande, 1-2 colores, fotos del producto protagonistas.',
  llamativo: 'Llamativo: colores fuertes, números y precios enormes, contraste máximo, energía de oferta.',
  ilustrado: 'Ilustrado con muñecos animados: personajes y escenas dibujados en SVG (el producto convertido en personaje con cara y brazos), fondos de color con degradado y cajas de texto de TikTok. No uses las fotos como fondo; como mucho, una foto pequeña del producto real al final. Ejemplo hecho: library/carousels/pack-de-embutido-iberico-2026-11-12 (assets/toons.js).',
};

export const CAROUSEL_TIPS = [
  { id: 'valor', text: 'Da valor real en las primeras diapositivas; el producto entra como uso natural, no como anuncio.', on: true },
  { id: 'gancho', text: 'Gancho que se entienda en medio segundo (las 5 primeras palabras mandan), con curiosidad o un número.', on: true },
  { id: 'cta', text: 'Última diapositiva con CTA al carrito naranja de TikTok Shop.', on: true },
  { id: 'precio', text: 'Pon el precio en grande (usa solo el precio que te he dado).' },
  { id: 'minus', text: 'Textos en minúsculas y primera persona, estilo testimonio.' },
  { id: 'emoji', text: 'Algún emoji en los textos, sin pasarse.' },
];

const fotos = (assets) => (assets?.length
  ? assets.map((a) => `- ${a}`).join('\n')
  : '- (no hay fotos del producto: haz diapositivas tipográficas o capturas dibujadas en HTML; nunca inventes cómo es el producto)');

export function buildCarouselPrompt(s) {
  const { id, dir, title, product, assets, format, reference, slides, tone, tips, extra } = s;
  const tipLines = CAROUSEL_TIPS.filter((t) => tips.includes(t.id)).map((t) => `- ${t.text}`);
  if (extra?.trim()) tipLines.push(`- ${extra.trim()}`);

  const ref = reference ? `
REFERENCIA A CLONAR
- «${reference.title}» → ${reference.dir}/ (${reference.images.length} diapositivas: ${reference.images.map((i) => i.split('/').pop()).join(', ')})${reference.source?.desc ? `\n- Descripción original: ${reference.source.desc.slice(0, 300)}` : ''}${reference.source?.music ? `\n- Sonido original: ${reference.source.music}` : ''}
- Mira TODAS sus diapositivas a tamaño completo. ${reference.analysis ? `Ya tiene análisis: ${reference.dir}/analysis.md (léelo).` : `Escribe ${reference.dir}/analysis.md (8-12 viñetas: fórmula semántica, fórmula visual, nº de diapositivas, fuente, colores, por qué engancha).`}
- Clona la ESTRUCTURA (qué hace cada diapositiva, en qué orden, cuánto texto) y el LOOK (tipo de foto, encuadre, fuente, cajas, colores, posición del texto), adaptados a MI producto. No copies sus frases, su marca ni sus afirmaciones.
- Mismo número de diapositivas que la referencia salvo que la historia pida una más o una menos.` : '';

  const fmt = !reference && format ? `
FORMATO: ${format.emoji || ''} ${format.name} (${format.slides} diapositivas)
- Gancho tipo: ${format.hook}
- Estructura:
${format.structure.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}
- Look: ${format.look}` : '';

  return `Eres el diseñador de carruseles de la app "Marc Edits". Crea un carrusel (post de fotos 9:16) para TikTok Shop, en español de España.

Usa la skill tiktok-carousel (.claude/skills/tiktok-carousel/SKILL.md): léela y síguela. Para el gancho de la primera diapositiva y la descripción, aplica .claude/skills/tiktok-hooks/ (fórmulas en references/hook-formulas.md). Formato de archivos en engine/CAROUSEL.md.
${reference ? 'Para clonar, aplica también el método de .claude/skills/reference-carousel-adapter/SKILL.md (sin pedir aprobaciones: decides tú).' : ''}${format?.id === 'notas-iphone' ? 'Para el formato de nota del iPhone, aplica las reglas de texto de .claude/skills/hook-notes-carousel/SKILL.md (puedes dibujar la nota en HTML).' : ''}

CARRUSEL
- ID: ${id}
- Carpeta: ${dir}/  (diapositivas en ${dir}/slides/01.html, 02.html…)
- Título: ${title}
- Diapositivas: ${slides === 'auto' ? 'las que pida el formato/la referencia (entre 4 y 8 suele ser lo mejor)' : slides}
- Estilo: ${TONES[tone] || TONES.nativo}

PRODUCTO
- Nombre: ${product.name || '(sin nombre: dedúcelo de las fotos)'}${product.price ? `\n- Precio: ${product.price}` : ''}${product.notes ? `\n- Lo que hay que saber: ${product.notes}` : ''}
- Fotos del producto (míralas todas antes de escribir):
${fotos(assets)}
${ref}${fmt}

INDICACIONES
${tipLines.length ? tipLines.join('\n') : '- Ninguna extra.'}

ENTREGA
- ${dir}/carousel.json (formato en engine/CAROUSEL.md) con el texto exacto de cada diapositiva.
- Render: python engine/carousel.py render ${id}  → mira ${dir}/contact.jpg y cada PNG; corrige y vuelve a renderizar hasta que esté perfecto (ortografía, tildes, nada fuera de la zona segura, nada tapando caras o el producto).
- ${dir}/caption.txt: descripción para TikTok (gancho corto + 3-5 hashtags del nicho) y en una línea aparte un sonido en tendencia que encaje (de library/tools/tendencias.json, solo el nombre: se añade desde TikTok).
- Actualiza ${dir}/meta.json (añade slides, format, caption) sin borrar lo que ya tiene.
- Sé eficiente: nada de pasos de más; un render, revisión y como mucho una o dos correcciones.
- Termina con un resumen de 2 líneas.

${RULES}`;
}

// Contexto del primer mensaje de la conversación sobre un carrusel ya hecho
export function buildCarouselChatContext(item) {
  return `Eres el diseñador de carruseles de la app "Marc Edits". Vamos a tener una conversación sobre un carrusel de TikTok que ya está hecho: el usuario te irá pidiendo cambios y preguntas, mensaje a mensaje.

CARRUSEL
- Título: ${item.title}
- Carpeta: ${item.dir}/ (carousel.json, slides/NN.html → NN.png, assets/, caption.txt, prompt.txt con el encargo original)
- Skill: .claude/skills/tiktok-carousel/SKILL.md · formato: engine/CAROUSEL.md
- Antes de cada mensaje la app guarda las diapositivas actuales en ${item.dir}/versions/.

CÓMO TRABAJAR
- Responde en español, corto: qué has hecho o qué propones. Si es una pregunta, contesta sin tocar nada.
- Cambia SOLO lo que se pide: edita el HTML de esas diapositivas y renderiza con «python engine/carousel.py render ${item.id} --only N» (o sin --only si cambias varias). Mira el PNG resultante antes de responder.
- Mantén carousel.json, caption.txt y meta.json al día.

${RULES}`;
}

export const CAROUSEL_CHIPS = [
  'Gancho más fuerte en la primera',
  'Menos texto por diapositiva',
  'Letra más grande',
  'Añade una diapositiva con el precio',
  'Cambia el color de las cajas de texto',
  'Haz otra versión del gancho',
  'Reescribe la descripción de TikTok',
  'Quita los emojis',
];
