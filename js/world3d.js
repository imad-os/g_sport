/* Motion Trail: 3D world (three.js r158, WebGL).
 * Builds one biome at a time (textures are painted in code, props are merged per segment),
 * and renders the lane track, obstacles, orbs and the athlete from the game state.
 * Game coordinates: x lateral (m), y up, z = distance ahead of the runner. three.js z = -z.
 * Nothing is allocated in render(): all vectors and objects are created up front.
 */
var MTWorld3D = (function () {
    'use strict';
    var T = window.THREE;

    /* ---------------- noise ---------------- */
    var PERM = new Uint8Array(512);
    (function () { var p = [], i, s = 1337; for (i = 0; i < 256; i++) p[i] = i; for (i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; var j = s % (i + 1), k = p[i]; p[i] = p[j]; p[j] = k; } for (i = 0; i < 512; i++) PERM[i] = p[i & 255]; })();
    function fade(t) { return t * t * (3 - 2 * t); }
    function hash(x, y) { return PERM[(PERM[x & 255] + y) & 255] / 255; }
    function vnoise(x, y, period) { // tileable value noise
        var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, p = period || 256;
        var x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
        var a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1), u = fade(xf), v = fade(yf);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, oct, period) { var s = 0, amp = 0.5, f = 1, n = 0; for (var o = 0; o < oct; o++) { s += vnoise(x * f, y * f, period * f) * amp; n += amp; amp *= 0.5; f *= 2; } return s / n; }
    function rng(seed) { var s = seed | 0 || 1; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
    function hex(c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

    /* ---------------- painted textures ---------------- */
    function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function toTex(c, rx, ry, srgb) {
        var t = new T.CanvasTexture(c);
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.repeat.set(rx || 1, ry || 1);
        if (srgb !== false) t.colorSpace = T.SRGBColorSpace;
        t.anisotropy = ANISO;
        return t;
    }
    // per-pixel noise fill: colour = mix(a, b, fbm) with grain
    function noiseFill(g, w, h, a, b, scale, grain, oct) {
        var img = g.getImageData(0, 0, w, h), d = img.data, A = hex(a), B = hex(b), r = rng(w * 7 + h), per = scale;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            var n = fbm(x / w * scale, y / h * scale, oct || 4, per), k = (y * w + x) * 4, gr = (r() - 0.5) * grain;
            d[k] = clampB(A[0] + (B[0] - A[0]) * n + gr); d[k + 1] = clampB(A[1] + (B[1] - A[1]) * n + gr); d[k + 2] = clampB(A[2] + (B[2] - A[2]) * n + gr); d[k + 3] = 255;
        }
        g.putImageData(img, 0, 0);
    }
    function clampB(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
    function speckle(g, w, h, n, col, size, alpha, seed) { var r = rng(seed || 9); g.fillStyle = col; for (var i = 0; i < n; i++) { g.globalAlpha = alpha * (0.4 + r() * 0.6); var s = size * (0.5 + r()); g.fillRect(r() * w, r() * h, s, s); } g.globalAlpha = 1; }

    var ROAD_W = 7.4, ROAD_TILE = 6;
    // road surfaces: base colours + lane paint; one tile = 7.4 m wide x 6 m long
    function roadTexture(kind, line, edge) {
        var w = TEXQ, h = TEXQ, c = canvas(w, h), g = c.getContext('2d'), px = w / ROAD_W, i;
        var S = {
            asphalt: ['#2a2c31', '#4a4c52', 8, 26], wet: ['#15161c', '#2b2d38', 8, 18], dirt: ['#6b4f36', '#9a7853', 6, 30],
            sandstone: ['#8a5536', '#b77a4f', 5, 26], snow: ['#c9d6e4', '#f4f8fc', 5, 14], basalt: ['#1c1a1a', '#3a3533', 7, 24],
            metal: ['#2c3342', '#3d4658', 3, 10], rubber: ['#8e3b2c', '#b04a36', 10, 22]
        }[kind];
        noiseFill(g, w, h, S[0], S[1], S[2], S[3], 5);
        if (kind === 'asphalt' || kind === 'wet') { speckle(g, w, h, 2600, '#8a8c92', 1.4, 0.35, 3); speckle(g, w, h, 1400, '#0d0e11', 1.6, 0.4, 4); }
        if (kind === 'dirt' || kind === 'sandstone') { speckle(g, w, h, 900, '#d8c2a0', 2.2, 0.35, 5); speckle(g, w, h, 600, '#3a2a1c', 2.5, 0.35, 6); }
        if (kind === 'basalt') { g.strokeStyle = 'rgba(255,90,20,0.5)'; g.lineWidth = 2; var rr = rng(4); for (i = 0; i < 14; i++) { g.beginPath(); var x0 = rr() * w, y0 = rr() * h; g.moveTo(x0, y0); for (var s = 0; s < 5; s++) { x0 += (rr() - 0.5) * 40; y0 += rr() * 30; g.lineTo(x0, y0); } g.stroke(); } }
        if (kind === 'metal') { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3; for (i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); } for (i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(i * w / 6, 0); g.lineTo(i * w / 6, h); g.stroke(); } g.fillStyle = 'rgba(255,255,255,0.18)'; for (i = 0; i < 6; i++) for (var j = 0; j < 4; j++) { g.fillRect(i * w / 6 + 6, j * h / 4 + 6, 4, 4); g.fillRect((i + 1) * w / 6 - 10, j * h / 4 + 6, 4, 4); } }
        // wheel / foot wear along each lane
        g.globalAlpha = kind === 'snow' ? 0.18 : 0.12;
        for (i = -1; i <= 1; i++) { var cx = (i * 2 + ROAD_W / 2) * px; var gr = g.createLinearGradient(cx - px * 0.7, 0, cx + px * 0.7, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, kind === 'snow' ? '#7f93ab' : '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - px * 0.7, 0, px * 1.4, h); }
        g.globalAlpha = 1;
        // paint: dashed lane dividers, solid edges
        g.fillStyle = line;
        for (i = -1; i <= 1; i += 2) g.fillRect((i + ROAD_W / 2) * px - px * 0.07, 0, px * 0.14, h * 0.5);
        g.fillStyle = edge;
        g.fillRect((ROAD_W / 2 - 3.3) * px - px * 0.08, 0, px * 0.16, h); g.fillRect((ROAD_W / 2 + 3.3) * px - px * 0.08, 0, px * 0.16, h);
        // worn paint
        speckle(g, w, h, 900, S[0], 2, 0.6, 8);
        return toTex(c, 1, 1);
    }
    function groundTexture(kind) {
        var w = TEXQ / 2, h = TEXQ / 2, c = canvas(w, h), g = c.getContext('2d'), i, r = rng(kind.length * 31);
        var S = {
            grass: ['#2f4a1e', '#5d7f30', 6, 30], dry: ['#6d6a3a', '#9b9356', 6, 26], sand: ['#c9a470', '#e7cc98', 5, 18], desert: ['#a65f36', '#d1925a', 4, 24],
            snow: ['#cbd8e6', '#ffffff', 4, 10], basalt: ['#121011', '#2e2827', 6, 20], concrete: ['#77777a', '#9a9a9d', 6, 16], forest: ['#2a2617', '#4c4426', 6, 28],
            quay: ['#4a4d52', '#6a6d72', 6, 16], deck: ['#1a1f2b', '#262d3d', 3, 8], tundra: ['#8fa1b6', '#d6e1ec', 5, 12]
        }[kind];
        noiseFill(g, w, h, S[0], S[1], S[2], S[3], 5);
        if (kind === 'grass' || kind === 'dry' || kind === 'forest') { g.lineWidth = 1; for (i = 0; i < 1800; i++) { var x = r() * w, y = r() * h; g.strokeStyle = r() < 0.5 ? 'rgba(120,160,60,0.5)' : 'rgba(30,50,15,0.5)'; if (kind === 'forest') g.strokeStyle = r() < 0.5 ? 'rgba(110,90,50,0.5)' : 'rgba(40,60,20,0.5)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 5); g.stroke(); } }
        if (kind === 'sand' || kind === 'desert') { g.globalAlpha = 0.12; g.strokeStyle = '#fff'; for (i = 0; i < h; i += 7) { g.beginPath(); for (var xx = 0; xx <= w; xx += 8) g.lineTo(xx, i + Math.sin(xx / 13 + i) * 2); g.stroke(); } g.globalAlpha = 1; }
        if (kind === 'snow' || kind === 'tundra') speckle(g, w, h, 500, '#ffffff', 1.5, 0.9, 12);
        if (kind === 'concrete' || kind === 'quay') { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); } }
        if (kind === 'basalt') { g.strokeStyle = 'rgba(255,80,10,0.6)'; g.lineWidth = 1.5; for (i = 0; i < 10; i++) { g.beginPath(); var a = r() * w, b = r() * h; g.moveTo(a, b); for (var k = 0; k < 6; k++) { a += (r() - 0.5) * 30; b += (r() - 0.5) * 30; g.lineTo(a, b); } g.stroke(); } }
        if (kind === 'deck') { g.strokeStyle = 'rgba(85,230,255,0.25)'; g.lineWidth = 2; for (i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(0, i * h / 2); g.lineTo(w, i * h / 2); g.stroke(); g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, h); g.stroke(); } }
        return toTex(c, 1, 1);
    }
    function facadeTexture(base, lit, dark, seed, style, litP) {
        var w = 256, h = 512, c = canvas(w, h), g = c.getContext('2d'), r = rng(seed), x, y;
        noiseFill(g, w, h, base, shade(base, 18), 6, 10, 3);
        var cols = style === 'tower' ? 8 : 4, rows = style === 'tower' ? 24 : 6, mw = w / cols, mh = h / rows;
        for (y = 0; y < rows; y++) {
            g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y * mh + mh - 3, w, 3);
            for (x = 0; x < cols; x++) {
                var on = r(), wx = x * mw + mw * 0.16, wy = y * mh + mh * 0.18, ww = mw * 0.68, wh = mh * 0.58;
                if (on < (litP || 0.35)) { var gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, lit); gr.addColorStop(1, shade(lit, -40)); g.fillStyle = gr; }
                else { var gd = g.createLinearGradient(wx, wy, wx + ww, wy + wh); gd.addColorStop(0, dark); gd.addColorStop(1, shade(dark, 25)); g.fillStyle = gd; }
                g.fillRect(wx, wy, ww, wh);
            }
        }
        return c;
    }
    function emissiveFrom(c, threshold) { // keep only the bright (lit) pixels
        var e = canvas(c.width, c.height), g = e.getContext('2d');
        g.drawImage(c, 0, 0);
        var img = g.getImageData(0, 0, e.width, e.height), d = img.data;
        for (var i = 0; i < d.length; i += 4) { var l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l < threshold) { d[i] = d[i + 1] = d[i + 2] = 0; } }
        g.putImageData(img, 0, 0);
        return e;
    }
    function shade(c, amt) { var a = hex(c); return 'rgb(' + clampB(a[0] + amt) + ',' + clampB(a[1] + amt) + ',' + clampB(a[2] + amt) + ')'; }
    function hazardTexture(a, b) {
        var c = canvas(256, 64), g = c.getContext('2d');
        g.fillStyle = a; g.fillRect(0, 0, 256, 64); g.fillStyle = b;
        for (var s = -64; s < 256; s += 64) { g.beginPath(); g.moveTo(s, 64); g.lineTo(s + 32, 64); g.lineTo(s + 96, 0); g.lineTo(s + 64, 0); g.closePath(); g.fill(); }
        noiseOver(g, 256, 64, 0.12);
        return toTex(c, 1, 1);
    }
    function noiseOver(g, w, h, a) { speckle(g, w, h, w * h / 30, '#000', 1.5, a, 2); speckle(g, w, h, w * h / 60, '#fff', 1.2, a * 0.6, 3); }
    function targetTexture(col) {
        var c = canvas(128, 128), g = c.getContext('2d');
        var gr = g.createRadialGradient(64, 54, 10, 64, 64, 90); gr.addColorStop(0, shade(col, 30)); gr.addColorStop(1, shade(col, -40));
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 36, 0, 6.2832); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 13, 0, 6.2832); g.fill();
        noiseOver(g, 128, 128, 0.1);
        return toTex(c, 1, 1);
    }
    function glowTexture() {
        var c = canvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        return toTex(c, 1, 1);
    }
    function cloudTexture(seed) {
        var w = 256, h = 128, c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            var dx = (x - w / 2) / (w / 2), dy = (y - h * 0.6) / (h * 0.5), fall = Math.max(0, 1 - dx * dx - dy * dy * 1.6);
            var n = fbm(x / 40 + seed, y / 40, 5, 256), a = clampB((n * 1.6 - 0.45) * fall * 400), k = (y * w + x) * 4;
            d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = a;
        }
        g.putImageData(img, 0, 0);
        return toTex(c, 1, 1);
    }
    function leafTexture(col) { // palm frond
        var c = canvas(64, 256), g = c.getContext('2d');
        g.strokeStyle = col; g.lineWidth = 3;
        for (var i = 8; i < 250; i += 6) { var len = 28 * Math.sin(i / 256 * Math.PI) + 4; g.beginPath(); g.moveTo(32, i); g.lineTo(32 - len, i + 10); g.moveTo(32, i); g.lineTo(32 + len, i + 10); g.stroke(); }
        g.strokeStyle = shade(col, -30); g.lineWidth = 4; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 256); g.stroke();
        return toTex(c, 1, 1);
    }
    function stripeTexture(a, b, seed) { // layered rock
        var c = canvas(128, 256), g = c.getContext('2d'), r = rng(seed);
        noiseFill(g, 128, 256, a, b, 4, 20, 4);
        for (var y = 0; y < 256; y += 6 + r() * 14) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,220,180' : '60,25,10') + ',' + (0.12 + r() * 0.15) + ')'; g.fillRect(0, y, 128, 2 + r() * 6); }
        return toTex(c, 1, 1);
    }
    function ridgedTexture(col) { // shipping container
        var c = canvas(128, 64), g = c.getContext('2d');
        g.fillStyle = col; g.fillRect(0, 0, 128, 64);
        for (var x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 0, 3, 64); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 3, 0, 2, 64); }
        noiseOver(g, 128, 64, 0.18);
        return toTex(c, 1, 1);
    }
    function backdropTexture(fn, w, h) { var c = canvas(w, h), g = c.getContext('2d'); fn(g, w, h); var t = toTex(c, 1, 1); t.wrapS = T.ClampToEdgeWrapping; t.wrapT = T.ClampToEdgeWrapping; return t; }

    /* ---------------- geometry merge ---------------- */
    var _m = null, _c = null;
    function Bucket() { this.parts = []; }
    Bucket.prototype.add = function (geo, x, y, z, rx, ry, rz, sx, sy, sz, col, uv) {
        var m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0));
        m.compose(new T.Vector3(x, y, z), q, new T.Vector3(sx || 1, sy || 1, sz || 1));
        this.parts.push({ g: geo, m: m, c: col || '#ffffff', uv: uv });
    };
    Bucket.prototype.build = function () {
        if (!this.parts.length) return null;
        var pos = [], nor = [], uvs = [], cols = [], i, j;
        for (i = 0; i < this.parts.length; i++) {
            var p = this.parts[i], g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
            g.applyMatrix4(p.m);
            var P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv ? g.attributes.uv.array : null, col = new T.Color(p.c);
            for (j = 0; j < P.length; j++) { pos.push(P[j]); nor.push(N[j]); }
            for (j = 0; j < P.length / 3; j++) {
                if (U) { var u = U[j * 2], v = U[j * 2 + 1]; if (p.uv) { u = u * p.uv[0] + p.uv[2]; v = v * p.uv[1] + p.uv[3]; } uvs.push(u, v); } else uvs.push(0, 0);
                cols.push(col.r, col.g, col.b);
            }
            g.dispose();
        }
        var geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
        geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
        geo.computeBoundingSphere();
        return geo;
    };

    /* ---------------- biomes ---------------- */
    // sky: [zenith, mid, horizon]; sun: [azimuth deg (0 = ahead), elevation deg, colour, intensity, disc size]
    var BIOMES = [
        { id: 'city', sky: ['#33427a', '#b77a96', '#ffc390'], sun: [28, 7, '#ffd2a0', 1.25, 1.2], hemi: ['#b9b5d8', '#4a3c46', 0.75], fog: ['#d9a08f', 35, 210], road: 'asphalt', line: '#f2f2ee', edge: '#ffd27a', ground: 'concrete', walk: 'concrete', night: 0.25, props: 'city', back: 'skyline', clouds: 1 },
        { id: 'harbor', sky: ['#040b18', '#0d2337', '#1f4a5c'], sun: [-35, 24, '#cfe4ff', 0.55, 0.8], hemi: ['#6a8aaa', '#1a2a34', 0.75], fog: ['#13303d', 28, 180], road: 'asphalt', line: '#e6f6ff', edge: '#3fe0d0', ground: 'quay', walk: 'quay', night: 1, props: 'harbor', back: 'harbor', stars: 1, water: '#0b2a3a' },
        { id: 'canyon', sky: ['#4b82c4', '#9fc1df', '#f2c99a'], sun: [-40, 30, '#fff1d6', 1.45, 0.9], hemi: ['#cfe1f2', '#8a4a2a', 0.7], fog: ['#e5b88c', 40, 230], road: 'sandstone', line: '#fff3dc', edge: '#ffffff', ground: 'desert', walk: 'desert', night: 0, props: 'canyon', back: 'mesas', clouds: 1 },
        { id: 'neon', sky: ['#05010d', '#1b0830', '#45114f'], sun: [20, 20, '#ff9be8', 0.35, 0], hemi: ['#5a3a8a', '#100818', 0.5], fog: ['#2a0c3a', 20, 160], road: 'wet', line: '#ff3fb4', edge: '#2ef2ff', ground: 'quay', walk: 'concrete', night: 1, props: 'neon', back: 'neon', stars: 0 },
        { id: 'glacier', sky: ['#2d6fc0', '#8cc0ea', '#e6f4ff'], sun: [35, 32, '#ffffff', 1.4, 0.9], hemi: ['#dceeff', '#9fb3c8', 0.85], fog: ['#dbeaf7', 40, 240], road: 'snow', line: '#2f8dff', edge: '#ff5a6e', ground: 'snow', walk: 'snow', night: 0, props: 'glacier', back: 'peaks', clouds: 1 },
        { id: 'space', sky: ['#000003', '#050a1e', '#111838'], sun: [-30, 18, '#c8d2ff', 1.0, 0.8], hemi: ['#6a78c8', '#0a0d1e', 0.55], fog: ['#0a0e22', 40, 260], road: 'metal', line: '#8a7dff', edge: '#55e6ff', ground: null, walk: 'deck', night: 1, props: 'space', back: 'space', stars: 1, planet: 1 },
        { id: 'forest', sky: ['#5f8fc9', '#a9c9e2', '#e9e4c8'], sun: [-25, 20, '#ffe7b0', 1.2, 1.0], hemi: ['#c9e0c0', '#3a3a1c', 0.8], fog: ['#b9c9a9', 18, 150], road: 'dirt', line: '#ffffff', edge: '#ffe08a', ground: 'forest', walk: 'forest', night: 0, props: 'forest', back: 'treeline', clouds: 1, rays: 1 },
        { id: 'coast', sky: ['#3e3d7a', '#d0708a', '#ffb067'], sun: [-38, 5, '#ffbf80', 1.2, 1.6], hemi: ['#f0b9a8', '#4a4a3a', 0.75], fog: ['#f0a383', 40, 230], road: 'asphalt', line: '#ffffff', edge: '#ffd27a', ground: 'grass', walk: 'sand', night: 0.15, props: 'coast', back: 'sea', clouds: 1, water: '#2a4f7a' },
        { id: 'volcano', sky: ['#120606', '#3d0e08', '#8a2a10'], sun: [25, 10, '#ff9a5a', 1.1, 1.4], hemi: ['#d0704a', '#3a1a10', 1.0], fog: ['#4a1a0e', 26, 190], road: 'basalt', line: '#ffb347', edge: '#ff5a1f', ground: 'basalt', walk: 'basalt', night: 0.8, props: 'volcano', back: 'volcano' },
        { id: 'aurora', sky: ['#020617', '#06233a', '#1a4a5a'], sun: [-20, 25, '#cfe8ff', 0.6, 0.7], hemi: ['#5c8fb0', '#1a2a3a', 0.65], fog: ['#0f2c3c', 30, 200], road: 'snow', line: '#7affc8', edge: '#7affc8', ground: 'tundra', walk: 'tundra', night: 1, props: 'tundra', back: 'peaksNight', stars: 1, aurora: 1 }
    ];

    var TEXQ = 512, ANISO = 4, SEG_LEN = 40, NSEG = 5;

    function create(glCanvas, opt) {
        var renderer;
        try {
            renderer = new T.WebGLRenderer({ canvas: glCanvas, antialias: opt.tier === 'high', powerPreference: 'high-performance', alpha: false });
        } catch (e) { return null; }
        if (!renderer || !renderer.getContext()) return null;
        var tier = opt.tier, shadows = tier !== 'low';
        TEXQ = tier === 'low' ? 256 : 512;
        ANISO = Math.min(tier === 'low' ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = shadows;
        renderer.shadowMap.type = tier === 'high' ? T.PCFSoftShadowMap : T.PCFShadowMap;

        var scene = new T.Scene(), camera = new T.PerspectiveCamera(52, 16 / 9, 0.3, 1200);
        var hemi = new T.HemisphereLight(0xffffff, 0x444444, 0.7), sun = new T.DirectionalLight(0xffffff, 1);
        var fill = new T.DirectionalLight(0xffffff, 1);
        scene.add(hemi); scene.add(sun); scene.add(sun.target); scene.add(fill); scene.add(fill.target);
        fill.position.set(0, 5, 12); fill.target.position.set(0, 1, -6);
        if (shadows) {
            sun.castShadow = true;
            sun.shadow.mapSize.set(tier === 'high' ? 2048 : 1024, tier === 'high' ? 2048 : 1024);
            var sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 12; sc.bottom = -6; sc.near = 1; sc.far = 80;
            sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
        }
        var neonL = null, neonR = null;
        var glowTex = glowTexture();

        /* ---------- persistent: athlete ---------- */
        var A = buildAthlete();
        scene.add(A.root);
        var blob = new T.Mesh(new T.PlaneGeometry(1.4, 1.0), new T.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
        blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; scene.add(blob);

        /* ---------- persistent: obstacle pools ---------- */
        var OM = { warn: new T.MeshLambertMaterial({ color: 0xffffff }), accent: new T.MeshLambertMaterial({ color: 0xffffff }), dark: new T.MeshLambertMaterial({ color: 0x1b1f2b }), metal: new T.MeshLambertMaterial({ color: 0xc9ced8 }),
            glowW: new T.MeshBasicMaterial({ color: 0xffffff }), glowA: new T.MeshBasicMaterial({ color: 0xffffff, map: glowTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false }),
            hazW: new T.MeshLambertMaterial({}), hazA: new T.MeshLambertMaterial({}), target: new T.MeshLambertMaterial({}), orb: new T.MeshBasicMaterial({ color: 0xffffff }) };
        var pools = { block: [], hurdle: [], tall: [], bar: [], pad: [], orb: [] };
        var i;
        for (i = 0; i < 16; i++) pools.block.push(addPool(makeBlock()));
        for (i = 0; i < 6; i++) { pools.hurdle.push(addPool(makeHurdle(0.58))); pools.tall.push(addPool(makeHurdle(1.02))); pools.bar.push(addPool(makeGate())); }
        for (i = 0; i < 18; i++) pools.pad.push(addPool(makePad()));
        for (i = 0; i < 48; i++) pools.orb.push(addPool(makeOrb()));
        function addPool(o) { o.visible = false; scene.add(o); return o; }
        function shadowAll(o) { o.traverse(function (m) { if (m.isMesh && m.material !== OM.glowA) { m.castShadow = shadows; } }); return o; }
        function makeBlock() {
            var g = new T.Group();
            var body = new T.Mesh(new T.BoxGeometry(1.64, 0.82, 0.42), OM.dark); body.position.y = 0.53; g.add(body);
            var haz = new T.Mesh(new T.BoxGeometry(1.66, 0.28, 0.44), OM.hazW); haz.position.y = 1.0; g.add(haz);
            var lamp = new T.Mesh(new T.BoxGeometry(1.66, 0.06, 0.46), OM.glowW); lamp.position.y = 1.17; g.add(lamp);
            var gl = new T.Mesh(new T.PlaneGeometry(2.4, 0.7), OM.glowA); gl.position.set(0, 1.17, 0.25); g.add(gl);
            var f1 = new T.Mesh(new T.BoxGeometry(0.3, 0.12, 0.7), OM.dark); f1.position.set(-0.6, 0.06, 0); g.add(f1);
            var f2 = f1.clone(); f2.position.x = 0.6; g.add(f2);
            return shadowAll(g);
        }
        function makeHurdle(hm) {
            var g = new T.Group(), postG = new T.CylinderGeometry(0.05, 0.05, hm, 8);
            for (var s = -1; s <= 1; s += 2) {
                var p = new T.Mesh(postG, OM.metal); p.position.set(s * 3.05, hm / 2, 0); g.add(p);
                var f = new T.Mesh(new T.BoxGeometry(0.12, 0.06, 0.6), OM.metal); f.position.set(s * 3.05, 0.03, 0); g.add(f);
            }
            var bar = new T.Mesh(new T.BoxGeometry(6.0, 0.2, 0.07), OM.hazA); bar.position.y = hm - 0.1; g.add(bar);
            if (hm > 0.8) { var b2 = new T.Mesh(new T.BoxGeometry(6.0, 0.14, 0.07), OM.hazA); b2.position.y = hm * 0.5; g.add(b2); }
            var gl = new T.Mesh(new T.PlaneGeometry(7, 0.8), OM.glowA); gl.position.set(0, hm - 0.1, 0.06); g.add(gl);
            return shadowAll(g);
        }
        function makeGate() {
            var g = new T.Group();
            for (var s = -1; s <= 1; s += 2) { var p = new T.Mesh(new T.BoxGeometry(0.28, 2.05, 0.28), OM.dark); p.position.set(s * 3.12, 1.025, 0); g.add(p); var st = new T.Mesh(new T.BoxGeometry(0.06, 1.8, 0.3), OM.glowW); st.position.set(s * 2.97, 1.0, 0); g.add(st); }
            var top = new T.Mesh(new T.BoxGeometry(6.52, 0.16, 0.3), OM.dark); top.position.y = 2.1; g.add(top);
            var beam = new T.Mesh(new T.BoxGeometry(5.94, 0.06, 0.06), OM.glowW); beam.position.y = 1.33; g.add(beam);
            var gl = new T.Mesh(new T.PlaneGeometry(6.6, 0.55), OM.glowA); gl.position.set(0, 1.33, 0.05); g.add(gl);
            return shadowAll(g);
        }
        function makePad() {
            var g = new T.Group();
            var post = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.5, 8), OM.dark); post.position.y = 0.25; g.add(post);
            var base = new T.Mesh(new T.CylinderGeometry(0.4, 0.45, 0.08, 16), OM.dark); base.position.y = 0.04; g.add(base);
            var pad = new T.Mesh(new T.BoxGeometry(1.0, 1.08, 0.36), OM.target); pad.position.y = 0.96; g.add(pad);
            return shadowAll(g);
        }
        function makeOrb() {
            var g = new T.Group();
            var core = new T.Mesh(new T.IcosahedronGeometry(0.2, 1), OM.orb); g.add(core);
            var gl = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); gl.scale.set(1.1, 1.1, 1); g.add(gl);
            g.userData.glow = gl;
            return g;
        }

        /* ---------- per-biome content ---------- */
        var B = null, biomeIdx = -1, built = []; // built: disposable objects for the current biome
        var road = null, groundL = null, groundR = null, walkL = null, walkR = null, segs = [], skyMesh = null, skyUni = null, water = [], auroraMat = null, animTex = [];

        function track(o) { built.push(o); return o; }
        function disposeBiome() {
            for (var k = 0; k < built.length; k++) {
                var o = built[k];
                if (o.parent) o.parent.remove(o);
                o.traverse && o.traverse(function (m) {
                    if (m.geometry) m.geometry.dispose();
                    if (m.material) { var mats = m.material.length ? m.material : [m.material]; mats.forEach(function (mt) { ['map', 'emissiveMap', 'alphaMap'].forEach(function (k2) { if (mt[k2] && mt[k2] !== glowTex) mt[k2].dispose(); }); mt.dispose(); }); }
                });
            }
            built = []; segs = []; water = []; animTex = []; auroraMat = null;
            if (neonL) { scene.remove(neonL); scene.remove(neonR); neonL = neonR = null; }
        }

        function setBiome(idx) {
            if (idx === biomeIdx) return;
            disposeBiome();
            biomeIdx = idx; B = BIOMES[idx];
            var night = B.night, r = rng(idx * 101 + 7);
            // light + fog
            hemi.color.set(B.hemi[0]); hemi.groundColor.set(B.hemi[1]); hemi.intensity = B.hemi[2] * Math.PI;
            sun.color.set(B.sun[2]); sun.intensity = B.sun[3] * Math.PI;
            fill.color.set(B.hemi[0]); fill.intensity = (night > 0.5 ? 0.75 : 0.45) * Math.PI;
            var az = B.sun[0] * Math.PI / 180, el = B.sun[1] * Math.PI / 180;
            sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
            scene.fog = new T.Fog(B.fog[0], B.fog[1], B.fog[2]);
            scene.background = new T.Color(B.fog[0]);
            renderer.toneMappingExposure = night > 0.6 ? 1.15 : 1.0;
            // sky dome
            skyUni = { top: { value: new T.Color(B.sky[0]) }, mid: { value: new T.Color(B.sky[1]) }, hor: { value: new T.Color(B.sky[2]) }, sunDir: { value: sunDir.clone() }, sunCol: { value: new T.Color(B.sun[2]) }, sunSize: { value: B.sun[4] } };
            skyMesh = track(new T.Mesh(new T.SphereGeometry(900, 32, 16), new T.ShaderMaterial({
                uniforms: skyUni, side: T.BackSide, depthWrite: false, fog: false,
                vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
                fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunSize; varying vec3 vD;' +
                    'void main(){ float h = vD.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(hor, mid, smoothstep(-0.02, 0.12, h));' +
                    'float d = max(dot(normalize(vD), normalize(sunDir)), 0.0); c += sunCol * (pow(d, 8.0) * 0.35 + pow(d, 64.0) * 0.6) * min(sunSize, 1.0);' +
                    'c = mix(c, sunCol * 1.6, smoothstep(0.9993 - sunSize * 0.0006, 0.9997 - sunSize * 0.0004, d) * step(0.01, sunSize));' +
                    'gl_FragColor = vec4(c, 1.0); }'
            })));
            skyMesh.renderOrder = -10; scene.add(skyMesh);
            if (B.stars) addStars(r);
            if (B.planet) addPlanet();
            if (B.aurora) addAurora();
            if (B.clouds) addClouds(r);
            addBackdrop(B.back, r);
            // road + ground
            var roadMat = new T.MeshPhongMaterial({ map: roadTexture(B.road, B.line, B.edge), shininess: B.road === 'wet' ? 90 : B.road === 'snow' ? 20 : 6, specular: new T.Color(B.road === 'wet' ? 0x666688 : B.road === 'metal' ? 0x333344 : 0x111111) });
            roadMat.map.repeat.set(1, 300 / ROAD_TILE);
            road = track(new T.Mesh(new T.PlaneGeometry(ROAD_W, 300), roadMat));
            road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -140); road.receiveShadow = shadows; scene.add(road);
            animTex.push([roadMat.map, ROAD_TILE]);
            // curbs
            var curbMat = new T.MeshLambertMaterial({ color: B.road === 'metal' ? 0x55e6ff : 0xb8b8b8, emissive: B.road === 'metal' || B.id === 'neon' ? new T.Color(B.edge) : new T.Color(0), emissiveIntensity: B.road === 'metal' || B.id === 'neon' ? 0.9 : 0 });
            for (var s = -1; s <= 1; s += 2) { var curb = track(new T.Mesh(new T.BoxGeometry(0.3, 0.16, 300), curbMat)); curb.position.set(s * (ROAD_W / 2 + 0.15), 0.08, -140); curb.receiveShadow = shadows; scene.add(curb); }
            if (B.walk) {
                var wt = groundTexture(B.walk); wt.repeat.set(1, 300 / 4); animTex.push([wt, 4]);
                var wm = new T.MeshLambertMaterial({ map: wt });
                walkL = track(new T.Mesh(new T.PlaneGeometry(4, 300), wm)); walkL.rotation.x = -Math.PI / 2; walkL.position.set(-(ROAD_W / 2 + 2.3), 0.005, -140); walkL.receiveShadow = shadows; scene.add(walkL);
                walkR = track(walkL.clone()); walkR.position.x = ROAD_W / 2 + 2.3; scene.add(walkR);
            }
            var gwL = B.id === 'harbor' ? 26 : B.id === 'coast' ? 16 : 300, gwR = B.id === 'harbor' ? 26 : 300;
            if (B.ground) {
                groundL = track(groundPlane(B.id === 'coast' ? 'sand' : B.ground, gwL, -1)); groundR = track(groundPlane(B.ground, gwR, 1));
            }
            if (B.water) addWater(B.id === 'coast' ? [-1] : [-1, 1], ROAD_W / 2 + 4.3 + gwL);
            // side props in recycling segments
            for (var k = 0; k < NSEG; k++) { var seg = buildSegment(B.props, rng(idx * 1000 + k * 17 + 3), k); seg.userData.k = k; segs.push(seg); scene.add(seg); track(seg); }
            if (B.id === 'neon' && tier !== 'low') {
                neonL = new T.PointLight(0xff3fb4, 60, 22, 2); neonR = new T.PointLight(0x2ef2ff, 60, 22, 2);
                scene.add(neonL); scene.add(neonR);
            }
            // obstacle colours
            var warn = PAL[idx][0], acc = PAL[idx][1];
            OM.warn.color.set(warn); OM.accent.color.set(acc); OM.glowW.color.set(lighten(warn)); OM.glowA.color.set(warn); OM.orb.color.set(lighten(acc));
            if (OM.hazW.map) OM.hazW.map.dispose(); OM.hazW.map = hazardTexture(warn, '#151820'); OM.hazW.needsUpdate = true;
            if (OM.hazA.map) OM.hazA.map.dispose(); OM.hazA.map = hazardTexture(acc, '#ffffff'); OM.hazA.needsUpdate = true;
            if (OM.target.map) OM.target.map.dispose(); OM.target.map = targetTexture(warn); OM.target.needsUpdate = true;
            for (var o = 0; o < pools.orb.length; o++) pools.orb[o].userData.glow.material.color.set(acc);
            A.setAccent(acc);
        }
        var PAL = [['#ff5f45', '#ffb347'], ['#ff7b54', '#3fe0d0'], ['#ffd23f', '#ff8a3d'], ['#ff3fb4', '#2ef2ff'], ['#ff5a6e', '#2f8dff'], ['#ff5f8a', '#8a7dff'], ['#ff6a3a', '#ffd84a'], ['#ff5f6d', '#3fd8ff'], ['#ffb03a', '#ff5a1f'], ['#ff6ad5', '#7affc8']];
        function lighten(c) { var a = hex(c); return 'rgb(' + clampB(a[0] + 90) + ',' + clampB(a[1] + 90) + ',' + clampB(a[2] + 90) + ')'; }
        var sunDir = new T.Vector3(0, 1, 0);

        function addStars(r) {
            var n = tier === 'low' ? 500 : 1400, p = new Float32Array(n * 3);
            for (var k = 0; k < n; k++) { var th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95), R = 800; p[k * 3] = Math.sin(ph) * Math.cos(th) * R; p[k * 3 + 1] = Math.cos(ph) * R; p[k * 3 + 2] = Math.sin(ph) * Math.sin(th) * R; }
            var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
            var st = track(new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
            scene.add(st);
        }
        function addPlanet() {
            var c = canvas(256, 128), g = c.getContext('2d'); noiseFill(g, 256, 128, '#3a4a9a', '#9ab0ff', 6, 10, 5);
            for (var y = 0; y < 128; y += 9) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y, 256, 4); }
            var pl = track(new T.Mesh(new T.SphereGeometry(70, 32, 16), new T.MeshLambertMaterial({ map: toTex(c), fog: false })));
            pl.position.set(-160, 150, -620); scene.add(pl);
            var ring = track(new T.Mesh(new T.RingGeometry(95, 140, 64), new T.MeshBasicMaterial({ color: 0xbfc8ff, transparent: true, opacity: 0.35, side: T.DoubleSide, fog: false })));
            ring.position.copy(pl.position); ring.rotation.set(1.25, 0.3, 0); scene.add(ring);
        }
        function addAurora() {
            auroraMat = new T.ShaderMaterial({
                uniforms: { t: { value: 0 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
                vertexShader: 'varying vec2 vU; uniform float t; void main(){ vU = uv; vec3 p = position; p.z += sin(p.x * 0.012 + t * 0.4) * 40.0; p.y += sin(p.x * 0.02 + t * 0.7) * 8.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
                fragmentShader: 'varying vec2 vU; uniform float t; void main(){ float band = sin(vU.x * 40.0 + t * 1.3) * 0.5 + 0.5; float a = smoothstep(0.0, 0.25, vU.y) * (1.0 - vU.y) * (0.45 + 0.55 * band);' +
                    'vec3 c = mix(vec3(0.15, 1.0, 0.6), vec3(0.6, 0.3, 1.0), vU.y); gl_FragColor = vec4(c * a * 0.9, 1.0); }'
            });
            for (var k = 0; k < 2; k++) { var m = track(new T.Mesh(new T.PlaneGeometry(1400, 160, 80, 1), auroraMat)); m.position.set(0, 190 + k * 50, -560 - k * 60); scene.add(m); }
        }
        function addClouds(r) {
            var tex = cloudTexture(3), n = tier === 'low' ? 5 : 10;
            for (var k = 0; k < n; k++) {
                var mat = new T.SpriteMaterial({ map: tex, color: new T.Color(B.sky[2]).lerp(new T.Color('#ffffff'), 0.5), transparent: true, opacity: 0.75, fog: false, depthWrite: false });
                var sp = track(new T.Sprite(mat)); var s = 160 + r() * 200; sp.scale.set(s, s * 0.45, 1);
                sp.position.set((r() - 0.5) * 1200, 120 + r() * 160, -500 - r() * 250); scene.add(sp);
            }
        }
        function bandMesh(tex, radius, height, y, arc) {
            var g = new T.CylinderGeometry(radius, radius, height, 48, 1, true, Math.PI - arc / 2, arc);
            var m = track(new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.BackSide, fog: false, depthWrite: false })));
            m.position.set(0, y + height / 2, 0); m.renderOrder = -5; scene.add(m); return m;
        }
        function haze(c, k) { return new T.Color(c).lerp(new T.Color(B.fog[0]), k).getStyle(); }
        function addBackdrop(kind, r) {
            var W2 = 2048, H2 = 256, far = haze(B.sky[1], 0.45), near = haze('#000000', 0.55);
            function ridge(g, w, h, col, base, amp, rough, seed, snow) {
                g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
                for (var x = 0; x <= w; x += 4) { var n = fbm(x / w * rough + seed, seed, 5, 256); g.lineTo(x, h - base - n * amp); }
                g.lineTo(w, h); g.closePath(); g.fill();
                if (snow) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,0.85)'; for (var x2 = 0; x2 <= w; x2 += 4) { var n2 = fbm(x2 / w * rough + seed, seed, 5, 256); g.fillRect(x2, h - base - n2 * amp, 4, Math.max(0, (n2 - 0.45)) * amp * 0.9); } g.globalCompositeOperation = 'source-over'; }
            }
            function towers(g, w, h, col, maxH, lights, seed) {
                var rr = rng(seed), x = 0;
                while (x < w) {
                    var bw = 14 + rr() * 40, bh = 20 + rr() * maxH; g.fillStyle = col; g.fillRect(x, h - bh, bw, bh);
                    if (lights) { g.fillStyle = lights; for (var k2 = 0; k2 < bw * bh / 90; k2++) if (rr() < 0.5) g.fillRect(x + 2 + rr() * (bw - 5), h - bh + 3 + rr() * (bh - 6), 2, 2); }
                    x += bw + rr() * 4;
                }
            }
            var tex = backdropTexture(function (g, w, h) {
                if (kind === 'skyline') { ridge(g, w, h, far, 40, 50, 4, 1); towers(g, w, h, haze('#4a3d66', 0.35), 130, 'rgba(255,214,150,0.8)', 3); }
                else if (kind === 'harbor') { towers(g, w, h, '#0c1c28', 70, 'rgba(255,220,160,0.9)', 5); g.fillStyle = '#0c1c28'; for (var c2 = 0; c2 < 9; c2++) { var cx = 120 + c2 * 220; g.fillRect(cx, h - 150, 6, 150); g.fillRect(cx - 40, h - 150, 120, 6); g.fillRect(cx + 70, h - 150, 3, 60); } }
                else if (kind === 'mesas') { ridge(g, w, h, haze('#b8734a', 0.4), 20, 140, 3, 2); g.fillStyle = haze('#9a5534', 0.25); for (var m2 = 0; m2 < 7; m2++) { var mx = 100 + m2 * 290 + r() * 80, mw = 120 + r() * 160, mh = 90 + r() * 90; g.fillRect(mx, h - mh, mw, mh); } }
                else if (kind === 'neon') { towers(g, w, h, '#12061f', 200, null, 7); var rr2 = rng(8); for (var k3 = 0; k3 < 260; k3++) { g.fillStyle = rr2() < 0.5 ? 'rgba(255,63,180,0.9)' : 'rgba(46,242,255,0.9)'; g.fillRect(rr2() * w, h - rr2() * 200, 2 + rr2() * 10, 2); } }
                else if (kind === 'peaks' || kind === 'peaksNight') { ridge(g, w, h, kind === 'peaks' ? haze('#7d9cc0', 0.35) : '#1a3248', 30, 200, 5, 4, true); ridge(g, w, h, kind === 'peaks' ? '#5f7f9f' : '#0f2232', 10, 90, 7, 9, kind === 'peaks'); }
                else if (kind === 'space') { g.fillStyle = 'rgba(80,90,160,0.25)'; for (var k4 = 0; k4 < 12; k4++) { var sx2 = r() * w; g.fillRect(sx2, h - 60 - r() * 100, 8 + r() * 30, 200); } }
                else if (kind === 'treeline') { ridge(g, w, h, haze('#5f7f5a', 0.45), 50, 90, 4, 3); var rr3 = rng(11); g.fillStyle = haze('#2e4a2a', 0.2); for (var x3 = 0; x3 < w; x3 += 6) { var th2 = 50 + rr3() * 60; g.beginPath(); g.moveTo(x3 - 8, h); g.lineTo(x3, h - th2); g.lineTo(x3 + 8, h); g.fill(); } }
                else if (kind === 'sea') { ridge(g, w, h, haze('#5a4a6a', 0.4), 18, 60, 3, 6); }
                else if (kind === 'volcano') { ridge(g, w, h, '#1a0806', 20, 70, 4, 2); g.fillStyle = '#120403'; g.beginPath(); g.moveTo(w * 0.45, h); g.lineTo(w * 0.55, h - 210); g.lineTo(w * 0.6, h - 205); g.lineTo(w * 0.72, h); g.fill(); var gr = g.createRadialGradient(w * 0.575, h - 210, 2, w * 0.575, h - 210, 90); gr.addColorStop(0, 'rgba(255,140,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,10,0)'); g.fillStyle = gr; g.fillRect(w * 0.5, h - 300, w * 0.15, 200); }
            }, W2, H2);
            bandMesh(tex, 700, 180, -4, Math.PI * 1.3);
        }
        function groundPlane(kind, gw, sd) {
            var gt = groundTexture(kind); gt.repeat.set(gw / 10, 300 / 10); animTex.push([gt, 10]);
            var m = new T.Mesh(new T.PlaneGeometry(gw, 300), new T.MeshLambertMaterial({ map: gt }));
            m.rotation.x = -Math.PI / 2; m.position.set(sd * (ROAD_W / 2 + 4.3 + gw / 2), -0.01, -140); m.receiveShadow = shadows; scene.add(m);
            return m;
        }
        function addWater(sides, startX) {
            var c = canvas(256, 256), g = c.getContext('2d'); noiseFill(g, 256, 256, B.water, shade(B.water, 40), 8, 8, 4);
            g.strokeStyle = 'rgba(255,255,255,0.18)'; var rr = rng(5); for (var k = 0; k < 120; k++) { var x = rr() * 256, y = rr() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 + rr() * 14, y); g.stroke(); }
            var t = toTex(c, 40, 30); animTex.push([t, 20]);
            var m = new T.MeshPhongMaterial({ map: t, shininess: 120, specular: new T.Color(0x888888), transparent: false });
            sides.forEach(function (s) { var wm = track(new T.Mesh(new T.PlaneGeometry(400, 600), m)); wm.rotation.x = -Math.PI / 2; wm.position.set(s * (startX + 200), -0.4, -250); scene.add(wm); water.push(wm); });
        }

        /* ---------- props ---------- */
        var GEO = { box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(0.5, 0.5, 1, 10), cone: new T.ConeGeometry(0.5, 1, 9), ico: new T.IcosahedronGeometry(0.5, 1), sph: new T.SphereGeometry(0.5, 10, 8), cyl6: new T.CylinderGeometry(0.5, 0.6, 1, 7) };
        function jitter(g, amt, seed) { var gg = g.clone(), p = gg.attributes.position, r = rng(seed); for (var k = 0; k < p.count; k++) { p.setXYZ(k, p.getX(k) * (1 + (r() - 0.5) * amt), p.getY(k) * (1 + (r() - 0.5) * amt), p.getZ(k) * (1 + (r() - 0.5) * amt)); } gg.computeVertexNormals(); return gg; }
        var ROCK = [jitter(GEO.ico, 0.45, 3), jitter(GEO.ico, 0.5, 7), jitter(GEO.ico, 0.4, 11)];

        function buildSegment(kind, r, segIndex) {
            var seg = new T.Group(), bk = {}, extra = [];
            function b(name) { return bk[name] || (bk[name] = new Bucket()); }
            function side() { return r() < 0.5 ? -1 : 1; }
            var L = SEG_LEN, z, s, x, k, h;
            function lamp(zz, sd, col) {
                var xx = sd * (ROAD_W / 2 + 0.9);
                b('dark').add(GEO.cyl, xx, 2.4, zz, 0, 0, 0, 0.14, 4.8, 0.14, '#2c303a');
                b('dark').add(GEO.box, xx - sd * 0.6, 4.75, zz, 0, 0, 0, 1.3, 0.12, 0.25, '#2c303a');
                b('glow').add(GEO.box, xx - sd * 1.1, 4.66, zz, 0, 0, 0, 0.45, 0.08, 0.22, col);
                extra.push([xx - sd * 1.1, 4.5, zz, col, 3.2]);
            }
            function tree(xx, zz, hh, col, wide) {
                b('bark').add(GEO.cyl, xx, hh * 0.3, zz, 0, r() * 3, 0, 0.35, hh * 0.6, 0.35, '#5a4030');
                for (var c = 0; c < 3; c++) b('leaf').add(ROCK[c], xx + (r() - 0.5) * 1.2, hh * (0.62 + c * 0.13), zz + (r() - 0.5) * 1.2, r(), r(), r(), hh * 0.5 * wide * (1 - c * 0.18), hh * 0.42, hh * 0.5 * wide * (1 - c * 0.18), shadeC(col, (r() - 0.5) * 0.25));
            }
            function pine(xx, zz, hh, col, snow) {
                b('bark').add(GEO.cyl, xx, hh * 0.12, zz, 0, 0, 0, 0.3, hh * 0.25, 0.3, '#4a3428');
                for (var c = 0; c < 4; c++) {
                    var w = hh * (0.42 - c * 0.08), y = hh * (0.25 + c * 0.18);
                    b('leaf').add(GEO.cone, xx, y + hh * 0.12, zz, 0, r() * 3, 0, w, hh * 0.32, w, shadeC(col, (r() - 0.5) * 0.15));
                    if (snow) b('snowy').add(GEO.cone, xx, y + hh * 0.2, zz, 0, r() * 3, 0, w * 0.7, hh * 0.16, w * 0.7, '#ffffff');
                }
            }
            function rock(xx, zz, sz, col) { b('rock').add(ROCK[(r() * 3) | 0], xx, sz * 0.3, zz, r() * 3, r() * 3, r() * 3, sz * (1 + r()), sz * (0.6 + r() * 0.5), sz * (1 + r()), shadeC(col, (r() - 0.5) * 0.3)); }
            function building(xx, zz, w, d, hh, col, lit) {
                var fv = (r() * 4) | 0;
                b('facade' + fv).add(GEO.box, xx, hh / 2, zz, 0, 0, 0, w, hh, d, col, [Math.round(d / 6), Math.round(hh / 20), 0, 0]);
                b('dark').add(GEO.box, xx, hh + 0.3, zz, 0, 0, 0, w * 0.9, 0.6, d * 0.9, '#3a3d48');
                if (r() < 0.5) b('dark').add(GEO.box, xx + (r() - 0.5) * w * 0.4, hh + 1.2, zz + (r() - 0.5) * d * 0.4, 0, 0, 0, 1.5, 1.6, 1.5, '#4a4d58');
            }
            switch (kind) {
                case 'city':
                    for (s = -1; s <= 1; s += 2) {
                        z = 0;
                        while (z > -L) { var bw = 10 + r() * 10, bh = 14 + r() * 34; building(s * (ROAD_W / 2 + 4.6 + 8 + r() * 4), z - bw / 2, 14, bw, bh, pick(r, ['#8f8a96', '#a59c92', '#6f7486', '#b4a89a', '#7c6f6a']), 0); z -= bw + 1.5 + r() * 3; }
                        for (z = -5; z > -L; z -= 10) { tree(s * (ROAD_W / 2 + 3.2), z, 4 + r() * 1.5, '#4f7a34', 1); b('dark').add(GEO.box, s * (ROAD_W / 2 + 3.2), 0.25, z, 0, 0, 0, 1.2, 0.5, 1.2, '#7a7a7e'); }
                        lamp(-L / 2 - s * 5, s, '#ffe2b0');
                    }
                    break;
                case 'harbor':
                    for (s = -1; s <= 1; s += 2) {
                        for (z = -3; z > -L; z -= 7 + r() * 4) {
                            var stacks = 1 + ((r() * 3) | 0), cx = s * (ROAD_W / 2 + 6 + r() * 6);
                            for (k = 0; k < stacks; k++) { var cc = pick(r, ['#b5452f', '#2d6a8e', '#d79b2e', '#3f8f6b', '#8a8f99']); b('cont').add(GEO.box, cx, 1.3 + k * 2.6, z, 0, (r() - 0.5) * 0.05, 0, 2.5, 2.55, 6.1, cc, [3, 1, 0, 0]); }
                        }
                        lamp(-10 - (s + 1) * 8, s, '#ffd9a0');
                        if (r() < 0.6) { var crx = s * (ROAD_W / 2 + 16); b('crane').add(GEO.box, crx, 14, -L / 2, 0, 0, 0, 1, 28, 1, '#d79b2e'); b('crane').add(GEO.box, crx - s * 9, 27, -L / 2, 0, 0, 0, 26, 1.2, 1.2, '#d79b2e'); b('crane').add(GEO.box, crx - s * 18, 22, -L / 2, 0, 0, 0, 0.2, 10, 0.2, '#555'); }
                        for (z = -2; z > -L; z -= 4) b('dark').add(GEO.cyl, s * (ROAD_W / 2 + 1.2), 0.4, z, 0, 0, 0, 0.3, 0.8, 0.3, '#2a2d33');
                    }
                    break;
                case 'canyon':
                    for (s = -1; s <= 1; s += 2) {
                        for (k = 0; k < 3; k++) { h = 10 + r() * 26; var mw = 8 + r() * 14; b('mesa').add(GEO.cyl6, s * (ROAD_W / 2 + 22 + r() * 34), h / 2, -r() * L, 0, r() * 3, 0, mw, h, mw * (0.7 + r() * 0.6), shadeC('#b8673f', (r() - 0.5) * 0.2), [mw / 8, h / 12, r(), 0]); }
                        for (k = 0; k < 4; k++) rock(s * (ROAD_W / 2 + 4 + r() * 8), -r() * L, 0.6 + r() * 1.4, '#9a5a3a');
                        for (k = 0; k < 3; k++) { x = s * (ROAD_W / 2 + 5 + r() * 10); z = -r() * L; h = 1.8 + r() * 2.2; b('cactus').add(GEO.cyl, x, h / 2, z, 0, 0, 0, 0.42, h, 0.42, '#3f7a3a'); b('cactus').add(GEO.cyl, x + 0.45, h * 0.6, z, 0, 0, 0.0, 0.3, h * 0.45, 0.3, '#3f7a3a'); b('cactus').add(GEO.cyl, x + 0.3, h * 0.42, z, 0, 0, 1.57, 0.25, 0.5, 0.25, '#3f7a3a'); }
                    }
                    break;
                case 'neon':
                    for (s = -1; s <= 1; s += 2) {
                        z = 0;
                        while (z > -L) { var tw = 8 + r() * 8, th = 25 + r() * 60; b('tower' + ((r() * 2) | 0)).add(GEO.box, s * (ROAD_W / 2 + 5.5 + 6 + r() * 3), th / 2, z - tw / 2, 0, 0, 0, 12, th, tw, '#2a2638', [tw / 6, th / 10, r(), r()]); if (r() < 0.6) b('neonA').add(GEO.box, s * (ROAD_W / 2 + 5.4), 4 + r() * 10, z - tw / 2, 0, 0, 0, 0.15, 0.2 + r() * 0.9, tw * 0.5, r() < 0.5 ? '#ff3fb4' : '#2ef2ff'); z -= tw + 1; }
                        for (z = -6; z > -L; z -= 13) { b('neonA').add(GEO.box, s * (ROAD_W / 2 + 1.6), 3.3, z, 0, 0, 0, 0.1, 0.14, 1.6, r() < 0.5 ? '#ff3fb4' : '#2ef2ff'); b('dark').add(GEO.box, s * (ROAD_W / 2 + 1.6), 1.6, z, 0, 0, 0, 0.12, 3.2, 0.12, '#222'); }
                    }
                    break;
                case 'glacier':
                    for (s = -1; s <= 1; s += 2) {
                        for (k = 0; k < 7; k++) pine(s * (ROAD_W / 2 + 4 + r() * 22), -r() * L, 5 + r() * 6, '#2c5e4f', true);
                        for (k = 0; k < 3; k++) { x = s * (ROAD_W / 2 + 6 + r() * 14); z = -r() * L; for (var q = 0; q < 3; q++) b('ice').add(GEO.cone, x + (r() - 0.5) * 2, 1.2, z + (r() - 0.5) * 2, (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4, 0.8 + r() * 0.8, 2.4 + r() * 2.5, 0.8 + r() * 0.8, '#bfe6ff'); }
                        for (k = 0; k < 3; k++) rock(s * (ROAD_W / 2 + 3 + r() * 10), -r() * L, 0.5 + r(), '#8a9aaa');
                    }
                    break;
                case 'space':
                    for (s = -1; s <= 1; s += 2) {
                        for (z = -4; z > -L; z -= 10) {
                            x = s * (ROAD_W / 2 + 2.6);
                            b('hull').add(GEO.box, x, 3, z, 0, 0, 0, 0.6, 6, 0.6, '#3a4466');
                            b('hull').add(GEO.box, x - s * 2.2, 6.1, z, 0, 0, 0, 5, 0.3, 0.6, '#3a4466');
                            b('neonA').add(GEO.box, x - s * 0.32, 3, z, 0, 0, 0, 0.06, 5, 0.12, '#55e6ff');
                        }
                        for (k = 0; k < 2; k++) { x = s * (ROAD_W / 2 + 16 + r() * 20); z = -r() * L; h = 14 + r() * 30; b('hull').add(GEO.cyl, x, h / 2 - 20, z, 0, 0, 0, 3, h, 3, '#2b3355'); b('panel').add(GEO.box, x + s * 7, h - 20, z, 0, 0, 0.3 * s, 10, 0.2, 4, '#1a2a6a'); b('neonA').add(GEO.sph, x, h - 19.5, z, 0, 0, 0, 0.8, 0.8, 0.8, '#ff5f8a'); }
                        b('hull').add(GEO.box, s * (ROAD_W / 2 + 1.5), -0.6, -L / 2, 0, 0, 0, 3, 1.2, L, '#20263d');
                    }
                    break;
                case 'forest':
                    for (s = -1; s <= 1; s += 2) {
                        for (k = 0; k < 9; k++) { x = s * (ROAD_W / 2 + 4 + r() * 26); if (r() < 0.5) tree(x, -r() * L, 8 + r() * 8, '#3d6b2a', 0.9); else pine(x, -r() * L, 9 + r() * 9, '#24452a', false); }
                        for (k = 0; k < 8; k++) b('leaf').add(ROCK[(r() * 3) | 0], s * (ROAD_W / 2 + 2.5 + r() * 6), 0.35, -r() * L, 0, r() * 3, 0, 1.2 + r() * 1.4, 0.8, 1.2 + r() * 1.4, shadeC('#3f6a28', (r() - 0.5) * 0.3));
                        for (k = 0; k < 2; k++) rock(s * (ROAD_W / 2 + 3 + r() * 8), -r() * L, 0.5 + r() * 0.8, '#6a6a60');
                        if (r() < 0.6) { z = -r() * L; b('bark').add(GEO.cyl, s * (ROAD_W / 2 + 4), 0.3, z, 1.57, r(), 0, 0.5, 5, 0.5, '#5a4030'); }
                    }
                    break;
                case 'coast':
                    for (k = 0; k < 4; k++) { x = -(ROAD_W / 2 + 3 + r() * 12); z = -r() * L; palm(x, z, 7 + r() * 4); }
                    for (k = 0; k < 5; k++) rock(ROAD_W / 2 + 6 + r() * 20, -r() * L, 1 + r() * 2.5, '#6a6a5a');
                    for (k = 0; k < 3; k++) { x = ROAD_W / 2 + 5 + r() * 12; palm(x, -r() * L, 6 + r() * 4); }
                    for (z = -2; z > -L; z -= 4) { b('dark').add(GEO.box, -(ROAD_W / 2 + 0.6), 0.45, z, 0, 0, 0, 0.12, 0.9, 0.12, '#9aa0a8'); }
                    b('metal').add(GEO.box, -(ROAD_W / 2 + 0.6), 0.75, -L / 2, 0, 0, 0, 0.08, 0.3, L, '#c8ccd2');
                    b('hill').add(ROCK[1], ROAD_W / 2 + 60, -6, -L / 2, 0, r() * 3, 0, 60, 30, 50, '#5e7a3e');
                    break;
                case 'volcano':
                    for (s = -1; s <= 1; s += 2) {
                        for (k = 0; k < 6; k++) rock(s * (ROAD_W / 2 + 3 + r() * 20), -r() * L, 0.8 + r() * 2.8, '#2a2220');
                        for (k = 0; k < 2; k++) { x = s * (ROAD_W / 2 + 6 + r() * 16); b('lava').add(GEO.box, x, 0.02, -r() * L, 0, r() * 3, 0, 1.2 + r() * 2, 0.05, 6 + r() * 10, '#ff6a1a'); }
                        for (k = 0; k < 2; k++) { h = 6 + r() * 10; b('rock').add(GEO.cone, s * (ROAD_W / 2 + 14 + r() * 20), h / 2, -r() * L, 0, r() * 3, 0, 5 + r() * 5, h, 5 + r() * 5, '#1e1817'); }
                    }
                    break;
                case 'tundra':
                    for (s = -1; s <= 1; s += 2) {
                        for (k = 0; k < 4; k++) pine(s * (ROAD_W / 2 + 5 + r() * 25), -r() * L, 4 + r() * 6, '#1f3d36', true);
                        for (k = 0; k < 4; k++) rock(s * (ROAD_W / 2 + 3 + r() * 14), -r() * L, 0.5 + r() * 1.5, '#5a6a7a');
                        for (z = -8; z > -L; z -= 16) { b('dark').add(GEO.cyl, s * (ROAD_W / 2 + 0.8), 0.6, z, 0, 0, 0, 0.12, 1.2, 0.12, '#2a2f3a'); b('neonA').add(GEO.box, s * (ROAD_W / 2 + 0.8), 1.25, z, 0, 0, 0, 0.18, 0.12, 0.18, '#7affc8'); extra.push([s * (ROAD_W / 2 + 0.8), 1.25, z, '#7affc8', 1.6]); }
                    }
                    break;
            }
            function palm(xx, zz, hh) {
                var lean = (r() - 0.5) * 0.3, segN = 6, px = xx, py = 0;
                for (var q = 0; q < segN; q++) { b('bark').add(GEO.cyl, px, py + hh / segN / 2, zz, 0, 0, lean * q / segN, 0.32 - q * 0.02, hh / segN + 0.05, 0.32 - q * 0.02, '#8a6a48'); px -= Math.sin(lean * q / segN) * hh / segN; py += hh / segN; }
                for (var f = 0; f < 7; f++) { var a = f / 7 * Math.PI * 2; b('frond').add(PLANE_FROND, px + Math.cos(a) * 1.4, py - 0.3, zz + Math.sin(a) * 1.4, 0.0, -a + Math.PI / 2, 0.7, 1.1, 3.4, 1, shadeC('#3f7a2a', (r() - 0.5) * 0.3)); }
            }
            for (var name in bk) {
                var geo = bk[name].build(); if (!geo) continue;
                var mesh = new T.Mesh(geo, MAT(name));
                mesh.castShadow = false; mesh.receiveShadow = shadows && (name === 'rock' || name === 'dark');
                seg.add(mesh);
            }
            for (k = 0; k < extra.length; k++) {
                var e = extra[k], sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: e[3], transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.5 + B.night * 0.5 }));
                sp.position.set(e[0], e[1], e[2]); sp.scale.set(e[4], e[4], 1); seg.add(sp);
            }
            return seg;
        }
        var PLANE_FROND = (function () { var g = new T.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); g.rotateX(-Math.PI / 2); return g; })();
        function pick(r, a) { return a[(r() * a.length) | 0]; }
        function shadeC(c, k) { var col = new T.Color(c); col.offsetHSL(0, 0, k); return '#' + col.getHexString(); }

        // materials for buckets, created once per biome
        var matCache = {};
        function MAT(name) {
            if (matCache[name]) return matCache[name];
            var m, n = B.night;
            if (name.indexOf('facade') === 0) {
                var fc = facadeTexture('#b0aaa4', n > 0.5 ? '#ffd28a' : '#ffe6b8', n > 0.5 ? '#1a2030' : '#6f8296', parseInt(name.slice(6), 10) * 7 + 3, 'mid', n > 0.5 ? 0.4 : 0.14);
                m = new T.MeshLambertMaterial({ map: toTex(fc), vertexColors: true, emissive: new T.Color(0xffd9a0), emissiveMap: toTex(emissiveFrom(fc, 190)), emissiveIntensity: 0.15 + n * 0.9 });
            } else if (name.indexOf('tower') === 0) {
                var tc = facadeTexture('#1a1626', name === 'tower0' ? '#ff4fc0' : '#3ff2ff', '#0a0a14', name === 'tower0' ? 21 : 37, 'tower', 0.16);
                m = new T.MeshLambertMaterial({ map: toTex(tc), vertexColors: true, emissive: new T.Color(0xffffff), emissiveMap: toTex(emissiveFrom(tc, 70)), emissiveIntensity: 0.8 });
            } else if (name === 'glow' || name === 'neonA' || name === 'lava') {
                m = new T.MeshBasicMaterial({ vertexColors: true, fog: name !== 'lava' });
            } else if (name === 'cont') {
                m = new T.MeshLambertMaterial({ map: ridgedTexture('#ffffff'), vertexColors: true });
            } else if (name === 'mesa') {
                m = new T.MeshLambertMaterial({ map: stripeTexture('#c07a52', '#e0a476', 5), vertexColors: true });
            } else if (name === 'frond') {
                m = new T.MeshLambertMaterial({ map: leafTexture('#ffffff'), vertexColors: true, transparent: true, alphaTest: 0.3, side: T.DoubleSide });
            } else if (name === 'ice') {
                m = new T.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.85, shininess: 90, specular: new T.Color(0xffffff), emissive: new T.Color(0x203850) });
            } else if (name === 'snowy') {
                m = new T.MeshLambertMaterial({ vertexColors: true, emissive: new T.Color(0x202830) });
            } else if (name === 'panel') {
                m = new T.MeshPhongMaterial({ vertexColors: true, shininess: 100, specular: new T.Color(0x8899ff) });
            } else if (name === 'metal') {
                m = new T.MeshPhongMaterial({ vertexColors: true, shininess: 60 });
            } else {
                m = new T.MeshLambertMaterial({ vertexColors: true, flatShading: name === 'rock' || name === 'leaf' || name === 'hill' });
            }
            matCache[name] = m;
            return m;
        }
        var _dispose = disposeBiome;
        disposeBiome = function () { _dispose(); for (var k in matCache) { var mt = matCache[k]; if (mt.map) mt.map.dispose(); if (mt.emissiveMap) mt.emissiveMap.dispose(); mt.dispose(); } matCache = {}; };

        /* ---------- athlete ---------- */
        function buildAthlete() {
            var mats = { skin: new T.MeshLambertMaterial({ color: 0xc68863 }), top: new T.MeshLambertMaterial({ color: 0x1f2738 }), shorts: new T.MeshLambertMaterial({ color: 0x141821 }),
                shoe: new T.MeshLambertMaterial({ color: 0xf2f4f8 }), tights: new T.MeshLambertMaterial({ color: 0x232a3a }), sole: new T.MeshLambertMaterial({ color: 0x2ef2d2 }), hair: new T.MeshLambertMaterial({ color: 0x2a1d17 }), band: new T.MeshLambertMaterial({ color: 0x2ef2d2, emissive: new T.Color(0x2ef2d2), emissiveIntensity: 0.3 }) };
            function cap(rad, len, mat) { var m = new T.Mesh(new T.CapsuleGeometry(rad, len, 4, 10), mat); m.castShadow = shadows; return m; }
            var root = new T.Group(), pelvis = new T.Group(); root.add(pelvis);
            var hips = cap(0.14, 0.12, mats.shorts); hips.rotation.z = Math.PI / 2; hips.scale.set(1, 1.15, 0.85); pelvis.add(hips);
            var spine = new T.Group(); spine.position.y = 0.06; pelvis.add(spine);
            var torso = cap(0.17, 0.3, mats.top); torso.position.y = 0.27; torso.scale.set(1.2, 1, 0.75); spine.add(torso);
            var stripe = new T.Mesh(new T.BoxGeometry(0.04, 0.38, 0.02), mats.band); stripe.position.set(0, 0.3, 0.13); spine.add(stripe);
            var neck = cap(0.05, 0.06, mats.skin); neck.position.y = 0.55; spine.add(neck);
            var head = new T.Group(); head.position.y = 0.69; head.scale.setScalar(1.12); spine.add(head);
            var skull = new T.Mesh(new T.SphereGeometry(0.115, 16, 12), mats.skin); skull.scale.set(0.95, 1.08, 1); skull.castShadow = shadows; head.add(skull);
            var hair = new T.Mesh(new T.SphereGeometry(0.122, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mats.hair); hair.rotation.x = 0.35; hair.scale.set(0.98, 1.08, 1.02); head.add(hair);
            var band = new T.Mesh(new T.TorusGeometry(0.118, 0.016, 6, 24), mats.band); band.rotation.x = Math.PI / 2 - 0.15; band.position.y = 0.035; head.add(band);
            var tail = new T.Group(); tail.position.set(0, 0.06, 0.1); head.add(tail);
            var tailM = cap(0.045, 0.2, mats.hair); tailM.position.y = -0.13; tail.add(tailM);
            function arm(sd) {
                var sh = new T.Group(); sh.position.set(sd * 0.22, 0.44, 0); spine.add(sh);
                var up = cap(0.058, 0.2, mats.skin); up.position.y = -0.14; sh.add(up);
                var el = new T.Group(); el.position.y = -0.28; sh.add(el);
                var fo = cap(0.043, 0.2, mats.skin); fo.position.y = -0.12; el.add(fo);
                var hand = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), mats.skin); hand.position.y = -0.27; el.add(hand);
                return { sh: sh, el: el };
            }
            function leg(sd) {
                var hp = new T.Group(); hp.position.set(sd * 0.1, -0.02, 0); pelvis.add(hp);
                var th = cap(0.088, 0.28, mats.tights); th.position.y = -0.22; hp.add(th);
                var sh = cap(0.095, 0.1, mats.shorts); sh.position.y = -0.1; sh.scale.set(1.05, 1, 1.05); hp.add(sh);
                var kn = new T.Group(); kn.position.y = -0.45; hp.add(kn);
                var sn = cap(0.07, 0.3, mats.tights); sn.position.y = -0.21; kn.add(sn);
                var an = new T.Group(); an.position.y = -0.44; kn.add(an);
                var shoe = new T.Mesh(new T.BoxGeometry(0.11, 0.08, 0.27), mats.shoe); shoe.position.set(0, -0.02, -0.06); shoe.castShadow = shadows; an.add(shoe);
                var sole = new T.Mesh(new T.BoxGeometry(0.115, 0.025, 0.28), mats.sole); sole.position.set(0, -0.065, -0.06); an.add(sole);
                return { hp: hp, kn: kn, an: an };
            }
            var aL = arm(-1), aR = arm(1), lL = leg(-1), lR = leg(1);
            root.rotation.y = 0; // faces -z (away from camera)
            return {
                root: root, pelvis: pelvis, spine: spine, head: head, tail: tail, aL: aL, aR: aR, lL: lL, lR: lR, mats: mats,
                setAccent: function (c) { mats.band.color.set(c); mats.band.emissive.set(c); mats.sole.color.set(c); },
                setSex: function (female) { tail.visible = female; }
            };
        }

        /* ---------- per frame ---------- */
        var V = new T.Vector3(), camLook = new T.Vector3(), clockT = 0;
        function pose(S) {
            var R = S.R, p = R.phase, amp = S.amp, act = R.act, k = R.adur ? Math.min(1, Math.max(0, R.at / R.adur)) : 0;
            var tuck = act === 'jump' || act === 'hjump' ? Math.sin(Math.PI * k) * (act === 'hjump' ? 1 : 0.65) : 0;
            var sq = act === 'squat' ? (k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1) : 0;
            if (R.landed > 0) sq = Math.max(sq, R.landed * 1.4);
            var kick = act === 'kick' ? Math.sin(Math.PI * k) : 0, st = R.stumble > 0 ? 1 : 0;
            var sL = Math.sin(p), sR = Math.sin(p + Math.PI);
            var hipL = 0.55 * amp * sL, hipR = 0.55 * amp * sR;
            var knL = -(0.25 + 1.25 * Math.max(0, Math.cos(p))) * amp, knR = -(0.25 + 1.25 * Math.max(0, Math.cos(p + Math.PI))) * amp;
            var shL = -0.6 * amp * sL, shR = -0.6 * amp * sR, elb = 1.35, abd = 0.08, lean = -0.14 * amp;
            if (tuck) { hipL = hipR = 1.15 * tuck; knL = knR = -2.0 * tuck; shL = shR = 2.6 * tuck; elb = 0.4; lean = -0.15; }
            if (sq) { hipL = hipL * (1 - sq) + 1.4 * sq; hipR = hipR * (1 - sq) + 1.4 * sq; knL = knL * (1 - sq) - 2.1 * sq; knR = knR * (1 - sq) - 2.1 * sq; shL = shR = 1.45 * sq + shL * (1 - sq); elb = 0.25 + 1.1 * (1 - sq); lean = -0.75 * sq; }
            if (kick) {
                var kl = R.kickLeg > 0; // right leg kicks when kickLeg > 0
                if (kl) { hipR = 1.65 * kick; knR = -0.25 - 0.6 * (1 - kick); hipL = -0.05; knL = -0.15; } else { hipL = 1.65 * kick; knL = -0.25 - 0.6 * (1 - kick); hipR = -0.05; knR = -0.15; }
                shL = shR = 0.9; elb = 2.1; lean = 0.25 * kick;
            }
            if (st) { lean = -0.45; abd = 1.0; }
            A.lL.hp.rotation.x = hipL; A.lL.kn.rotation.x = knL; A.lL.an.rotation.x = -knL * 0.3 - hipL * 0.2;
            A.lR.hp.rotation.x = hipR; A.lR.kn.rotation.x = knR; A.lR.an.rotation.x = -knR * 0.3 - hipR * 0.2;
            A.lL.hp.rotation.z = sq * 0.12; A.lR.hp.rotation.z = -sq * 0.12;
            A.aL.sh.rotation.x = shL; A.aR.sh.rotation.x = shR; A.aL.el.rotation.x = elb; A.aR.el.rotation.x = elb;
            A.aL.sh.rotation.z = -abd; A.aR.sh.rotation.z = abd;
            A.spine.rotation.x = lean; A.spine.rotation.y = Math.sin(p) * 0.12 * amp;
            A.tail.rotation.x = 0.5 + Math.cos(p * 2) * 0.15 * amp + tuck * 0.6; A.tail.rotation.z = Math.sin(p) * 0.3 * amp;
            // pelvis height: the lower foot touches the ground
            var ext = Math.max(legExt(hipL, knL), legExt(hipR, knR));
            A.pelvis.position.y = ext + 0.075 + (tuck ? 0 : Math.abs(Math.cos(p)) * 0.03 * amp);
            A.root.position.set(R.x, R.y, 0);
            A.root.rotation.z = Math.max(-0.2, Math.min(0.2, -R.lean * 0.1));
        }
        function legExt(h, kn) { return 0.45 * Math.cos(h) + 0.44 * Math.cos(h + kn) + 0.04; }

        function place(S) {
            var i2, o, used = USED, OBS = S.OBS, ORBS = S.ORBS;
            used.block = used.hurdle = used.tall = used.bar = used.pad = used.orb = 0;
            for (i2 = 0; i2 < OBS.length; i2++) {
                o = OBS[i2]; if (!o.on || o.z > 140) continue;
                if (o.type === 'block') { for (var l = -1; l <= 1; l++) if (l !== o.open) put('block', l * 2, 0, o.z, 0, 1); }
                else if (o.type === 'pad') {
                    for (var m = -1; m <= 1; m++) {
                        if (o.broken) { if (o.broken < 0.6) put('pad', m * 2 + m * o.broken * 4, o.broken * 3 - o.broken * o.broken * 5, o.z + o.broken * 6, o.broken * 8, Math.max(0.01, 1 - o.broken * 1.5)); }
                        else put('pad', m * 2, 0, o.z, 0, 1);
                    }
                } else put(o.type, 0, 0, o.z, 0, 1);
            }
            for (i2 = 0; i2 < ORBS.length; i2++) { o = ORBS[i2]; if (!o.on || o.z > 140) continue; var ob = put('orb', o.lane * 2, o.y + Math.sin(clockT * 5 + o.z) * 0.08, o.z, clockT * 2, 1); }
            hideRest('block'); hideRest('hurdle'); hideRest('tall'); hideRest('bar'); hideRest('pad'); hideRest('orb');
        }
        var USED = { block: 0, hurdle: 0, tall: 0, bar: 0, pad: 0, orb: 0 };
        function put(type, x, y, z, rot, scl) {
            var pl = pools[type], n = USED[type]; if (n >= pl.length) return null;
            var g = pl[n]; USED[type] = n + 1;
            g.visible = true; g.position.set(x, y, -z); g.rotation.set(type === 'pad' ? rot * 0.3 : 0, type === 'orb' ? rot : 0, type === 'pad' ? rot * 0.2 : 0); g.scale.setScalar(scl);
            return g;
        }
        function hideRest(type) { var pl = pools[type]; for (var n = USED[type]; n < pl.length; n++) if (pl[n].visible) pl[n].visible = false; }

        function render(S) {
            clockT += 1 / 60;
            var d = S.dist, k, span = SEG_LEN * NSEG;
            // scroll ground textures and segments
            for (k = 0; k < animTex.length; k++) animTex[k][0].offset.y = (d / animTex[k][1]) % 1;
            var base = d % span;
            for (k = 0; k < segs.length; k++) {
                var zz = segs[k].userData.k * SEG_LEN - base;
                if (zz < -SEG_LEN - 6) zz += span;
                segs[k].position.z = -zz;
            }
            if (auroraMat) auroraMat.uniforms.t.value = clockT;
            pose(S); place(S);
            A.setSex(S.female);
            // camera
            var cx = S.camX, sh = S.shake;
            camera.position.set(cx + sh * 0.15, 2.1 + Math.abs(Math.sin(S.R.phase)) * 0.025 * S.amp, 3.3);
            camLook.set(cx * 0.85, 1.0, -10);
            camera.lookAt(camLook);
            // sun shadow follows the runner
            sun.position.set(S.R.x + sunDir.x * 40, sunDir.y * 40 + 4, sunDir.z * 40 - 4);
            sun.target.position.set(S.R.x, 0, -4);
            blob.visible = !shadows; blob.position.x = S.R.x; blob.scale.setScalar(1 - Math.min(0.5, S.R.y * 0.3));
            if (neonL) { neonL.position.set(-4, 3.5, -6 + Math.sin(clockT) * 2); neonR.position.set(4, 3.5, -12 + Math.cos(clockT * 0.8) * 2); }
            for (k = 0; k < water.length; k++) water[k].position.y = -0.4 + Math.sin(clockT * 0.8) * 0.03;
            renderer.render(scene, camera);
        }
        function project(x, y, z, out) {
            V.set(x, y, -z).project(camera);
            out.x = (V.x + 1) * 0.5 * 960; out.y = (1 - V.y) * 0.5 * 540; out.v = V.z < 1;
        }
        function resize(w, h) { renderer.setPixelRatio(1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
        function snapshot(target, w, h) { // copy the last frame into a 2D canvas (stage thumbnails)
            var g = target.getContext('2d'), sw = glCanvas.width, shh = glCanvas.height;
            g.drawImage(glCanvas, sw * 0.18, shh * 0.08, sw * 0.64, shh * 0.64, 0, 0, w, h);
        }
        function dispose() { disposeBiome(); renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) {} }

        return { setBiome: setBiome, render: render, project: project, resize: resize, dispose: dispose, snapshot: snapshot, biome: function () { return biomeIdx; } };
    }

    return { create: create, count: BIOMES.length };
})();
