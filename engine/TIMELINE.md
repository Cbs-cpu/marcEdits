# timeline.json (manual editor)

`library/edited/<id>/timeline.json` describes the whole edit. The app's editor and Claude both modify this file;
`python engine/timeline.py render <id>` renders it with HyperFrames → `library/edited/<id>/editor/render.mp4`
(the app copies it to `final.mp4` and keeps the previous version in `versions/`).

```json
{
  "version": 1, "fps": 30, "width": 1080, "height": 1920,
  "source": "inputs/video.mp4",                 // original, relative to the root
  "clips": [                                     // in order; output time = sum of the previous durations
    { "in": 2.57, "out": 5.86, "zoom": 1.0, "cx": 0.5, "cy": 0.35, "punch": false }
  ],
  "captions": [                                  // times on the OUTPUT timeline (seconds)
    { "start": 0.0, "end": 1.3, "text": "aunque parezca", "size": 94, "color": "#FFFFFF", "top": 1005, "back": false }
  ],
  "voice": { "gain_db": 0 },
  "music": { "file": "library/tools/canciones/x.mp3", "start": 0, "offset": 0, "gain_db": -20, "duck": true,
             "fade_in": 0.5, "fade_out": 1 },     // or null
  "sfx": [ { "file": "library/tools/sonidos/pop.mp3", "t": 1.34, "gain_db": -18 } ],
  "cutout": { "file": "work/reels/x/assets/subject.webm", "sig": "…" },  // or null
  "grade": "contrast(1.07) saturate(.9) brightness(.97)",                // "none" = natural
  "look": "bold"
}
```

- `captions.size`: px on the 1080x1920 frame (94 normal line, 150 medium, 220 large, 300 huge). `top`: px from the top
  (safe zone 225–1460). Bold style: Inter Tight 900, dark outline, blur-pop entrance. Key word in yellow `#FAE67A`.
- `back: true` = behind the head; it only works while `cutout.sig` matches the clips (`sig()` in timeline.py).
  If the cuts change, it renders in front, or regenerate the cutout with the skill's `scripts/cutout.py`.
- The mix (voice + music with ducking + sfx → -14 LUFS) is done by the render; do not normalise beforehand.
- v2 (professional editor):
  - `clips[].speed` (0.5–2, voice keeps its pitch), `clips[].transition` (`none|punch|zoom|flash|blur|whip`, entering
    the clip), `clips[].pushin` + `pushin_amount` (slow zoom across the clip).
  - `captions[]`: `font` (Inter Tight, Montserrat, DM Serif Display, Instrument Serif, Caveat, Inter), `stroke`
    (outline and shadow), `box` (background), `anim` (`pop|fade|up|type|none`), `x` (horizontal offset in px).
  - `overlays[]`: stickers `{type: title|emoji|arrow|cart|circle, text, start, end, x, y (centre, px), size, color, bg,
    rotate, anim (pop|fade|up|type|bounce|none), loop}`.
  - `effects[]`: `{type: shake|zoom|flash|blur, t, dur, amount}`.
  - `progress`: `{enabled, pos: top|bottom, color, height}` progress bar. `enhance: true` = denoise + sharpening
    for low-resolution sources. `voice.clean` = 80 Hz high-pass.
- v3 (several videos / complex edits):
  - `clips[].src`: the video this clip is cut from (relative path); without `src` it comes from `source`. This is how
    several raw videos are joined: clips from different files one after the other, in the order you want.
  - `clips[].fit`: `fill` (crop to 9:16, default) | `blur` (whole frame over a blurred copy: horizontal videos,
    screen recordings) | `fit` (whole frame over black). `clips[].gain_db`: that clip's audio volume; `clips[].mute`:
    clip without its own sound.
  - `broll[]`: `{src, in, start, end, fit, zoom, cx, cy}` footage OVER the main video (like CapCut's overlay layer)
    between `start` and `end` on the output timeline, starting at second `in` of `src`; the main video's voice keeps
    playing underneath (voice-over on B-roll). While there is B-roll, "behind the head" captions render in front.
  - Long videos: `in`/`out` can point anywhere in a source of any length; only the chosen clips get rendered.
  - The raw videos of an edit with several inputs live in `inputs/<id>/01-….mp4, 02-…`; those added from the
    editor, in `library/edited/<id>/editor/media/`.
- Example of a finished reel: `library/edited/embutido-reel-pro-2026-11-09/timeline.json`.
- To import an edit: `python engine/timeline.py import <id>` (from the skill project, the engine's EDL or the final).
