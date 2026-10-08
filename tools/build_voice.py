"""Pack the generated voice clips of each language into one MP3 sprite.

Usage: python build_voice.py CLIPS_DIR OUT_DIR [lang ...]

Writes OUT_DIR/<lang>.js, which sets window.MT_VOICE = {lang, clips: {key: [start, dur]}, mp3: base64}.
A script file (not fetch) so the game also loads it when index.html is opened from disk.
Needs ffmpeg, numpy, soundfile.
"""
import base64, json, os, subprocess, sys, tempfile

import numpy as np
import soundfile as sf

GAP = 0.3


def main():
    src, out = sys.argv[1], sys.argv[2]
    langs = sys.argv[3:] or ["en", "fr", "es", "ar"]
    os.makedirs(out, exist_ok=True)
    for lang in langs:
        folder = os.path.join(src, lang)
        parts, clips, pos, sr = [], {}, GAP, 24000
        for name in sorted(os.listdir(folder)):
            if not name.endswith(".wav"):
                continue
            y, sr = sf.read(os.path.join(folder, name), dtype="float32")
            clips[name[:-4]] = [round(pos, 3), round(len(y) / sr + 0.04, 3)]
            parts += [y, np.zeros(int(GAP * sr), np.float32)]
            pos += len(y) / sr + GAP
        audio = np.concatenate([np.zeros(int(GAP * sr), np.float32)] + parts)
        with tempfile.TemporaryDirectory() as tmp:
            wav, mp3 = os.path.join(tmp, "a.wav"), os.path.join(tmp, "a.mp3")
            sf.write(wav, audio, sr)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-ar", "24000", "-b:a", "48k", mp3], check=True)
            data = base64.b64encode(open(mp3, "rb").read()).decode()
        with open(os.path.join(out, lang + ".js"), "w") as f:
            f.write("window.MT_VOICE = " + json.dumps({"lang": lang, "clips": clips}, separators=(",", ":"))[:-1] + ',"mp3":"' + data + '"};\n')
        print(lang, len(clips), "clips", round(pos, 1), "s", os.path.getsize(os.path.join(out, lang + ".js")) // 1024, "KB")


if __name__ == "__main__":
    main()
