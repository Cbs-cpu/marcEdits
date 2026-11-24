# Marc Edits

Desktop app (Electron) for editing vertical TikTok videos with Claude Code, using the user's Claude subscription (not the API).
The app launches `claude -p` in this folder. Speak to the user in Spanish.

## Structure
- `app/`: Electron + React + Tailwind app. `npm start` inside `app/` builds and opens it.
- `engine/edit.py`: fast editing engine (Whisper → silence cuts → zooms → ASS captions → 1080x1920 MP4). Configured by a recipe.
- `engine/fonts/`: fonts for the engine's captions (Montserrat Black / ExtraBold).
- `library/edited/<id>/`: edited videos (`final.mp4`, `thumb.jpg`, `meta.json`, `edl.json`).
- `library/references/<id>/`: reference videos (`video.mp4`, `meta.json`, `thumb.jpg`, `analysis.md` once analysed).
- `library/scripts/<id>.md`: scripts (`# Title`, then hook / body / CTA).
- `library/tools/recipes/*.json`: editing styles. `basico.json` is the base schema. `ref-<id>.json` comes from a reference.
  If it has a `"skill"` field (e.g. `skill-video-edit.json`), it means "edit by following that skill" instead of the engine.
- `.claude/skills/ref-<id>/SKILL.md`: skills generated with the "Save as skill" button on a reference.
- `.claude/skills/video-edit/`: skill by @tenfoldmarc (Bold / Cool girl / Cool dude, HyperFrames). Adapted for Spanish:
  `ingest.py` and `transcribe_cut.py` use Whisper with `language=es` (never `.en` models); the app sets
  `VE_WHISPER_MODEL=large-v3-turbo` (same Spanish text, 2.5x faster than `large-v3`).
  Its projects live in `work/reels/<slug>/`.
- `inputs/`: copies of the raw videos (the originals are never touched).
- `library/tools/{transiciones,canciones,sonidos,efectos}/`: the user's tool folders. Media files carry a `<file>.meta.json`
  sidecar (name, notes); `.json` files are presets describing the effect. The edit prompt lists the chosen ones with their path and notes.
- The app sends Claude (model `claude-opus-5-5`) exactly the prompt the user reviewed in "Editar vídeo"; it is saved in
  `library/edited/<id>/prompt.txt`.
- Reference for how a "Bold" video should look: `work/reels/embutido/build.py` (readable captions v2).
- App installer: `cd app && npm run dist` → `app/release/Marc Edits Setup x.y.z.exe`.
- Every new edit is rendered from `timeline.json` with `engine/timeline.py` (so the editor opens it complete).
- Manual editor: `library/edited/<id>/timeline.json` (format in `engine/TIMELINE.md`) + `python engine/timeline.py import|render <id>`.
  If a video has `timeline.json`, it is the source of truth: Claude's changes go there and get rendered with timeline.py.
- Per-video conversation: `library/edited/<id>/chat.json` (the Claude session is resumed with `--resume`).
- Before Claude is called, the app runs `engine/prep.py` (no Claude): faster-whisper transcription (`large-v3-turbo`
  int8 on CPU, `large-v3` if CUDA works, `small` on low-RAM PCs; hardware profile cached in `library/.cache/hw.json`),
  silences and contact sheets → `library/edited/<id>/work/prep.json`. With the video-edit skill it also writes the
  skill's ingest files into `work/reels/<id>/`, so `ingest.py` must NOT be run again. `MARC_WHISPER_URL` sends only the
  audio to our own transcription server (OpenAI-compatible API) instead.
- Each video/carousel stores a timer in `meta.json` → `timing { started, finished, seconds, steps }`; changes store
  `lastChange.seconds`. Claude runs with `--effort medium` (app setting "Rápido") or `high` ("Máx. calidad").
- Carousels (TikTok Shop photo posts): `library/carousels/<id>/` (`carousel.json`, `assets/`, `slides/NN.html` →
  `NN.png` 1080x1920, `contact.jpg`, `caption.txt`, `meta.json`, `chat.json`). Render with
  `python engine/carousel.py render <id> [--only N]` (Edge/Chrome headless). Format: `engine/CAROUSEL.md`.
  Skill: `.claude/skills/tiktok-carousel/` (+ `reference-carousel-adapter`, `hook-notes-carousel`, MIT, by maxxyart;
  in the app never ask for intermediate approvals). Reference carousels: `library/carousel-refs/<id>/01.jpg…`
  (`python engine/carousel.py fetch <id> <url>` uses gallery-dl). Trending formats: `library/tools/carruseles/formatos.json`.
  Never invent reviews, numbers or prices on slides.
- `.claude/skills/tiktok-hooks/`: 3-second hook formulas, retention rules and TikTok caption rules (knowledge from
  sergebulaev/tiktok-skills, MIT; its Publora/Apify publishing code is deliberately NOT included). Every new edit
  writes `library/edited/<id>/caption.txt` (shown in the video's Info tab).
- `.claude/skills/cut-video/`: the cut method (relative silence threshold, Spanish fillers, keep the last good take,
  re-transcribe an isolated window around EVERY join, repetition scan before delivering). Adapted for Spanish/Windows
  from louisedesadeleer/cut-video (MIT; original in `references/original-SKILL.md`). Every edit prompt points to it.
- Black gradient look: `"look": "bold"` with `"grade"` set adds the top/bottom black gradient + light vignette.
- **Express mode** (default in "Editar vídeo"): `engine/express.py <id> <videos…> [--title] [--notes] [--no-gradient]`
  does everything in ONE process in ~20 s: faster-whisper (GPU if the CUDA pip libs work, see `engine/prep.py`),
  real word bounds from audio energy (threshold max(floor+6, voice−32) dB), Claude in a single no-tools call
  (`claude -p --tools "" --effort low`, JSON: words to drop, start word, caption, title), join verification in one
  batched transcription, ffmpeg render (trim/concat, 12 ms audio fades, gradient PNG overlay, -14 LUFS, NVENC when
  available). Writes the same files as a normal edit (incl. timeline.json, so it opens in the manual editor) plus
  `work/express.json`. The full Claude flow stays for captions/effects/references.
  "Editar vídeo" is ONLY express now (`app/src/views/QuickEdit.jsx`: videos, Zooms, Degradado, optional reference,
  notes). Zooms (default on, `--no-zoom`): «push» = slow alternating in/out 6-10 % + small hit on each cut (1.035, every
  third 1.08) — toned down after «se van demasiado»; «jump» = fixed scale per clip 1.0/1.16/1.06/1.22 (UGC style).
  Scale is always ≥ 1 and cropped inside the frame: no black borders, no distortion.
  Reference (`--ref <id>`): analysis.md + SKILL.md + recipe go into the single Claude call, which returns
  `style {zoom: push|jump|none, strength, pause, hook_text}`. A reference that is not analysed yet is analysed first
  (full Claude job, once) and then the express edit runs. Claude call uses `--effort medium` (consistent decisions).
  Perfect cuts (`safe_cuts`): words that fall entirely in silence are moved to the real voice onset; every clip is
  trimmed to real voice (−0.03/+0.05 s); pauses > 0.25 s inside a clip are split (keeps `pause`); a cut is only made
  in silence or in the deepest valley between words (±0.12 s); otherwise the dropped neighbouring words are restored
  (e.g. «Y es que» glued to the next phrase). Connectors are never treated as repetitions.
  Transcription against repetitions: Whisper ALWAYS runs with `condition_on_previous_text=False` (with True it
  «cleans up» the text and skips repeated takes, so nobody could remove them); voice without words (≥0.35 s) is
  transcribed on its own and inserted (`fill_gaps`); words Claude drops in a block (2+ in a row) are never restored
  by the cut, which falls in the energy valley instead; `repeats_left` drops the first take of any phrase still
  repeated before rendering; and `final_check` listens to final.mp4 (large-v3 on GPU, better words) → `meta.transcript`
  and `meta.check.repeated`.
  Claude can ask for up to 2 images (`meta.needs[]`: `{n, t, dur, what, said, image}`; times on the final video).
  The video window shows each request; attaching one copies it to `media/imagen-N.*` and runs
  `express.py <id> --rerender` (ffmpeg only, ~5 s): rounded card with shadow over the lower half, 0.18 s fades.
- Product spec (accounts, subscriptions, own server): `docs/SPEC.md` — nothing marked "Futuro" is built without approval.
- Trending TikTok songs: `library/tools/tendencias.json` (list only; copyrighted, never downloaded or put in the
  video: the user adds them from TikTok when publishing).

## Rules
- The audio is in Spanish. Captions say exactly what is said (accents, brands, numbers).
- Clean cuts: kill dead air and the speaker's false starts / repetitions; confirm with `silencedetect` (-40 dB, 0.08 s)
  and with the energy around each cut. Verify the joins on the final render.
- Every finished video goes in `library/edited/<id>/` with `final.mp4`, `thumb.jpg` and `meta.json`
  (id, title, source, recipe, duration_in, duration_out, cuts, created, transcript) so the app shows it.
- Audio mix: the voice leads; background music 15-20 dB below the voice with ducking (sidechaincompress driven by the voice),
  0.5 s fade-in / 0.8-1 s fade-out; short sound effects 8-12 dB under the voice; master at -14 LUFS / -1.5 dBTP, AAC 192k 48 kHz.
- Changes to an already edited video: the app saves the current version in `library/edited/<id>/versions/vN.mp4`
  before calling Claude; work in the `project` from meta.json and only touch what is asked.
- Songs in `library/tools/canciones/` from Kevin MacLeod are CC BY 4.0: the credit (in their `.meta.json`) goes in the
  TikTok description.
- Never delete the user's files.
