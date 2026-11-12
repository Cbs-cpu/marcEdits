---
name: marc-edits-app
description: "Marc Edits project, an Electron desktop app for editing TikTok videos with Claude Code on the user's subscription."
metadata:
  node_type: memory
  type: project
  originSessionId: f62c6cf9-f666-42ab-ada9-8a4d35e86f24
  modified: 2026-11-08T19:01:53.283Z
---

The app in `C:\Users\Cobos\Desktop\marc edits` launches `claude -p` (subscription, never API key) to edit vertical TikTok videos in Spanish (creator @marcaltarriba).

User preferences (2026-11-08):
- Model for the app's edits: Opus 5.5 (`claude-opus-5-5`), not Sonnet.
- Loved the edit made with the @tenfoldmarc `video-edit` skill (Bold look), but asked for more readable captions.
- Wants a real executable (no .bat).
- Tools section split into folders: subtitles, transitions, songs, sounds, effects.
- "Editar vídeo" as a step-by-step guided flow whose final prompt is shown exactly before it goes to Claude.
- Top priority when editing: clean silence cuts and a perfect transcription, removing the speaker's false starts.

**Why:** these were their explicit requests while building the app.
**How to apply:** respect them in future changes. Related: [[idioma-espanol]].
