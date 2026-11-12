"""Motor de edicion para videos verticales de TikTok.

Uso:
  python engine/edit.py --input inputs/video.mp4 --recipe library/tools/recipes/basico.json --id mi-video [--title "..."]

Pasos:
  1. Transcribe con Whisper (marcas de tiempo por palabra) si no hay transcript.json.
  2. Corta los silencios y las pausas largas (jump cuts).
  3. Reencuadra a 1080x1920 con zooms alternos en cada corte.
  4. Subtitulos animados palabra por palabra (ASS) segun la receta.
  5. Normaliza el audio a -14 LUFS y exporta library/edited/<id>/final.mp4.

Todas las rutas son relativas a la raiz del proyecto.
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def log(msg):
    print(f"[edit] {msg}", flush=True)


def probe_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def transcribe(inp, outdir, model, language):
    os.makedirs(outdir, exist_ok=True)
    log(f"Transcribiendo con Whisper ({model})...")
    env = dict(os.environ, PYTHONIOENCODING="utf8")
    subprocess.run(
        ["whisper", inp, "--model", model, "--language", language, "--word_timestamps", "True",
         "--output_format", "json", "--output_dir", outdir, "--verbose", "False"],
        check=True, env=env,
    )
    base = os.path.splitext(os.path.basename(inp))[0]
    return os.path.join(outdir, base + ".json")


def load_words(transcript_path, corrections):
    data = json.load(open(transcript_path, encoding="utf8"))
    words = []
    for seg in data.get("segments", []):
        for w in seg.get("words", []):
            text = w["word"].strip()
            if not text:
                continue
            key = re.sub(r"[^\wáéíóúñü]", "", text.lower())
            if key in corrections:
                text = corrections[key]
            words.append({"text": text, "start": float(w["start"]), "end": float(w["end"])})
    return words, data.get("text", "").strip()


def build_segments(words, duration, cuts):
    gap = cuts.get("silence_gap", 0.35)
    pb = cuts.get("pad_before", 0.06)
    pa = cuts.get("pad_after", 0.12)
    groups = []
    for w in words:
        if groups and w["start"] - groups[-1][-1]["end"] <= gap:
            groups[-1].append(w)
        else:
            groups.append([w])
    segs = []
    for g in groups:
        s = max(0.0, g[0]["start"] - pb)
        e = min(duration, g[-1]["end"] + pa)
        if segs and s < segs[-1]["end"]:
            s = segs[-1]["end"]
        if e - s > 0.05:
            segs.append({"start": s, "end": e, "words": g})
    # Divide segmentos largos para cambiar el zoom sin cortar tiempo
    max_len = cuts.get("max_shot", 4.5)
    out = []
    for sg in segs:
        cur_start, cur_words = sg["start"], []
        for i, w in enumerate(sg["words"]):
            cur_words.append(w)
            nxt = sg["words"][i + 1] if i + 1 < len(sg["words"]) else None
            if nxt and (w["end"] - cur_start) >= max_len:
                cut = (w["end"] + nxt["start"]) / 2
                out.append({"start": cur_start, "end": cut, "words": cur_words, "hard": False})
                cur_start, cur_words = cut, []
        out.append({"start": cur_start, "end": sg["end"], "words": cur_words, "hard": True})
    t = 0.0
    for sg in out:
        sg["new_start"] = t
        t += sg["end"] - sg["start"]
    return out, t


def ass_color(hex_color, alpha=0):
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ts(t):
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def chunk_words(words, cap):
    per = cap.get("words_per_chunk", 3)
    max_chars = cap.get("max_chars", 16)
    chunks, cur = [], []
    for i, w in enumerate(words):
        if cur:
            length = sum(len(x["text"]) + 1 for x in cur) + len(w["text"])
            gap = w["start"] - cur[-1]["end"]
            if len(cur) >= per or length > max_chars or gap > 0.3 or re.search(r"[.!?,]$", cur[-1]["text"]):
                chunks.append(cur)
                cur = []
        cur.append(w)
    if cur:
        chunks.append(cur)
    return chunks


def build_ass(segments, cap, out_w, out_h):
    # Pasa las palabras al tiempo nuevo (despues de los cortes)
    words = []
    for sg in segments:
        off = sg["new_start"] - sg["start"]
        for w in sg["words"]:
            words.append({"text": w["text"], "start": max(sg["new_start"], w["start"] + off),
                          "end": min(sg["new_start"] + sg["end"] - sg["start"], w["end"] + off)})
    upper = cap.get("uppercase", True)
    font = cap.get("font", "Montserrat Black")
    size = cap.get("size", 86)
    primary = ass_color(cap.get("primary", "#FFFFFF"))
    hi = ass_color(cap.get("highlight", "#FFE14D"))
    outline = ass_color(cap.get("outline", "#000000"))
    back = ass_color(cap.get("shadow_color", "#000000"), 0x60)
    x = out_w // 2
    y = int(out_h * cap.get("pos_y", 0.68))
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {out_w}
PlayResY: {out_h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},{size},{primary},{primary},{outline},{back},-1,0,0,0,100,100,{cap.get('spacing', 1)},0,1,{cap.get('outline_w', 7)},{cap.get('shadow', 3)},5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    chunks = chunk_words(words, cap)
    for ci, ch in enumerate(chunks):
        nxt_start = chunks[ci + 1][0]["start"] if ci + 1 < len(chunks) else ch[-1]["end"] + 0.4
        chunk_end = min(ch[-1]["end"] + 0.15, nxt_start)
        for wi, w in enumerate(ch):
            start = w["start"]
            end = ch[wi + 1]["start"] if wi + 1 < len(ch) else chunk_end
            if end - start < 0.02:
                continue
            parts = []
            for k, other in enumerate(ch):
                t = other["text"].upper() if upper else other["text"]
                t = t.replace("{", "(").replace("}", ")")
                if k == wi and cap.get("highlight_active", True):
                    parts.append(f"{{\\c{hi}}}{t}{{\\c{primary}}}")
                else:
                    parts.append(t)
            anim = ""
            if wi == 0 and cap.get("pop", True):
                anim = "\\fscx70\\fscy70\\t(0,90,\\fscx108\\fscy108)\\t(90,150,\\fscx100\\fscy100)"
            text = f"{{\\pos({x},{y}){anim}}}" + " ".join(parts)
            lines.append(f"Dialogue: 0,{ts(start)},{ts(end)},Cap,,0,0,0,,{text}")
    return header + "\n".join(lines) + "\n", words


def build_filter(segments, zoom, out_w, out_h, fps, ass_rel, fonts_rel, loudnorm):
    pattern = zoom.get("pattern", [1.0, 1.12])
    anchor = zoom.get("anchor_y", 0.35)
    parts, labels = [], []
    zi = 0
    for i, sg in enumerate(segments):
        z = pattern[zi % len(pattern)] if zoom.get("enabled", True) else 1.0
        zi += 1
        W, H = int(out_w * z) // 2 * 2, int(out_h * z) // 2 * 2
        parts.append(
            f"[0:v]trim=start={sg['start']:.3f}:end={sg['end']:.3f},setpts=PTS-STARTPTS,"
            f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,"
            f"crop={out_w}:{out_h}:(iw-{out_w})/2:(ih-{out_h})*{anchor},setsar=1,fps={fps}[v{i}]"
        )
        d = sg["end"] - sg["start"]
        fade = min(0.012, d / 4)
        parts.append(
            f"[0:a]atrim=start={sg['start']:.3f}:end={sg['end']:.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={fade:.3f},afade=t=out:st={d - fade:.3f}:d={fade:.3f}[a{i}]"
        )
        labels.append(f"[v{i}][a{i}]")
    n = len(segments)
    parts.append(f"{''.join(labels)}concat=n={n}:v=1:a=1[vc][ac]")
    parts.append(f"[vc]subtitles='{ass_rel}':fontsdir='{fonts_rel}',format=yuv420p[vout]")
    if loudnorm:
        parts.append("[ac]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]")
    else:
        parts.append("[ac]aresample=48000[aout]")
    return ";\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--recipe", default="library/tools/recipes/basico.json")
    ap.add_argument("--id", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--transcript", default="")
    ap.add_argument("--corrections", default="", help="JSON {palabra: correccion}")
    args = ap.parse_args()

    recipe = json.load(open(args.recipe, encoding="utf8"))
    out_cfg = recipe.get("output", {})
    W, H, fps = out_cfg.get("w", 1080), out_cfg.get("h", 1920), out_cfg.get("fps", 30)
    outdir = f"library/edited/{args.id}"
    workdir = f"{outdir}/work"
    os.makedirs(workdir, exist_ok=True)

    corrections = dict(recipe.get("corrections", {}))
    if args.corrections:
        corrections.update(json.loads(args.corrections))

    transcript = args.transcript or transcribe(
        args.input, workdir, recipe.get("whisper_model", "medium"), recipe.get("language", "es"))
    words, full_text = load_words(transcript, corrections)
    if not words:
        sys.exit("No se han detectado palabras en el audio.")

    duration = probe_duration(args.input)
    segments, new_dur = build_segments(words, duration, recipe.get("cuts", {}))
    log(f"{len(segments)} planos · {duration:.1f}s -> {new_dur:.1f}s")

    ass, mapped_words = build_ass(segments, recipe.get("captions", {}), W, H)
    ass_path = f"{workdir}/captions.ass"
    open(ass_path, "w", encoding="utf8").write(ass)

    fc = build_filter(segments, recipe.get("zoom", {}), W, H, fps, ass_path, "engine/fonts",
                      recipe.get("audio", {}).get("loudnorm", True))
    fc_path = f"{workdir}/filter.txt"
    open(fc_path, "w", encoding="utf8").write(fc)

    final = f"{outdir}/final.mp4"
    log("Renderizando...")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-stats", "-y", "-i", args.input, "-filter_complex_script", fc_path,
         "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium",
         "-crf", str(out_cfg.get("crf", 18)), "-profile:v", "high", "-c:a", "aac", "-b:a", "192k",
         "-movflags", "+faststart", final],
        check=True,
    )
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", final, "-frames:v", "1",
                    "-vf", "scale=540:-1", f"{outdir}/thumb.jpg"], check=True)

    edl = [{"src_start": round(s["start"], 3), "src_end": round(s["end"], 3),
            "out_start": round(s["new_start"], 3), "hard_cut": s["hard"]} for s in segments]
    json.dump({"segments": edl, "words": mapped_words}, open(f"{outdir}/edl.json", "w", encoding="utf8"),
              ensure_ascii=False, indent=1)
    meta = {
        "id": args.id,
        "title": args.title or args.id,
        "source": args.input,
        "recipe": recipe.get("name", os.path.basename(args.recipe)),
        "duration_in": round(duration, 2),
        "duration_out": round(new_dur, 2),
        "cuts": len(segments),
        "created": dt.datetime.now().isoformat(timespec="seconds"),
        "transcript": " ".join(w["text"] for w in words),
    }
    json.dump(meta, open(f"{outdir}/meta.json", "w", encoding="utf8"), ensure_ascii=False, indent=2)
    log(f"Listo: {final}")


if __name__ == "__main__":
    main()
