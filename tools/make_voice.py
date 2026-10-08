"""Generate the coach voice clips with Chatterbox Multilingual TTS (MIT licence).

Usage: python make_voice.py voice_lines.json OUT_DIR [lang ...]

For every line it renders up to N takes, transcribes each take with Whisper,
keeps the take whose words best match the script, trims anything the model
added after the last expected word, and normalises loudness. Resumable: clips
already in OUT_DIR are skipped. Needs: chatterbox-tts, faster-whisper, librosa,
pyloudnorm, soundfile.
"""
import difflib, json, os, re, sys, unicodedata

import librosa
import numpy as np
import pyloudnorm
import soundfile as sf
import torch
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from faster_whisper import WhisperModel

TAKES = 3
SR = 24000


def norm(s, lang):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    if lang == "ar":
        s = re.sub("[إأآا]", "ا", s).replace("ة", "ه").replace("ى", "ي")
    return re.sub(r"[^\w]+", " ", s).strip()


def sim(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def pitch(y):
    f0 = librosa.yin(y, fmin=80, fmax=420, sr=SR)
    rms = librosa.feature.rms(y=y)[0][: len(f0)]
    f0 = f0[: len(rms)][rms > rms.max() * 0.25]
    return float(np.median(f0)) if len(f0) else 0.0


def main():
    lines = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    langs = sys.argv[3:] or ["en", "fr", "es", "ar"]
    torch.set_num_threads(os.cpu_count() or 4)
    tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    asr = WhisperModel("small", device="cpu", compute_type="int8")
    meter = pyloudnorm.Meter(SR)
    report = {}
    for lang in langs:
        os.makedirs(os.path.join(out, lang), exist_ok=True)
        for key, texts in lines.items():
            path = os.path.join(out, lang, key + ".wav")
            if os.path.exists(path):
                continue
            want = norm(texts[lang], lang)
            best = None
            for take in range(TAKES + 1):
                torch.manual_seed(1000 * take + 7)
                ex, cfg = [(0.65, 0.4), (0.55, 0.5), (0.75, 0.3), (0.5, 0.5)][take]
                try:
                    text = texts[lang] if take < 2 else texts[lang].replace("!", ".").replace("¡", "")
                    y = tts.generate(text, language_id=lang, exaggeration=ex, cfg_weight=cfg).squeeze(0).numpy()
                except Exception as e:  # very short lines sometimes fail; try the next take
                    print("take failed", lang, key, e, flush=True)
                    continue
                if len(y) < SR * 0.15:
                    continue
                y16 = librosa.resample(y, orig_sr=SR, target_sr=16000).astype(np.float32)
                segs, _ = asr.transcribe(y16, language=lang, beam_size=3, word_timestamps=True)
                words = [w for s in segs for w in (s.words or [])]
                # best prefix of the heard words: drops anything babbled after the script
                score, end = 0.0, len(y) / SR
                for i in range(len(words)):
                    s = sim(norm("".join(w.word for w in words[: i + 1]), lang), want)
                    if s > score:
                        score, end = s, words[i].end
                f0 = pitch(y)
                total = score - (0.3 if f0 < 150 else 0)
                if best is None or total > best[0]:
                    best = (total, score, f0, y, end)
                if score >= 0.95 and f0 >= 150:
                    break
            if best is None:
                print("SKIPPED", lang, key, flush=True)
                continue
            total, score, f0, y, end = best
            y = y[: min(len(y), int((end + 0.12) * SR))]
            y, _ = librosa.effects.trim(y, top_db=38)
            fade = int(0.03 * SR)
            y[-fade:] *= np.linspace(1, 0, fade)
            y = pyloudnorm.normalize.loudness(y, meter.integrated_loudness(y), -15.0) if len(y) > SR * 0.4 else y / (np.abs(y).max() + 1e-6) * 0.7
            y = np.clip(y, -0.98, 0.98)
            sf.write(path, y, SR)
            report[lang + "/" + key] = {"match": round(score, 3), "f0": round(f0, 1), "sec": round(len(y) / SR, 2)}
            print(lang, key, report[lang + "/" + key], flush=True)
    with open(os.path.join(out, "report-%s.json" % "-".join(langs)), "w") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
