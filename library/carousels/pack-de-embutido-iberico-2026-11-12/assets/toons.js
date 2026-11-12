// Muñecos animados (SVG) para el carrusel del pack de embutido ibérico.
const INK = '#2b1610';
const T = (x, y, s, inner, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${inner}</g>`;

function eyes(mood) {
  let e = '';
  for (const dx of [-30, 30]) {
    if (mood === 'happy') {
      e += `<path d="M${dx - 16} 6 Q${dx} -18 ${dx + 16} 6" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
      continue;
    }
    e += `<ellipse cx="${dx}" cy="0" rx="17" ry="21" fill="#fff" stroke="${INK}" stroke-width="5"/>`;
    const py = mood === 'sad' ? 7 : 2, r = mood === 'shock' ? 6 : 9;
    e += `<circle cx="${dx + 2}" cy="${py}" r="${r}" fill="${INK}"/><circle cx="${dx + 5}" cy="${py - 4}" r="3" fill="#fff"/>`;
  }
  if (mood === 'sad' || mood === 'worried') {
    e += `<path d="M-48 -26 L-16 -38 M16 -38 L48 -26" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  }
  if (mood === 'shock') {
    e += `<path d="M-46 -34 Q-30 -48 -14 -36 M14 -36 Q30 -48 46 -34" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  }
  return e;
}
function mouth(mood) {
  switch (mood) {
    case 'happy': return `<path d="M-26 26 Q0 64 26 26 Z" fill="${INK}"/><path d="M-12 44 Q0 56 12 44 Q0 38 -12 44Z" fill="#ff6b81"/>`;
    case 'sad': return `<path d="M-20 46 Q0 26 20 46" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    case 'shock': return `<ellipse cx="0" cy="40" rx="13" ry="17" fill="${INK}"/>`;
    case 'worried': return `<path d="M-22 42 q11 -10 22 0 q11 10 22 0" transform="translate(-11 0)" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    default: return `<path d="M-16 40 L16 36" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  }
}
function face(mood) {
  return `<ellipse cx="-50" cy="26" rx="13" ry="8" fill="#ff8fa3" opacity=".75"/><ellipse cx="50" cy="26" rx="13" ry="8" fill="#ff8fa3" opacity=".75"/>` + eyes(mood) + mouth(mood);
}
function limb(x1, y1, x2, y2, hand = true) {
  const mx = (x1 + x2) / 2 + (x2 > x1 ? 8 : -8), my = (y1 + y2) / 2 + 10;
  return `<path d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>` +
    (hand ? `<circle cx="${x2}" cy="${y2}" r="16" fill="#fff" stroke="${INK}" stroke-width="5"/>` : '');
}
function arms(sx, sy, pose) {
  const P = { down: [[-sx - 50, sy + 80], [sx + 50, sy + 80]], up: [[-sx - 60, sy - 100], [sx + 60, sy - 100]],
    wave: [[-sx - 50, sy + 80], [sx + 60, sy - 100]], sad: [[-sx - 25, sy + 95], [sx + 25, sy + 95]] }[pose || 'down'];
  return limb(-sx, sy, P[0][0], P[0][1]) + limb(sx, sy, P[1][0], P[1][1]);
}
function legs(y, sp = 30, len = 62) {
  let s = '';
  for (const k of [-1, 1]) {
    s += `<path d="M${k * sp * .7} ${y} L${k * sp} ${y + len}" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>`;
    s += `<ellipse cx="${k * (sp + 10)}" cy="${y + len + 4}" rx="24" ry="13" fill="${INK}"/>`;
  }
  return s;
}
const dots = (list, fill) => list.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .8}" fill="${fill}"/>`).join('');

// ---------- Personajes ----------
function chorizo(mood = 'happy', pose = 'down', o = {}) {
  const c = o.dry ? '#8a3a20' : '#bf3420';
  let s = legs(160) + arms(66, 10, pose);
  s += `<path d="M0 -172 q-26 -34 0 -58 q22 -20 6 -44" fill="none" stroke="#efe2c4" stroke-width="7" stroke-linecap="round"/>`;
  s += `<rect x="-72" y="-172" width="144" height="340" rx="72" fill="${c}" stroke="${INK}" stroke-width="8"/>`;
  s += `<path d="M-18 -170 Q0 -184 18 -170" fill="none" stroke="#efe2c4" stroke-width="8" stroke-linecap="round"/>`;
  s += dots([[-38, 40, 10], [20, 30, 8], [40, 80, 11], [-20, 95, 9], [10, 140, 10], [-44, 130, 7], [46, 130, 7], [-40, -120, 8], [36, -130, 9], [0, 64, 6]], o.dry ? '#d9a77f' : '#f6cfab');
  if (o.dry) s += `<path d="M-60 -10 q20 8 40 0 M20 20 q20 8 40 0 M-60 110 q22 8 44 0 M14 160 q14 6 30 0 M-30 -150 q20 8 40 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity=".55"/>`;
  else s += `<rect x="-52" y="-140" width="20" height="120" rx="10" fill="#fff" opacity=".28"/>`;
  s += T(0, -60, 1, face(mood));
  return s;
}
function salchichon(mood = 'happy', pose = 'down') {
  let s = legs(170) + arms(62, 10, pose);
  s += `<path d="M0 -182 q24 -30 0 -56" fill="none" stroke="#efe2c4" stroke-width="7" stroke-linecap="round"/>`;
  s += `<rect x="-66" y="-182" width="132" height="360" rx="66" fill="#7f2431" stroke="${INK}" stroke-width="8"/>`;
  s += `<path d="M-18 -180 Q0 -194 18 -180" fill="none" stroke="#efe2c4" stroke-width="8" stroke-linecap="round"/>`;
  s += dots([[-34, 40, 7], [18, 28, 6], [38, 78, 8], [-22, 96, 7], [12, 146, 7], [-40, 136, 5], [42, 128, 6], [-36, -130, 6], [34, -140, 7], [0, 70, 5], [-8, 120, 6], [30, 168, 5]], '#f8e7d6');
  s += dots([[-12, 50, 5], [32, 108, 5], [-38, 74, 4], [4, 100, 4], [-20, 156, 5], [44, 160, 4], [-6, -150, 4], [20, -120, 5]], '#1a0c08');
  s += `<path d="M-64 20 Q0 36 64 20 M-60 120 Q0 136 60 120" fill="none" stroke="#efe2c4" stroke-width="5" opacity=".75"/>`;
  s += `<rect x="-48" y="-150" width="18" height="110" rx="9" fill="#fff" opacity=".22"/>`;
  s += T(0, -66, 1, face(mood));
  return s;
}
function lomo(mood = 'happy', pose = 'down') {
  let s = legs(112, 52, 64) + arms(150, 10, pose);
  s += `<ellipse cx="0" cy="0" rx="162" ry="122" fill="#d9531e" stroke="${INK}" stroke-width="8"/>`;
  s += `<ellipse cx="0" cy="0" rx="136" ry="98" fill="#b8243a"/>`;
  s += `<path d="M-120 30 q24 -18 48 -4 t44 6 M70 -78 q22 12 46 -6 M-100 -50 q18 6 30 -10 M60 60 q20 -14 46 0 M-40 80 q20 -10 40 2" fill="none" stroke="#f7d9d9" stroke-width="6" stroke-linecap="round" opacity=".65"/>`;
  s += `<ellipse cx="-80" cy="-56" rx="30" ry="14" fill="#fff" opacity=".2" transform="rotate(-25 -80 -56)"/>`;
  s += T(0, -8, 1, face(mood));
  return s;
}
function person(mood = 'shock') {
  let s = '';
  s += `<rect x="-72" y="110" width="62" height="230" rx="24" fill="#3b4a6b" stroke="${INK}" stroke-width="8"/><rect x="10" y="110" width="62" height="230" rx="24" fill="#3b4a6b" stroke="${INK}" stroke-width="8"/>`;
  s += `<ellipse cx="-48" cy="344" rx="44" ry="20" fill="#fff" stroke="${INK}" stroke-width="7"/><ellipse cx="48" cy="344" rx="44" ry="20" fill="#fff" stroke="${INK}" stroke-width="7"/>`;
  s += `<rect x="-104" y="-104" width="208" height="250" rx="72" fill="#ff6b4a" stroke="${INK}" stroke-width="8"/>`;
  s += `<path d="M-30 -104 Q0 -70 30 -104" fill="#f2c29b" stroke="${INK}" stroke-width="6"/>`;
  // brazos a las mejillas
  for (const k of [-1, 1]) {
    s += `<path d="M${k * 92} -60 Q${k * 170} -110 ${k * 112} -176" fill="none" stroke="${INK}" stroke-width="58" stroke-linecap="round"/>`;
    s += `<path d="M${k * 92} -60 Q${k * 170} -110 ${k * 112} -176" fill="none" stroke="#ff6b4a" stroke-width="42" stroke-linecap="round"/>`;
  }
  s += `<circle cx="0" cy="-205" r="98" fill="#f2c29b" stroke="${INK}" stroke-width="8"/>`;
  s += `<circle cx="-98" cy="-200" r="18" fill="#f2c29b" stroke="${INK}" stroke-width="6"/><circle cx="98" cy="-200" r="18" fill="#f2c29b" stroke="${INK}" stroke-width="6"/>`;
  s += `<path d="M-98 -222 Q-110 -330 0 -314 Q104 -330 98 -222 Q70 -270 20 -262 Q30 -285 4 -292 Q-6 -262 -40 -264 Q-80 -262 -98 -222 Z" fill="#3a2418" stroke="${INK}" stroke-width="6"/>`;
  s += T(0, -196, 1.25, face(mood));
  for (const k of [-1, 1]) s += `<circle cx="${k * 104}" cy="-182" r="30" fill="#f2c29b" stroke="${INK}" stroke-width="7"/>`;
  s += drop(150, -300, 1) + drop(-160, -270, .8) + drop(175, -220, .6);
  return s;
}
const drop = (x, y, s) => T(x, y, s, `<path d="M0 -34 Q26 2 0 20 Q-26 2 0 -34Z" fill="#7cc8ff" stroke="${INK}" stroke-width="5"/>`);

// ---------- Objetos ----------
function sobre(kind, label) {
  let s = `<rect x="-130" y="-180" width="260" height="360" rx="22" fill="#e8d5ae" stroke="${INK}" stroke-width="7"/>`;
  s += `<path d="M-130 -140 H130" stroke="${INK}" stroke-width="5" stroke-dasharray="10 10" opacity=".5"/>`;
  s += `<rect x="-96" y="-112" width="192" height="172" rx="18" fill="#fff6ea" stroke="${INK}" stroke-width="5"/>`;
  const slice = (x, y) => kind === 'lomo'
    ? `<ellipse cx="${x}" cy="${y}" rx="44" ry="34" fill="#d9531e" stroke="${INK}" stroke-width="4"/><ellipse cx="${x}" cy="${y}" rx="34" ry="25" fill="#b8243a"/>`
    : `<circle cx="${x}" cy="${y}" r="38" fill="${kind === 'chorizo' ? '#bf3420' : '#7f2431'}" stroke="${INK}" stroke-width="4"/>` +
      dots([[x - 14, y - 10, 6], [x + 12, y + 4, 5], [x - 4, y + 18, 6], [x + 16, y - 16, 4]], '#f6cfab');
  s += slice(-44, -64) + slice(44, -58) + slice(0, 8);
  s += `<rect x="-104" y="84" width="208" height="62" rx="12" fill="${INK}"/>`;
  s += `<text x="0" y="128" text-anchor="middle" font-family="TikTok Sans, Segoe UI" font-weight="900" font-size="${label.length > 7 ? 26 : 34}" fill="#fff">${label}</text>`;
  return s;
}
function fridge() {
  let s = `<rect x="-150" y="-270" width="300" height="580" rx="26" fill="#eef3f7" stroke="${INK}" stroke-width="8"/>`;
  s += `<rect x="-124" y="-244" width="248" height="528" rx="14" fill="#d6ecff"/>`;
  s += `<ellipse cx="0" cy="-200" rx="90" ry="24" fill="#fff" opacity=".7"/>`;
  for (const y of [-90, 50, 180]) s += `<path d="M-124 ${y} H124" stroke="#8fb9db" stroke-width="9"/>`;
  s += `<path d="M86 -244 l38 0 M124 -206 l0 -38 M90 -244 q10 22 34 30" fill="none" stroke="#9aa9b5" stroke-width="3"/>`; // telaraña
  s += `<path d="M-150 -270 L-262 -236 L-262 280 L-150 310 Z" fill="#dfe7ee" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  s += `<rect x="-246" y="-120" width="14" height="110" rx="7" fill="#9aa9b5"/>`;
  return s;
}
function burst(text) {
  let pts = [];
  for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? 150 : 205; pts.push(`${(Math.cos(a) * r * 1.35).toFixed(0)},${(Math.sin(a) * r).toFixed(0)}`); }
  return `<polygon points="${pts.join(' ')}" fill="#fe2c55" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
    `<text x="0" y="20" text-anchor="middle" font-family="TikTok Sans, Segoe UI" font-weight="900" font-size="64" fill="#fff" stroke="${INK}" stroke-width="8" paint-order="stroke">${text}</text>`;
}
function calendar() {
  let s = `<rect x="-130" y="-140" width="260" height="280" rx="22" fill="#fff" stroke="${INK}" stroke-width="7"/>`;
  s += `<rect x="-130" y="-140" width="260" height="70" rx="22" fill="#fe2c55" stroke="${INK}" stroke-width="7"/>`;
  s += `<circle cx="-70" cy="-150" r="12" fill="${INK}"/><circle cx="70" cy="-150" r="12" fill="${INK}"/>`;
  let k = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++, k++) {
    const x = -90 + c * 60, y = -30 + r * 58;
    s += `<rect x="${x - 20}" y="${y - 20}" width="40" height="40" rx="6" fill="#f2f2f2"/>`;
    if (k < 6) s += `<path d="M${x - 14} ${y - 14} L${x + 14} ${y + 14} M${x + 14} ${y - 14} L${x - 14} ${y + 14}" stroke="#e5332a" stroke-width="6" stroke-linecap="round"/>`;
  }
  return s;
}
function bowl(mood) {
  let s = '';
  const chip = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="46" ry="30" transform="rotate(${r} ${x} ${y})" fill="#f7c948" stroke="${INK}" stroke-width="5"/>`;
  s += chip(-100, -20, -20) + chip(-30, -44, 10) + chip(50, -30, 30) + chip(110, -14, -10) + chip(10, -10, -40);
  s += `<path d="M-200 0 A200 140 0 0 0 200 0 Z" fill="#5aa5e6" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  s += `<path d="M-200 0 H200" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
  s += T(0, 54, .9, face(mood));
  return s;
}
function olive(mood) {
  return `<ellipse cx="0" cy="0" rx="62" ry="50" fill="#7a9a2e" stroke="${INK}" stroke-width="7"/><ellipse cx="44" cy="-6" rx="12" ry="10" fill="#e5332a" stroke="${INK}" stroke-width="4"/>` + T(-6, 0, .55, face(mood));
}
function board() {
  let s = `<rect x="300" y="-34" width="130" height="68" rx="34" fill="#a86a32" stroke="${INK}" stroke-width="8"/><circle cx="392" cy="0" r="14" fill="${INK}"/>`;
  s += `<rect x="-330" y="-150" width="660" height="300" rx="70" fill="#c98a4b" stroke="${INK}" stroke-width="8"/>`;
  s += `<path d="M-280 -90 q120 -20 240 0 M-250 60 q160 20 300 -10 M40 -40 q90 -14 200 6" fill="none" stroke="#a86a32" stroke-width="5" opacity=".7"/>`;
  const ch = (x, y, c) => `<circle cx="${x}" cy="${y}" r="44" fill="${c}" stroke="${INK}" stroke-width="5"/>` + dots([[x - 16, y - 10, 7], [x + 14, y + 6, 6], [x - 4, y + 20, 7], [x + 18, y - 18, 5]], '#f6cfab');
  const lo = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="58" ry="44" fill="#d9531e" stroke="${INK}" stroke-width="5"/><ellipse cx="${x}" cy="${y}" rx="45" ry="32" fill="#b8243a"/><path d="M${x - 24} ${y + 4} q14 -10 28 0" stroke="#f7d9d9" stroke-width="4" fill="none" opacity=".7"/>`;
  s += ch(-230, 30, '#bf3420') + ch(-180, -50, '#bf3420') + ch(-150, 50, '#bf3420');
  s += lo(-40, -50) + lo(-10, 40) + lo(60, -10);
  s += ch(170, -50, '#7f2431') + ch(220, 30, '#7f2431') + ch(150, 54, '#7f2431');
  return s;
}
function gift() {
  return `<rect x="-130" y="-60" width="260" height="190" rx="16" fill="#fe2c55" stroke="${INK}" stroke-width="8"/>` +
    `<rect x="-150" y="-110" width="300" height="70" rx="14" fill="#ff5277" stroke="${INK}" stroke-width="8"/>` +
    `<rect x="-24" y="-110" width="48" height="240" fill="#ffd447" stroke="${INK}" stroke-width="6"/>` +
    `<path d="M0 -112 C-90 -190 -120 -100 0 -112 C120 -100 90 -190 0 -112Z" fill="#ffd447" stroke="${INK}" stroke-width="7"/>`;
}
const heart = (x, y, s, c = '#fe2c55') => T(x, y, s, `<path d="M0 30 C-64 -12 -40 -72 0 -40 C40 -72 64 -12 0 30Z" fill="${c}" stroke="${INK}" stroke-width="6"/>`);
const spark = (x, y, s, c = '#fff') => T(x, y, s, `<path d="M0 -40 Q6 -6 40 0 Q6 6 0 40 Q-6 6 -40 0 Q-6 -6 0 -40Z" fill="${c}"/>`);
const shadow = (x, y, rx) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * .16}" fill="#000" opacity=".14"/>`;

function background(c1, c2, opts = {}) {
  let s = `<defs><radialGradient id="g" cx="50%" cy="58%" r="70%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>`;
  s += `<rect width="1080" height="1920" fill="url(#g)"/>`;
  if (opts.rays) {
    const [cx, cy] = opts.rays;
    for (let i = 0; i < 18; i += 1) {
      if (i % 2) continue;
      const a1 = i * Math.PI / 9, a2 = (i + 1) * Math.PI / 9;
      s += `<polygon points="${cx},${cy} ${cx + Math.cos(a1) * 1800},${cy + Math.sin(a1) * 1800} ${cx + Math.cos(a2) * 1800},${cy + Math.sin(a2) * 1800}" fill="#fff" opacity=".13"/>`;
    }
  }
  // confeti suave
  const conf = [[90, 700, 10], [980, 640, 8], [130, 1450, 12], [940, 1500, 9], [60, 1060, 7], [1010, 1080, 11], [300, 1720, 9], [800, 1760, 10]];
  s += conf.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".45"/>`).join('');
  return s;
}
function draw(svgInner) {
  document.getElementById('art').innerHTML = svgInner;
}
