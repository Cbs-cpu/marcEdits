const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { Readable } = require('node:stream');
const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.css': 'text/css' };

// Raíz del proyecto: la carpeta "marc edits".
// - En desarrollo: app/ está dentro, así que es ../..
// - Instalada (.exe): se lee de la config del usuario; si no, la ruta grabada al compilar (electron/root.json);
//   si tampoco existe, se pregunta con un diálogo al arrancar.
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
function resolveRoot() {
  const ok = (p) => p && fs.existsSync(path.join(p, 'library'));
  if (!app.isPackaged) return path.resolve(__dirname, '..', '..');
  try { const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); if (ok(c.root)) return c.root; } catch {}
  try { const b = JSON.parse(fs.readFileSync(path.join(__dirname, 'root.json'), 'utf8')); if (ok(b.root)) return b.root; } catch {}
  return null;
}
let ROOT = resolveRoot();   // null hasta que el usuario elija la carpeta (solo en la versión instalada)

// Carpetas de herramientas: cada una es una carpeta normal que puedes editar desde el explorador
const TOOL_CATS = ['transiciones', 'canciones', 'sonidos', 'efectos'];
let DIRS = {};
function initDirs() {
  const LIB = path.join(ROOT, 'library');
  DIRS = {
    edited: path.join(LIB, 'edited'),
    references: path.join(LIB, 'references'),
    scripts: path.join(LIB, 'scripts'),
    recipes: path.join(LIB, 'tools', 'recipes'),
    inputs: path.join(ROOT, 'inputs'),
    skills: path.join(ROOT, '.claude', 'skills'),
  };
  for (const c of TOOL_CATS) DIRS[c] = path.join(LIB, 'tools', c);
  Object.values(DIRS).forEach((d) => fs.mkdirSync(d, { recursive: true }));
}
if (ROOT) initDirs();

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

let win;
const jobs = new Map();

// ---------- utilidades ----------
const readJSON = (p, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
};
const writeJSON = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const exists = (p) => fs.existsSync(p);
const slugify = (s) =>
  (s || 'video').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'video';
const today = () => new Date().toISOString().slice(0, 10);
const uniqueId = (dir, base) => {
  let id = base, i = 2;
  while (exists(path.join(dir, id))) id = `${base}-${i++}`;
  return id;
};
const listDirs = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------- biblioteca ----------
function listVersions(dir) {
  const vdir = path.join(dir, 'versions');
  if (!exists(vdir)) return [];
  return fs.readdirSync(vdir).filter((f) => /^v\d+\.mp4$/.test(f))
    .map((f) => ({ id: f.replace('.mp4', ''), n: +f.slice(1, -4), video: rel(path.join(vdir, f)),
      thumb: exists(path.join(vdir, f.replace('.mp4', '.jpg'))) ? rel(path.join(vdir, f.replace('.mp4', '.jpg'))) : null,
      at: mtime(path.join(vdir, f)) }))
    .sort((a, b) => b.n - a.n);
}

function listEdited() {
  return listDirs(DIRS.edited).map((id) => {
    const dir = path.join(DIRS.edited, id);
    const meta = readJSON(path.join(dir, 'meta.json'), { id, title: id });
    const video = path.join(dir, 'final.mp4');
    return {
      ...meta, id,
      ready: exists(video),
      busy: meta.status === 'processing',
      video: exists(video) ? rel(video) : null,
      thumb: exists(path.join(dir, 'thumb.jpg')) ? rel(path.join(dir, 'thumb.jpg')) : null,
      v: mtime(video),
      dir: rel(dir),
      prompt: exists(path.join(dir, 'prompt.txt')) ? fs.readFileSync(path.join(dir, 'prompt.txt'), 'utf8') : null,
      versions: listVersions(dir),
    };
  }).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}

function listReferences() {
  return listDirs(DIRS.references).map((id) => {
    const dir = path.join(DIRS.references, id);
    const meta = readJSON(path.join(dir, 'meta.json'), { id, title: id });
    const video = ['video.mp4', 'video.webm', 'video.mov'].map((f) => path.join(dir, f)).find(exists);
    const skillPath = path.join(DIRS.skills, `ref-${id}`, 'SKILL.md');
    const analysis = path.join(dir, 'analysis.md');
    return {
      ...meta, id,
      video: video ? rel(video) : null,
      thumb: exists(path.join(dir, 'thumb.jpg')) ? rel(path.join(dir, 'thumb.jpg')) : null,
      skill: exists(skillPath) ? rel(skillPath) : null,
      recipe: exists(path.join(DIRS.recipes, `ref-${id}.json`)) ? `ref-${id}` : null,
      analysis: exists(analysis) ? fs.readFileSync(analysis, 'utf8') : null,
      dir: rel(dir),
    };
  }).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}

function listScripts() {
  return fs.readdirSync(DIRS.scripts).filter((f) => f.endsWith('.md')).map((f) => {
    const p = path.join(DIRS.scripts, f);
    const content = fs.readFileSync(p, 'utf8');
    const title = (content.match(/^#\s+(.+)$/m) || [])[1] || f.replace(/\.md$/, '');
    return { id: f.replace(/\.md$/, ''), title, content, updated: mtime(p) };
  }).sort((a, b) => b.updated - a.updated);
}

function listRecipes() {
  return fs.readdirSync(DIRS.recipes).filter((f) => f.endsWith('.json')).map((f) => {
    const id = f.replace(/\.json$/, '');
    const data = readJSON(path.join(DIRS.recipes, f), {});
    return { id, name: data.name || id, description: data.description || '', fromReference: id.startsWith('ref-'), data };
  }).sort((a, b) => (a.id === 'basico' ? -1 : b.id === 'basico' ? 1 : a.name.localeCompare(b.name)));
}

function which(cmd) {
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true }, (err, out) =>
      resolve(err ? null : out.split(/\r?\n/)[0].trim()));
  });
}

async function toolStatus() {
  const names = ['claude', 'ffmpeg', 'ffprobe', 'whisper', 'yt-dlp', 'python'];
  const res = await Promise.all(names.map(which));
  return names.map((n, i) => ({ name: n, path: res[i] }));
}

// ---------- trabajos (procesos en segundo plano) ----------
function runJob({ kind, title, cmd, args, parser, onDone }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const env = {
    ...process.env, PYTHONIOENCODING: 'utf8', PYTHONUTF8: '1',
    // comandos largos de Claude (cutout en CPU, render): hasta 30 min en primer plano
    BASH_DEFAULT_TIMEOUT_MS: '1800000', BASH_MAX_TIMEOUT_MS: '3600000',
  };
  // Garantiza que Claude Code use la suscripción (login de claude.ai) y no una API key
  delete env.ANTHROPIC_API_KEY;
  const child = spawn(cmd, args, {
    cwd: ROOT, env, shell: false, windowsHide: true,
    windowsVerbatimArguments: cmd === 'cmd.exe',
  });
  const job = { id, kind, title, status: 'running', started: Date.now() };
  jobs.set(id, { ...job, child });
  send('job:event', { ...job, type: 'start' });

  const emit = (text, level = 'log') => text && send('job:event', { id, type: 'log', level, text });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    lines.forEach((l) => (parser ? parser(l, emit) : emit(l)));
  });
  child.stderr.on('data', (d) => {
    const t = d.toString('utf8').replace(/\r/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean).pop();
    if (t) emit(t, 'dim');
  });
  child.on('error', (e) => emit(`No se pudo lanzar ${cmd}: ${e.message}`, 'error'));
  child.on('close', (code) => {
    if (buf) (parser ? parser(buf, emit) : emit(buf));
    const status = code === 0 ? 'done' : 'error';
    try { onDone && onDone(code); } catch (e) { emit(e.message, 'error'); }
    jobs.delete(id);
    send('job:event', { id, type: 'end', status, code });
  });
  return id;
}

// ---------- sesión del CLI de Claude (la suscripción) ----------
const AUTH_ERR = /OAuth|authenticate|not logged in|log in|\/login/i;

function claudeAuthStatus() {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    execFile('cmd.exe', ['/d', '/c', 'claude auth status'], { cwd: ROOT, env, windowsHide: true, timeout: 30000 }, (err, out) => {
      try {
        const j = JSON.parse(out.slice(out.indexOf('{')));
        resolve({ loggedIn: !!j.loggedIn, method: j.authMethod || null });
      } catch {
        resolve({ loggedIn: false, method: null, error: err ? err.message : 'No se pudo leer el estado' });
      }
    });
  });
}

// Abre una consola visible con el login oficial (se completa en el navegador; la app nunca ve credenciales)
function claudeLogin() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  spawn('cmd.exe', ['/d', '/c', 'start "Iniciar sesion en Claude" cmd /k claude auth login --claudeai'],
    { cwd: ROOT, env, detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
}

// Traduce el stream-json de `claude -p` a líneas legibles
function claudeParser(line, emit) {
  if (!line.trim()) return;
  let ev;
  try { ev = JSON.parse(line); } catch { return emit(line, 'dim'); }
  if (ev.type === 'assistant' && ev.message?.content) {
    for (const c of ev.message.content) {
      if (c.type === 'text' && c.text.trim()) emit(c.text.trim(), 'claude');
      if (c.type === 'tool_use') {
        const i = c.input || {};
        const detail = i.description || i.command || i.file_path || i.pattern || i.skill || '';
        emit(`${c.name}: ${String(detail).slice(0, 160)}`, 'tool');
      }
    }
  } else if (ev.type === 'result') {
    if (ev.is_error && AUTH_ERR.test(ev.result || '')) {
      emit('Tu sesión de Claude ha caducado. Pulsa «Iniciar sesión en Claude» y vuelve a lanzar la edición.', 'auth');
      send('auth:changed', { loggedIn: false });
    } else if (ev.is_error) emit(ev.result || 'Claude terminó con error', 'error');
    else emit('Claude ha terminado.', 'ok');
  } else if (ev.type === 'system' && ev.subtype === 'init') {
    emit(`Claude conectado (${ev.model || 'modelo por defecto'})`, 'dim');
  }
}

// Modelo para todas las ediciones: Opus 5.5
const CLAUDE_MODEL = 'claude-opus-5-5';

// Reglas que se añaden SIEMPRE al final del prompt: en modo -p, si Claude deja algo en segundo plano y termina su
// turno, el proceso se cierra y el trabajo queda a medias (el vídeo nunca llega a final.mp4)
const RUN_RULES = `

[Reglas de ejecución de la app]
- Trabaja todo en primer plano y en este mismo turno: nunca uses run_in_background, Monitor, ScheduleWakeup ni tareas programadas. Los comandos largos (cutout, render) ejecútalos en primer plano con timeout alto (hasta 1800000 ms). No termines hasta que el vídeo final exista.
- No hay nadie para responder preguntas: decide tú y sigue hasta el final.`;

function runClaude({ kind, title, prompt, onDone, resume, extraTools, onEvent }) {
  const args = [
    '-p', prompt,
    '--model', CLAUDE_MODEL,
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', ['Bash,Read,Write,Edit,Glob,Grep,Skill,Agent', ...(extraTools || [])].join(','),
    '--disallowedTools', 'ScheduleWakeup,Monitor,CronCreate,RemoteTrigger',
  ];
  if (resume) args.push('--resume', resume);
  const parser = onEvent
    ? (line, emit) => { claudeParser(line, emit); try { onEvent(JSON.parse(line)); } catch {} }
    : claudeParser;
  return runJobShellSafe({ kind, title, cmd: 'claude', args, parser, onDone });
}

// En Windows, claude es un .cmd: hay que lanzarlo a través de cmd.exe con los argumentos bien escapados
function runJobShellSafe(opts) {
  if (process.platform !== 'win32') return runJob(opts);
  const q = (a) => (/[\s"&|<>^%]/.test(a) ? `"${a.replace(/"/g, '""').replace(/%/g, '%%')}"` : a);
  // El prompt va por fichero para evitar los límites y el escapado de cmd.exe
  const tmp = path.join(app.getPath('temp'), `marc-edits-prompt-${Date.now()}.txt`);
  const pIdx = opts.args.indexOf('-p');
  const prompt = opts.args[pIdx + 1];
  fs.writeFileSync(tmp, prompt, 'utf8');
  const rest = opts.args.filter((_, i) => i !== pIdx && i !== pIdx + 1);
  const line = `type "${tmp}" | ${opts.cmd} -p ${rest.map(q).join(' ')}`;
  return runJob({
    ...opts,
    cmd: 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line}"`],
    onDone: (code) => { try { fs.unlinkSync(tmp); } catch {} opts.onDone && opts.onDone(code); },
  });
}

// ---------- prompts para Claude ----------
// El prompt de edición lo construye la interfaz (paso a paso) y se envía tal cual; aquí solo queda el de skills.
function skillPrompt(ref) {
  const dir = ref.dir;
  const skillId = `ref-${ref.id}`;
  return `Eres el editor de vídeo de la app "Marc Edits". El usuario quiere guardar esta referencia como estilo reutilizable.

Referencia: ${dir}/${path.basename(ref.video)} (título: ${ref.title || ref.id})

Analiza la referencia a fondo:
1. ffprobe (duración, resolución, fps).
2. Detecta los cortes: ffmpeg -i <video> -vf "select='gt(scene,0.25)',showinfo" -f null - (saca tiempos de cortes y el ritmo medio por plano).
3. Saca fotogramas (1 cada 1-2 s y alrededor de los cortes) en ${dir}/frames y míralos: encuadre, zooms/punch-ins, B-roll, textos en pantalla, emojis, stickers, color.
4. Transcribe el audio con whisper (--word_timestamps True --language es --model medium, salida en ${dir}/frames) y estudia la estructura del guion: hook (primeros 2-3 s), desarrollo, CTA, longitud de frases y ritmo de habla.
5. Fíjate en el estilo de subtítulos: fuente aproximada, tamaño relativo, mayúsculas, colores, palabra resaltada, borde/sombra, posición vertical (0-1), palabras por bloque, animación de entrada. Fíjate también en la música, los efectos de sonido y los silencios.
6. Estructura del montaje (clave en vídeos complejos): haz una tabla escena a escena (tiempo, qué se ve, tipo de plano: persona hablando a cámara / voz en off sobre B-roll / grabación de pantalla / foto / texto a pantalla completa / plano de producto), cuántas fuentes distintas parece haber, cómo se pasa de una a otra (transición, corte en el beat, match cut), cuánto dura cada tipo, si la voz sigue por debajo del B-roll, textos y stickers en pantalla, y en qué momentos entra cada recurso respecto al guion.

Escribe estos tres archivos:
A) library/tools/recipes/${skillId}.json: el mismo esquema que library/tools/recipes/basico.json, con "name": "Ref · <nombre corto>", con los valores ajustados para imitar la referencia (cuts.silence_gap, max_shot según el ritmo de cortes, zoom.pattern, captions.*). Fuentes disponibles en engine/fonts (Montserrat Black / Montserrat ExtraBold). Si la referencia usa otra fuente libre (Google Fonts), descárgala a engine/fonts y úsala.
B) .claude/skills/${skillId}/SKILL.md: skill con frontmatter (name: ${skillId}, description: "Editar un vídeo de TikTok con el estilo de la referencia <nombre>..."). Contenido: análisis del estilo, la tabla de estructura del montaje (paso 6) convertida en una plantilla reutilizable («0-2 s: gancho a cámara con texto grande; 2-6 s: B-roll del producto con la voz debajo…»), plantilla de guion (hook/desarrollo/CTA con ejemplos de la referencia), reglas exactas de edición (cortes, zooms, subtítulos, sonido, duración objetivo) y los pasos concretos para montar un vídeo nuevo así, con UNO o VARIOS vídeos de entrada: escribir library/edited/<id>/timeline.json (formato en engine/TIMELINE.md; cada plano puede venir de un vídeo distinto con "src", "fit": "blur" para material horizontal, "mute" para B-roll sin su audio) y renderizar con «python engine/timeline.py render <id>».
C) ${dir}/analysis.md: resumen legible para el usuario (8-15 viñetas) de lo que define este estilo, incluida la estructura del montaje.

Por último, borra la carpeta ${dir}/frames y termina con un resumen de 2 líneas.`;
}

// ---------- IPC ----------
ipcMain.handle('lib:list', async (_e, section) => {
  if (section === 'edited') return listEdited();
  if (section === 'references') return listReferences();
  if (section === 'scripts') return listScripts();
  if (section === 'recipes') return listRecipes();
  if (section === 'tools') return toolStatus();
  return [];
});

ipcMain.handle('auth:status', () => claudeAuthStatus());
ipcMain.handle('auth:login', () => { claudeLogin(); return true; });

ipcMain.handle('scripts:save',(_e, { id, title, content }) => {
  const sid = id || uniqueId(DIRS.scripts, `${slugify(title)}`).replace(/\.md$/, '');
  let body = content || '';
  if (!/^#\s+/m.test(body)) body = `# ${title || 'Guion'}\n\n${body}`;
  else body = body.replace(/^#\s+.+$/m, `# ${title || 'Guion'}`);
  fs.writeFileSync(path.join(DIRS.scripts, `${sid}.md`), body, 'utf8');
  return sid;
});
ipcMain.handle('scripts:delete', (_e, id) => {
  fs.rmSync(path.join(DIRS.scripts, `${id}.md`), { force: true });
  return true;
});

ipcMain.handle('recipes:save', (_e, { id, data }) => {
  writeJSON(path.join(DIRS.recipes, `${id}.json`), data);
  return true;
});

ipcMain.handle('dialog:pickVideo', async (_e, multi) => {
  const r = await dialog.showOpenDialog(win, {
    properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{ name: 'Vídeos', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }],
  });
  if (r.canceled) return multi ? [] : null;
  return multi ? r.filePaths : r.filePaths[0];
});

// Duración, tamaño y si tiene audio (para listar varios vídeos y montarlos juntos)
const probeVideo = (f) => new Promise((resolve) =>
  execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', f], { windowsHide: true },
    (err, out) => {
      try {
        const j = JSON.parse(out);
        const v = (j.streams || []).find((x) => x.codec_type === 'video') || {};
        resolve({ dur: Math.round(parseFloat(j.format.duration) * 100) / 100, w: v.width || 0, h: v.height || 0,
          audio: (j.streams || []).some((x) => x.codec_type === 'audio') });
      } catch { resolve({ dur: 0, w: 0, h: 0, audio: false }); }
    }));
ipcMain.handle('video:probe', (_e, f) => probeVideo(f));

ipcMain.handle('shell:open', (_e, relPath) => shell.openPath(path.join(ROOT, relPath)));
ipcMain.handle('shell:show', (_e, relPath) => shell.showItemInFolder(path.join(ROOT, relPath)));

// Borrar = mover a la papelera de Windows (se puede recuperar)
ipcMain.handle('edited:delete', async (_e, id) => {
  await shell.trashItem(path.join(DIRS.edited, id));
  return true;
});

// ---------- cambios sobre un vídeo ya editado ----------
const ffprobeDur = (f) => new Promise((resolve) =>
  execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { windowsHide: true },
    (err, out) => resolve(err ? null : Math.round(parseFloat(out) * 100) / 100)));
const ff = (args) => new Promise((resolve, reject) =>
  execFile('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 1 << 24 }, (err) => (err ? reject(err) : resolve())));

// Guarda el estado actual como versions/vN.mp4 (+ miniatura) antes de cualquier cambio
function backupVersion(dir) {
  const vdir = path.join(dir, 'versions');
  fs.mkdirSync(vdir, { recursive: true });
  const n = (listVersions(dir)[0]?.n || 0) + 1;
  fs.copyFileSync(path.join(dir, 'final.mp4'), path.join(vdir, `v${n}.mp4`));
  if (exists(path.join(dir, 'thumb.jpg'))) fs.copyFileSync(path.join(dir, 'thumb.jpg'), path.join(vdir, `v${n}.jpg`));
  return `v${n}`;
}
function addHistory(dir, entry) {
  const mp = path.join(dir, 'meta.json');
  const m = readJSON(mp, {});
  m.history = [...(m.history || []), { at: new Date().toISOString().slice(0, 19), ...entry }];
  writeJSON(mp, m);
}
// Después de cambiar final.mp4: duración, miniatura y copia para móvil al día
async function refreshOutputs(dir) {
  const final = path.join(dir, 'final.mp4');
  const mp = path.join(dir, 'meta.json');
  const m = readJSON(mp, {});
  m.duration_out = (await ffprobeDur(final)) ?? m.duration_out;
  writeJSON(mp, m);
  try { await ff(['-ss', '1', '-i', final, '-frames:v', '1', '-vf', 'scale=540:-1', path.join(dir, 'thumb.jpg')]); } catch {}
  try {
    await ff(['-i', final, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', path.join(dir, 'final-movil.mp4')]);
  } catch {}
}

// Cambio con Claude: se envía EXACTAMENTE el prompt revisado por el usuario
ipcMain.handle('edited:revise', (_e, { id, prompt, desc }) => {
  const dir = path.join(DIRS.edited, id);
  const final = path.join(dir, 'final.mp4');
  const mp = path.join(dir, 'meta.json');
  const before = mtime(final);
  const backup = backupVersion(dir);
  const n = fs.readdirSync(dir).filter((f) => /^prompt-cambio-\d+\.txt$/.test(f)).length + 1;
  fs.writeFileSync(path.join(dir, `prompt-cambio-${n}.txt`), prompt, 'utf8');
  addHistory(dir, { type: 'claude', desc, backup });
  const m0 = readJSON(mp, {});
  delete m0.lastError;
  writeJSON(mp, { ...m0, status: 'processing' });
  send('lib:changed', 'edited');
  return runClaude({
    kind: 'edit', title: `Cambiando · ${m0.title || id}`, prompt,
    onDone: async () => {
      const m = readJSON(mp, {});
      delete m.status;
      if (mtime(final) === before) m.lastError = 'Claude no ha cambiado el vídeo. Sigue la versión anterior.';
      else delete m.lastError;
      writeJSON(mp, m);
      if (mtime(final) !== before) await refreshOutputs(dir);
      send('lib:changed', 'edited');
    },
  });
});

// Ajustes rápidos sin Claude (ffmpeg, segundos)
ipcMain.handle('edited:quick', async (_e, { id, op, value }) => {
  const dir = path.join(DIRS.edited, id);
  const final = path.join(dir, 'final.mp4');
  const tmp = path.join(dir, 'final.tmp.mp4');
  const dur = await ffprobeDur(final);
  const enc = ['-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
  let args, desc;
  if (op === 'speed') {
    args = ['-i', final, '-filter_complex', `[0:v]setpts=PTS/${value}[v];[0:a]atempo=${value}[a]`, '-map', '[v]', '-map', '[a]', ...enc, tmp];
    desc = `Velocidad x${value}`;
  } else if (op === 'trim') {
    const a = Math.max(0, +value.start || 0), b = Math.max(0, +value.end || 0);
    if (!a && !b) throw new Error('Nada que recortar');
    if (a + b >= dur - 0.5) throw new Error('Recorte demasiado largo');
    args = ['-ss', `${a}`, '-to', `${(dur - b).toFixed(3)}`, '-i', final, ...enc, tmp];
    desc = `Recortado ${a ? `${a}s al inicio` : ''}${a && b ? ' y ' : ''}${b ? `${b}s al final` : ''}`;
  } else if (op === 'volume') {
    args = ['-i', final, '-c:v', 'copy', '-af', `volume=${value}dB,alimiter=limit=0.89`, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp];
    desc = `Volumen ${value > 0 ? '+' : ''}${value} dB`;
  } else if (op === 'normalize') {
    args = ['-i', final, '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp];
    desc = 'Audio normalizado para TikTok (-14 LUFS)';
  } else throw new Error('Ajuste desconocido');
  const mp = path.join(dir, 'meta.json');
  writeJSON(mp, { ...readJSON(mp, {}), status: 'processing' });
  send('lib:changed', 'edited');
  try {
    await ff(args);
    const backup = backupVersion(dir);
    fs.renameSync(tmp, final);
    addHistory(dir, { type: 'ajuste', desc, backup });
    chatPush(dir, { role: 'event', text: `Ajuste rápido: ${desc}. La versión anterior quedó como ${backup}.` });
    await refreshOutputs(dir);
  } finally {
    fs.rmSync(tmp, { force: true });
    const m = readJSON(mp, {}); delete m.status; writeJSON(mp, m);
    send('lib:changed', 'edited');
  }
  return desc;
});

// Volver a una versión anterior (la actual también se guarda, así que no se pierde nada)
ipcMain.handle('edited:restore', async (_e, { id, version }) => {
  const dir = path.join(DIRS.edited, id);
  const src = path.join(dir, 'versions', `${version}.mp4`);
  if (!exists(src)) throw new Error('Versión no encontrada');
  const backup = backupVersion(dir);
  fs.copyFileSync(src, path.join(dir, 'final.mp4'));
  addHistory(dir, { type: 'restaurar', desc: `Vuelta a ${version}`, backup });
  chatPush(dir, { role: 'event', text: `Restaurada la ${version}. Lo que había se guardó como ${backup}.` });
  await refreshOutputs(dir);
  send('lib:changed', 'edited');
  return true;
});

// ---------- conversación con Claude por vídeo ----------
// library/edited/<id>/chat.json = { session, messages: [{ role: user|assistant|event|context, text, at }] }
const chatFile = (dir) => path.join(dir, 'chat.json');
const readChat = (dir) => readJSON(chatFile(dir), { session: null, messages: [] });
function chatPush(dir, msg) {
  const c = readChat(dir);
  c.messages.push({ at: new Date().toISOString().slice(0, 19), ...msg });
  writeJSON(chatFile(dir), c);
  send('chat:changed', path.basename(dir));
}
const chatJobs = new Map();   // id del vídeo -> id del trabajo en marcha

ipcMain.handle('chat:get', (_e, id) => ({ ...readChat(path.join(DIRS.edited, id)), jobId: chatJobs.get(id) || null }));

ipcMain.handle('chat:new', (_e, id) => {
  const dir = path.join(DIRS.edited, id);
  const c = readChat(dir);
  if (c.messages.length) writeJSON(path.join(dir, `chat-${Date.now()}.json`), c);   // la anterior se archiva
  writeJSON(chatFile(dir), { session: null, messages: [] });
  send('chat:changed', id);
  return true;
});

// Envía un mensaje. El primero va con el contexto del vídeo delante (se guarda y se ve en la conversación);
// los siguientes se envían tal cual y Claude retoma la misma sesión.
ipcMain.handle('chat:send', (_e, { id, text, context }) => {
  if (chatJobs.has(id)) throw new Error('Claude ya está trabajando en este vídeo');
  const dir = path.join(DIRS.edited, id);
  const final = path.join(dir, 'final.mp4');
  const mp = path.join(dir, 'meta.json');
  const c = readChat(dir);
  const first = !c.session;
  if (first && context) chatPush(dir, { role: 'context', text: context });
  chatPush(dir, { role: 'user', text });
  const prompt = first && context ? `${context}\n\nMENSAJE DEL USUARIO\n${text}` : text;

  const before = mtime(final);
  const backup = backupVersion(dir);   // por si Claude cambia el vídeo; si no lo toca, se descarta
  writeJSON(mp, { ...readJSON(mp, {}), status: 'processing' });
  send('lib:changed', 'edited');

  let reply = '', session = c.session;
  const jobId = runClaude({
    kind: 'chat', title: `Conversación · ${readJSON(mp, {}).title || id}`, prompt, resume: c.session,
    onEvent: (ev) => {
      if (ev.session_id && ev.session_id !== session) {
        session = ev.session_id;
        const cc = readChat(dir); cc.session = session; writeJSON(chatFile(dir), cc);
      }
      if (ev.type === 'assistant') {
        for (const b of ev.message?.content || []) if (b.type === 'text' && b.text.trim()) reply = b.text.trim();
      }
      if (ev.type === 'result' && typeof ev.result === 'string' && ev.result.trim()) reply = ev.result.trim();
    },
    onDone: async (code) => {
      chatJobs.delete(id);
      const changed = mtime(final) !== before;
      const m = readJSON(mp, {}); delete m.status; writeJSON(mp, m);
      if (changed) {
        addHistory(dir, { type: 'claude', desc: text.slice(0, 140), backup });
        await refreshOutputs(dir);
      } else {
        // sin cambios en el vídeo: la copia de seguridad sobra
        fs.rmSync(path.join(dir, 'versions', `${backup}.mp4`), { force: true });
        fs.rmSync(path.join(dir, 'versions', `${backup}.jpg`), { force: true });
      }
      if (reply) chatPush(dir, { role: 'assistant', text: reply });
      else if (code !== 0) chatPush(dir, { role: 'event', text: 'Claude no ha podido terminar. Mira el panel de tareas para ver qué ha pasado.' });
      if (changed) chatPush(dir, { role: 'event', text: `Vídeo actualizado. La versión anterior quedó como ${backup}.` });
      send('lib:changed', 'edited');
    },
  });
  chatJobs.set(id, jobId);
  send('chat:changed', id);
  return jobId;
});

// ---------- canciones en tendencia de TikTok (lista, no archivos: tienen copyright y se añaden desde TikTok) ----------
const TRENDS = () => path.join(ROOT, 'library', 'tools', 'tendencias.json');
ipcMain.handle('trends:get', () => readJSON(TRENDS(), { updated: null, songs: [] }));
ipcMain.handle('trends:refresh', () => runClaude({
  kind: 'trends', title: 'Actualizando canciones en tendencia',
  extraTools: ['WebSearch', 'WebFetch'],
  prompt: `Actualiza library/tools/tendencias.json con las canciones que más se están usando AHORA en TikTok (hoy es ${today()}).
Busca en la web (Tokchart worldwide y Estados Unidos, TikTok Creative Center, Revid, Metricool, listas de TikTok España) y quédate con 12-15 canciones,
priorizando las que también suenan en España y en vídeos en español. Para cada una: title, artist y notes (1 frase: posición/crecimiento
o por qué es tendencia, sin inventar datos). Mantén el mismo formato JSON: { "updated": "${today()}", "sources": [urls usadas], "songs": [...] }.
No descargues ninguna canción.${RUN_RULES}`,
  onDone: () => send('lib:changed', 'trends'),
}));
ipcMain.handle('shell:external', (_e, url) => {
  if (/^https:\/\/(www\.)?tiktok\.com\//.test(url)) return shell.openExternal(url);
  return false;
});

// ---------- editor manual (línea de tiempo) ----------
// library/edited/<id>/timeline.json  ->  python engine/timeline.py render <id>  ->  editor/render.mp4  ->  final.mp4
const pyEnv = () => ({ ...process.env, PYTHONIOENCODING: 'utf8', PYTHONUTF8: '1' });
const runPy = (args) => new Promise((resolve, reject) =>
  execFile('python', args, { cwd: ROOT, env: pyEnv(), windowsHide: true, maxBuffer: 1 << 24 },
    (err, out, errOut) => (err ? reject(new Error((errOut || out || err.message).trim().split('\n').pop())) : resolve(out))));

ipcMain.handle('editor:load', async (_e, id) => {
  const dir = path.join(DIRS.edited, id);
  const tf = path.join(dir, 'timeline.json');
  if (!exists(tf)) await runPy(['engine/timeline.py', 'import', id]);
  const tl = readJSON(tf, null);
  const meta = readJSON(path.join(dir, 'meta.json'), {});
  const srcAbs = path.join(ROOT, tl.source);
  return { id, title: meta.title || id, timeline: tl, sourceDur: (await ffprobeDur(srcAbs)) || 0, busy: meta.status === 'processing',
    videos: projectVideos(id, tl) };
});

// Miniaturas (tira de fotogramas) y forma de onda, como en CapCut/Premiere. Se cachean por archivo + fecha.
const CACHE = () => path.join(ROOT, 'library', '.cache');
const cacheKey = (abs) => require('node:crypto').createHash('sha1').update(abs + mtime(abs)).digest('hex').slice(0, 16);
async function peaksFor(relFile, rate = 50) {
  const abs = path.join(ROOT, relFile);
  if (!exists(abs)) return null;
  const out = path.join(CACHE(), `peaks-${cacheKey(abs)}-${rate}.json`);
  if (exists(out)) return readJSON(out, null);
  fs.mkdirSync(CACHE(), { recursive: true });
  const sr = 8000;
  const buf = await new Promise((resolve, reject) => execFile('ffmpeg', ['-v', 'error', '-i', abs, '-vn', '-ac', '1', '-ar', String(sr), '-f', 's16le', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 30, windowsHide: true }, (err, o) => (err ? reject(err) : resolve(o))));
  const step = Math.floor(sr / rate), n = Math.floor(buf.length / 2 / step);
  const peaks = new Array(n);
  let max = 1;
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (let j = 0; j < step; j++) { const v = Math.abs(buf.readInt16LE((i * step + j) * 2)); if (v > p) p = v; }
    peaks[i] = p; if (p > max) max = p;
  }
  const res = { rate, peaks: peaks.map((p) => Math.round((p / max) * 100)) };
  writeJSON(out, res);
  return res;
}
async function stripFor(relFile) {
  const abs = path.join(ROOT, relFile);
  const dur = (await ffprobeDur(abs)) || 1;
  const fps = Math.min(4, 360 / dur);
  const key = cacheKey(abs);
  const img = path.join(CACHE(), `strip-${key}.jpg`);
  if (!exists(img)) {
    fs.mkdirSync(CACHE(), { recursive: true });
    const n = Math.max(1, Math.ceil(dur * fps));
    await ff(['-i', abs, '-vf', `fps=${fps},scale=-2:96,tile=${n}x1`, '-frames:v', '1', '-q:v', '5', img]);
  }
  return { strip: rel(img), fps, dur };
}
// Vídeos disponibles en el proyecto: los que ya usa la línea de tiempo + los de inputs/<id>/ y editor/media/
function projectVideos(id, tl) {
  const set = new Set([tl.source, ...tl.clips.map((c) => c.src).filter(Boolean)]);
  const meta = readJSON(path.join(DIRS.edited, id, 'meta.json'), {});
  (meta.sources || []).forEach((s) => set.add(s));
  for (const d of [path.join(DIRS.inputs, id), path.join(DIRS.edited, id, 'editor', 'media')]) {
    if (exists(d)) fs.readdirSync(d).filter((f) => KIND(f) === 'video').forEach((f) => set.add(rel(path.join(d, f))));
  }
  return [...set].filter((s) => s && exists(path.join(ROOT, s)));
}
async function assetsFor(src) {
  const [strip, voice, info] = await Promise.all([stripFor(src).catch(() => null), peaksFor(src).catch(() => null), probeVideo(path.join(ROOT, src))]);
  return { ...info, ...strip, voice };
}
ipcMain.handle('editor:assets', async (_e, id) => {
  const tl = readJSON(path.join(DIRS.edited, id, 'timeline.json'), null);
  if (!tl) return null;
  const sources = {};
  for (const s of projectVideos(id, tl)) sources[s] = await assetsFor(s);
  return { ...(sources[tl.source] || {}), sources };
});
ipcMain.handle('editor:sourceAssets', (_e, src) => assetsFor(src));
// Importar más vídeos al proyecto desde el editor (se copian; el original no se toca)
ipcMain.handle('editor:importVideos', async (_e, { id, files }) => {
  let list = files;
  if (!list) {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Vídeos', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }] });
    if (r.canceled) return [];
    list = r.filePaths;
  }
  const dir = path.join(DIRS.edited, id, 'editor', 'media');
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const f of list) {
    const base = slugify(path.basename(f, path.extname(f))).slice(0, 40), ext = path.extname(f) || '.mp4';
    let name = base + ext, i = 2;
    while (exists(path.join(dir, name))) name = `${base}-${i++}${ext}`;
    await fs.promises.copyFile(f, path.join(dir, name));
    out.push(rel(path.join(dir, name)));
  }
  return out;
});
ipcMain.handle('editor:peaks', (_e, file) => peaksFor(file).catch(() => null));

ipcMain.handle('editor:save', (_e, { id, timeline }) => {
  writeJSON(path.join(DIRS.edited, id, 'timeline.json'), timeline);
  return true;
});

// Vuelve a cargar lo que hizo Claude (el timeline actual se guarda como timeline.prev.json)
ipcMain.handle('editor:reimport', async (_e, id) => {
  const tf = path.join(DIRS.edited, id, 'timeline.json');
  if (exists(tf)) fs.renameSync(tf, path.join(DIRS.edited, id, 'timeline.prev.json'));
  fs.rmSync(path.join(DIRS.edited, id, 'editor', 'base.mp4'), { force: true });
  await runPy(['engine/timeline.py', 'import', id]);
  return true;
});

ipcMain.handle('editor:render', (_e, { id, timeline }) => {
  const dir = path.join(DIRS.edited, id);
  writeJSON(path.join(dir, 'timeline.json'), timeline);
  const mp = path.join(dir, 'meta.json');
  writeJSON(mp, { ...readJSON(mp, {}), status: 'processing' });
  send('lib:changed', 'edited');
  return runJob({
    kind: 'render', title: `Renderizando · ${readJSON(mp, {}).title || id}`,
    cmd: 'python', args: ['engine/timeline.py', 'render', id],
    parser: (l, emit) => emit(l.replace(/^\[timeline\]\s*/, ''), l.startsWith('[timeline]') ? 'tool' : 'dim'),
    onDone: async (code) => {
      const out = path.join(dir, 'editor', 'render.mp4');
      const m = readJSON(mp, {}); delete m.status; writeJSON(mp, m);
      if (code === 0 && exists(out)) {
        const backup = backupVersion(dir);
        fs.copyFileSync(out, path.join(dir, 'final.mp4'));
        const m2 = readJSON(mp, {}); m2.cuts = timeline.clips.length; writeJSON(mp, m2);
        addHistory(dir, { type: 'editor', desc: 'Editado a mano en el editor', backup });
        chatPush(dir, { role: 'event', text: `Editado a mano en el editor y renderizado. La versión anterior quedó como ${backup}.` });
        await refreshOutputs(dir);
      }
      send('lib:changed', 'edited');
      send('editor:rendered', { id, ok: code === 0 });
    },
  });
});

ipcMain.handle('edited:rename', (_e, { id, title }) => {
  const mp = path.join(DIRS.edited, id, 'meta.json');
  writeJSON(mp, { ...readJSON(mp, {}), title });
  send('lib:changed', 'edited');
  return true;
});
ipcMain.handle('references:delete', (_e, id) => {
  fs.rmSync(path.join(DIRS.references, id), { recursive: true, force: true });
  return true;
});

// Añadir referencia desde URL (TikTok, Instagram, YouTube...) o desde archivo
ipcMain.handle('references:add', async (_e, { url, file, title }) => {
  const base = url
    ? slugify((url.match(/@([\w.]+)\/video\/(\d+)/) || []).slice(1).join('-') || title || 'referencia')
    : slugify(title || path.basename(file, path.extname(file)));
  const id = uniqueId(DIRS.references, base);
  const dir = path.join(DIRS.references, id);
  fs.mkdirSync(dir, { recursive: true });
  const finish = () => {
    const info = readJSON(path.join(dir, 'video.info.json'), {});
    writeJSON(path.join(dir, 'meta.json'), {
      id,
      title: title || (info.title || '').split('#')[0].trim() || id,
      url: url || null,
      author: info.uploader || null,
      duration: info.duration || null,
      created: new Date().toISOString().slice(0, 19),
    });
    execFile('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', path.join(dir, 'video.mp4'), '-frames:v', '1',
      '-vf', 'scale=540:-1', path.join(dir, 'thumb.jpg')], { windowsHide: true }, () => send('lib:changed', 'references'));
  };
  if (file) {
    fs.copyFileSync(file, path.join(dir, 'video.mp4'));
    finish();
    return { id };
  }
  const jobId = runJob({
    kind: 'reference', title: `Descargando referencia`,
    cmd: 'yt-dlp',
    args: ['--newline', '--no-warnings', '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4',
      '-o', path.join(dir, 'video.%(ext)s'), '--write-info-json', url],
    parser: (l, emit) => { if (/\[download\]\s+\d/.test(l) && !/100%/.test(l)) return; emit(l.trim(), 'dim'); },
    onDone: (code) => { if (code === 0) finish(); else { fs.rmSync(dir, { recursive: true, force: true }); send('lib:changed', 'references'); } },
  });
  return { id, jobId };
});

ipcMain.handle('references:skillPrompt', (_e, id) => {
  const ref = listReferences().find((r) => r.id === id);
  return ref && ref.video ? skillPrompt(ref) : null;
});
ipcMain.handle('references:saveSkill', (_e, id) => {
  const ref = listReferences().find((r) => r.id === id);
  if (!ref || !ref.video) throw new Error('Referencia sin vídeo');
  return runClaude({
    kind: 'skill', title: `Creando skill · ${ref.title || id}`,
    prompt: skillPrompt(ref) + RUN_RULES,
    onDone: () => send('lib:changed', 'references'),
  });
});

// Editar vídeo en dos fases:
//  1) edit:prepare  copia el vídeo a inputs/ y reserva el id (para que el prompt pueda llevar rutas exactas)
//  2) edit:run      envía a Claude EXACTAMENTE el prompt que el usuario ha revisado
const prepared = new Map();
// files: [{ path, role, note }] en el orden elegido. Un solo vídeo → inputs/<id>.mp4 (como siempre);
// varios → inputs/<id>/01-<nombre>.mp4, 02-…
ipcMain.handle('edit:prepare', async (_e, { file, files, title }) => {
  const list = files || [{ path: file, role: 'principal' }];
  const first = list[0].path;
  const id = uniqueId(DIRS.edited, `${slugify(title || path.basename(first, path.extname(first)))}-${today()}`);
  fs.mkdirSync(path.join(DIRS.edited, id), { recursive: true });   // reserva el id
  let inputs = [], cleanup;
  if (list.length === 1) {
    const abs = path.join(DIRS.inputs, `${id}${path.extname(first) || '.mp4'}`);
    await fs.promises.copyFile(first, abs);
    inputs = [{ ...list[0], abs }]; cleanup = abs;
  } else {
    const dir = path.join(DIRS.inputs, id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [i, f] of list.entries()) {
      const abs = path.join(dir, `${String(i + 1).padStart(2, '0')}-${slugify(path.basename(f.path, path.extname(f.path))).slice(0, 40)}${path.extname(f.path) || '.mp4'}`);
      await fs.promises.copyFile(f.path, abs);
      inputs.push({ ...f, abs });
    }
    cleanup = dir;
  }
  const out = [];
  for (const f of inputs) out.push({ path: rel(f.abs), name: path.basename(f.path), role: f.role || 'principal', note: f.note || '', ...(await probeVideo(f.abs)) });
  prepared.set(id, { inputAbs: inputs[0].abs, cleanup, inputs: out });
  return { id, input: out[0].path, inputs: out };
});
ipcMain.handle('edit:discard', (_e, id) => {
  const p = prepared.get(id);
  if (!p) return false;
  fs.rmSync(p.cleanup || p.inputAbs, { recursive: true, force: true });
  fs.rmSync(path.join(DIRS.edited, id), { recursive: true, force: true });
  prepared.delete(id);
  return true;
});
ipcMain.handle('edit:run', (_e, { id, title, recipe, prompt }) => {
  const p = prepared.get(id);
  if (!p) throw new Error('Vídeo no preparado');
  prepared.delete(id);
  const outDir = path.join(DIRS.edited, id);
  writeJSON(path.join(outDir, 'meta.json'), {
    id, title: title || id, source: rel(p.inputAbs), ...(p.inputs.length > 1 ? { sources: p.inputs.map((x) => x.path) } : {}),
    recipe, status: 'processing',
    created: new Date().toISOString().slice(0, 19),
  });
  fs.writeFileSync(path.join(outDir, 'prompt.txt'), prompt, 'utf8');   // queda guardado lo que se envió
  send('lib:changed', 'edited');
  return runClaude({
    kind: 'edit', title: `Editando · ${title || id}`, prompt,
    onDone: () => {
      const mp = path.join(outDir, 'meta.json');
      const m = readJSON(mp, {});
      if (!exists(path.join(outDir, 'final.mp4'))) writeJSON(mp, { ...m, status: 'error' });
      else if (m.status) { delete m.status; writeJSON(mp, m); }
      send('lib:changed', 'edited');
    },
  });
});

// ---------- herramientas: carpetas de transiciones, canciones, sonidos y efectos ----------
const KIND = (f) => {
  const e = path.extname(f).toLowerCase();
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(e)) return 'audio';
  if (['.mp4', '.mov', '.webm', '.m4v', '.mkv'].includes(e)) return 'video';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(e)) return 'image';
  if (e === '.json') return 'preset';
  return 'file';
};
function listTools(cat) {
  const dir = DIRS[cat];
  return fs.readdirSync(dir).filter((f) => !f.endsWith('.meta.json') && !f.startsWith('.') && f !== 'README.md')
    .map((f) => {
      const p = path.join(dir, f);
      const kind = KIND(f);
      const meta = kind === 'preset' ? readJSON(p, {}) : readJSON(`${p}.meta.json`, {});
      return {
        file: f, kind, path: rel(p), v: mtime(p),
        name: meta.name || f.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
        notes: meta.notes || '', size: fs.statSync(p).size,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
ipcMain.handle('tools:list', (_e, cat) => (TOOL_CATS.includes(cat) ? listTools(cat) : []));
ipcMain.handle('tools:add', async (_e, { cat, files }) => {
  let list = files;
  if (!list) {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return 0;
    list = r.filePaths;
  }
  for (const f of list) {
    let name = path.basename(f), i = 2;
    while (exists(path.join(DIRS[cat], name))) name = `${path.basename(f, path.extname(f))}-${i++}${path.extname(f)}`;
    fs.copyFileSync(f, path.join(DIRS[cat], name));
  }
  return list.length;
});
ipcMain.handle('tools:preset', (_e, { cat, name, notes, file }) => {
  const f = file || `${slugify(name)}.json`;
  writeJSON(path.join(DIRS[cat], f), { name, notes });
  return f;
});
ipcMain.handle('tools:meta', (_e, { cat, file, name, notes }) => {
  const p = path.join(DIRS[cat], file);
  if (KIND(file) === 'preset') writeJSON(p, { ...readJSON(p, {}), name, notes });
  else writeJSON(`${p}.meta.json`, { name, notes });
  return true;
});
// A la papelera de Windows (se puede recuperar), nunca borrado definitivo
ipcMain.handle('tools:remove', async (_e, { cat, file }) => {
  const p = path.join(DIRS[cat], file);
  await shell.trashItem(p);
  if (exists(`${p}.meta.json`)) await shell.trashItem(`${p}.meta.json`);
  return true;
});
ipcMain.handle('tools:openDir', (_e, cat) => shell.openPath(DIRS[cat]));

ipcMain.handle('job:cancel', (_e, id) => {
  const j = jobs.get(id);
  if (j) {
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(j.child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    else j.child.kill('SIGTERM');
  }
  return true;
});

// ---------- ventana ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640,
    backgroundColor: '#0b0b0f',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0b0f', symbolColor: '#a1a1aa', height: 36 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Modo prueba: MARC_SHOTS=<carpeta> captura cada sección y cierra la app
  if (process.env.MARC_SHOTS) {
    const out = process.env.MARC_SHOTS;
    fs.mkdirSync(out, { recursive: true });
    win.webContents.on('console-message', (_e, _l, msg) => console.log('[renderer]', msg));
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const js = (code) => win.webContents.executeJavaScript(code);
      const click = (txt) => js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(txt)})?.click()`);
      const shot = async (name) => { await wait(1200); fs.writeFileSync(path.join(out, `${slugify(name)}.png`), (await win.webContents.capturePage()).toPNG()); };
      for (const v of ['Vídeos editados', 'Guiones', 'Referencias']) { await click(v); await shot(v); }
      await click('Herramientas');
      for (const t of ['Subtítulos', 'Transiciones', 'Canciones', 'Sonidos', 'Efectos']) { await click(t); await shot(`tools-${t}`); }
      if (process.env.MARC_TEST_EDITOR) {
        await click('Editor'); await wait(800);
        await js(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(process.env.MARC_TEST_EDITOR)}))?.click()`);
        await wait(6000); await shot('editor');
        await js(`[...document.querySelectorAll('button[title="Vídeos"]')][0]?.click()`); await shot('editor-lib-videos');
        await js(`document.querySelector('[class*="bg-orange-900"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10 }))`);
        await js(`window.dispatchEvent(new PointerEvent('pointerup'))`); await shot('editor-broll');
        await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
        await js(`document.querySelector('.grid.size-9')?.click()`); await wait(300); await shot('editor-play-broll');
        await wait(2200); await shot('editor-play-clip2');
        await wait(1500); await shot('editor-play-clip3');
        await js(`document.querySelector('.grid.size-9')?.click()`);
        await js(`[...document.querySelectorAll('[title]')].find(d => d.getAttribute('title') === 'charcutería')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10 }))`);
        await js(`window.dispatchEvent(new PointerEvent('pointerup'))`);
        await shot('editor-texto');
        for (const tab of ['Stickers', 'Efectos', 'Música']) {
          await js(`[...document.querySelectorAll('button[title=${JSON.stringify(tab)}]')][0]?.click()`); await shot(`editor-lib-${tab}`);
        }
        await js(`document.querySelector('.grid.size-9')?.click()`); await wait(2500); await shot('editor-play');
        await js(`document.querySelector('.grid.size-9')?.click()`);
      }
      if (process.env.MARC_TEST_EDITED) {
        await click('Vídeos editados'); await wait(800);
        await js(`[...document.querySelectorAll('[role=button]')].find(d => d.textContent.includes(${JSON.stringify(process.env.MARC_TEST_EDITED)}))?.click()`);
        for (const t of ['Cambiar con Claude', 'Ajustes rápidos', 'Versiones', 'Info']) {
          await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)}))?.click()`);
          if (t === 'Cambiar con Claude') {
            await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Música más baja')?.click()`);
            await shot('edited-claude');
            await click('Revisar el prompt'); await shot('edited-claude-prompt');
            fs.writeFileSync(path.join(out, 'revision-prompt.txt'), await js(`[...document.querySelectorAll('textarea')].pop()?.value || ''`), 'utf8');
            await click('Atrás');
          } else if (t === 'Ajustes rápidos') {
            await shot('edited-quick');
            await click('1.1x'); await wait(8000); await shot('edited-quick-done');
          } else await shot(`edited-${t}`);
        }
        await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
      }
      if (process.env.MARC_TEST_FILE) {
        await js(`window.__MARC_TEST_FILE = ${JSON.stringify(process.env.MARC_TEST_FILE.split('|'))}`);
        await click('Editar vídeo');
        for (let i = 0; i < 11; i++) {
          if (i === 0) await wait(1500);
          if (i === 1 && process.env.MARC_TEST_REF) await js(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(process.env.MARC_TEST_REF)}))?.click()`);
          if (i === 5) await js(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Punch en el corte'))?.click()`);
          await shot(`wizard-${i}`);
          await click('Seguir');
        }
        await wait(800);
        fs.writeFileSync(path.join(out, 'prompt.txt'), await js(`document.querySelector('textarea')?.value || ''`), 'utf8');
        await shot('wizard-revision');
        await js(`document.querySelector('.btn-icon.ml-auto')?.click()`);   // cerrar: descarta el vídeo preparado
        await wait(800);
      }
      app.quit();
    });
  }
}

app.whenReady().then(async () => {
  while (!ROOT) {
    const r = await dialog.showOpenDialog({
      title: 'Elige la carpeta del proyecto (la que contiene «library»)',
      properties: ['openDirectory'],
    });
    if (r.canceled) return app.quit();
    if (fs.existsSync(path.join(r.filePaths[0], 'library'))) ROOT = r.filePaths[0];
    else await dialog.showMessageBox({ type: 'warning', message: 'Esa carpeta no tiene la carpeta «library». Elige la carpeta «marc edits».' });
  }
  if (app.isPackaged) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    writeJSON(CONFIG_FILE, { root: ROOT });
  }
  initDirs();
  // media://f/<ruta relativa a la raíz>  → sirve vídeos e imágenes de la biblioteca
  protocol.handle('media', (req) => {
    const u = new URL(req.url);
    const relPath = decodeURIComponent(u.pathname.replace(/^\//, ''));
    const abs = path.resolve(ROOT, relPath);
    if (!abs.startsWith(ROOT) || !exists(abs)) return new Response('not found', { status: 404 });
    const size = fs.statSync(abs).size;
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.get('range');
    const m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
      let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
      end = Math.min(end, size - 1, start + 8 * 1024 * 1024 - 1);   // trozos de 8 MB como mucho
      const body = Readable.toWeb(fs.createReadStream(abs, { start, end }));
      return new Response(body, { status: 206, headers: {
        'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`, 'Cache-Control': 'no-cache' } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(abs)), {
      status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(size), 'Cache-Control': 'no-cache' } });
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
