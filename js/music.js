/* Motion Trail: workout music and sound effects.
 * Ten original HIIT-style loops composed in code and rendered once with an
 * OfflineAudioContext into a seamless 16-bar AudioBuffer, so nothing large is
 * downloaded or decoded on the TV and the loop plays with a single node.
 */
var MTMusic = (function () {
    'use strict';

    // style: k = kick (four | half | break), b = bass, h = hats, s = snare, l = lead, p = pad
    var TRACKS = [
        { name: 'Ignition',     bpm: 124, root: 45, prog: [0, 5, 2, 6], k: 'four',  b: 'offbeat', h: 'off16', s: 'clap',  l: 'pluck', p: 1, wave: 'sawtooth' },
        { name: 'Redline',      bpm: 128, root: 41, prog: [0, 0, 5, 6], k: 'four',  b: 'roll',    h: '16',    s: 'clap',  l: 'acid',  p: 0, wave: 'sawtooth' },
        { name: 'Pulse Driver', bpm: 130, root: 43, prog: [0, 6, 5, 4], k: 'four',  b: 'offbeat', h: 'off16', s: 'clap',  l: 'stab',  p: 1, wave: 'square' },
        { name: 'Night Sprint', bpm: 118, root: 40, prog: [0, 5, 3, 4], k: 'four',  b: 'eighth',  h: '16',    s: 'snare', l: 'arp',   p: 1, wave: 'sawtooth' },
        { name: 'Overdrive',    bpm: 174, root: 38, prog: [0, 5, 6, 4], k: 'break', b: 'reese',   h: '8',     s: 'snare', l: 'stab',  p: 1, wave: 'sawtooth' },
        { name: 'Burnout',      bpm: 126, root: 44, prog: [0, 5, 2, 6], k: 'four',  b: 'offbeat', h: 'off16', s: 'clap',  l: 'stab',  p: 1, wave: 'sawtooth' },
        { name: 'Velocity',     bpm: 136, root: 42, prog: [0, 5, 3, 6], k: 'four',  b: 'roll',    h: 'off16', s: 'clap',  l: 'arp',   p: 1, wave: 'sawtooth' },
        { name: 'Iron Lungs',   bpm: 96,  root: 37, prog: [0, 0, 5, 6], k: 'half',  b: '808',     h: 'trap',  s: 'clap',  l: 'pluck', p: 1, wave: 'square' },
        { name: 'Afterburn',    bpm: 132, root: 46, prog: [0, 3, 5, 4], k: 'four',  b: 'roll',    h: '16',    s: 'clap',  l: 'acid',  p: 0, wave: 'square' },
        { name: 'Final Lap',    bpm: 145, root: 39, prog: [0, 5, 6, 4], k: 'four',  b: 'offbeat', h: 'off16', s: 'snare', l: 'arp',   p: 1, wave: 'sawtooth' }
    ];
    var MINOR = [0, 2, 3, 5, 7, 8, 10];

    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function chord(root, deg) {          // triad on a degree of the natural minor scale, as midi notes
        var out = [];
        for (var i = 0; i < 3; i++) {
            var d = deg + i * 2, oct = Math.floor(d / 7);
            out.push(root + MINOR[d % 7] + 12 * oct);
        }
        return out;
    }
    function rng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

    function noiseBuffer(ctx, sec) {
        var len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return b;
    }
    function impulse(ctx, sec, decay) {
        var len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
        for (var c = 0; c < 2; c++) {
            var d = b.getChannelData(c);
            for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        return b;
    }

    /* ---------------- instruments (offline graph) ---------------- */

    function Kit(ctx, out, duckGain, reverb) {
        this.ctx = ctx; this.out = out; this.duck = duckGain; this.rev = reverb;
        this.noise = noiseBuffer(ctx, 1.2);
    }
    Kit.prototype.kick = function (t, hard) {
        var c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(hard ? 190 : 160, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(1.0, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        o.connect(g); g.connect(this.out);
        o.start(t); o.stop(t + 0.45);
        this.noiseHit(t, 0.012, 'highpass', 2500, 0.25, false);
        // sidechain: everything melodic ducks under the kick
        var d = this.duck.gain;
        d.setValueAtTime(0.3, t);
        d.linearRampToValueAtTime(1, t + 0.22);
    };
    Kit.prototype.noiseHit = function (t, dur, type, freq, vol, wet, q) {
        var c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = this.noise;
        f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(f); f.connect(g); g.connect(this.out);
        if (wet) g.connect(this.rev);
        s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    };
    Kit.prototype.clap = function (t) {
        for (var i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, 0.02, 'bandpass', 1300, 0.55, false, 1.2);
        this.noiseHit(t + 0.033, 0.2, 'bandpass', 1200, 0.5, true, 1.0);
    };
    Kit.prototype.snare = function (t, vol) {
        var c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
        g.gain.setValueAtTime(0.35 * (vol || 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.14);
        this.noiseHit(t, 0.17, 'highpass', 1800, 0.45 * (vol || 1), true);
    };
    Kit.prototype.hat = function (t, open, vol) { this.noiseHit(t, open ? 0.16 : 0.035, 'highpass', open ? 7000 : 8500, (open ? 0.16 : 0.12) * (vol || 1), false); };
    Kit.prototype.crash = function (t) { this.noiseHit(t, 1.6, 'highpass', 5000, 0.18, true); };

    function synthNote(ctx, dest, t, dur, midi, opt) {
        var g = ctx.createGain(), f = ctx.createBiquadFilter(), n = opt.voices || 1, i;
        f.type = 'lowpass';
        f.Q.value = opt.q || 0.8;
        var c0 = opt.cut || 1200, ce = opt.cutEnv || 0;
        f.frequency.setValueAtTime(c0 + ce, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(80, c0), t + (opt.cutDecay || 0.15));
        var a = opt.attack || 0.005, rel = opt.release || 0.05, v = opt.vol || 0.2;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + a);
        if (opt.decay) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v * (opt.sustain || 0.0001)), t + a + opt.decay);
        g.gain.setValueAtTime(opt.decay ? Math.max(0.0001, v * (opt.sustain || 0.0001)) : v, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
        for (i = 0; i < n; i++) {
            var o = ctx.createOscillator();
            o.type = opt.wave || 'sawtooth';
            o.frequency.value = hz(midi);
            o.detune.value = n > 1 ? (i / (n - 1) - 0.5) * (opt.spread || 18) : 0;
            o.connect(f);
            o.start(t); o.stop(t + dur + rel + 0.02);
        }
        f.connect(g);
        g.connect(dest);
    }

    /* ---------------- composer ---------------- */

    function schedule(ctx, tr, bars, mix) {
        var beat = 60 / tr.bpm, bar = beat * 4, s16 = beat / 4, r = rng(tr.bpm * 31 + tr.root), kit = mix.kit;
        var bassOpt = { id: 'b', wave: tr.b === '808' ? 'sine' : tr.b === 'reese' ? 'sawtooth' : tr.wave, cut: tr.b === 'reese' ? 380 : 260, cutEnv: tr.b === '808' ? 0 : 900, cutDecay: 0.12, vol: tr.b === '808' ? 0.55 : 0.32, voices: tr.b === 'reese' ? 3 : 1, spread: 30, q: 2 };
        var padOpt = { id: 'p', wave: 'sawtooth', voices: 3, spread: 22, cut: 1400, attack: 0.25, release: 0.5, vol: 0.05, send: 1, haas: 1 };
        var leadOpt = tr.l === 'acid'
            ? { id: 'l', wave: 'sawtooth', cut: 420, cutEnv: 2600, cutDecay: 0.14, q: 9, vol: 0.12, release: 0.04, pan: 1 }
            : tr.l === 'stab'
                ? { id: 'l', wave: 'sawtooth', voices: 3, spread: 26, cut: 2200, cutEnv: 2500, cutDecay: 0.18, vol: 0.07, decay: 0.2, sustain: 0.05, send: 1, haas: 1 }
                : { id: 'l', wave: tr.l === 'pluck' ? 'triangle' : 'square', cut: 1500, cutEnv: 3000, cutDecay: 0.12, vol: tr.l === 'pluck' ? 0.16 : 0.07, decay: 0.16, sustain: 0.02, send: 1, pan: 1 };
        for (var b = 0; b < bars; b++) {
            var t0 = b * bar, deg = tr.prog[Math.floor(b / 2) % tr.prog.length], ch = chord(tr.root + 24, deg), bassNote = tr.root + MINOR[deg % 7] - (deg >= 5 ? 12 : 0);
            var partB = b >= 8, fill = (b % 8) === 7, i;
            if (b === 0 || b === 8) kit.crash(t0);
            // drums
            for (i = 0; i < 16; i++) {
                var t = t0 + i * s16;
                if (tr.k === 'four' && i % 4 === 0 && !(fill && i >= 12)) kit.kick(t, i === 0);
                if (tr.k === 'half' && (i === 0 || i === 10 || (i === 7 && b % 2))) kit.kick(t, i === 0);
                if (tr.k === 'break' && (i === 0 || i === 10 || (i === 6 && b % 2 === 1))) kit.kick(t, i === 0);
                var back = tr.k === 'half' || tr.k === 'break' ? i === 8 : i === 4 || i === 12;
                if (back && !(fill && i >= 12)) { if (tr.s === 'clap') kit.clap(t); else kit.snare(t); }
                if (fill && i >= 12) kit.snare(t, 0.45 + (i - 12) * 0.18);
                if (tr.k === 'break' && (i === 14 || (i === 3 && b % 2 === 0))) kit.snare(t, 0.35);
                if (tr.h === 'off16') { if (i % 4 === 2) kit.hat(t, true); else if (partB && i % 2) kit.hat(t, false, 0.6); }
                else if (tr.h === '16') kit.hat(t, i % 4 === 2, i % 2 ? 0.55 : 0.9);
                else if (tr.h === '8') { if (i % 2 === 0) kit.hat(t, i % 8 === 4, 0.8); }
                else if (tr.h === 'trap') { kit.hat(t, false, 0.7); if (partB && i % 8 === 6) kit.hat(t + s16 / 3, false, 0.5); }
            }
            // bass
            if (tr.b === 'offbeat') for (i = 0; i < 4; i++) mix.note(mix.duck, t0 + i * beat + beat / 2, beat * 0.35, bassNote, bassOpt);
            else if (tr.b === 'roll') for (i = 0; i < 16; i++) { if (i % 4) mix.note(mix.duck, t0 + i * s16, s16 * 0.8, bassNote + (i % 8 === 6 ? 12 : 0), bassOpt); }
            else if (tr.b === 'eighth') for (i = 0; i < 8; i++) mix.note(mix.duck, t0 + i * beat / 2, beat * 0.42, bassNote + (i % 2 ? 12 : 0), bassOpt);
            else if (tr.b === 'reese') { mix.note(mix.duck, t0, beat * 1.9, bassNote, bassOpt); mix.note(mix.duck, t0 + beat * 2.5, beat * 1.4, bassNote + (b % 2 ? 3 : 0), bassOpt); }
            else if (tr.b === '808') { mix.note(mix.dry, t0, beat * 2.2, bassNote, bassOpt); mix.note(mix.dry, t0 + beat * 2.5, beat * 1.2, bassNote + (b % 2 ? 7 : 0), bassOpt); }
            // pad
            if (tr.p && (b % 2 === 0)) for (i = 0; i < 3; i++) mix.note(mix.duck, t0, bar * 2 - 0.1, ch[i], padOpt);
            // lead
            if (tr.l === 'arp' && partB) for (i = 0; i < 16; i++) mix.note(mix.duck, t0 + i * s16, s16 * 0.7, ch[i % 3] + 12 * ((i >> 2) % 2), leadOpt);
            if (tr.l === 'arp' && !partB && b % 2 === 1) for (i = 8; i < 16; i++) mix.note(mix.duck, t0 + i * s16, s16 * 0.6, ch[i % 3] + 12, leadOpt);
            if (tr.l === 'pluck') for (i = 0; i < 16; i++) { if ((i * 7 + b * 3) % 5 < (partB ? 3 : 2) && i % 2 === 0) mix.note(mix.duck, t0 + i * s16, s16 * 1.4, ch[(i >> 1) % 3] + 12, leadOpt); }
            if (tr.l === 'acid') for (i = 0; i < 16; i++) { if (r() < (partB ? 0.75 : 0.45)) mix.note(mix.duck, t0 + i * s16, s16 * 0.6, bassNote + 24 + (r() < 0.25 ? 12 : 0) + (r() < 0.2 ? 3 : 0), leadOpt); }
            if (tr.l === 'stab') for (i = 0; i < 16; i++) { if ((partB ? [0, 3, 6, 10, 12] : [3, 10]).indexOf(i) >= 0) for (var k = 0; k < 3; k++) mix.note(mix.duck, t0 + i * s16, s16 * 1.2, ch[k] + 12, leadOpt); }
        }
    }

    /* Rendering is done in three cheap steps so it stays fast on a TV:
     * 1. the composer records note/drum events instead of building an audio graph;
     * 2. each distinct sound is rendered once into a small sample bank;
     * 3. events are mixed in plain JS, then one pass adds reverb and compression.
     */
    var KIT_LEN = { kick0: 0.5, kick1: 0.5, clap: 0.3, snare: 0.26, hat0: 0.07, hat1: 0.2, crash: 1.7 };
    var KIT_WET = { clap: 0.6, snare: 0.6, crash: 0.8 };
    function Recorder() {
        var self = this;
        this.ev = []; this.kicks = []; this.dry = 'dry'; this.duck = 'duck'; this.keys = {};
        function hit(key, t, vol, pan) { self.keys[key] = 1; self.ev.push({ key: key, t: t, bus: 'dry', vol: vol, pan: pan || 0, wet: KIT_WET[key] || 0, haas: 0 }); }
        var hatSide = 1;
        this.kit = {
            kick: function (t, hard) { hit(hard ? 'kick1' : 'kick0', t, 0.72); self.kicks.push(t); },
            clap: function (t) { hit('clap', t, 1); },
            snare: function (t, vol) { hit('snare', t, vol || 1); },
            hat: function (t, open, vol) { hatSide = -hatSide; hit(open ? 'hat1' : 'hat0', t, (vol || 1) * 1.35, hatSide * 0.18); },
            crash: function (t) { hit('crash', t, 1); }
        };
        this.notes = {};
        this.leadSide = 1;
    }
    Recorder.prototype.note = function (bus, t, dur, midi, opt) {
        var key = opt.id + midi + '_' + Math.round(dur * 1000);
        if (!this.notes[key]) this.notes[key] = { dur: dur, midi: midi, opt: opt };
        if (opt.pan) this.leadSide = -this.leadSide;
        this.ev.push({ key: key, t: t, bus: bus, vol: bus === 'duck' ? 1.7 : 0.8, pan: opt.pan ? this.leadSide * 0.28 : 0, wet: opt.send ? 1 : 0, haas: opt.haas ? 1 : 0 });
    };

    function renderBank(rec, sr) {
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, items = [], total = 0.05, k;
        for (k in rec.keys) { items.push({ key: k, len: KIT_LEN[k], at: total }); total += KIT_LEN[k] + 0.02; }
        for (k in rec.notes) { var n = rec.notes[k], len = n.dur + (n.opt.release || 0.05) + 0.06; items.push({ key: k, len: len, at: total, n: n }); total += len + 0.02; }
        var ctx = new OAC(1, Math.ceil(total * sr), sr), out = ctx.createGain(), dummy = ctx.createGain(), kit;
        out.connect(ctx.destination);
        kit = new Kit(ctx, out, dummy, dummy);
        items.forEach(function (it) {
            if (it.n) synthNote(ctx, out, it.at, it.n.dur, it.n.midi, it.n.opt);
            else if (it.key === 'kick0' || it.key === 'kick1') kit.kick(it.at, it.key === 'kick1');
            else if (it.key === 'hat0' || it.key === 'hat1') kit.hat(it.at, it.key === 'hat1', 1);
            else kit[it.key](it.at, 1);
        });
        return ctx.startRendering().then(function (buf) {
            var d = buf.getChannelData(0), bank = {};
            items.forEach(function (it) { var a = Math.floor(it.at * sr); bank[it.key] = d.subarray(a, Math.min(d.length, a + Math.ceil(it.len * sr))); });
            return bank;
        });
    }

    /* Render track idx as a seamless loop. lite = mono, lower rate (low-tier TVs). */
    function render(idx, lite) {
        var tr = TRACKS[idx % TRACKS.length], bars = 16, beat = 60 / tr.bpm, loopSec = bars * beat * 4, tail = 2.0;
        var sr = lite ? 22050 : 32000, chs = lite ? 1 : 2, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC) return Promise.reject(new Error('no offline audio'));
        var rec = new Recorder();
        rec.kit.duck = null;
        schedule(null, tr, bars, rec);
        return renderBank(rec, sr).then(function (bank) {
            var N = Math.ceil((loopSec + tail) * sr), c, i;
            var main = [], duck = [], send = new Float32Array(N), env = new Float32Array(N);
            for (c = 0; c < chs; c++) { main.push(new Float32Array(N)); duck.push(new Float32Array(N)); }
            env.fill(1);
            var dl = Math.floor(0.22 * sr);
            rec.kicks.forEach(function (tk) { var a = Math.floor(tk * sr); for (var j = 0; j < dl && a + j < N; j++) { var v = 0.3 + 0.7 * j / dl; if (v < env[a + j]) env[a + j] = v; } });
            var haas = Math.floor(0.011 * sr);
            rec.ev.forEach(function (e) {
                var smp = bank[e.key], a = Math.floor(e.t * sr), tgt = e.bus === 'duck' ? duck : main, len = smp.length, j, v;
                var gl = chs === 2 ? e.vol * (1 - Math.max(0, e.pan)) : e.vol, gr = e.vol * (1 + Math.min(0, e.pan));
                var L = tgt[0], R = chs === 2 ? tgt[1] : null, rOff = e.haas ? haas : 0;
                for (j = 0; j < len && a + j < N; j++) {
                    v = smp[j];
                    L[a + j] += v * gl;
                    if (R && a + j + rOff < N) R[a + j + rOff] += v * gr;
                    if (e.wet) send[a + j] += v * e.vol * e.wet;
                }
            });
            for (c = 0; c < chs; c++) { var m = main[c], dk = duck[c]; for (i = 0; i < N; i++) m[i] += dk[i] * env[i]; }
            duck = null; env = null;
            // final pass: reverb on the send, gentle bus compression
            var ctx = new OAC(chs, N, sr);
            var mb = ctx.createBuffer(chs, N, sr), sb = ctx.createBuffer(1, N, sr);
            for (c = 0; c < chs; c++) mb.getChannelData(c).set(main[c]);
            sb.getChannelData(0).set(send);
            var comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.15;
            comp.connect(ctx.destination);
            var ms = ctx.createBufferSource(); ms.buffer = mb; ms.connect(comp);
            var ss = ctx.createBufferSource(); ss.buffer = sb;
            var rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 1.8, 3);
            var rg = ctx.createGain(); rg.gain.value = 0.22;
            ss.connect(rev); rev.connect(rg); rg.connect(comp);
            ms.start(0); ss.start(0);
            return ctx.startRendering();
        }).then(function (buf) {
            // fold the tail back to the start so the loop is seamless, then normalise the peak
            var loopLen = Math.floor(loopSec * sr), tailLen = buf.length - loopLen, peak = 0.0001, c, i;
            var out = new AudioBuffer({ length: loopLen, numberOfChannels: chs, sampleRate: sr });
            for (c = 0; c < chs; c++) {
                var src = buf.getChannelData(c), dst = out.getChannelData(c);
                dst.set(src.subarray(0, loopLen));
                for (i = 0; i < tailLen && i < loopLen; i++) dst[i] += src[loopLen + i];
                for (i = 0; i < loopLen; i++) { var v = dst[i] < 0 ? -dst[i] : dst[i]; if (v > peak) peak = v; }
            }
            var g = 0.89 / peak;
            for (c = 0; c < chs; c++) { var d = out.getChannelData(c); for (i = 0; i < loopLen; i++) d[i] *= g; }
            return out;
        });
    }

    /* ---------------- sound effects, rendered once ---------------- */

    var SFX_LIST = ['whoosh', 'jump', 'land', 'kick', 'orb', 'hit', 'beep', 'go', 'clear', 'select', 'move', 'fanfare'];

    function renderSfx(name) {
        var sr = 22050, len = name === 'fanfare' ? 1.6 : 0.6;
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        var ctx = new OAC(1, Math.ceil(sr * len), sr), out = ctx.createGain();
        out.connect(ctx.destination);
        var kit = new Kit(ctx, out, ctx.createGain(), out), t = 0.0, o, g, i;
        function tone(type, f0, f1, start, dur, vol) {
            var oo = ctx.createOscillator(), gg = ctx.createGain();
            oo.type = type; oo.frequency.setValueAtTime(f0, start); if (f1 !== f0) oo.frequency.exponentialRampToValueAtTime(f1, start + dur);
            gg.gain.setValueAtTime(0.0001, start); gg.gain.linearRampToValueAtTime(vol, start + 0.008); gg.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            oo.connect(gg); gg.connect(out); oo.start(start); oo.stop(start + dur + 0.02);
        }
        switch (name) {
            case 'whoosh': kit.noiseHit(t, 0.28, 'bandpass', 900, 0.5, false, 0.8); tone('sine', 300, 600, t, 0.2, 0.08); break;
            case 'jump': tone('triangle', 260, 720, t, 0.22, 0.3); tone('sine', 520, 1300, t + 0.04, 0.18, 0.1); break;
            case 'land': kit.noiseHit(t, 0.12, 'lowpass', 500, 0.6, false); tone('sine', 120, 60, t, 0.12, 0.4); break;
            case 'kick': kit.kick(t, true); kit.noiseHit(t, 0.25, 'bandpass', 2200, 0.7, false, 0.7); tone('square', 900, 200, t, 0.12, 0.08); break;
            case 'orb': tone('sine', 1320, 1320, t, 0.12, 0.2); tone('sine', 1980, 1980, t + 0.06, 0.2, 0.16); break;
            case 'hit': tone('sawtooth', 180, 60, t, 0.35, 0.3); kit.noiseHit(t, 0.3, 'lowpass', 900, 0.6, false); break;
            case 'beep': tone('sine', 880, 880, t, 0.16, 0.35); break;
            case 'go': tone('sine', 1320, 1320, t, 0.35, 0.35); tone('triangle', 660, 660, t, 0.35, 0.2); break;
            case 'clear': tone('triangle', 990, 1480, t, 0.14, 0.18); break;
            case 'select': tone('sine', 740, 740, t, 0.07, 0.18); tone('sine', 1110, 1110, t + 0.05, 0.1, 0.16); break;
            case 'move': tone('sine', 520, 560, t, 0.06, 0.12); break;
            case 'fanfare':
                var notes = [72, 76, 79, 84];
                for (i = 0; i < 4; i++) { tone('sawtooth', hz(notes[i]), hz(notes[i]), t + i * 0.12, i === 3 ? 0.9 : 0.2, 0.09); tone('triangle', hz(notes[i]), hz(notes[i]), t + i * 0.12, i === 3 ? 0.9 : 0.2, 0.15); }
                kit.crash(t + 0.36);
                break;
        }
        return ctx.startRendering();
    }

    function renderAllSfx() {
        var out = {}, jobs = [];
        SFX_LIST.forEach(function (n) { jobs.push(renderSfx(n).then(function (b) { out[n] = b; })); });
        return Promise.all(jobs).then(function () { return out; });
    }

    return { TRACKS: TRACKS, render: render, renderAllSfx: renderAllSfx };
})();
