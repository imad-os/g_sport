/* Motion Trail: HIIT lane runner for My PC (Samsung TV) and desktop Chrome.
 * One canvas, fixed 960x540 logical size, one rAF loop with a fixed 60 Hz update.
 * All world objects live in pools created once; the loop does not allocate.
 */
(function () {
    'use strict';

    var VERSION = '2.1.0';
    var W = 960, H = 540, STEP = 1000 / 60, DT = 1 / 60;
    var canvas, ctx, RS = 1, PR = 2, raf = 0, last = 0, acc = 0, running = false;
    var info = null, lang = 'en', rtl = false, t = MT_TXT.en, tier = 'high', fxFull = true;
    var W3 = null, glCanvas = null, SCR = { x: 0, y: 0, v: true }, S3 = { dist: 0, camX: 0, R: null, OBS: null, ORBS: null, amp: 1, shake: 0, female: true }, biomeFade = 0, wantBiome = -1, biomeTimer = 0, thumbReal = [], thumbTimer = 0;
    var cfg = { speed: 1, restBonus: 0, warmup: 30, cooldown: 30, voice: true, sets: 2 };

    /* ---------------- saved data ---------------- */
    var profile = { sex: 0, age: 35, h: 168, w: 72, fit: 0, imp: 0, units: 0 };
    var settings = { ctrl: 1, track: -1, mvol: 2, coach: 1, fx: 0, cv: 2 };
    // custom workout: moves in CUSTOM_MOVES order, work/rest seconds, rounds, terrain (stage) index
    var CUSTOM_MOVES = ['side', 'jump', 'squat', 'kick', 'hjump'], PRESETS = [[20, 10], [30, 10], [40, 20], [45, 15], [60, 10]];
    var custom = { pre: 4, work: 60, rest: 10, rounds: 8, moves: [1, 1, 1, 1, 0], terrain: 0 }, customRun = false;
    var progress = { unlocked: 1, best: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bestCustom: 0, workouts: 0, kcal: 0, secs: 0, last: 0 };

    /* ---------------- levels ---------------- */
    var LEVELS = [
        { theme: 0, speed: 1.00, track: 0, rounds: [['side'], ['squat'], ['side', 'squat']] },
        { theme: 1, speed: 1.05, track: 1, rounds: [['side'], ['jump'], ['squat'], ['side', 'jump', 'squat']] },
        { theme: 2, speed: 1.10, track: 3, rounds: [['kick'], ['side', 'kick'], ['jump', 'squat'], ['side', 'jump', 'kick']] },
        { theme: 3, speed: 1.15, track: 2, rounds: [['hjump'], ['kick', 'squat'], ['side', 'hjump'], ['jump', 'kick'], ['side', 'squat', 'jump', 'kick', 'hjump']] },
        { theme: 4, speed: 1.20, track: 6, rounds: [['side', 'jump'], ['squat', 'kick'], ['hjump', 'side'], ['jump', 'squat', 'kick'], ['side', 'jump', 'squat', 'kick', 'hjump']] },
        { theme: 5, speed: 1.25, track: 9, rounds: [['side', 'squat'], ['jump', 'kick'], ['hjump', 'squat'], ['side', 'kick'], ['jump', 'squat', 'hjump'], ['side', 'jump', 'squat', 'kick', 'hjump']] },
        { theme: 6, speed: 1.28, track: 4, rounds: [['side', 'jump'], ['kick', 'squat'], ['hjump', 'side'], ['jump', 'kick'], ['squat', 'hjump'], ['side', 'jump', 'squat', 'kick', 'hjump']] },
        { theme: 7, speed: 1.32, track: 5, rounds: [['side', 'squat', 'jump'], ['kick', 'hjump'], ['side', 'kick'], ['jump', 'squat'], ['hjump', 'side', 'kick'], ['side', 'jump', 'squat', 'kick', 'hjump']] },
        { theme: 8, speed: 1.36, track: 8, rounds: [['jump', 'kick', 'side'], ['squat', 'hjump'], ['side', 'jump'], ['kick', 'squat', 'hjump'], ['side', 'squat'], ['side', 'jump', 'squat', 'kick', 'hjump']] },
        { theme: 9, speed: 1.4, track: 7, rounds: [['side', 'jump', 'squat'], ['kick', 'hjump', 'side'], ['jump', 'squat', 'kick'], ['side', 'hjump'], ['squat', 'kick', 'jump'], ['side', 'jump', 'squat', 'kick', 'hjump']] }
    ];
    var NL = LEVELS.length;
    var WORK_REST = [[20, 10], [30, 10], [40, 10]];
    var LOW_REST_BONUS = 5;
    var BASE_SPEED = [8.5, 10, 11.5];
    var GAP = [3.4, 2.7, 2.1];
    // MET values (standard, low impact). Sources: Compendium of Physical Activities, approximated.
    var MET = { run: [8.0, 4.0], side: [6.5, 4.5], squat: [5.5, 5.0], jump: [8.0, 4.0], hjump: [9.0, 4.5], kick: [7.0, 4.8], rest: [2.8, 2.5], warm: [4.0, 3.0], cool: [3.3, 2.8] };
    var FIT_FACTOR = [0.88, 1.0, 1.12];

    /* ---------------- calories ---------------- */
    function bmi() { return profile.w / ((profile.h / 100) * (profile.h / 100)); }
    function lowImpact() {
        if (profile.imp === 1) return true;
        if (profile.imp === 2) return false;
        var b = bmi();
        return b >= 30 || profile.age >= 60 || (profile.fit === 0 && b >= 27);
    }
    // Resting energy (Mifflin-St Jeor), kcal per second. Activity energy = MET x resting energy.
    function rmrPerSec() {
        var kcalDay = 10 * profile.w + 6.25 * profile.h - 5 * profile.age + (profile.sex === 1 ? 5 : -161);
        return Math.max(900, kcalDay) / 86400;
    }
    function workMet(focus, low) {
        var li = low ? 1 : 0, sum = 0;
        for (var i = 0; i < focus.length; i++) sum += MET[focus[i]][li];
        return (MET.run[li] * 0.5 + (sum / focus.length) * 0.5) * FIT_FACTOR[profile.fit];
    }
    function segMet(seg, low) {
        var li = low ? 1 : 0;
        if (seg.type === 'work') return workMet(seg.focus, low);
        if (seg.type === 'rest') return MET.rest[li];
        if (seg.type === 'warmup') return MET.warm[li] * FIT_FACTOR[profile.fit];
        return MET.cool[li];
    }

    function buildTimeline(li) {
        var L = LEVELS[li], wr = WORK_REST[profile.fit], low = lowImpact(), out = [], n = L.rounds.length;
        var work = wr[0], rest = wr[1] + (low ? LOW_REST_BONUS : 0) + cfg.restBonus, focusList = L.rounds;
        n = L.rounds.length * cfg.sets;
        if (customRun) { work = custom.work; rest = custom.rest + (low ? LOW_REST_BONUS : 0); n = custom.rounds; focusList = [customFocus()]; }
        out.push({ type: 'warmup', dur: cfg.warmup, round: 0, focus: null, start: 0 });
        for (var r = 0; r < n; r++) {
            out.push({ type: 'work', dur: work, round: r + 1, focus: focusList[r % focusList.length], start: 0 });
            if (r < n - 1) out.push({ type: 'rest', dur: rest, round: r + 1, focus: null, start: 0 });
        }
        out.push({ type: 'cooldown', dur: cfg.cooldown, round: 0, focus: null, start: 0 });
        var s = 0;
        for (var i = 0; i < out.length; i++) { out[i].start = s; s += out[i].dur; }
        return out;
    }
    function customFocus() { var f = []; for (var i = 0; i < CUSTOM_MOVES.length; i++) if (custom.moves[i]) f.push(CUSTOM_MOVES[i]); return f.length ? f : ['side']; }
    function timelineLength(tl) { var s = 0; for (var i = 0; i < tl.length; i++) s += tl[i].dur; return s; }
    function estimateKcal(li, asCustom) {
        var was = customRun; customRun = !!asCustom;
        var tl = buildTimeline(li);
        customRun = was;
        var low = lowImpact(), k = 0, r = rmrPerSec();
        for (var i = 0; i < tl.length; i++) k += segMet(tl[i], low) * r * tl[i].dur;
        return k;
    }

    /* ---------------- small helpers (cached strings, fonts) ---------------- */
    var NUMS = [], TIMES = [], FONTS = {};
    function num(n) { n = n | 0; if (n < 0) n = 0; if (n < 200000) return NUMS[n] || (NUMS[n] = String(n)); return String(n); }
    function clock(s) {
        s = Math.max(0, Math.ceil(s)) | 0;
        if (TIMES[s]) return TIMES[s];
        var m = (s / 60) | 0, r = s % 60;
        return (TIMES[s] = m + ':' + (r < 10 ? '0' : '') + r);
    }
    function font(px, w) {
        var k = px * 10 + (w === 800 ? 3 : w === 700 ? 2 : 1);
        return FONTS[k] || (FONTS[k] = w + ' ' + px + 'px Barlow, Cairo, Arial, sans-serif');
    }
    function X(x) { return rtl ? W - x : x; }
    function A(a) { return !rtl || a === 'center' ? a : a === 'left' ? 'right' : 'left'; }
    function text(s, x, y, px, color, align, w) {
        ctx.font = font(px, w || 700);
        ctx.fillStyle = color;
        ctx.textAlign = align || 'left';
        ctx.fillText(s, x, y);
    }
    function rrect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function panel(x, y, w, h, r, fill, stroke, lw) {
        rrect(x, y, w, h, r);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
    }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, k) { return a + (b - a) * k; }
    var seed = 1;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

    /* ---------------- themes ---------------- */
    var THEMES = [
        { sky: ['#1d2550', '#7a4f8f', '#f7a072'], sun: [0.68, 0.78, 46, '#ffe0a8'], far: '#3b2d5c', near: '#2a2147', ground: '#272038', track: '#30344a', track2: '#2a2e42', line: '#ffd38a', accent: '#ffb347', warn: '#ff5f45', edge: '#f7c46c', fog: 'rgba(247,160,114,', kind: 'city', stars: 0 },
        { sky: ['#030b18', '#0b2a3d', '#1e5a6b'], sun: [0.25, 0.35, 22, '#e6f3ff'], far: '#0e2433', near: '#0b1c29', ground: '#0a1822', track: '#15303d', track2: '#112834', line: '#5ff2e4', accent: '#3fe0d0', warn: '#ff7b54', edge: '#3fe0d0', fog: 'rgba(30,90,107,', kind: 'harbor', stars: 1 },
        { sky: ['#3a1736', '#b2423a', '#ffb05c'], sun: [0.4, 0.86, 60, '#ffd27a'], far: '#7a2f2a', near: '#5a2421', ground: '#6b3324', track: '#8a4a32', track2: '#7c422c', line: '#ffe2b3', accent: '#ff8a3d', warn: '#ffd23f', edge: '#ffcf8a', fog: 'rgba(255,176,92,', kind: 'canyon', stars: 0 },
        { sky: ['#07020f', '#1c0a33', '#3d0f4f'], sun: [0.78, 0.5, 30, '#ff7ad9'], far: '#170a26', near: '#12081e', ground: '#0c0716', track: '#17112a', track2: '#130e23', line: '#ff3fb4', accent: '#2ef2ff', warn: '#ff3fb4', edge: '#2ef2ff', fog: 'rgba(61,15,79,', kind: 'neon', stars: 1 },
        { sky: ['#4a86c5', '#9cc9ec', '#e8f6ff'], sun: [0.3, 0.3, 34, '#ffffff'], far: '#a9c8e6', near: '#7fa6cc', ground: '#dbe9f5', track: '#9fb6cc', track2: '#93abc2', line: '#ffffff', accent: '#2f8dff', warn: '#ff5a6e', edge: '#ffffff', fog: 'rgba(232,246,255,', kind: 'ice', stars: 0 },
        { sky: ['#000003', '#060b1f', '#141a3a'], sun: [0.72, 0.42, 70, '#7b8cff'], far: '#1a2040', near: '#101530', ground: '#0a0d1e', track: '#1d2338', track2: '#181d30', line: '#8a7dff', accent: '#8a7dff', warn: '#ff5f8a', edge: '#55e6ff', fog: 'rgba(20,26,58,', kind: 'space', stars: 1 },
        { sky: ['#5f8fc9', '#a9c9e2', '#e9e4c8'], sun: [0.3, 0.6, 34, '#ffe7b0'], far: '#5f7f5a', near: '#2e4a2a', ground: '#3a3a1c', track: '#7a5a3c', track2: '#6e5034', line: '#ffffff', accent: '#ffd84a', warn: '#ff6a3a', edge: '#ffe08a', fog: 'rgba(185,201,169,', kind: 'ice', stars: 0 },
        { sky: ['#3e3d7a', '#d0708a', '#ffb067'], sun: [0.25, 0.9, 50, '#ffbf80'], far: '#5a4a6a', near: '#3a3a4a', ground: '#4a5a3a', track: '#3a3c44', track2: '#33353d', line: '#ffffff', accent: '#3fd8ff', warn: '#ff5f6d', edge: '#ffd27a', fog: 'rgba(240,163,131,', kind: 'canyon', stars: 0 },
        { sky: ['#120606', '#3d0e08', '#8a2a10'], sun: [0.6, 0.8, 50, '#ff7a3a'], far: '#1a0806', near: '#120403', ground: '#1a1210', track: '#2a2422', track2: '#241f1d', line: '#ffb347', accent: '#ff5a1f', warn: '#ffb03a', edge: '#ff5a1f', fog: 'rgba(58,18,10,', kind: 'canyon', stars: 0 },
        { sky: ['#020617', '#06233a', '#1a4a5a'], sun: [0.3, 0.4, 24, '#cfe8ff'], far: '#1a3248', near: '#0f2232', ground: '#8fa1b6', track: '#b9c6d4', track2: '#adbccb', line: '#7affc8', accent: '#7affc8', warn: '#ff6ad5', edge: '#7affc8', fog: 'rgba(15,44,60,', kind: 'ice', stars: 1 }
    ];
    var theme = THEMES[0], themeIdx = -1;
    var skyCv = null, sceneryCv = [], spr = {}, fogGrad = null, groundGrad = null, vignette = null, thumbs = [];

    /* ---------------- projection ---------------- */
    var CAM_H = 2.35, CAM_D = 3.4, FOCAL = 300, HOR = 196, CX = W / 2, FAR = 92, SPAWN_Z = 72, LANE = 2.0, HALF = 3.25;
    var camX = 0;
    function sc(z) { return FOCAL / (z + CAM_D); }
    function gy(z) { return HOR + CAM_H * sc(z); }
    function sx(x, z) { return CX + (x - camX) * sc(z); }
    function scr(x, y, z) { if (W3) { W3.project(x, y, z, SCR); return; } SCR.x = sx(x, z); SCR.y = gy(z) - y * sc(z); }

    /* ---------------- sprite factory (runs on theme change only) ---------------- */
    function glowDot(r, color) {
        var c = mkCanvas(r * 2, r * 2), g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
        gr.addColorStop(0, color); gr.addColorStop(0.25, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.9; g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
        return c;
    }
    function hexA(hex, a) {
        var n = parseInt(hex.slice(1), 16);
        return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function makeSky(th) {
        var w = (W + 160) * PR, h = (HOR + 24) * PR, c = mkCanvas(w, h), g = c.getContext('2d'), r = rngSeed(th.kind.length * 97 + 3);
        var gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.62, th.sky[1]); gr.addColorStop(1, th.sky[2]);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        var i;
        if (th.stars) for (i = 0; i < 160; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.6) + ')'; var s = (r() < 0.1 ? 2 : 1) * PR; g.fillRect(r() * w, r() * h * 0.7, s, s); }
        var sxp = th.sun[0] * w, syp = th.sun[1] * h, sr = th.sun[2] * PR;
        var sg = g.createRadialGradient(sxp, syp, 0, sxp, syp, sr * 4);
        sg.addColorStop(0, hexA(th.sun[3], 0.55)); sg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sg; g.fillRect(0, 0, w, h);
        g.fillStyle = th.sun[3]; g.beginPath(); g.arc(sxp, syp, sr, 0, 6.2832); g.fill();
        if (th.kind === 'space') { // ringed planet
            g.strokeStyle = 'rgba(190,200,255,0.55)'; g.lineWidth = 6 * PR; g.beginPath(); g.ellipse(sxp, syp, sr * 2.1, sr * 0.45, -0.25, 0, 6.2832); g.stroke();
            g.fillStyle = 'rgba(20,24,60,0.5)'; g.beginPath(); g.arc(sxp - sr * 0.3, syp - sr * 0.2, sr * 0.95, 0, 6.2832); g.fill();
        }
        if (th.kind === 'neon') { // sun bands
            g.fillStyle = th.sky[0];
            for (i = 0; i < 6; i++) g.fillRect(sxp - sr, syp + i * sr * 0.18, sr * 2, 2 * PR + i * PR);
        }
        // far silhouettes
        g.fillStyle = th.far;
        var base = h - 24 * PR, x = 0;
        if (th.kind === 'canyon' || th.kind === 'ice') {
            g.beginPath(); g.moveTo(0, h);
            for (x = 0; x <= w; x += 40 * PR) g.lineTo(x, base - (th.kind === 'ice' ? 50 + r() * 90 : (r() < 0.3 ? 70 : 30) + r() * 20) * PR);
            g.lineTo(w, h); g.closePath(); g.fill();
            if (th.kind === 'ice') { // snow caps
                g.fillStyle = 'rgba(255,255,255,0.7)';
                for (x = 0; x < w; x += 40 * PR) { g.beginPath(); g.arc(x, base - 120 * PR + r() * 60 * PR, 10 * PR, 0, 6.2832); g.fill(); }
            }
        } else {
            while (x < w) {
                var bw = (20 + r() * 50) * PR, bh = (25 + r() * (th.kind === 'harbor' ? 45 : 95)) * PR;
                g.fillRect(x, base - bh, bw, bh + 30 * PR);
                if (th.kind === 'harbor' && r() < 0.25) { g.fillRect(x + bw * 0.4, base - bh - 60 * PR, 4 * PR, 60 * PR); g.fillRect(x + bw * 0.4, base - bh - 60 * PR, 70 * PR, 4 * PR); }
                if (th.kind !== 'space' && r() < 0.6) {
                    g.fillStyle = th.kind === 'neon' ? (r() < 0.5 ? 'rgba(255,63,180,0.8)' : 'rgba(46,242,255,0.8)') : 'rgba(255,214,150,0.55)';
                    for (var k = 0; k < 6; k++) g.fillRect(x + r() * (bw - 4 * PR), base - r() * bh, 3 * PR, 2 * PR);
                    g.fillStyle = th.far;
                }
                x += bw + r() * 6 * PR;
            }
        }
        g.fillStyle = th.near; // near layer
        g.beginPath(); g.moveTo(0, h);
        for (x = 0; x <= w; x += 30 * PR) g.lineTo(x, h - (8 + r() * 14) * PR);
        g.lineTo(w, h); g.closePath(); g.fill();
        return c;
    }
    function rngSeed(s) { var v = s; return function () { v = (v * 16807) % 2147483647; return v / 2147483647; }; }

    // scenery sprites: [canvas, width m, height m]
    function makeScenery(th) {
        var out = [], r = rngSeed(th.kind.length * 13 + 1), ppm = 26 * PR, i;
        for (var v = 0; v < 3; v++) {
            var wm, hm, c, g;
            if (th.kind === 'city' || th.kind === 'neon' || th.kind === 'harbor') {
                wm = 5 + v * 1.5; hm = th.kind === 'harbor' ? 4 + v * 2.5 : 14 + v * 7;
                c = mkCanvas(wm * ppm, hm * ppm); g = c.getContext('2d');
                if (th.kind === 'harbor' && v < 2) { // container stacks
                    var cols = ['#c8553d', '#2d6a8e', '#e0a33a', '#3f8f6b'];
                    for (i = 0; i < 3 + v; i++) { g.fillStyle = cols[(i + v) % 4]; g.fillRect(0, c.height - (i + 1) * 2.4 * ppm, c.width, 2.3 * ppm); g.fillStyle = 'rgba(0,0,0,0.25)'; for (var q = 0; q < c.width; q += 0.5 * ppm) g.fillRect(q, c.height - (i + 1) * 2.4 * ppm, 0.12 * ppm, 2.3 * ppm); }
                } else {
                    var bg = g.createLinearGradient(0, 0, c.width, 0);
                    bg.addColorStop(0, th.near); bg.addColorStop(1, th.far);
                    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
                    for (var yy = 0.8; yy < hm - 0.8; yy += 1.4) for (var xx = 0.5; xx < wm - 0.6; xx += 1.1) {
                        var lit = r();
                        g.fillStyle = th.kind === 'neon' ? (lit < 0.18 ? 'rgba(255,63,180,0.75)' : lit < 0.34 ? 'rgba(46,242,255,0.7)' : 'rgba(255,255,255,0.05)') : (lit < 0.45 ? 'rgba(255,210,140,0.85)' : 'rgba(255,255,255,0.07)');
                        g.fillRect(xx * ppm, yy * ppm, 0.6 * ppm, 0.8 * ppm);
                    }
                    if (th.kind === 'neon') { g.fillStyle = v === 1 ? '#2ef2ff' : '#ff3fb4'; g.fillRect(0, 0, 0.18 * ppm, c.height); g.fillRect(c.width - 0.18 * ppm, 0, 0.18 * ppm, c.height); }
                    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, c.width, 0.25 * ppm);
                }
            } else if (th.kind === 'canyon') {
                wm = 6 + v * 2; hm = 9 + v * 5;
                c = mkCanvas(wm * ppm, hm * ppm); g = c.getContext('2d');
                var rg = g.createLinearGradient(0, 0, c.width, 0);
                rg.addColorStop(0, '#a4482f'); rg.addColorStop(0.6, '#7a3324'); rg.addColorStop(1, '#5a241b');
                g.fillStyle = rg; g.beginPath(); g.moveTo(0, c.height); g.lineTo(c.width * 0.12, c.height * 0.1); g.lineTo(c.width * 0.85, 0); g.lineTo(c.width, c.height); g.closePath(); g.fill();
                g.fillStyle = 'rgba(255,190,120,0.18)'; for (i = 1; i < 6; i++) g.fillRect(c.width * 0.1, c.height * i / 6, c.width * 0.85, 0.2 * ppm);
            } else if (th.kind === 'ice') {
                wm = 3 + v; hm = 6 + v * 2.5;
                c = mkCanvas(wm * ppm, hm * ppm); g = c.getContext('2d');
                g.fillStyle = '#2c5e4f'; // snowy pine
                for (i = 0; i < 4; i++) { var ty = c.height * (0.15 + i * 0.2), tw = c.width * (0.3 + i * 0.18); g.beginPath(); g.moveTo(c.width / 2, ty - c.height * 0.2); g.lineTo(c.width / 2 + tw / 2, ty + c.height * 0.08); g.lineTo(c.width / 2 - tw / 2, ty + c.height * 0.08); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(c.width / 2 - tw * 0.3, ty + c.height * 0.04, tw * 0.6, 0.18 * ppm); g.fillStyle = '#2c5e4f'; }
                g.fillStyle = '#4a3528'; g.fillRect(c.width / 2 - 0.2 * ppm, c.height * 0.85, 0.4 * ppm, c.height * 0.15);
            } else { // space pylons
                wm = 2.4 + v; hm = 10 + v * 6;
                c = mkCanvas(wm * ppm, hm * ppm); g = c.getContext('2d');
                var pg = g.createLinearGradient(0, 0, c.width, 0);
                pg.addColorStop(0, '#2b3355'); pg.addColorStop(0.5, '#3d4878'); pg.addColorStop(1, '#1a2040');
                g.fillStyle = pg; g.fillRect(c.width * 0.3, 0, c.width * 0.4, c.height);
                g.fillRect(0, c.height * 0.25, c.width, 0.5 * ppm); g.fillRect(0, c.height * 0.6, c.width, 0.5 * ppm);
                g.fillStyle = '#55e6ff'; for (i = 0; i < hm; i += 2) g.fillRect(c.width * 0.45, i * ppm, c.width * 0.1, 0.8 * ppm);
                g.fillStyle = '#ff5f8a'; g.fillRect(0, c.height * 0.25, 0.4 * ppm, 0.5 * ppm); g.fillRect(c.width - 0.4 * ppm, c.height * 0.6, 0.4 * ppm, 0.5 * ppm);
            }
            out.push([c, wm, hm]);
        }
        return out;
    }

    // obstacle sprites; each [canvas, width m, height m]; drawn with bottom centre at the anchor
    function makeObstacles(th) {
        var ppm = (tier === 'low' ? 55 : 95), o = {}, c, g;
        function begin(wm, hm) { c = mkCanvas(wm * ppm, hm * ppm); g = c.getContext('2d'); g.setTransform(ppm, 0, 0, ppm, wm * ppm / 2, hm * ppm); return g; } // origin bottom centre, metres, y down negative
        function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
        function hazard(x, y, w, h, a, b) {
            g.save(); rr(x, y, w, h, Math.min(h / 2, 0.06)); g.clip();
            g.fillStyle = a; g.fillRect(x, y, w, h); g.fillStyle = b;
            for (var s = x - h; s < x + w; s += h * 1.6) { g.beginPath(); g.moveTo(s, y + h); g.lineTo(s + h * 0.8, y + h); g.lineTo(s + h * 1.6, y); g.lineTo(s + h * 0.8, y); g.closePath(); g.fill(); }
            g.restore();
        }
        function glow(color, blur) { g.shadowColor = color; g.shadowBlur = blur * ppm * 0.1; }
        // side barrier (one lane)
        begin(1.9, 1.35);
        glow(th.warn, 3); g.fillStyle = '#161a26'; rr(-0.82, -1.18, 1.64, 1.1, 0.1); g.fill(); g.shadowBlur = 0;
        hazard(-0.74, -1.08, 1.48, 0.26, th.warn, '#1b1f2b');
        g.fillStyle = hexA(th.warn, 0.9); rr(-0.82, -1.24, 1.64, 0.08, 0.04); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(-0.74, -0.74, 1.48, 0.5);
        g.strokeStyle = hexA(th.warn, 0.95); g.lineWidth = 0.07; g.beginPath(); g.moveTo(-0.3, -0.62); g.lineTo(0, -0.38); g.lineTo(0.3, -0.62); g.stroke();
        g.fillStyle = '#0b0d14'; g.fillRect(-0.7, -0.1, 0.25, 0.1); g.fillRect(0.45, -0.1, 0.25, 0.1);
        o.block = [c, 1.9, 1.35];
        // hurdle (jump)
        function hurdle(hm, name) {
            begin(6.6, hm + 0.25);
            g.fillStyle = '#d8dde8'; g.fillRect(-3.1, -hm - 0.05, 0.12, hm + 0.05); g.fillRect(2.98, -hm - 0.05, 0.12, hm + 0.05);
            g.fillRect(-3.25, -0.06, 0.42, 0.06); g.fillRect(2.83, -0.06, 0.42, 0.06);
            glow(th.accent, 4); hazard(-3.0, -hm, 6.0, 0.2, th.accent, '#ffffff'); g.shadowBlur = 0;
            if (hm > 0.8) hazard(-3.0, -hm * 0.5, 6.0, 0.14, th.accent, '#ffffff');
            o[name] = [c, 6.6, hm + 0.25];
        }
        hurdle(0.58, 'hurdle'); hurdle(1.02, 'tall');
        // squat gate: laser beam at 1.2-1.45 m
        begin(6.8, 2.2);
        g.fillStyle = '#20263a'; g.fillRect(-3.25, -2.05, 0.28, 2.05); g.fillRect(2.97, -2.05, 0.28, 2.05); g.fillRect(-3.25, -2.12, 6.5, 0.16);
        g.fillStyle = th.edge; g.fillRect(-3.17, -1.95, 0.08, 1.8); g.fillRect(3.09, -1.95, 0.08, 1.8);
        glow(th.warn, 8); g.fillStyle = hexA(th.warn, 0.45); g.fillRect(-2.97, -1.48, 5.94, 0.3);
        g.fillStyle = '#ffffff'; g.fillRect(-2.97, -1.36, 5.94, 0.07); g.shadowBlur = 0;
        g.fillStyle = th.warn; for (var k = -2.6; k < 2.8; k += 0.65) { g.beginPath(); g.moveTo(k, -1.18); g.lineTo(k + 0.12, -1.06); g.lineTo(k + 0.24, -1.18); g.fill(); }
        o.bar = [c, 6.8, 2.2];
        // kick pad (one lane)
        begin(1.4, 1.6);
        g.fillStyle = '#2a2f3d'; g.fillRect(-0.06, -0.5, 0.12, 0.5); g.fillRect(-0.42, -0.07, 0.84, 0.07);
        glow(th.warn, 4); g.fillStyle = th.warn; rr(-0.5, -1.5, 1.0, 1.08, 0.22); g.fill(); g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,0.18)'; rr(-0.42, -1.44, 0.4, 0.96, 0.18); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 0.07; g.beginPath(); g.arc(0, -0.96, 0.28, 0, 6.2832); g.stroke();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, -0.96, 0.1, 0, 6.2832); g.fill();
        o.pad = [c, 1.4, 1.6];
        // orb
        var oc = mkCanvas(0.9 * ppm, 0.9 * ppm), og = oc.getContext('2d'), r0 = 0.45 * ppm, gr = og.createRadialGradient(r0, r0, 0, r0, r0, r0);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, th.accent); gr.addColorStop(0.55, hexA(th.accent, 0.35)); gr.addColorStop(1, 'rgba(0,0,0,0)');
        og.fillStyle = gr; og.fillRect(0, 0, oc.width, oc.height);
        og.strokeStyle = 'rgba(255,255,255,0.9)'; og.lineWidth = 0.03 * ppm; og.beginPath(); og.arc(r0, r0, r0 * 0.42, 0, 6.2832); og.stroke();
        o.orb = [oc, 0.9, 0.9];
        o.lamp = glowDot(Math.round(18 * PR), hexA(th.edge, 0.9));
        o.shadow = glowDot(Math.round(40 * PR), 'rgba(0,0,0,0.55)');
        return o;
    }

    function setTheme(i) {
        if (i === themeIdx) return;
        themeIdx = i; theme = THEMES[i];
        if (W3) { W3.setBiome(i); biomeFade = 1; thumbTimer = 0; }
        else { skyCv = makeSky(theme); sceneryCv = makeScenery(theme); }
        spr = makeObstacles(theme);
        fogGrad = ctx.createLinearGradient(0, HOR - 40, 0, HOR + 70);
        fogGrad.addColorStop(0, theme.fog + '0)'); fogGrad.addColorStop(0.4, theme.fog + '0.55)'); fogGrad.addColorStop(1, theme.fog + '0)');
        groundGrad = ctx.createLinearGradient(0, HOR, 0, H);
        groundGrad.addColorStop(0, theme.far); groundGrad.addColorStop(0.25, theme.ground); groundGrad.addColorStop(1, theme.ground);
        buildRunnerPaint();
    }
    function makeThumbs() {
        for (var i = 0; i < THEMES.length; i++) {
            var th = THEMES[i], c = mkCanvas(260 * PR, 120 * PR), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, c.height);
            gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.55, th.sky[1]); gr.addColorStop(0.75, th.sky[2]); gr.addColorStop(0.751, th.ground); gr.addColorStop(1, th.ground);
            g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
            g.fillStyle = th.sun[3]; g.beginPath(); g.arc(c.width * 0.5, c.height * 0.5, 12 * PR, 0, 6.2832); g.fill();
            g.fillStyle = th.far; for (var b = 0; b < 14; b++) { var bh = (8 + ((b * 37) % 23)) * PR; g.fillRect(b * 20 * PR, c.height * 0.75 - bh, 16 * PR, bh); }
            g.fillStyle = th.track; g.beginPath(); g.moveTo(c.width * 0.47, c.height * 0.75); g.lineTo(c.width * 0.53, c.height * 0.75); g.lineTo(c.width * 0.85, c.height); g.lineTo(c.width * 0.15, c.height); g.closePath(); g.fill();
            g.strokeStyle = th.line; g.lineWidth = 2 * PR; g.beginPath(); g.moveTo(c.width * 0.49, c.height * 0.75); g.lineTo(c.width * 0.38, c.height); g.moveTo(c.width * 0.51, c.height * 0.75); g.lineTo(c.width * 0.62, c.height); g.stroke();
            thumbs[i] = c;
        }
    }

    /* ---------------- pools ---------------- */
    var OBS = [], ORBS = [], PARTS = [], POPS = [], LINES = [];
    var i0;
    for (i0 = 0; i0 < 24; i0++) OBS.push({ on: false, type: '', z: 0, pz: 0, open: 0, done: false, hit: false, cued: false, broken: 0, id: 0, key: '' });
    for (i0 = 0; i0 < 48; i0++) ORBS.push({ on: false, z: 0, lane: 0, y: 0, got: 0 });
    for (i0 = 0; i0 < 90; i0++) PARTS.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, col: '' });
    for (i0 = 0; i0 < 8; i0++) POPS.push({ on: false, s: '', x: 0, y: 0, life: 0, col: '' });
    for (i0 = 0; i0 < 22; i0++) LINES.push({ a: 0, r: 0, v: 0, len: 0 });
    var PLUS = { 20: '+20', 100: '+100', 150: '+150', 200: '+200', 250: '+250', 300: '+300', 400: '+400', 450: '+450', 500: '+500', 600: '+600', 750: '+750' };
    var MULT = ['', 'x1', 'x2', 'x3', 'x4', 'x5'];

    function spawnPart(x, y, vx, vy, life, size, col) {
        for (var i = 0; i < PARTS.length; i++) if (!PARTS[i].on) { var p = PARTS[i]; p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.col = col; return; }
    }
    function popup(s, x, y, col) {
        for (var i = 0; i < POPS.length; i++) if (!POPS[i].on) { var p = POPS[i]; p.on = true; p.s = s; p.x = x; p.y = y; p.life = 1; p.col = col; return; }
    }

    /* ---------------- world state ---------------- */
    var R = { lane: 0, x: 0, y: 0, vy: 0, act: 'run', at: 0, adur: 0, phase: 0, lean: 0, stumble: 0, kickLeg: 1, landed: 0 };
    var world = { dist: 0, speed: 0, target: 0, base: 10, demo: true };
    var level = 0, timeline = [], segIdx = 0, segT = 0, totalT = 0, totalLen = 1, playPhase = 'intro', phaseT = 0;
    var score = 0, combo = 0, bestCombo = 0, clears = 0, misses = 0, orbsGot = 0, kcal = 0, spawnT = 0, lastJumpSpawn = -99, plannedLane = 0, lastMove = '', moveRepeat = 0, obsId = 0;
    var cue = null, cueT = 0, flash = 0, shake = 0, lowMode = false, handsFree = false, said = { half: false, ten: false, cd: 0, pre: false };
    var feedbackT = 0, oopsT = 0, introT = 0, newRecord = false, resultSel = 0, segKcalMet = 3, segFlash = 0;

    function resetRunner() { R.lane = 0; R.x = 0; R.y = 0; R.vy = 0; R.act = 'run'; R.at = 0; R.stumble = 0; R.lean = 0; camX = 0; }
    function clearWorld() {
        var i;
        for (i = 0; i < OBS.length; i++) OBS[i].on = false;
        for (i = 0; i < ORBS.length; i++) ORBS[i].on = false;
        for (i = 0; i < PARTS.length; i++) PARTS[i].on = false;
        for (i = 0; i < POPS.length; i++) POPS[i].on = false;
        cue = null;
    }

    function startDemo() {
        world.demo = true; clearWorld(); resetRunner();
        setTheme(LEVELS[clamp(progress.last, 0, NL - 1)].theme);
        world.base = 9; world.speed = 8; world.target = 8; spawnT = 1.5; plannedLane = 0;
        lowMode = lowImpact();
    }

    function startLevel(li, asCustom) {
        customRun = !!asCustom;
        level = li; if (!customRun) progress.last = li;
        world.demo = false; clearWorld(); resetRunner();
        setTheme(LEVELS[li].theme);
        lowMode = lowImpact(); handsFree = settings.ctrl === 1;
        timeline = buildTimeline(li); totalLen = timelineLength(timeline);
        world.base = BASE_SPEED[profile.fit] * LEVELS[li].speed * (lowMode ? 0.9 : 1) * cfg.speed;
        world.speed = 0; world.target = 0; world.dist = 0;
        segIdx = 0; segT = 0; totalT = 0; playPhase = 'intro'; introT = 3.2;
        score = 0; combo = 0; bestCombo = 0; clears = 0; misses = 0; orbsGot = 0; kcal = 0; spawnT = 0; lastJumpSpawn = -99; plannedLane = 0;
        said.half = false; said.ten = false; said.cd = 0; said.pre = false; feedbackT = 0; oopsT = 0; newRecord = false;
        seed = (Date.now() % 100000) + 1;
        screen = 'play';
        refreshUI();
        playTrack(trackFor(li));
        musicMode('warm');
        if (customRun) { voice('getready', 2); MyPC.announce(t.customTitle + '. ' + t.stageNames[li]); }
        else { voice('stage' + (li + 1), 2); voiceQueue('getready'); MyPC.announce(t.stage + ' ' + (li + 1) + '. ' + t.stageNames[li]); }
    }
    function seg() { return timeline[segIdx]; }
    function roundsTotal() { return customRun ? custom.rounds : LEVELS[level].rounds.length * cfg.sets; }
    function segRemain() { return seg().dur - segT; }

    function enterSegment() {
        var s = seg(); segT = 0; said.ten = false; said.cd = 0; said.pre = false; segFlash = 1.2;
        if (s.type === 'warmup') { world.target = world.base * 0.55; voice('warmup', 1); voiceQueue(lowMode ? 'march' : 'run'); musicMode('warm'); }
        else if (s.type === 'work') { world.target = world.base; voice('go', 3); sfx('go'); spawnT = 0; plannedLane = R.lane; musicMode('work'); }
        else if (s.type === 'rest') {
            world.target = world.base * 0.3; voice('rest', 1); musicMode('rest');
            if (!said.half && s.start + s.dur / 2 >= totalLen / 2) { said.half = true; voiceQueue('halfway'); }
        } else if (s.type === 'cooldown') { world.target = world.base * 0.4; voice('cooldown', 1); musicMode('warm'); }
        segKcalMet = segMet(s, lowMode);
        refreshSegment();
    }

    function nextSegment() {
        if (segIdx >= timeline.length - 1) { finishLevel(); return; }
        segIdx++; enterSegment();
    }

    function finishLevel() {
        playPhase = 'finish'; phaseT = 2.2; world.target = 0; cue = null;
        voice('workoutdone', 2); sfx('fanfare'); musicMode('rest');
        var prev = customRun ? progress.bestCustom : progress.best[level] || 0;
        newRecord = score > prev;
        if (newRecord) { if (customRun) progress.bestCustom = score; else progress.best[level] = score; voiceQueue('record'); }
        if (!customRun) {
            progress.unlocked = Math.max(progress.unlocked, Math.min(NL, level + 2));
            progress.last = Math.min(NL - 1, level + 1 < progress.unlocked ? level + 1 : level);
        }
        progress.workouts++; progress.kcal += kcal; progress.secs += totalLen;
        MyPC.save('progress', progress);
        MyPC.submitScore(score);
    }

    /* ---------------- spawning ---------------- */
    function getObs() { for (var i = 0; i < OBS.length; i++) if (!OBS[i].on) return OBS[i]; return null; }
    function addOrbs(z0, lane, n, kind) {
        for (var k = 0; k < n; k++) {
            for (var i = 0; i < ORBS.length; i++) if (!ORBS[i].on) {
                var o = ORBS[i]; o.on = true; o.lane = lane; o.got = 0;
                if (kind === 1) { o.z = z0 - 4.2 + k * 2.1; var u = (k + 0.5) / n; o.y = 0.45 + Math.sin(u * Math.PI) * 1.25; }
                else { o.z = z0 + k * 2.6; o.y = 0.5; }
                break;
            }
        }
    }
    var DEMO_MOVES = ['side', 'jump', 'squat', 'kick', 'side', 'hjump'];
    function isJumpType(m) { return m === 'jump' || m === 'hjump'; }
    function pickMove(focus) {
        var m = '', tries = 0;
        while (tries++ < 8) {
            m = focus[(rnd() * focus.length) | 0];
            if (lowMode && isJumpType(m) && totalT - lastJumpSpawn < 6) continue;
            if (m === lastMove && moveRepeat >= 2 && focus.length > 1) continue;
            break;
        }
        if (lowMode && isJumpType(m) && totalT - lastJumpSpawn < 6) m = focus.indexOf('side') >= 0 ? 'side' : focus.indexOf('squat') >= 0 ? 'squat' : '';
        if (m === lastMove) moveRepeat++; else { moveRepeat = 1; lastMove = m; }
        return m;
    }
    function spawnWave(m, z) {
        var o = getObs();
        if (!o || !m) { addOrbs(z, plannedLane, 5, 0); return; }
        o.on = true; o.z = z; o.pz = z; o.done = false; o.hit = false; o.cued = false; o.broken = 0; o.id = ++obsId;
        if (m === 'side') {
            o.type = 'block';
            var dir = plannedLane === -1 ? 1 : plannedLane === 1 ? -1 : (rnd() < 0.5 ? -1 : 1);
            o.open = plannedLane + dir; plannedLane = o.open;
            addOrbs(z + 3.5, o.open, 4, 0);
        } else if (m === 'jump' || m === 'hjump') {
            o.type = m === 'jump' ? 'hurdle' : 'tall'; lastJumpSpawn = totalT;
            if (rnd() < 0.6) addOrbs(z, plannedLane, 5, 1);
        } else if (m === 'squat') { o.type = 'bar'; }
        else if (m === 'kick') { o.type = 'pad'; }
        if (m === 'squat' || m === 'kick') if (rnd() < 0.5) addOrbs(z + 4, plannedLane, 4, 0);
    }
    function updateSpawns() {
        var s = seg();
        if (world.demo) {
            spawnT -= DT;
            if (spawnT <= 0) { spawnT = 2.6; spawnWave(DEMO_MOVES[(rnd() * 6) | 0], SPAWN_Z); }
            return;
        }
        if (playPhase !== 'run') return;
        if (s.type === 'work') {
            spawnT -= DT;
            var v = Math.max(world.speed, world.base * 0.6), first = segT < 0.5;
            var z = first ? Math.min(SPAWN_Z, world.base * 3.4) : SPAWN_Z;
            if (spawnT <= 0 && segRemain() > z / world.base + 0.4) {
                spawnWave(pickMove(s.focus), z);
                spawnT = GAP[profile.fit] * (lowMode ? 1.35 : 1) / Math.sqrt(LEVELS[level].speed);
            }
        } else if (s.type === 'warmup' && segRemain() > 10) {
            spawnT -= DT;
            if (spawnT <= 0) { spawnT = 4.5; addOrbs(SPAWN_Z, ((rnd() * 3) | 0) - 1, 5, 0); }
        }
    }

    /* ---------------- runner actions ---------------- */
    var JUMP_D = 0.72, HJUMP_D = 0.96, SQUAT_D = 0.85, KICK_D = 0.5;
    function nextOf(types, maxZ) {
        var best = null;
        for (var i = 0; i < OBS.length; i++) { var o = OBS[i]; if (o.on && !o.done && o.z > -0.5 && o.z < maxZ && types.indexOf(o.type) >= 0 && (!best || o.z < best.z)) best = o; }
        return best;
    }
    var JUMPERS = ['hurdle', 'tall'], PADS = ['pad'], ANY = ['block', 'hurdle', 'tall', 'bar', 'pad'];
    function doLane(d) {
        var nl = clamp(R.lane + d, -1, 1);
        if (nl === R.lane) return;
        R.lane = nl; sfx('whoosh');
    }
    function doJump() {
        if (R.act === 'jump' || R.act === 'hjump') return;
        var nx = nextOf(JUMPERS, 26), high = nx && nx.type === 'tall';
        R.act = high ? 'hjump' : 'jump'; R.at = 0; R.adur = high ? HJUMP_D : JUMP_D; sfx('jump');
    }
    function doSquat() {
        if (R.act === 'jump' || R.act === 'hjump') return;
        R.act = 'squat'; R.at = 0; R.adur = SQUAT_D;
    }
    function doKick() {
        if (R.act === 'jump' || R.act === 'hjump') return;
        R.act = 'kick'; R.at = 0; R.adur = KICK_D; R.kickLeg = -R.kickLeg;
        var p = nextOf(PADS, 5.5);
        if (p && p.z > -0.3 && !p.broken) { p.broken = 0.001; p.done = true; clearObstacle(p, 150); sfx('kick'); burst(p); }
        else sfx('whoosh');
    }
    function burst(o) {
        for (var l = -1; l <= 1; l++) { scr(l * LANE, 0.9, o.z); for (var k = 0; k < (fxFull ? 7 : 3); k++) spawnPart(SCR.x, SCR.y, (rnd() - 0.5) * 260, -120 - rnd() * 220, 0.7, 3 + rnd() * 4, theme.warn); }
    }

    function autopilot() {
        var o = nextOf(ANY, 30);
        if (!o) { if (R.lane !== 0 && world.demo && rnd() < 0.01) doLane(-R.lane); return; }
        var v = Math.max(1, world.speed), tta = o.z / v;
        if (o.type === 'block') { if (tta < 0.95 && R.lane !== o.open && R.stumble <= 0) doLane(o.open > R.lane ? 1 : -1); }
        else if (o.type === 'hurdle') { if (tta < 0.3 && R.act !== 'jump') doJump(); }
        else if (o.type === 'tall') { if (tta < 0.46 && R.act !== 'hjump') doJump(); }
        else if (o.type === 'bar') { if (tta < 0.28 && R.act !== 'squat') doSquat(); }
        else if (o.type === 'pad') { if (o.z < 2.8 && !o.broken) doKick(); }
    }

    function clearObstacle(o, pts) {
        o.done = true;
        combo++; if (combo > bestCombo) bestCombo = combo;
        var mult = 1 + Math.min(4, (combo / 5) | 0), p = pts * mult;
        if (!world.demo) {
            score += p; clears++;
            popup(PLUS[p] || '+' + p, X(W / 2), 200, theme.accent);
            sfx('clear');
            if (combo % 10 === 0) voice('combo', 0);
            else if (feedbackT <= 0 && rnd() < 0.45) { voice(combo % 3 === 0 ? 'perfect' : combo % 2 ? 'nice' : 'great', 0); feedbackT = 6; }
        }
        if (cue === o) cue = null;
    }
    function hitObstacle(o) {
        o.done = true; o.hit = true;
        if (world.demo) return;
        combo = 0; misses++; R.stumble = 0.5; flash = 0.35; shake = 0.3; sfx('hit');
        if (oopsT <= 0) { voice('oops', 0); oopsT = 5; }
        if (cue === o) cue = null;
    }

    function cueKey(o) {
        if (o.type === 'block') { var d = o.open - R.lane; return d === 0 ? '' : d < 0 ? 'left' : 'right'; }
        if (o.type === 'hurdle') return lowMode ? 'reach' : 'jump';
        if (o.type === 'tall') return lowMode ? 'knee' : 'hjump';
        if (o.type === 'bar') return 'squat';
        return 'kick';
    }

    /* ---------------- update (fixed 60 Hz) ---------------- */
    function update() {
        if (biomeFade > 0) biomeFade -= DT * 2.2;
        if (wantBiome >= 0) { biomeTimer -= DT; if (biomeTimer <= 0) { setTheme(wantBiome); wantBiome = -1; } }
        if (W3 && !thumbReal[themeIdx]) { thumbTimer += DT; if (thumbTimer > 1.2 && thumbs[themeIdx]) { W3.snapshot(thumbs[themeIdx], thumbs[themeIdx].width, thumbs[themeIdx].height); thumbReal[themeIdx] = true; } }
        if (screen === 'play') updatePlay();
        else if (world.demo) updateWorld();
        updateFx();
        menuAnim += DT;
    }

    function updatePlay() {
        if (playPhase === 'intro') {
            introT -= DT;
            world.target = world.base * 0.4;
            if (introT <= 0) { playPhase = 'run'; enterSegment(); }
        } else if (playPhase === 'run') {
            segT += DT; totalT += DT;
            kcal += segKcalMet * rmrPerSec() * DT;
            var s = seg(), rem = segRemain();
            if (s.type === 'work' && s.dur >= 25 && !said.ten && rem <= 10) { said.ten = true; voice('tensec', 1); }
            var nextWork = segIdx + 1 < timeline.length && timeline[segIdx + 1].type === 'work';
            if (nextWork) {
                if (!said.pre && rem <= 5.5) { said.pre = true; var nr = timeline[segIdx + 1].round; voice(nr === roundsTotal() && nr > 1 ? 'lastround' : nr <= 6 ? 'round' + nr : 'work', 1); }
                var cd = rem <= 1 ? 3 : rem <= 2 ? 2 : rem <= 3 ? 1 : 0;
                if (cd > said.cd) { said.cd = cd; voice(cd === 1 ? 'three' : cd === 2 ? 'two' : 'one', 2); sfx('beep'); }
            }
            if (rem <= 0) nextSegment();
        } else if (playPhase === 'finish') {
            phaseT -= DT;
            if (phaseT <= 0) { screen = 'results'; resultSel = 0; refreshResults(); MyPC.announce(t.complete + '. ' + t.score + ' ' + score + '. ' + Math.round(kcal) + ' ' + t.kcal); }
        }
        if (feedbackT > 0) feedbackT -= DT;
        if (oopsT > 0) oopsT -= DT;
        if (segFlash > 0) segFlash -= DT;
        updateWorld();
    }

    function updateWorld() {
        world.speed += (world.target - world.speed) * (world.target > world.speed ? 0.03 : 0.025);
        var dz = world.speed * DT;
        world.dist += dz;
        if (world.demo || handsFree) autopilot();
        updateSpawns();

        // runner
        R.x += (R.lane * LANE - R.x) * 0.2;
        R.lean += ((R.lane * LANE - R.x) * 0.25 - R.lean) * 0.2;
        R.phase += DT * (4.2 + world.speed * 0.62);
        if (R.stumble > 0) R.stumble -= DT;
        if (R.act !== 'run') {
            R.at += DT;
            if (R.act === 'squat' && R.at >= R.adur && !world.demo && !handsFree && MyPC.isDown('down')) R.at = R.adur - 0.01;
            if (R.at >= R.adur) {
                if (R.act === 'jump' || R.act === 'hjump') { R.landed = 0.25; sfx('land'); dust(); }
                R.act = 'run'; R.at = 0;
            }
        }
        if (R.landed > 0) R.landed -= DT;
        R.y = R.act === 'jump' ? Math.sin(Math.PI * R.at / JUMP_D) * 1.0 : R.act === 'hjump' ? Math.sin(Math.PI * R.at / HJUMP_D) * 1.65 : 0;
        camX += (R.x * 0.55 - camX) * 0.12;

        // obstacles
        var near = null, i, o;
        for (i = 0; i < OBS.length; i++) {
            o = OBS[i]; if (!o.on) continue;
            o.pz = o.z; o.z -= dz;
            if (o.broken) o.broken += DT;
            if (!o.done && o.pz > 0 && o.z <= 0) {
                var ok = o.type === 'block' ? Math.abs(R.x - o.open * LANE) < 1.0
                    : o.type === 'hurdle' ? R.y >= 0.42
                        : o.type === 'tall' ? R.y >= 1.05
                            : o.type === 'bar' ? R.act === 'squat'
                                : false;
                if (ok) clearObstacle(o, o.type === 'tall' ? 150 : 100); else hitObstacle(o);
            }
            if (o.z < -6) o.on = false;
            if (!o.done && o.z > 0 && (!near || o.z < near.z)) near = o;
        }
        // cue the nearest obstacle
        if (!world.demo && near) {
            var tta = near.z / Math.max(1, world.speed), lead = profile.fit === 0 ? 2.1 : 1.8;
            if (!near.cued && tta <= lead) {
                near.cued = true; cue = near; cueT = tta;
                var k = cueKey(near);
                near.key = k;
                if (k) voice(k, 3); else cue = null;
            }
        }
        if (cue && (!cue.on || cue.done)) cue = null;
        // orbs
        for (i = 0; i < ORBS.length; i++) {
            var b = ORBS[i]; if (!b.on) continue;
            var pz = b.z; b.z -= dz;
            if (!b.got && pz > 0 && b.z <= 0 && Math.abs(R.x - b.lane * LANE) < 1.0 && Math.abs(b.y - (R.y + 0.8)) < 0.95) {
                b.got = 1; b.on = false;
                if (!world.demo) { orbsGot++; score += 20; sfx('orb'); }
                scr(b.lane * LANE, b.y + 0.2, 0); for (var q = 0; q < (fxFull ? 5 : 2); q++) spawnPart(SCR.x + (rnd() - 0.5) * 30, SCR.y, (rnd() - 0.5) * 120, -60 - rnd() * 120, 0.5, 3, theme.accent);
            }
            if (b.z < -4) b.on = false;
        }
    }
    function dust() { scr(R.x, 0, 0); for (var k = 0; k < (fxFull ? 8 : 3); k++) spawnPart(SCR.x + (rnd() - 0.5) * 60, SCR.y, (rnd() - 0.5) * 140, -20 - rnd() * 50, 0.45, 3 + rnd() * 3, 'rgba(255,255,255,0.5)'); }

    function updateFx() {
        var i;
        for (i = 0; i < PARTS.length; i++) { var p = PARTS[i]; if (!p.on) continue; p.life -= DT; if (p.life <= 0) { p.on = false; continue; } p.x += p.vx * DT; p.y += p.vy * DT; p.vy += 420 * DT; }
        for (i = 0; i < POPS.length; i++) { var q = POPS[i]; if (!q.on) continue; q.life -= DT * 0.9; q.y -= 40 * DT; if (q.life <= 0) q.on = false; }
        if (fxFull) for (i = 0; i < LINES.length; i++) { var l = LINES[i]; l.r += l.v * DT * (0.3 + world.speed * 0.12); if (l.r > 700 || l.len === 0) { l.a = rnd() * 6.2832; l.r = 60 + rnd() * 80; l.v = 260 + rnd() * 360; l.len = 30 + rnd() * 70; } }
        if (flash > 0) flash -= DT;
        if (shake > 0) shake -= DT;
    }

    /* ---------------- drawing: world ---------------- */
    function quad(xa, xb, za, zb) { // ground trapezoid between x in [xa, xb], z in [za, zb]
        var sa = sc(za), sb = sc(zb), ya = HOR + CAM_H * sa, yb = HOR + CAM_H * sb;
        ctx.beginPath();
        ctx.moveTo(CX + (xa - camX) * sa, ya); ctx.lineTo(CX + (xb - camX) * sa, ya);
        ctx.lineTo(CX + (xb - camX) * sb, yb); ctx.lineTo(CX + (xa - camX) * sb, yb);
        ctx.closePath(); ctx.fill();
    }
    function drawSprite(sp, x, z, yUp, alpha, widthScale) {
        var s = sc(z), w = sp[1] * s * (widthScale || 1), h = sp[2] * s * (widthScale || 1), bx = sx(x, z), by = gy(z) - (yUp || 0) * s;
        if (bx + w / 2 < -20 || bx - w / 2 > W + 20) return;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sp[0], bx - w / 2, by - h, w, h);
        ctx.globalAlpha = 1;
    }
    function fadeFor(z) { return z > FAR - 28 ? clamp((FAR - z) / 28, 0, 1) : 1; }

    function drawWorld() {
        var sh = shake > 0 ? (rnd() - 0.5) * 8 * shake / 0.3 : 0;
        ctx.setTransform(RS, 0, 0, RS, sh * RS, 0);
        // sky with a little parallax
        ctx.drawImage(skyCv, 0, 0, skyCv.width, skyCv.height, -80 - camX * 6, 0, W + 160, HOR + 24);
        ctx.fillStyle = groundGrad; ctx.fillRect(-10, HOR + 10, W + 20, H - HOR);
        // track
        var zNear = -CAM_D + 0.75, off = world.dist % 10, z, k;
        ctx.fillStyle = theme.track; quad(-HALF, HALF, FAR, zNear);
        ctx.fillStyle = theme.track2;
        for (z = FAR - off; z > zNear; z -= 10) quad(-HALF, HALF, z, Math.max(zNear, z - 5));
        // curbs
        ctx.fillStyle = theme.near; quad(-HALF - 0.45, -HALF, FAR, zNear); quad(HALF, HALF + 0.45, FAR, zNear);
        ctx.fillStyle = theme.edge; quad(-HALF - 0.12, -HALF, FAR, zNear); quad(HALF, HALF + 0.12, FAR, zNear);
        // lane dashes
        ctx.fillStyle = theme.line;
        var doff = world.dist % 6;
        for (z = FAR - doff; z > zNear; z -= 6) {
            var z2 = Math.max(zNear, z - 3);
            ctx.globalAlpha = fadeFor(z) * 0.9;
            quad(-LANE / 2 - 0.06, -LANE / 2 + 0.06, z, z2); quad(LANE / 2 - 0.06, LANE / 2 + 0.06, z, z2);
        }
        ctx.globalAlpha = 1;
        // scenery and lamps, far to near
        var sp = 14, soff = world.dist % sp, baseI = Math.floor(world.dist / sp), lampEvery = tier === 'low' ? 2 : 1;
        for (k = Math.floor(FAR / sp); k >= 0; k--) {
            z = k * sp - soff;
            if (z < zNear) continue;
            var idx = baseI + k, a = fadeFor(z);
            for (var side = -1; side <= 1; side += 2) {
                var v = sceneryCv[((idx * 7 + (side + 1) * 5) % 3 + 3) % 3];
                var gap = theme.kind === 'ice' || theme.kind === 'space' ? 6.5 : 8;
                drawSprite(v, side * (gap + v[1] / 2 + ((idx * 3) % 2)), z, 0, a, 1);
                if (k % lampEvery === 0) {
                    var ls = sc(z), lx = sx(side * (HALF + 0.3), z), lyB = gy(z);
                    ctx.globalAlpha = a; ctx.fillStyle = '#2a2f3d'; ctx.fillRect(lx - 0.06 * ls, lyB - 3.2 * ls, 0.12 * ls, 3.2 * ls);
                    ctx.drawImage(spr.lamp, lx - 0.7 * ls, lyB - 3.9 * ls, 1.4 * ls, 1.4 * ls); ctx.globalAlpha = 1;
                }
            }
        }
        ctx.fillStyle = fogGrad; ctx.fillRect(-10, HOR - 40, W + 20, 110);
        drawSpeedLines();
        // objects behind the runner plane, far to near
        drawObjects(FAR, 0.0);
        drawRunner();
        drawObjects(0.0, zNear);
        drawParticles();
        ctx.setTransform(RS, 0, 0, RS, 0, 0);
    }
    function drawSpeedLines() {
        var k;
        if (fxFull && world.speed > 6) {
            ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2;
            ctx.beginPath();
            for (k = 0; k < LINES.length; k++) {
                var L = LINES[k], ca = Math.cos(L.a), sa = Math.sin(L.a);
                if (sa < -0.2) continue;
                ctx.moveTo(CX + ca * L.r, HOR + 40 + sa * L.r * 0.6); ctx.lineTo(CX + ca * (L.r + L.len), HOR + 40 + sa * (L.r + L.len) * 0.6);
            }
            ctx.stroke();
        }
    }

    function drawObjects(zFrom, zTo) {
        // simple ordered passes: collect by scanning in z bands (pools are small)
        var band = 4, z, i, o;
        for (z = zFrom; z > zTo - band; z -= band) {
            var lo = Math.max(zTo, z - band);
            for (i = 0; i < ORBS.length; i++) {
                var b = ORBS[i];
                if (!b.on || b.z > z || b.z <= lo) continue;
                var bob = Math.sin(menuAnim * 5 + b.z) * 0.08;
                drawSprite(spr.orb, b.lane * LANE, b.z, b.y + bob - 0.45, fadeFor(b.z), 1);
            }
            for (i = 0; i < OBS.length; i++) {
                o = OBS[i];
                if (!o.on || o.z > z || o.z <= lo) continue;
                var a = fadeFor(o.z);
                if (o.type === 'block') { for (var l = -1; l <= 1; l++) if (l !== o.open) drawSprite(spr.block, l * LANE, o.z, 0, a, 1); }
                else if (o.type === 'pad') {
                    if (o.broken) { if (o.broken < 0.5) for (var m = -1; m <= 1; m++) drawSprite(spr.pad, m * LANE + m * o.broken * 3, o.z + o.broken * 8, o.broken * 3, Math.max(0, 1 - o.broken * 2), 1); }
                    else for (var n = -1; n <= 1; n++) drawSprite(spr.pad, n * LANE, o.z, 0, a, 1);
                }
                else drawSprite(spr[o.type], 0, o.z, 0, a, 1);
            }
        }
    }

    function drawParticles() {
        var i;
        for (i = 0; i < PARTS.length; i++) { var p = PARTS[i]; if (!p.on) continue; ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
        ctx.globalAlpha = 1;
        for (i = 0; i < POPS.length; i++) { var q = POPS[i]; if (!q.on) continue; ctx.globalAlpha = Math.min(1, q.life * 2); text(q.s, q.x, q.y, 34, q.col, 'center', 800); }
        ctx.globalAlpha = 1;
    }

    /* ---------------- runner (procedural athlete seen from behind) ---------------- */
    var RP = { skin: '#c68863', skinD: '#a86d4d', hair: '#241a16', top: '#1c2232', topHi: null, shorts: '#10131c', shoe: '#f3f5f9', band: '#2ef2d2' };
    function buildRunnerPaint() {
        var g = ctx.createLinearGradient(-0.25, 0, 0.25, 0);
        g.addColorStop(0, '#141926'); g.addColorStop(0.5, '#273049'); g.addColorStop(1, '#141926');
        RP.topHi = g; RP.band = theme.accent;
    }
    function limb(x1, y1, x2, y2, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    function limb3(x1, y1, x2, y2, x3, y3, w1, w2, col) { limb(x1, y1, x2, y2, w1, col); limb(x2, y2, x3, y3, w2, col); }

    function drawRunner() {
        var s0 = sc(0), bx = sx(R.x, 0), by = gy(0), pxm = s0 * 1.22;
        // shadow
        var shw = 0.9 * (1 - Math.min(0.5, R.y * 0.3)) * pxm;
        ctx.globalAlpha = 0.75; ctx.drawImage(spr.shadow, bx - shw, by - shw * 0.22, shw * 2, shw * 0.44); ctx.globalAlpha = 1;
        if (R.stumble > 0 && ((R.stumble * 20) | 0) % 2 === 0) ctx.globalAlpha = 0.45;
        ctx.save();
        ctx.setTransform(RS * pxm, 0, 0, -RS * pxm, RS * bx, RS * (by - R.y * pxm));
        ctx.rotate(clamp(-R.lean * 0.12, -0.2, 0.2) + (R.stumble > 0 ? Math.sin(R.stumble * 30) * 0.08 : 0));
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        var act = R.act, k = R.adur ? clamp(R.at / R.adur, 0, 1) : 0, amp = world.speed > 6 ? 1 : world.speed > 3 ? 0.6 : 0.35;
        if (!world.demo && screen === 'play' && (playPhase !== 'run' || seg().type === 'rest')) amp = Math.min(amp, 0.45);
        var p = R.phase, hipY = 0.95 + Math.abs(Math.sin(p)) * 0.035 * amp, shY, tuck = 0, sq = 0, i, side;
        if (act === 'jump' || act === 'hjump') tuck = Math.sin(Math.PI * k) * (act === 'hjump' ? 1 : 0.6);
        if (act === 'squat') sq = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1;
        if (R.landed > 0) sq = Math.max(sq, R.landed * 1.6);
        hipY -= sq * 0.38;
        shY = hipY + 0.5 - sq * 0.08;
        var female = profile.sex === 0, legW = 0.15, armW = 0.1, kickK = act === 'kick' ? Math.sin(Math.PI * k) : 0;

        // legs
        for (i = 0; i < 2; i++) {
            side = i === 0 ? -1 : 1;
            var lift = Math.max(0, Math.sin(p + i * Math.PI)) * amp, hx = side * 0.095;
            var kx = side * (0.11 + sq * 0.14), ky = hipY - 0.46 + lift * 0.2 + sq * 0.12, fx = side * (0.1 + sq * 0.07), fy = 0.05 + lift * 0.32;
            if (tuck) { ky = hipY - 0.42 + tuck * 0.26; fy = hipY - 0.82 + tuck * 0.42; kx = side * (0.13 + tuck * 0.04); lift = 1; }
            if (kickK && side === R.kickLeg) { ky = hipY - 0.2 + kickK * 0.12; fy = hipY - 0.35 + kickK * 0.5; kx = side * 0.12; fx = side * 0.08; }
            if (kickK && side !== R.kickLeg) { fy = 0.05; ky = hipY - 0.46; lift = 0; }
            limb3(hx, hipY, kx, ky, fx, fy, legW, 0.125, RP.skin);
            // shoe: sole shows when the foot is up
            ctx.fillStyle = RP.shoe; rrM(fx - 0.075, fy - 0.06, 0.15, 0.1, 0.04);
            if (lift > 0.25 || tuck) { ctx.fillStyle = RP.band; rrM(fx - 0.07, fy - 0.07, 0.14, 0.04, 0.02); }
        }
        // shorts
        ctx.fillStyle = RP.shorts;
        ctx.beginPath(); ctx.moveTo(-0.19, hipY + 0.12); ctx.lineTo(0.19, hipY + 0.12); ctx.lineTo(0.21 + sq * 0.05, hipY - 0.17); ctx.lineTo(0.02, hipY - 0.14); ctx.lineTo(0, hipY - 0.08); ctx.lineTo(-0.02, hipY - 0.14); ctx.lineTo(-0.21 - sq * 0.05, hipY - 0.17); ctx.closePath(); ctx.fill();
        // arms behind the torso when they reach forward (squat / kick guard)
        var armsFwd = sq > 0.3 || kickK > 0;
        if (armsFwd) drawArms(shY, p, amp, tuck, sq, kickK, armW);
        // torso (tank top)
        ctx.fillStyle = RP.topHi;
        ctx.beginPath(); ctx.moveTo(-0.21, shY); ctx.quadraticCurveTo(0, shY + 0.04, 0.21, shY); ctx.lineTo(0.16, hipY + 0.1); ctx.lineTo(-0.16, hipY + 0.1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = RP.band; ctx.fillRect(-0.16, hipY + 0.1, 0.32, 0.035);
        ctx.fillRect(-0.012, shY - 0.33, 0.024, 0.28);
        // neck + head
        limb(0, shY, 0, shY + 0.08, 0.085, RP.skinD);
        var hy = shY + 0.2;
        ctx.fillStyle = RP.skin; ctx.beginPath(); ctx.arc(-0.11, hy - 0.01, 0.028, 0, 6.2832); ctx.arc(0.11, hy - 0.01, 0.028, 0, 6.2832); ctx.fill();
        ctx.fillStyle = RP.hair; ctx.beginPath(); ctx.arc(0, hy, 0.112, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = RP.band; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.arc(0, hy, 0.112, 0.35, Math.PI - 0.35); ctx.stroke();
        if (female) {
            var sway = Math.sin(p) * 0.06 * amp + R.lean * 0.05;
            ctx.strokeStyle = RP.hair; ctx.lineWidth = 0.075; ctx.beginPath(); ctx.moveTo(0, hy + 0.02); ctx.quadraticCurveTo(sway * 0.5, hy - 0.12, sway, hy - 0.24 + tuck * 0.1); ctx.stroke();
            ctx.lineWidth = 0.045; ctx.beginPath(); ctx.moveTo(sway, hy - 0.22 + tuck * 0.1); ctx.lineTo(sway * 1.3, hy - 0.3 + tuck * 0.1); ctx.stroke();
        }
        if (!armsFwd) drawArms(shY, p, amp, tuck, sq, kickK, armW);
        ctx.restore();
        ctx.globalAlpha = 1;
    }
    function drawArms(shY, p, amp, tuck, sq, kickK, armW) {
        for (var i = 0; i < 2; i++) {
            var side = i === 0 ? -1 : 1, sw = Math.sin(p + i * Math.PI + Math.PI) * amp;
            var ex = side * 0.27, ey = shY - 0.26 + sw * 0.05, hx = side * (0.21 - sw * 0.06), hy = shY - 0.38 + sw * 0.17;
            if (tuck) { ex = side * (0.3 + tuck * 0.05); ey = shY + 0.05 + tuck * 0.12; hx = side * (0.26 + tuck * 0.02); hy = shY + 0.2 + tuck * 0.22; }
            else if (sq > 0.3) { ex = side * 0.24; ey = shY - 0.06; hx = side * 0.1; hy = shY + 0.02; }
            else if (kickK) { ex = side * 0.26; ey = shY - 0.12; hx = side * 0.12; hy = shY + 0.1; }
            limb3(side * 0.2, shY - 0.03, ex, ey, hx, hy, armW, 0.085, RP.skin);
        }
    }
    function rrM(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); }

    /* ---------------- icons ---------------- */
    function tri(x, y, s, dir) { // dir 0 up, 1 right, 2 down, 3 left
        ctx.beginPath();
        if (dir === 0) { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.7); ctx.lineTo(x - s, y + s * 0.7); }
        else if (dir === 2) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y - s * 0.7); ctx.lineTo(x - s, y - s * 0.7); }
        else if (dir === 1) { ctx.moveTo(x + s, y); ctx.lineTo(x - s * 0.7, y - s); ctx.lineTo(x - s * 0.7, y + s); }
        else { ctx.moveTo(x - s, y); ctx.lineTo(x + s * 0.7, y - s); ctx.lineTo(x + s * 0.7, y + s); }
        ctx.closePath(); ctx.fill();
    }
    function icon(name, x, y, s, col) {
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        switch (name) {
            case 'up': case 'jump': case 'reach': tri(x, y, s * 0.6, 0); break;
            case 'down': case 'squat': tri(x, y, s * 0.6, 2); break;
            case 'left': tri(x, y, s * 0.6, 3); break;
            case 'right': tri(x, y, s * 0.6, 1); break;
            case 'hjump': case 'knee': tri(x, y - s * 0.32, s * 0.45, 0); tri(x, y + s * 0.32, s * 0.45, 0); break;
            case 'ud': tri(x, y - s * 0.4, s * 0.38, 0); tri(x, y + s * 0.4, s * 0.38, 2); break;
            case 'lr': tri(x - s * 0.45, y, s * 0.38, 3); tri(x + s * 0.45, y, s * 0.38, 1); break;
            case 'arrows': tri(x, y - s * 0.5, s * 0.3, 0); tri(x, y + s * 0.5, s * 0.3, 2); tri(x - s * 0.5, y, s * 0.3, 3); tri(x + s * 0.5, y, s * 0.3, 1); break;
            case 'ok': case 'kick':
                ctx.lineWidth = Math.max(2, s * 0.12); ctx.beginPath(); ctx.arc(x, y, s * 0.62, 0, 6.2832); ctx.stroke();
                ctx.font = font(Math.round(s * 0.55), 800); ctx.textAlign = 'center'; ctx.fillText('OK', x, y + s * 0.2); break;
            case 'flame':
                ctx.beginPath(); ctx.moveTo(x, y - s * 0.7); ctx.quadraticCurveTo(x + s * 0.65, y - s * 0.05, x + s * 0.4, y + s * 0.45); ctx.quadraticCurveTo(x, y + s * 0.75, x - s * 0.4, y + s * 0.45); ctx.quadraticCurveTo(x - s * 0.6, y, x - s * 0.1, y - s * 0.3); ctx.quadraticCurveTo(x - s * 0.05, y - s * 0.05, x, y - s * 0.7); ctx.fill(); break;
            case 'heart':
                ctx.beginPath(); ctx.moveTo(x, y + s * 0.6); ctx.bezierCurveTo(x - s * 0.9, y, x - s * 0.5, y - s * 0.7, x, y - s * 0.25); ctx.bezierCurveTo(x + s * 0.5, y - s * 0.7, x + s * 0.9, y, x, y + s * 0.6); ctx.fill(); break;
            case 'clock': ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y - s * 0.3); ctx.lineTo(x, y); ctx.lineTo(x + s * 0.25, y + s * 0.12); ctx.stroke(); break;
            case 'lock': ctx.beginPath(); ctx.arc(x, y - s * 0.15, s * 0.3, Math.PI, 0); ctx.stroke(); ctx.fillRect(x - s * 0.45, y - s * 0.12, s * 0.9, s * 0.65); break;
            case 'star':
                ctx.beginPath();
                for (var i = 0; i < 10; i++) { var r = i % 2 ? s * 0.28 : s * 0.62, a = -Math.PI / 2 + i * Math.PI / 5; if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
                ctx.closePath(); ctx.fill(); break;
            case 'bolt': ctx.beginPath(); ctx.moveTo(x + s * 0.15, y - s * 0.7); ctx.lineTo(x - s * 0.4, y + s * 0.1); ctx.lineTo(x, y + s * 0.1); ctx.lineTo(x - s * 0.15, y + s * 0.7); ctx.lineTo(x + s * 0.4, y - s * 0.1); ctx.lineTo(x, y - s * 0.1); ctx.closePath(); ctx.fill(); break;
            case 'play': tri(x + s * 0.1, y, s * 0.55, 1); break;
            case 'grid': for (var gx = 0; gx < 2; gx++) for (var gy2 = 0; gy2 < 2; gy2++) ctx.fillRect(x - s * 0.5 + gx * s * 0.55, y - s * 0.5 + gy2 * s * 0.55, s * 0.42, s * 0.42); break;
            case 'user': ctx.beginPath(); ctx.arc(x, y - s * 0.28, s * 0.26, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(x, y + s * 0.6, s * 0.52, Math.PI, 0); ctx.fill(); break;
            case 'gear': ctx.beginPath(); ctx.arc(x, y, s * 0.36, 0, 6.2832); ctx.stroke(); for (var j = 0; j < 8; j++) { var ga = j * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(ga) * s * 0.4, y + Math.sin(ga) * s * 0.4); ctx.lineTo(x + Math.cos(ga) * s * 0.62, y + Math.sin(ga) * s * 0.62); ctx.stroke(); } break;
            case 'music': ctx.beginPath(); ctx.arc(x - s * 0.25, y + s * 0.35, s * 0.2, 0, 6.2832); ctx.fill(); ctx.fillRect(x - s * 0.1, y - s * 0.6, s * 0.12, s * 0.95); ctx.fillRect(x - s * 0.1, y - s * 0.6, s * 0.5, s * 0.14); break;
            case 'trophy': ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.6); ctx.lineTo(x + s * 0.45, y - s * 0.6); ctx.quadraticCurveTo(x + s * 0.45, y + s * 0.1, x, y + s * 0.15); ctx.quadraticCurveTo(x - s * 0.45, y + s * 0.1, x - s * 0.45, y - s * 0.6); ctx.fill(); ctx.fillRect(x - s * 0.08, y + s * 0.1, s * 0.16, s * 0.3); ctx.fillRect(x - s * 0.3, y + s * 0.4, s * 0.6, s * 0.15); break;
            case 'target': ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, 6.2832); ctx.fill(); break;
        }
    }

    /* ---------------- HUD ---------------- */
    var GLASS = 'rgba(8,12,24,0.72)', GLASS2 = 'rgba(8,12,24,0.86)', LINE = 'rgba(255,255,255,0.14)', WHITE = '#f5f7fb', MUTED = '#9aa6bf';
    function segLabel(s) { return s.type === 'work' ? t.work : s.type === 'rest' ? t.rest : s.type === 'warmup' ? t.warmup : t.cooldown; }
    function segColor(s) { return s.type === 'work' ? theme.accent : s.type === 'rest' ? '#6fb4ff' : '#b6c0d4'; }

    function drawHud() {
        var s = seg(), col = segColor(s);
        // left card: segment + timer
        var lx = X(36), w1 = 290;
        panel(rtl ? lx - w1 : lx, 26, w1, 96, 18, GLASS, LINE, 2);
        var tx = rtl ? lx - 22 : lx + 22;
        ctx.fillStyle = col; ctx.fillRect(rtl ? lx - 8 : lx + 2, 42, 6, 64);
        text(segLabel(s), tx, 58, 22, col, A('left'), 800);
        if (s.type === 'work') text(S.round, rtl ? lx - w1 + 22 : lx + w1 - 22, 58, 20, MUTED, A('right'), 700);
        text(playPhase === 'intro' ? clock(s.dur) : clock(segRemain()), tx, 106, 46, WHITE, A('left'), 800);
        var fr = playPhase === 'run' ? clamp(segT / s.dur, 0, 1) : 0;
        panel(rtl ? lx - w1 + 130 : lx + 130, 90, 138, 8, 4, 'rgba(255,255,255,0.12)', null);
        if (fr > 0) { ctx.fillStyle = col; rrect(rtl ? lx - w1 + 130 + 138 * (1 - fr) : lx + 130, 90, 138 * fr, 8, 4); ctx.fill(); }
        // centre: stage progress
        var bx = 330, bw = 300, by = 34;
        text(S.stageLine, W / 2, by + 8, 20, WHITE, 'center', 700);
        for (var i = 0; i < timeline.length; i++) {
            var g = timeline[i], x0 = bx + bw * g.start / totalLen, x1 = bx + bw * (g.start + g.dur) / totalLen - 3;
            ctx.fillStyle = i < segIdx ? segColor(g) : i === segIdx ? segColor(g) : 'rgba(255,255,255,0.16)';
            ctx.globalAlpha = i < segIdx ? 0.55 : 1;
            ctx.fillRect(x0, by + 22, Math.max(2, x1 - x0), 8);
        }
        ctx.globalAlpha = 1;
        var ph = bx + bw * clamp(totalT / totalLen, 0, 1);
        ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(ph, by + 26, 7, 0, 6.2832); ctx.fill();
        if (lowMode || handsFree) {
            var chip = handsFree ? t.handsFree : t.lowImpact;
            panel(W / 2 - 80, by + 42, 160, 30, 15, 'rgba(255,255,255,0.08)', LINE, 1.5);
            text(chip, W / 2, by + 63, 17, MUTED, 'center', 700);
        }
        // right card: kcal + score
        var rx = X(W - 36), w2 = 250, rx0 = rtl ? rx : rx - w2;
        panel(rx0, 26, w2, 96, 18, GLASS, LINE, 2);
        icon('flame', rx0 + 34, 56, 26, '#ff8a3d');
        text(num(Math.floor(kcal)), rx0 + 56, 66, 36, WHITE, 'left', 800);
        text(t.kcal, rx0 + 56 + (kcal >= 100 ? 62 : kcal >= 10 ? 42 : 24), 66, 18, MUTED, 'left', 700);
        icon('star', rx0 + 34, 100, 22, theme.accent);
        text(num(score), rx0 + 56, 108, 26, WHITE, 'left', 800);
        if (combo >= 5) text(MULT[1 + Math.min(4, (combo / 5) | 0)], rx0 + w2 - 20, 108, 26, theme.accent, 'right', 800);
        // cue card
        if (cue && !handsFree) drawCue(true);
        else if (cue && handsFree) drawCue(false);
        // base movement pill
        if (playPhase === 'run' && s.type !== 'rest' && !(cue && cue.key)) {
            var mv = s.type === 'cooldown' ? t.mv.walk : lowMode ? t.mv.march : t.mv.run;
            var pulse = 0.75 + Math.sin(menuAnim * 6) * 0.25;
            panel(W / 2 - 150, 486, 300, 40, 20, GLASS, LINE, 1.5);
            ctx.globalAlpha = pulse; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(W / 2 - 124, 506, 6, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
            text(mv, W / 2 + 8, 514, 22, WHITE, 'center', 700);
        }
        if (s.type === 'rest' && playPhase === 'run') drawRest(s);
        if (playPhase === 'intro') drawIntro();
        if (segFlash > 0 && playPhase === 'run' && s.type === 'work') {
            ctx.globalAlpha = clamp(segFlash, 0, 1);
            text(t.go, W / 2, 300, 96, theme.accent, 'center', 800);
            ctx.globalAlpha = 1;
        }
        if (flash > 0) { ctx.globalAlpha = flash * 0.6; ctx.fillStyle = '#ff3c3c'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        if (playPhase === 'finish') { ctx.globalAlpha = clamp(2.2 - phaseT, 0, 1); text(t.complete, W / 2, 290, 64, WHITE, 'center', 800); ctx.globalAlpha = 1; }
    }

    function drawCue(withButton) {
        var k = cue.key;
        if (!k) return;
        var tta = cue.z / Math.max(1, world.speed), f = clamp(tta / 2.1, 0, 1);
        var y = 420, w = 430, x = W / 2 - w / 2, col = theme.warn;
        panel(x, y, w, 104, 22, GLASS2, col, 4);
        var ix = rtl ? x + w - 60 : x + 60;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(ix, y + 52, 36, 0, 6.2832); ctx.stroke();
        ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(ix, y + 52, 36, -Math.PI / 2, -Math.PI / 2 + 6.2832 * f); ctx.stroke();
        icon(k, ix, y + 52, 34, WHITE);
        var tx = rtl ? x + w - 116 : x + 116;
        text(t.mv[k], tx, y + 52, 40, WHITE, A('left'), 800);
        text(t.how[k], tx, y + 84, 19, MUTED, A('left'), 600);
        if (withButton) {
            var bxp = rtl ? x + 34 : x + w - 34;
            panel(bxp - 24, y + 22, 48, 48, 12, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.3)', 2);
            icon(k === 'kick' ? 'ok' : k === 'left' ? 'left' : k === 'right' ? 'right' : k === 'squat' ? 'down' : 'up', bxp, y + 46, 26, WHITE);
        }
    }

    function drawRest(s) {
        var rem = segRemain();
        ctx.fillStyle = 'rgba(4,8,18,0.55)'; ctx.fillRect(0, 140, W, 340);
        icon('heart', X(W / 2 - 230), 230, 40 + Math.sin(menuAnim * 7) * 3, '#ff5f7a');
        text(t.rest, W / 2, 246, 54, WHITE, 'center', 800);
        text(clock(rem), W / 2, 330, 90, '#6fb4ff', 'center', 800);
        var nx = timeline[segIdx + 1];
        if (nx && nx.type === 'work') text(S.restNext, W / 2, 392, 26, theme.accent, 'center', 800);
        text(t.tips[s.round % t.tips.length], W / 2, 440, 22, MUTED, 'center', 600);
    }
    var MOVE_LABEL = {};
    function moveLabel(m) {
        var key = m + (lowMode ? 1 : 0);
        if (MOVE_LABEL[key]) return MOVE_LABEL[key];
        var k = m === 'side' ? 'side' : m === 'jump' ? (lowMode ? 'reach' : 'jump') : m === 'hjump' ? (lowMode ? 'knee' : 'hjump') : m;
        return (MOVE_LABEL[key] = t.mv[k]);
    }

    function drawIntro() {
        var k = 1 - introT / 3.2, a = clamp(k * 4, 0, 1) * clamp(introT * 2, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(4,8,18,0.6)'; ctx.fillRect(0, 170, W, 210);
        ctx.fillStyle = theme.accent; ctx.fillRect(W / 2 - 60, 200, 120, 5);
        text(S.intro, W / 2, 240, 28, theme.accent, 'center', 800);
        text(t.stageNames[level], W / 2, 304, 64, WHITE, 'center', 800);
        text(t.getReady, W / 2, 352, 24, MUTED, 'center', 700);
        ctx.globalAlpha = 1;
    }

    /* ---------------- menus ---------------- */
    var screen = 'title', menuAnim = 0, sel = 0, gridSel = 0, rowSel = 0, setSel = 0, needProfile = false, previewTrack = -1;
    var TITLE_ITEMS = ['play', 'custom', 'stages', 'profile', 'settings'], TITLE_ICONS = ['play', 'bolt', 'grid', 'user', 'gear'];
    var FOCUS = '#ffffff';

    function focusBox(x, y, w, h, r, on, accent) {
        if (on) {
            var pulse = 0.5 + Math.sin(menuAnim * 5) * 0.5;
            ctx.globalAlpha = 0.35 + pulse * 0.3; panel(x - 4, y - 4, w + 8, h + 8, r + 4, null, accent, 8);
            ctx.globalAlpha = 0.22; panel(x, y, w, h, r, accent, null); ctx.globalAlpha = 1;
            panel(x, y, w, h, r, null, FOCUS, 4);
        } else panel(x, y, w, h, r, GLASS, LINE, 2);
    }
    function hints(list, y) {
        // draw centred hint row; widths estimated from text length to avoid measuring every frame
        var total = 0, i;
        for (i = 0; i < list.length; i++) total += 46 + list[i][1].length * 10 + 30;
        var x = W / 2 - total / 2;
        if (rtl) x = W / 2 + total / 2;
        for (i = 0; i < list.length; i++) {
            var wItem = 46 + list[i][1].length * 10 + 30;
            var cx = rtl ? x - 18 : x + 18;
            panel(cx - 17, y - 17, 34, 34, 9, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.25)', 1.5);
            icon(list[i][0], cx, y, list[i][0] === 'ok' ? 22 : 20, WHITE);
            text(list[i][1], rtl ? cx - 30 : cx + 30, y + 7, 20, MUTED, A('left'), 700);
            x += rtl ? -wItem : wItem;
        }
    }
    function sideShade() {
        var g = rtl ? shadeR : shadeL;
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    var shadeL = null, shadeR = null;

    function drawTitle() {
        sideShade();
        var x = X(70), al = A('left');
        text(t.t1, x, 112, 34, theme.accent, al, 800);
        text(t.t2, x, 188, 96, WHITE, al, 800);
        text(t.tag, x, 222, 19, MUTED, al, 700);
        if (needProfile) text(t.firstRun, x, 250, 19, theme.accent, al, 700);
        for (var i = 0; i < TITLE_ITEMS.length; i++) {
            var y = 264 + i * 48, on = sel === i, w = 360, bx = rtl ? W - 70 - w : 70;
            focusBox(bx, y, w, 40, 13, on, theme.accent);
            icon(TITLE_ICONS[i], rtl ? bx + w - 32 : bx + 32, y + 20, 19, on ? WHITE : MUTED);
            text(t[TITLE_ITEMS[i]], rtl ? bx + w - 62 : bx + 62, y + 29, 24, WHITE, al, 800);
            if (i === 0) text(S.titleStage, rtl ? bx + 22 : bx + w - 22, y + 28, 19, on ? WHITE : MUTED, A('right'), 700);
        }
        // lifetime stats, top corner opposite the logo
        var cols = S.titleStats;
        panel(rtl ? 36 : W - 36 - 404, 36, 404, 78, 16, GLASS, LINE, 1.5);
        for (var j = 0; j < 3; j++) {
            var cx = rtl ? 60 + j * 130 : W - 60 - j * 130, ax = A('right');
            text(cols[j][1], cx, 74, 30, WHITE, ax, 800);
            text(cols[j][0], cx, 98, 15, MUTED, ax, 700);
        }
        hints(t.hint, 518);
    }
    function bestAll() { var b = 0; for (var i = 0; i < NL; i++) b = Math.max(b, progress.best[i] || 0); return b; }

    var carScroll = 0, lastCard = 0;
    function drawStages() {
        // the live 3D world behind shows the selected stage's terrain
        ctx.fillStyle = shadeTop; ctx.fillRect(0, 0, W, H);
        text(t.stages, X(70), 82, 46, WHITE, A('left'), 800);
        if (S.low) text(t.lowImpact, X(W - 70), 82, 20, theme.accent, A('right'), 800);
        var focusCard = gridSel === NL ? lastCard : gridSel, cw = 250, ch = 304, gap = 26, y0 = 118;
        carScroll += (focusCard - carScroll) * 0.18;
        for (var i = 0; i < NL; i++) {
            var off = (i - carScroll) * (cw + gap), x = W / 2 - cw / 2 + (rtl ? -off : off);
            if (x > W + 20 || x + cw < -20) continue;
            var on = gridSel === i, locked = i >= progress.unlocked, th = THEMES[LEVELS[i].theme];
            var grow = on ? 8 : 0, cx0 = x - grow, cy0 = y0 - grow, w = cw + grow * 2, h = ch + grow * 2;
            ctx.globalAlpha = on ? 1 : gridSel === NL && i === lastCard ? 0.95 : 0.78;
            if (on) { ctx.globalAlpha = 0.45 + Math.sin(menuAnim * 5) * 0.25; panel(cx0 - 6, cy0 - 6, w + 12, h + 12, 24, null, th.accent, 8); ctx.globalAlpha = 1; }
            ctx.save(); rrect(cx0, cy0, w, h, 18); ctx.clip();
            ctx.fillStyle = GLASS2; ctx.fillRect(cx0, cy0, w, h);
            ctx.drawImage(thumbs[LEVELS[i].theme], cx0, cy0, w, w * 0.5);
            var fadeG = ctx.createLinearGradient(0, cy0 + w * 0.3, 0, cy0 + w * 0.5); // created only while this menu is open
            fadeG.addColorStop(0, 'rgba(8,12,24,0)'); fadeG.addColorStop(1, 'rgba(8,12,24,0.86)');
            ctx.fillStyle = fadeG; ctx.fillRect(cx0, cy0 + w * 0.3, w, w * 0.2);
            if (locked) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(cx0, cy0, w, h); }
            ctx.restore();
            panel(cx0, cy0, w, h, 18, null, on ? FOCUS : LINE, on ? 4 : 2);
            var al = A('left'), tx = rtl ? cx0 + w - 20 : cx0 + 20, ty = cy0 + w * 0.5;
            text(S.stageNum[i], tx, ty + 30, 20, th.accent, al, 800);
            text(t.stageNames[i], tx, ty + 66, 28, WHITE, al, 800);
            if (locked) { icon('lock', cx0 + w / 2, cy0 + w * 0.25, 40, WHITE); text(t.lockedHint, tx, ty + 104, 18, MUTED, al, 600); }
            else {
                text(S.stageInfo[i], tx, ty + 100, 19, MUTED, al, 600);
                text(S.stageKcal[i], tx, ty + 128, 19, MUTED, al, 600);
                if (progress.best[i]) { icon('trophy', rtl ? cx0 + 34 : cx0 + w - 34, cy0 + 30, 24, '#ffd27a'); text(S.stageBest[i], rtl ? cx0 + 56 : cx0 + w - 54, cy0 + 38, 20, '#ffd27a', A('right'), 800); }
            }
            ctx.globalAlpha = 1;
        }
        var bon = gridSel === NL, bw = 220, bx = W / 2 - bw / 2;
        focusBox(bx, 446, bw, 46, 14, bon, theme.accent);
        text(t.back, W / 2, 478, 24, WHITE, 'center', 800);
        hints(t.hintGrid, 520);
    }
    var shadeTop = null;

    var PROFILE_ROWS = ['sex', 'age', 'height', 'weight', 'fitness', 'impact', 'units', 'done'];
    function profileValue(r) {
        var p = profile, imp = p.units === 1;
        switch (r) {
            case 'sex': return t.sexOpts[p.sex];
            case 'age': return num(p.age) + ' ' + t.yrs;
            case 'height': if (imp) { var inch = Math.round(p.h / 2.54); return num((inch / 12) | 0) + '′ ' + num(inch % 12) + '″'; } return num(Math.round(p.h)) + ' ' + t.cm;
            case 'weight': return imp ? num(Math.round(p.w * 2.20462)) + ' ' + t.lb : num(Math.round(p.w)) + ' ' + t.kg;
            case 'fitness': return t.fitOpts[p.fit];
            case 'impact': return t.impactOpts[p.imp];
            case 'units': return t.unitOpts[p.units];
        }
        return '';
    }
    function drawProfile() {
        ctx.fillStyle = 'rgba(4,8,18,0.78)'; ctx.fillRect(0, 0, W, H);
        text(t.profileTitle, X(70), 76, 44, WHITE, A('left'), 800);
        text(t.profileSub, X(70), 108, 19, MUTED, A('left'), 600);
        var lx = rtl ? W - 70 - 500 : 70;
        for (var i = 0; i < PROFILE_ROWS.length; i++) {
            var r = PROFILE_ROWS[i], y = 128 + i * 47, on = rowSel === i;
            if (r === 'done') { focusBox(lx, y + 4, 500, 42, 12, on, theme.accent); text(t.done, lx + 250, y + 34, 24, WHITE, 'center', 800); continue; }
            focusBox(lx, y, 500, 40, 12, on, theme.accent);
            text(t[r === 'fitness' ? 'fitness' : r], rtl ? lx + 500 - 20 : lx + 20, y + 28, 20, on ? WHITE : MUTED, A('left'), 700);
            var vx = rtl ? lx + 150 : lx + 350;
            text(S.prof[i], vx, y + 29, 23, WHITE, 'center', 800);
            if (on) { ctx.fillStyle = theme.accent; tri(vx - 125, y + 20, 8, 3); tri(vx + 125, y + 20, 8, 1); }
        }
        // summary card
        var cx = rtl ? 70 : W - 70 - 300, cy = 128, low = S.low;
        panel(cx, cy, 300, 368, 18, GLASS2, LINE, 2);
        text(t.bmi, cx + 24, cy + 40, 18, MUTED, 'left', 700);
        text(S.bmi, cx + 276, cy + 42, 30, WHITE, 'right', 800);
        ctx.fillStyle = LINE; ctx.fillRect(cx + 24, cy + 60, 252, 2);
        text(low ? t.lowOn : t.stdOn, rtl ? cx + 276 : cx + 24, cy + 94, 22, low ? '#6fb4ff' : theme.accent, A('left'), 800);
        wrap(low ? t.lowWhy : t.stdWhy, rtl ? cx + 276 : cx + 24, cy + 122, 252, 24, 17, MUTED);
        ctx.fillStyle = LINE; ctx.fillRect(cx + 24, cy + 214, 252, 2);
        text(t.interval, rtl ? cx + 276 : cx + 24, cy + 246, 16, MUTED, A('left'), 700);
        text(S.wr, rtl ? cx + 24 : cx + 276, cy + 248, 22, WHITE, A('right'), 800);
        text(t.perMin, rtl ? cx + 276 : cx + 24, cy + 286, 16, MUTED, A('left'), 700);
        text(S.perMin, rtl ? cx + 24 : cx + 276, cy + 288, 22, WHITE, A('right'), 800);
        text(t.perStage, rtl ? cx + 276 : cx + 24, cy + 326, 16, MUTED, A('left'), 700);
        text(S.perStage, rtl ? cx + 24 : cx + 276, cy + 328, 22, WHITE, A('right'), 800);
        text(t.estNote, rtl ? cx + 276 : cx + 24, cy + 356, 14, MUTED, A('left'), 600);
        hints(t.hintLR, 520);
    }
    var WRAP_CACHE = {};
    function wrap(str, x, y, maxW, lh, px, col) {
        var lines = WRAP_CACHE[str];
        if (!lines) {
            ctx.font = font(px, 600);
            var words = str.split(' '), cur = '';
            lines = [];
            for (var i = 0; i < words.length; i++) { var test = cur ? cur + ' ' + words[i] : words[i]; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = test; }
            if (cur) lines.push(cur);
            WRAP_CACHE[str] = lines;
        }
        for (var j = 0; j < lines.length; j++) text(lines[j], x, y + j * lh, px, col, A('left'), 600);
    }

    var SETTING_ROWS = ['controls', 'music', 'musicVol', 'coach', 'effects', 'done'];
    function settingValue(r) {
        switch (r) {
            case 'controls': return t.ctrlOpts[settings.ctrl];
            case 'music': return settings.track < 0 ? t.musicAuto : num(settings.track + 1) + ' · ' + MTMusic.TRACKS[settings.track].name.toUpperCase();
            case 'musicVol': return t.volOpts[settings.mvol];
            case 'coach': return t.onOff[settings.coach];
            case 'effects': return t.effOpts[settings.fx];
        }
        return '';
    }
    /* ---------------- custom workout ---------------- */
    var CUSTOM_ROWS = ['preset', 'workTime', 'restTime', 'rounds', 'moves', 'terrain', 'go'], custSel = 0, moveSel = 0, goSel = 0;
    var MOVE_ICON = { side: 'lr', jump: 'jump', squat: 'squat', kick: 'kick', hjump: 'hjump' };
    function refreshCustom() {
        S.cust = S.cust || [];
        S.cust[0] = custom.pre < PRESETS.length ? PRESETS[custom.pre][0] + '/' + PRESETS[custom.pre][1] : t.own;
        S.cust[1] = custom.work + ' ' + t.sec; S.cust[2] = custom.rest + ' ' + t.sec; S.cust[3] = String(custom.rounds);
        S.cust[5] = (custom.terrain + 1) + ' · ' + t.stageNames[custom.terrain];
        var was = customRun; customRun = true;
        var len = timelineLength(buildTimeline(custom.terrain));
        customRun = was;
        S.custTotal = t.total + '  ' + clock(len) + '   ·   ≈' + Math.round(estimateKcal(custom.terrain, true)) + ' ' + t.kcal;
        S.custMoves = []; for (var i = 0; i < CUSTOM_MOVES.length; i++) S.custMoves[i] = moveLabel(CUSTOM_MOVES[i]);
    }
    function openCustom() { screen = 'custom'; custSel = 0; goSel = 0; refreshUI(); wantBiome = LEVELS[custom.terrain].theme; biomeTimer = 0.2; say(t.customTitle); }
    function drawCustom() {
        ctx.fillStyle = 'rgba(4,8,18,0.72)'; ctx.fillRect(0, 0, W, H);
        text(t.customTitle, X(70), 70, 40, WHITE, A('left'), 800);
        text(S.custTotal, X(W - 70), 70, 22, theme.accent, A('right'), 800);
        var lx = 110, w = 740, y = 96, i;
        for (i = 0; i < CUSTOM_ROWS.length; i++) {
            var r = CUSTOM_ROWS[i], on = custSel === i, h = r === 'moves' ? 66 : 44;
            if (r === 'go') {
                for (var b = 0; b < 2; b++) {
                    var bw = 230, k = rtl ? 1 - b : b, bx = W / 2 - bw - 10 + k * (bw + 20);
                    focusBox(bx, y + 4, bw, 44, 14, on && goSel === b, theme.accent);
                    if (b === 0) icon('play', bx + 34, y + 26, 18, WHITE);
                    text(b === 0 ? t.play : t.back, bx + bw / 2 + (b === 0 ? 10 : 0), y + 36, 24, WHITE, 'center', 800);
                }
                break;
            }
            focusBox(lx, y, w, h, 13, on, theme.accent);
            text(t[r], rtl ? lx + w - 22 : lx + 22, y + h / 2 + 7, 20, on ? WHITE : MUTED, A('left'), 700);
            if (r === 'moves') {
                for (var m = 0; m < CUSTOM_MOVES.length; m++) {
                    var cx = rtl ? lx + w - 236 - 92 - m * 100 : lx + 236 + m * 100, picked = custom.moves[m], cur = on && moveSel === m;
                    panel(cx, y + 7, 92, 52, 10, picked ? theme.accent : 'rgba(255,255,255,0.06)', cur ? FOCUS : picked ? null : LINE, cur ? 3 : 1.5);
                    icon(MOVE_ICON[CUSTOM_MOVES[m]], cx + 46, y + 23, 16, picked ? '#0b1020' : MUTED);
                    text(S.custMoves[m], cx + 46, y + 52, 16, picked ? '#0b1020' : MUTED, 'center', 800);
                }
            } else {
                var vx = rtl ? lx + 230 : lx + 510;
                text(S.cust[i], vx, y + 30, 23, WHITE, 'center', 800);
                if (on) { ctx.fillStyle = theme.accent; tri(vx - 170, y + 21, 8, 3); tri(vx + 170, y + 21, 8, 1); }
            }
            y += h + 6;
        }
        hints(t.hintCustom, 520);
    }
    function changeCustom(r, d) {
        if (r === 'preset') { custom.pre = (custom.pre + d + PRESETS.length + 1) % (PRESETS.length + 1); if (custom.pre < PRESETS.length) { custom.work = PRESETS[custom.pre][0]; custom.rest = PRESETS[custom.pre][1]; } }
        else if (r === 'workTime') { custom.work = clamp(custom.work + d * 5, 10, 180); custom.pre = presetOf(); }
        else if (r === 'restTime') { custom.rest = clamp(custom.rest + d * 5, 5, 90); custom.pre = presetOf(); }
        else if (r === 'rounds') custom.rounds = clamp(custom.rounds + d, 1, 30);
        else if (r === 'terrain') { custom.terrain = (custom.terrain + d + NL) % NL; wantBiome = LEVELS[custom.terrain].theme; biomeTimer = 0.4; }
        refreshCustom();
    }
    function presetOf() { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i][0] === custom.work && PRESETS[i][1] === custom.rest) return i; return PRESETS.length; }
    function customInput(ok, dir, lr, repeat) {
        if (dir) { custSel = clamp(custSel + dir, 0, CUSTOM_ROWS.length - 1); sfx('move'); var rr = CUSTOM_ROWS[custSel]; say(rr === 'go' ? (goSel ? t.back : t.play) : rr === 'moves' ? t.moves : t[rr] + ', ' + S.cust[custSel]); }
        var r = CUSTOM_ROWS[custSel];
        if (rtl && (r === 'moves' || r === 'go')) lr = -lr; // these rows are drawn mirrored
        if (r === 'moves') {
            if (lr) { moveSel = clamp(moveSel + lr, 0, CUSTOM_MOVES.length - 1); sfx('move'); say(S.custMoves[moveSel]); }
            if (ok) {
                var n = 0; for (var i = 0; i < custom.moves.length; i++) n += custom.moves[i];
                if (custom.moves[moveSel] && n <= 1) { sfx('hit'); return; } // keep at least one move
                custom.moves[moveSel] = custom.moves[moveSel] ? 0 : 1; sfx('select'); refreshCustom();
                say(S.custMoves[moveSel] + ', ' + t.onOff[custom.moves[moveSel]]);
            }
        } else if (r === 'go') {
            if (lr && !repeat) { goSel = clamp(goSel + lr, 0, 1); sfx('move'); say(goSel ? t.back : t.play); }
            if (ok) { MyPC.save('custom', custom); sfx('select'); if (goSel === 0) startLevel(custom.terrain, true); else toTitle(); }
        } else if (lr) { changeCustom(r, lr); sfx('move'); say(S.cust[custSel]); }
        else if (ok && custSel < CUSTOM_ROWS.length - 1) { custSel = CUSTOM_ROWS.length - 1; goSel = 0; sfx('move'); }
    }

    function drawSettings() {
        ctx.fillStyle = 'rgba(4,8,18,0.78)'; ctx.fillRect(0, 0, W, H);
        text(t.settingsTitle, X(70), 80, 44, WHITE, A('left'), 800);
        var lx = 150;
        for (var i = 0; i < SETTING_ROWS.length; i++) {
            var r = SETTING_ROWS[i], y = 120 + i * 58, on = setSel === i;
            if (r === 'done') { focusBox(lx + 180, y + 8, 300, 48, 14, on, theme.accent); text(t.done, W / 2, y + 41, 24, WHITE, 'center', 800); continue; }
            focusBox(lx, y, 660, 48, 14, on, theme.accent);
            text(t[r], rtl ? lx + 640 : lx + 22, y + 33, 21, on ? WHITE : MUTED, A('left'), 700);
            var vx = rtl ? lx + 180 : lx + 480;
            text(S.set[i], vx, y + 34, 23, WHITE, 'center', 800);
            if (on) { ctx.fillStyle = theme.accent; tri(vx - 165, y + 24, 8, 3); tri(vx + 165, y + 24, 8, 1); }
        }
        text(t.ctrlHelp[settings.ctrl], W / 2, 478, 20, theme.accent, 'center', 600);
        hints(t.hintLR, 520);
    }

    function drawResults() {
        ctx.fillStyle = 'rgba(4,8,18,0.8)'; ctx.fillRect(0, 0, W, H);
        text(S.stageLine, W / 2, 74, 24, theme.accent, 'center', 800);
        text(t.complete, W / 2, 132, 58, WHITE, 'center', 800);
        if (newRecord) { panel(W / 2 - 110, 150, 220, 36, 18, 'rgba(255,210,122,0.2)', '#ffd27a', 2); icon('trophy', W / 2 - 84, 168, 20, '#ffd27a'); text(t.newRecord, W / 2 + 12, 176, 20, '#ffd27a', 'center', 800); }
        var stats = S.res, labels = S.resLabels, icons = RES_ICONS;
        for (var i = 0; i < 6; i++) {
            var c = i % 3, r = (i / 3) | 0, vc = rtl ? 2 - c : c, x = 120 + vc * 250, y = 200 + r * 110;
            panel(x, y, 230, 96, 16, GLASS, LINE, 2);
            if (icons[i] === 'orb') { ctx.drawImage(spr.orb[0], x + 14, y + 26, 44, 44); } else icon(icons[i], x + 36, y + 48, 28, i === 1 ? '#ff8a3d' : theme.accent);
            text(stats[i], x + 70, y + 54, 38, WHITE, 'left', 800);
            text(labels[i], x + 70, y + 80, 16, MUTED, 'left', 700);
        }
        var btns = resultButtons();
        for (var j = 0; j < btns.length; j++) {
            var bw = 230, gap = 20, tot = btns.length * bw + (btns.length - 1) * gap, k = rtl ? btns.length - 1 - j : j, bx = W / 2 - tot / 2 + k * (bw + gap);
            focusBox(bx, 432, bw, 54, 14, resultSel === j, theme.accent);
            text(t[btns[j]], bx + bw / 2, 468, 24, WHITE, 'center', 800);
        }
        text(t.estNote, W / 2, 516, 16, MUTED, 'center', 600);
    }
    var RES_ICONS = ['star', 'flame', 'clock', 'target', 'bolt', 'orb'];
    // every string the menus and HUD show is built here, outside the frame loop
    var S = { round: '', stageLine: '', restNext: '', intro: '', titleStage: '', titleStats: null, stageInfo: [], stageKcal: [], stageBest: [], stageNum: [], prof: [], set: [], bmi: '', wr: '', perMin: '', perStage: '', low: false, res: [], resLabels: [] };
    function refreshUI() {
        var i, low = lowImpact(), wr = WORK_REST[profile.fit];
        S.low = low;
        S.titleStage = t.stage + ' ' + (progress.last + 1);
        S.titleStats = [[t.workouts, String(progress.workouts)], [t.kcalTotal, String(Math.round(progress.kcal))], [t.bestScore, String(bestAll())]];
        for (i = 0; i < NL; i++) {
            S.stageNum[i] = t.stage + ' ' + (i + 1);
            S.stageInfo[i] = LEVELS[i].rounds.length * cfg.sets + ' ' + t.rounds + ' · ' + Math.round(timelineLength(buildTimeline(i)) / 60) + ' ' + t.min;
            S.stageKcal[i] = '≈' + Math.round(estimateKcal(i)) + ' ' + t.kcal;
            S.stageBest[i] = String(progress.best[i] || 0);
        }
        for (i = 0; i < PROFILE_ROWS.length; i++) S.prof[i] = profileValue(PROFILE_ROWS[i]);
        for (i = 0; i < SETTING_ROWS.length; i++) S.set[i] = settingValue(SETTING_ROWS[i]);
        S.bmi = bmi().toFixed(1);
        S.wr = wr[0] + 's / ' + (wr[1] + (low ? LOW_REST_BONUS : 0) + cfg.restBonus) + 's';
        S.perMin = '≈' + (workMet(['side', 'squat', 'jump', 'kick'], low) * rmrPerSec() * 60).toFixed(1);
        S.perStage = '≈' + Math.round(estimateKcal(0));
        S.stageLine = customRun ? t.custom + ' · ' + t.stageNames[level] : t.stage + ' ' + (level + 1) + ' · ' + t.stageNames[level];
        S.intro = customRun ? t.customTitle : t.stage + ' ' + (level < 9 ? '0' : '') + (level + 1);
        refreshCustom();
        S.resLabels = [t.score, t.kcal, t.time, t.accuracy, t.bestCombo, t.orbs];
    }
    function refreshSegment() {
        var s = seg(), nx = timeline[segIdx + 1];
        S.round = s.type === 'work' ? t.round + ' ' + s.round + '/' + roundsTotal() : '';
        S.restNext = '';
        if (nx && nx.type === 'work') {
            S.restNext = t.next + ':  ';
            for (var i = 0; i < nx.focus.length; i++) S.restNext += moveLabel(nx.focus[i]) + (i < nx.focus.length - 1 ? ' + ' : '');
        }
    }
    function refreshResults() {
        S.res = [String(score), String(Math.round(kcal)), clock(totalLen), (clears + misses ? Math.round(100 * clears / (clears + misses)) : 100) + '%', String(bestCombo), String(orbsGot)];
    }
    var BTN_NEXT = ['nextStage', 'replay', 'menu'], BTN_LAST = ['replay', 'menu'];
    function resultButtons() { return !customRun && level < NL - 1 ? BTN_NEXT : BTN_LAST; }

    function drawPausedOverlay() {
        ctx.setTransform(RS, 0, 0, RS, 0, 0);
        ctx.fillStyle = 'rgba(4,8,18,0.6)'; ctx.fillRect(0, 0, W, H);
        text(t.paused, W / 2, H / 2 + 20, 72, WHITE, 'center', 800);
    }

    /* ---------------- draw ---------------- */
    function draw() {
        ctx.setTransform(RS, 0, 0, RS, 0, 0);
        ctx.direction = rtl ? 'rtl' : 'ltr';
        if (W3) {
            S3.dist = world.dist; S3.camX = camX; S3.shake = shake > 0 ? (rnd() - 0.5) * shake * 3 : 0; S3.female = profile.sex === 0;
            S3.amp = world.speed > 6 ? 1 : world.speed > 3 ? 0.6 : 0.35;
            if (!world.demo && screen === 'play' && (playPhase !== 'run' || seg().type === 'rest')) S3.amp = Math.min(S3.amp, 0.45);
            W3.render(S3);
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.setTransform(RS, 0, 0, RS, 0, 0);
            drawSpeedLines(); drawParticles();
            if (biomeFade > 0) { ctx.globalAlpha = Math.min(1, biomeFade); ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        } else drawWorld();
        ctx.direction = rtl ? 'rtl' : 'ltr';
        if (screen === 'play') drawHud();
        else if (screen === 'title') drawTitle();
        else if (screen === 'stages') drawStages();
        else if (screen === 'profile') drawProfile();
        else if (screen === 'settings') drawSettings();
        else if (screen === 'custom') drawCustom();
        else if (screen === 'results') drawResults();
    }

    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (!last) last = ts;
        var dtMs = ts - last;
        acc += Math.min(250, dtMs); last = ts;
        while (acc >= STEP) { update(); acc -= STEP; }
        // dynamic resolution: if frames stay slow for ~3 s, render the 3D view smaller
        if (W3 && glScale > 0.6) { if (dtMs > 24 && dtMs < 250) slowFrames++; else if (slowFrames > 0) slowFrames--; if (slowFrames > 150) { glScale -= 0.15; slowFrames = 0; resize(); } }
        draw();
        audioTick();
    }
    var glScale = 1, slowFrames = 0;
    function startLoop() { if (!raf) { last = 0; acc = 0; raf = requestAnimationFrame(frame); } }
    function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    function resize() {
        var cap = tier === 'low' ? 960 : tier === 'mid' ? 1280 : 1920;
        var dpr = window.devicePixelRatio || 1, s = Math.min(window.innerWidth / W, window.innerHeight / H) * dpr;
        var cw = Math.min(cap, Math.round(W * s));
        canvas.width = cw; canvas.height = Math.round(cw * H / W);
        RS = canvas.width / W;
        var scale = Math.min(window.innerWidth / W, window.innerHeight / H);
        var cssW = Math.round(W * scale) + 'px', cssH = Math.round(H * scale) + 'px';
        canvas.style.width = cssW; canvas.style.height = cssH;
        var st = document.getElementById('stage'); st.style.width = cssW; st.style.height = cssH;
        if (W3) {
            var gcap = tier === 'low' ? 960 : tier === 'mid' ? 1280 : 1600, gw = Math.round(Math.min(gcap, W * s) * glScale);
            W3.resize(gw, Math.round(gw * H / W));
            glCanvas.style.width = cssW; glCanvas.style.height = cssH;
        }
        ctx.imageSmoothingEnabled = true;
    }

    /* ---------------- audio ---------------- */
    var AC = null, master = null, musicBus = null, musicFilter = null, duckG = null, sfxG = null, voiceG = null;
    var sfxBufs = null, voiceBuf = null, voiceClips = null, voiceEnd = 0, voiceSrc = null, pendingVoice = '', pendingAt = 0, voiceQ = '';
    var musicCache = {}, musicSrc = null, musicSrcG = null, musicIdx = -1, rendering = false, wantTrack = -1, musicPhase = 'warm';
    var VOLS = [0, 0.35, 0.62, 0.9];

    function initAudio() {
        if (AC) return;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        try { AC = new Ctx(); } catch (e) { AC = null; return; }
        master = AC.createGain(); master.connect(AC.destination);
        musicFilter = AC.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 2400; musicFilter.Q.value = 0.7;
        duckG = AC.createGain(); musicBus = AC.createGain();
        musicFilter.connect(duckG); duckG.connect(musicBus); musicBus.connect(master);
        sfxG = AC.createGain(); sfxG.connect(master);
        voiceG = AC.createGain(); voiceG.connect(master);
        applyVolume();
        MTMusic.renderAllSfx().then(function (b) { sfxBufs = b; }).catch(function () {});
        decodeVoice();
        playTrack(screen === 'play' ? trackFor(level) : settings.track >= 0 ? settings.track : LEVELS[clamp(progress.last, 0, NL - 1)].track);
    }
    function applyVolume() {
        if (!AC) return;
        var v = (info && info.volume) || { music: 0.7, sfx: 0.8 };
        musicBus.gain.value = v.music * VOLS[settings.mvol] * 0.9;
        sfxG.gain.value = v.sfx * 0.55;
        voiceG.gain.value = Math.min(1, v.sfx * 1.25);
    }
    function trackFor(li) { return settings.track >= 0 ? settings.track : LEVELS[li].track; }
    function playTrack(idx) {
        wantTrack = idx;
        if (!AC) return;
        if (musicCache[idx]) { startBuffer(idx); return; }
        if (rendering) return;
        rendering = true;
        MTMusic.render(idx, tier === 'low').then(function (buf) {
            rendering = false;
            if (!AC) return;
            var keys = Object.keys(musicCache);
            if (keys.length >= 2) delete musicCache[keys[0]];
            musicCache[idx] = buf;
            if (wantTrack === idx) startBuffer(idx); else playTrack(wantTrack);
        }).catch(function () { rendering = false; });
    }
    function startBuffer(idx) {
        if (musicIdx === idx && musicSrc) return;
        var now = AC.currentTime;
        if (musicSrc) { try { musicSrcG.gain.setTargetAtTime(0, now, 0.3); musicSrc.stop(now + 1.5); } catch (e) {} }
        musicSrc = AC.createBufferSource(); musicSrc.buffer = musicCache[idx]; musicSrc.loop = true;
        musicSrcG = AC.createGain(); musicSrcG.gain.value = 0; musicSrcG.gain.setTargetAtTime(1, now, 0.4);
        musicSrc.connect(musicSrcG); musicSrcG.connect(musicFilter);
        musicSrc.start(now);
        musicIdx = idx;
    }
    function musicMode(m) {
        musicPhase = m;
        if (!AC) return;
        var f = m === 'work' ? 18000 : m === 'rest' ? 650 : 2600, now = AC.currentTime;
        musicFilter.frequency.cancelScheduledValues(now);
        musicFilter.frequency.setTargetAtTime(f, now, m === 'work' ? 0.25 : 0.6);
    }
    function stopMusic() { if (musicSrc) { try { musicSrc.stop(); } catch (e) {} } musicSrc = null; musicIdx = -1; }
    function sfx(name) {
        if (!AC || !sfxBufs || !sfxBufs[name] || AC.state !== 'running') return;
        var s = AC.createBufferSource(); s.buffer = sfxBufs[name]; s.connect(sfxG); s.start();
    }
    function decodeVoice() {
        var V = window.MT_VOICE;
        if (!AC || !V || voiceBuf) return;
        try {
            var bin = atob(V.mp3), len = bin.length, bytes = new Uint8Array(len);
            for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
            AC.decodeAudioData(bytes.buffer, function (b) { voiceBuf = b; voiceClips = V.clips; }, function () {});
        } catch (e) {}
    }
    // prio: 3 move cue (interrupts), 2 important, 1 info, 0 feedback (dropped when busy)
    var voicePrio = 0;
    function voice(key, prio) {
        // countdown beeps and the 'go' tone play separately, so a missing clip needs no fallback
        if (!settings.coach || !cfg.voice || !AC || !voiceBuf || !voiceClips || !voiceClips[key]) return;
        var now = AC.currentTime, busy = now < voiceEnd;
        if (busy && prio <= voicePrio && prio < 3) { if (prio >= 1) { pendingVoice = key; pendingAt = now; } return; }
        if (voiceSrc && busy) { try { voiceSrc.stop(); } catch (e) {} }
        var c = voiceClips[key];
        voiceSrc = AC.createBufferSource(); voiceSrc.buffer = voiceBuf; voiceSrc.connect(voiceG);
        voiceSrc.start(now, c[0], c[1]);
        voiceEnd = now + c[1]; voicePrio = prio;
        duckG.gain.setTargetAtTime(0.45, now, 0.05);
    }
    function voiceQueue(key) { voiceQ = key; }
    var welcomePending = false;
    function audioTick() {
        if (!AC) return;
        var now = AC.currentTime;
        if (welcomePending && voiceBuf && AC.state === 'running') { welcomePending = false; if (screen === 'title') voice('welcome', 1); }
        if (now >= voiceEnd) {
            if (voicePrio >= 0 && duckG) { duckG.gain.setTargetAtTime(1, now, 0.25); voicePrio = -1; }
            if (voiceQ) { var q = voiceQ; voiceQ = ''; voice(q, 1); }
            else if (pendingVoice && now - pendingAt < 2) { var p = pendingVoice; pendingVoice = ''; voice(p, 1); }
            else pendingVoice = '';
        }
    }
    function closeAudio() {
        stopMusic();
        if (AC) { try { AC.close(); } catch (e) {} }
        AC = null; voiceBuf = null; sfxBufs = null; musicCache = {}; voiceSrc = null;
    }

    /* ---------------- input ---------------- */
    function onInput(action, pressed, repeat) {
        if (!pressed) return;
        if (AC && AC.state === 'suspended' && !paused) { try { AC.resume(); } catch (e) {} }
        if (screen === 'play') {
            if (playPhase !== 'run' || handsFree || repeat) return;
            if (action === 'left') doLane(-1);
            else if (action === 'right') doLane(1);
            else if (action === 'up') doJump();
            else if (action === 'down') doSquat();
            else if (action === 'confirm') doKick();
            return;
        }
        var ok = action === 'confirm' && !repeat, dir = action === 'up' ? -1 : action === 'down' ? 1 : 0, lr = action === 'left' ? -1 : action === 'right' ? 1 : 0;
        if (rtl && screen !== 'profile' && screen !== 'settings') lr = -lr;
        if (screen === 'title') {
            if (dir) { sel = (sel + dir + TITLE_ITEMS.length) % TITLE_ITEMS.length; sfx('move'); say(t[TITLE_ITEMS[sel]]); }
            if (ok) {
                sfx('select');
                if (sel === 0) { if (needProfile) { openProfile(); } else startLevel(clamp(progress.last, 0, progress.unlocked - 1)); }
                else if (sel === 1) { if (needProfile) openProfile(); else openCustom(); }
                else if (sel === 2) { screen = 'stages'; gridSel = lastCard = clamp(progress.last, 0, NL - 1); carScroll = gridSel; say(t.stages); }
                else if (sel === 3) openProfile();
                else { screen = 'settings'; setSel = 0; say(t.settingsTitle); }
            }
        } else if (screen === 'stages') {
            if (gridSel === NL) { if (dir === -1) { gridSel = lastCard; previewStage(); } }
            else {
                if (lr) { gridSel = clamp(gridSel + lr, 0, NL - 1); previewStage(); }
                if (dir === 1) { lastCard = gridSel; gridSel = NL; }
            }
            if (dir || lr) { sfx('move'); say(gridSel === NL ? t.back : t.stage + ' ' + (gridSel + 1) + ', ' + t.stageNames[gridSel] + (gridSel >= progress.unlocked ? ', ' + t.locked : '')); }
            if (ok) {
                if (gridSel === NL) { toTitle(); sfx('select'); }
                else if (gridSel < progress.unlocked) { sfx('select'); progress.last = gridSel; startLevel(gridSel); }
                else sfx('hit');
            }
        } else if (screen === 'profile') {
            if (dir) { rowSel = clamp(rowSel + dir, 0, PROFILE_ROWS.length - 1); sfx('move'); sayRow(PROFILE_ROWS[rowSel], profileValue(PROFILE_ROWS[rowSel])); }
            var row = PROFILE_ROWS[rowSel];
            if (lr && row !== 'done') {
                if (rtl) lr = -lr;
                changeProfile(row, lr, repeat); sfx('move'); say(profileValue(row));
            }
            if (ok && row === 'done') { MyPC.save('profile', profile); needProfile = false; MyPC.save('hasProfile', true); screen = 'title'; sfx('select'); }
        } else if (screen === 'custom') {
            customInput(ok, dir, action === 'left' ? -1 : action === 'right' ? 1 : 0, repeat);
        } else if (screen === 'settings') {
            if (dir) { setSel = clamp(setSel + dir, 0, SETTING_ROWS.length - 1); sfx('move'); sayRow(SETTING_ROWS[setSel], settingValue(SETTING_ROWS[setSel])); }
            var sr = SETTING_ROWS[setSel];
            if (lr && sr !== 'done' && !repeat) { if (rtl) lr = -lr; changeSetting(sr, lr); sfx('move'); say(settingValue(sr)); }
            if (ok && sr === 'done') { MyPC.save('settings', settings); screen = 'title'; sfx('select'); playTrack(settings.track >= 0 ? settings.track : LEVELS[clamp(progress.last, 0, NL - 1)].track); }
        } else if (screen === 'results') {
            var btns = resultButtons();
            if (lr) { resultSel = clamp(resultSel + lr, 0, btns.length - 1); sfx('move'); say(t[btns[resultSel]]); }
            if (ok) {
                sfx('select');
                var b = btns[resultSel];
                if (b === 'nextStage') startLevel(level + 1);
                else if (b === 'replay') startLevel(level, customRun);
                else toTitle();
            }
        }
    }
    function say(s) { MyPC.announce(s); }
    function previewStage() { wantBiome = LEVELS[gridSel].theme; biomeTimer = 0.4; }
    function sayRow(r, v) { MyPC.announce((t[r] || t.done) + (v ? ', ' + v : '')); }
    function openProfile() { screen = 'profile'; rowSel = 0; say(t.profileTitle); }
    function toTitle() { screen = 'title'; sel = 0; refreshUI(); wantBiome = -1; startDemo(); musicMode('warm'); playTrack(settings.track >= 0 ? settings.track : LEVELS[clamp(progress.last, 0, NL - 1)].track); }
    function changeProfile(r, d, repeat) {
        var p = profile, imp = p.units === 1, big = repeat ? 1 : 1;
        if (r === 'sex') p.sex = (p.sex + 1) % 2;
        else if (r === 'age') p.age = clamp(p.age + d * big, 14, 95);
        else if (r === 'height') p.h = clamp(Math.round((p.h + d * (imp ? 2.54 : 1)) * 10) / 10, 120, 220);
        else if (r === 'weight') p.w = clamp(Math.round((p.w + d * (imp ? 0.4536 : 1)) * 100) / 100, 35, 250);
        else if (r === 'fitness') p.fit = clamp(p.fit + d, 0, 2);
        else if (r === 'impact') p.imp = (p.imp + d + 3) % 3;
        else if (r === 'units') p.units = (p.units + 1) % 2;
        refreshUI();
    }
    function changeSetting(r, d) {
        if (r === 'controls') settings.ctrl = (settings.ctrl + 1) % 2;
        else if (r === 'music') { settings.track = ((settings.track + 1 + d + 11) % 11) - 1; playTrack(settings.track >= 0 ? settings.track : LEVELS[clamp(progress.last, 0, NL - 1)].track); musicMode('work'); }
        else if (r === 'musicVol') { settings.mvol = clamp(settings.mvol + d, 0, 3); applyVolume(); }
        else if (r === 'coach') { settings.coach = (settings.coach + 1) % 2; if (settings.coach) voice('welcome', 1); }
        else if (r === 'effects') { settings.fx = (settings.fx + d + 3) % 3; fxFull = settings.fx === 2 || (settings.fx === 0 && tier !== 'low'); }
        refreshUI();
    }

    /* ---------------- lifecycle ---------------- */
    var paused = false;
    function loadScript(src) {
        return new Promise(function (res) {
            var s = document.createElement('script'), done = false;
            function fin() { if (!done) { done = true; res(); } }
            s.src = src; s.onload = fin; s.onerror = fin; setTimeout(fin, 9000);
            document.head.appendChild(s);
        });
    }
    function loadFonts() {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        var list = ['600 20px Barlow', '700 20px Barlow', '800 20px Barlow', '600 20px Cairo', '800 20px Cairo'];
        return Promise.race([Promise.all(list.map(function (f) { return document.fonts.load(f, f.indexOf('Cairo') > 0 ? 'ب' : 'A'); })), new Promise(function (r) { setTimeout(r, 3500); })]).catch(function () {});
    }
    function mergeSaved(target, src) { if (src && typeof src === 'object') for (var k in target) if (src.hasOwnProperty(k) && typeof src[k] === typeof target[k]) target[k] = src[k]; }

    MyPC.init({
        onInit: function (i) {
            info = i || {};
            lang = MT_TXT[info.lang] ? info.lang : 'en';
            t = MT_TXT[lang]; rtl = lang === 'ar';
            tier = (info.quality && info.quality.tier) || 'mid';
            PR = tier === 'low' ? 1 : 2;
            var ac = MyPC.app_config || {};
            cfg.speed = clamp(+ac.speed || 1, 0.6, 1.6);
            cfg.restBonus = clamp(+ac.restBonus || 0, 0, 60);
            cfg.warmup = clamp(+ac.warmupSeconds || 30, 10, 120);
            cfg.cooldown = clamp(+ac.cooldownSeconds || 30, 10, 120);
            cfg.voice = ac.voice !== false;
            cfg.sets = clamp(Math.round(+ac.sets || 2), 1, 4);
            mergeSaved(profile, MyPC.load('profile', null));
            var savedSet = MyPC.load('settings', null);
            mergeSaved(settings, savedSet);
            if (!savedSet || savedSet.cv !== 2) { settings.ctrl = 1; settings.cv = 2; } // hands-free is the new default
            var savedCustom = MyPC.load('custom', null);
            mergeSaved(custom, savedCustom);
            if (!(custom.moves instanceof Array) || custom.moves.length !== CUSTOM_MOVES.length) custom.moves = [1, 1, 1, 1, 0];
            custom.work = clamp(custom.work | 0, 10, 180); custom.rest = clamp(custom.rest | 0, 5, 90); custom.rounds = clamp(custom.rounds | 0, 1, 30); custom.terrain = clamp(custom.terrain | 0, 0, NL - 1); custom.pre = clamp(custom.pre | 0, 0, PRESETS.length);
            mergeSaved(progress, MyPC.load('progress', null));
            if (!(progress.best instanceof Array)) progress.best = [];
            while (progress.best.length < NL) progress.best.push(0);
            progress.unlocked = clamp(progress.unlocked | 0, 1, NL);
            progress.last = clamp(progress.last | 0, 0, progress.unlocked - 1);
            needProfile = !MyPC.load('hasProfile', false);
            fxFull = settings.fx === 2 || (settings.fx === 0 && tier !== 'low');
            canvas = document.getElementById('c'); glCanvas = document.getElementById('gl');
            try { if (window.THREE && window.MTWorld3D && ac.renderer !== '2d') W3 = MTWorld3D.create(glCanvas, { tier: tier }); } catch (e) { W3 = null; }
            if (!W3) glCanvas.style.display = 'none';
            S3.R = R; S3.OBS = OBS; S3.ORBS = ORBS;
            ctx = canvas.getContext('2d');
            resize(); window.addEventListener('resize', resize);
            shadeL = ctx.createLinearGradient(0, 0, W, 0); shadeL.addColorStop(0, 'rgba(4,8,18,0.92)'); shadeL.addColorStop(0.5, 'rgba(4,8,18,0.6)'); shadeL.addColorStop(0.75, 'rgba(4,8,18,0)');
            shadeR = ctx.createLinearGradient(W, 0, 0, 0); shadeR.addColorStop(0, 'rgba(4,8,18,0.92)'); shadeR.addColorStop(0.5, 'rgba(4,8,18,0.6)'); shadeR.addColorStop(0.75, 'rgba(4,8,18,0)');
            shadeTop = ctx.createLinearGradient(0, 0, 0, H); shadeTop.addColorStop(0, 'rgba(4,8,18,0.85)'); shadeTop.addColorStop(0.3, 'rgba(4,8,18,0.35)'); shadeTop.addColorStop(0.75, 'rgba(4,8,18,0.35)'); shadeTop.addColorStop(1, 'rgba(4,8,18,0.9)');
            MyPC.setMenu([{ id: 'restart', label: t.restart }, { id: 'menu', label: t.quit }]);
            MyPC.progress(0.1);
            var vlang = lang;
            Promise.all([loadFonts(), loadScript('voice/' + vlang + '.js?v=' + VERSION)]).then(function () {
                MyPC.progress(0.7);
                makeThumbs();
                refreshUI();
                startDemo();
                MyPC.progress(1);
                MyPC.ready();
            });
        },
        onStart: function () {
            initAudio();
            startLoop();
            welcomePending = true;
            MyPC.announce(t.t1 + ' ' + t.t2 + '. ' + t[TITLE_ITEMS[sel]]);
        },
        onPause: function () {
            paused = true; stopLoop();
            if (AC) { try { AC.suspend(); } catch (e) {} }
            if (ctx) { draw(); drawPausedOverlay(); }
        },
        onResume: function () {
            paused = false;
            if (AC) { try { AC.resume(); } catch (e) {} }
            startLoop();
        },
        onDestroy: function () { stopLoop(); window.removeEventListener('resize', resize); closeAudio(); if (W3) { W3.dispose(); W3 = null; } },
        onInput: onInput,
        onMenu: function (id) {
            if (id === 'restart' && (screen === 'play' || screen === 'results')) startLevel(level, customRun);
            else if (id === 'menu') toTitle();
        },
        onVolume: function (v) { if (info) info.volume = v; applyVolume(); }
    });
})();
