# Motion Trail

**Version 2.1.0** · A HIIT lane-runner workout game for **My PC** (Samsung TV 2024+, Tizen 8) and desktop Chrome.

Your athlete sprints down a three-lane road through a real-time 3D world (WebGL, with lighting, shadows, fog and textured terrain). Barriers, hurdles, laser gates and kick pads rush at you, and a voice coach calls each move a moment before it arrives. **You do the move for real** (side step, jump, squat, kick) and press the matching button on the remote, or switch to **Hands-free** and just follow the coach while the runner dodges by itself.

Every stage is a real interval session: warm-up → work/rest rounds → cool-down, with music that drives during work and softens during recovery.

## Features

- **10 stages, 10 terrains**: Dawn Boulevard (city at sunrise), Harbor Lights (night port), Canyon Run (desert mesas), Neon District (night city), Glacier Pass (snowy peaks), Orbit Ring (space station), Forest Trail, Coastal Highway (sunset ocean), Volcano Ridge (lava fields) and Aurora Tundra (northern lights). Each one has its own road surface, props, skyline or mountains, sky, sun and fog. Each stage adds moves and speed, and stages unlock in order. The stage carousel shows each terrain live behind the menu.
- **HIIT structure**: warm-up, then work/recovery rounds, then cool-down. Work time follows your fitness level (Beginner 20 s, Intermediate 30 s, Advanced 40 s) with **10 s of recovery** (15 s in low-impact mode), 6 to 12 rounds per stage.
- **Custom workout** (main menu → CUSTOM): pick the moves (side step, jump, squat, kick, big jump), a preset (20/10, 30/10, 40/20, 45/15, 60/10) or your own work and recovery times (work 10–180 s, recovery 5–90 s), the number of rounds (1–30) and the terrain. The total time and estimated kcal update as you change it, and the setup is saved.
- **Renderer**: 3D on WebGL; effects scale with the TV's quality tier (shadows and full-resolution textures on mid/high tiers). Without WebGL it falls back to a 2D renderer automatically (or set `"renderer": "2d"` in the owner config).
- **Moves**: side step (left/right), jump, big jump, squat, front kick, plus jogging or marching in place between obstacles.
- **Low-impact mode**: switched on automatically for a BMI of 30 or more, age 60 or more, or a beginner with a BMI of 27 or more (or chosen by hand). Jumps become *reach-ups* and big jumps become *knee lifts*; jump-type moves are at least 6 s apart; obstacles are spaced 35% further apart; the pace is 10% slower and every recovery is 5 s longer.
- **Calorie estimate** from sex, age, height, weight and fitness level: resting energy (Mifflin-St Jeor) × MET of each move (Compendium of Physical Activities, approximated). Shown live during play, per stage before you start, and in your lifetime total. These are estimates, not medical measurements.
- **Female voice coach** in English, French, Spanish and Arabic: moves, countdowns, rounds, rest, halfway, last round, stage names, finish, encouragement.
- **10 original HIIT tracks** (house, techno, electro, synthwave, drum & bass, trap, 96–174 BPM). They are composed in code and rendered on the device, so nothing big is downloaded. Choose one or let each stage pick its own.
- Score, combos, energy orbs, accuracy, best combo; best score per stage; top-10 scores through My PC.
- Interface in English, French, Spanish and Arabic (right to left).

## Controls

Everything works with the **arrows + OK**.

| | Menus | During a workout (Remote mode; Hands-free needs no buttons) |
|---|---|---|
| ◀ ▶ | change a value | step left / right (change lane) |
| ▲ | move up | jump (big jump / reach-up / knee lift, as cued) |
| ▼ | move down | squat (hold to stay low) |
| OK | select | kick |
| Back | My PC pause menu (Resume, Restart stage, Quit to menu, Quit) | same |

Standalone in Chrome: arrows, **Enter** (OK) and **Esc** (pause).

**Hands-free** is the default (Settings → Controls): the runner dodges by itself, so you can put the remote down and just follow the coach. Choose **Remote** to press the arrows and OK yourself.

## Settings, saves, config

- Profile (sex, age, height, weight, fitness level, impact, units), settings and progress are saved per My PC profile with `MyPC.save`.
- Owner config (App Store Manager → Config), all optional:
  `speed` (0.6–1.6, default 1), `sets` (1–4 passes through a stage's round list, default 2), `restBonus` (extra rest seconds, 0–60), `warmupSeconds` and `cooldownSeconds` (10–120, default 30), `voice` (false turns the coach off).

## Files

- `index.html`: entry page; `js/game.js` (game, HUD, menus, 2D fallback renderer), `js/world3d.js` (3D world), `js/music.js` (music and sound effects), `js/i18n.js` (texts)
- `lib/three.min.js`: three.js r158 (MIT licence, `lib/three-LICENSE.txt`)
- `voice/<lang>.js`: coach voice for each language (one MP3 sprite each, about 0.5 MB)
- `fonts/`: Barlow Condensed and Cairo (SIL Open Font License, see the OFL files)
- `tools/`: scripts that generated the voice (`make_voice.py`, `build_voice.py`, `voice_lines.json`)

## Credits and licences

- Code, terrains, textures (painted in code), props and the athlete: original, made for this game. 3D engine: three.js (MIT).
- Music: 10 original tracks generated by `js/music.js`.
- Coach voice: generated with [Chatterbox Multilingual TTS](https://huggingface.co/ResembleAI/chatterbox) by Resemble AI (MIT licence), checked automatically with Whisper. To regenerate it: `python tools/make_voice.py tools/voice_lines.json out` then `python tools/build_voice.py out voice`.
- Fonts: Barlow Condensed (Jeremy Tribby) and Cairo (Mohamed Gaber), SIL Open Font License 1.1.

## Health note

Clear some space around you, wear proper shoes, and stop if you feel pain, dizziness or shortness of breath. If you have a medical condition, check with a professional before starting. Calorie figures are estimates.
