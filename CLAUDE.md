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
  `ingest.py` and `transcribe_cut.py` use Whisper `large-v3` with `language=es` (never `.en` models).
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
