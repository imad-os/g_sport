/* Motion Trail: live heart rate from a Bluetooth LE sensor, through My PC (MyPC.bluetooth, SDK API level 7).
 * My PC owns Bluetooth on the TV; this file keeps the latest reading and the sensor list, and turns heart rate
 * into calories. Everything here runs on SDK events (about once a second), never inside the game loop, except
 * the read-only helpers fresh() and kcalPerSec().
 * Standalone (a browser) or when My PC has not allowed heart rate for this app, every call fails: the game
 * keeps its profile-based calorie estimate.
 */
var MTHeart = (function () {
    'use strict';

    var FRESH_MS = 5000, MAX_DEVICES = 5;
    var B = null, onChange = null, busy = false;
    var st = {
        hosted: false,      // inside My PC (the SDK finished its handshake)
        allowed: true,      // false once My PC said Bluetooth is not allowed for this app
        ble: false,         // the TV has Bluetooth LE and it is on
        reason: '',         // capabilities().reasonCode, or 'denied' / 'standalone'
        state: 'off',       // off | scanning | connecting | connected | stale | no-contact | reconnecting | test | error
        message: '',        // last message from My PC (English), shown when nothing better is known
        device: '',         // connected sensor name
        last: null,         // { id, name } of the sensor used last on this TV
        devices: [],        // scan results: { id, name }
        searched: false,    // a scan finished (so "none found" can be shown)
        bpm: 0, at: 0, simulated: false
    };

    function changed() { if (onChange) { try { onChange(); } catch (e) {} } }
    function fail(e) {
        var m = String((e && e.message) || e || '');
        if (/not allowed/i.test(m)) { st.allowed = false; st.reason = 'denied'; }
        st.message = m; busy = false;
        if (st.state === 'scanning' || st.state === 'connecting') st.state = 'off';
        changed();
    }
    function addDevice(d) {
        if (!d || typeof d.id !== 'string') return;
        var name = String(d.name || '').slice(0, 32) || 'Sensor';
        for (var i = 0; i < st.devices.length; i++) if (st.devices[i].id === d.id) { st.devices[i].name = name; return; }
        if (st.devices.length < MAX_DEVICES) st.devices.push({ id: d.id, name: name });
    }

    function onStatus(e) {
        var s = e && e.status;
        if (typeof s !== 'string') return;
        if (e.message) st.message = String(e.message);
        if (s === 'connected') { st.state = 'connected'; st.simulated = false; if (e.deviceName) st.device = String(e.deviceName); }
        else if (s === 'test') { st.state = 'test'; st.simulated = true; st.device = ''; }
        else if (s === 'stale' || s === 'no-contact' || s === 'reconnecting' || s === 'connecting' || s === 'scanning') st.state = s;
        else if (s === 'scan-complete' || s === 'scan-cancelled') { if (st.state === 'scanning') st.state = 'off'; st.searched = true; }
        else if (s === 'disconnected' || s === 'test-stopped') { st.state = 'off'; st.device = ''; st.bpm = 0; st.simulated = false; }
        else if (s === 'error') { st.state = st.device ? st.state : 'off'; }
        changed();
    }
    function onReading(r) {
        var bpm = r ? +r.bpm : 0;
        if (!(bpm > 20 && bpm < 250)) return;
        st.bpm = Math.round(bpm); st.at = Date.now(); st.simulated = r.source === 'simulation';
        if (st.state === 'stale' || st.state === 'no-contact' || st.state === 'reconnecting') st.state = st.simulated ? 'test' : 'connected';
        if (r.deviceName && !st.simulated) st.device = String(r.deviceName);
        changed();
    }

    function call(fn) {
        if (!B) return Promise.reject(new Error('standalone'));
        try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
    }

    return {
        st: st,
        // call once from onInit; cb runs after every change (to rebuild menu strings)
        init: function (cb) {
            onChange = cb || null;
            B = typeof MyPC !== 'undefined' && MyPC.bluetooth && MyPC.bluetooth.available && MyPC.bluetooth.available() ? MyPC.bluetooth : null;
            st.hosted = !!B;
            if (!B) { st.reason = 'standalone'; return; }
            B.on('status', onStatus);
            B.on('reading', onReading);
            B.on('device-found', function (e) { if (e && e.device) { addDevice(e.device); changed(); } });
            this.probe();
        },
        // what the TV can do (no scan); also tells whether My PC allows this app
        probe: function () {
            return call(function () { return B.capabilities(); }).then(function (c) {
                c = c || {};
                st.ble = !!c.nativeBleAvailable; st.reason = String(c.reasonCode || ''); st.message = String(c.message || '');
                if (c.lastDevice && typeof c.lastDevice.id === 'string') st.last = { id: c.lastDevice.id, name: String(c.lastDevice.name || 'Sensor').slice(0, 32) };
                if (c.state === 'connected' && st.state === 'off') st.state = 'connected';
                changed();
            }, fail);
        },
        usable: function () { return st.hosted && st.allowed; },
        busy: function () { return busy || st.state === 'scanning' || st.state === 'connecting'; },
        scan: function () {
            if (busy) return;
            busy = true; st.devices.length = 0; st.searched = false; st.state = 'scanning'; changed();
            call(function () { return B.scan({ seconds: 10 }); }).then(function (res) {
                busy = false;
                var list = (res && res.devices) || [];
                for (var i = 0; i < list.length; i++) addDevice(list[i]);
                st.searched = true; if (st.state === 'scanning') st.state = 'off';
                changed();
            }, fail);
        },
        connect: function (id) {
            if (busy) return;
            busy = true; st.state = 'connecting'; changed();
            call(function () { return B.connect(id); }).then(function (r) {
                busy = false; st.state = 'connected'; st.simulated = false;
                if (r && r.deviceName) st.device = String(r.deviceName);
                if (r && r.device && r.device.id) st.last = { id: r.device.id, name: st.device || 'Sensor' };
                changed();
            }, fail);
        },
        reconnectLast: function (quiet) {
            if (busy || !st.last) return;
            busy = true; if (!quiet) { st.state = 'connecting'; changed(); }
            call(function () { return B.reconnectLast(); }).then(function (r) {
                busy = false; st.state = 'connected'; st.simulated = false;
                if (r && r.deviceName) st.device = String(r.deviceName);
                changed();
            }, function (e) { if (quiet) { busy = false; if (st.state === 'connecting') st.state = 'off'; changed(); } else fail(e); });
        },
        disconnect: function () {
            var wasTest = st.state === 'test';
            call(function () { return wasTest ? B.stopTest() : B.disconnect(); }).then(function () {
                st.state = 'off'; st.device = ''; st.bpm = 0; st.simulated = false; changed();
            }, fail);
        },
        startTest: function () {
            call(function () { return B.startTest(); }).then(function () { st.state = 'test'; st.simulated = true; changed(); }, fail);
        },
        live: function () { return st.state === 'connected' || st.state === 'test' || st.state === 'stale' || st.state === 'no-contact' || st.state === 'reconnecting'; },
        // the current heart rate, or 0 when there is no recent reading (no allocation: safe in the game loop)
        fresh: function (now) { return st.bpm && now - st.at < FRESH_MS && st.state !== 'no-contact' ? st.bpm : 0; },
        // Keytel et al. 2005 (J Sports Sci 23:289), energy from heart rate without VO2max, kcal per second.
        // Only used from 90 bpm up, where the equation holds; below that the game keeps its MET estimate.
        kcalPerSec: function (bpm, male, weightKg, age) {
            if (bpm < 90) return 0;
            var kj = male ? -55.0969 + 0.6309 * bpm + 0.1988 * weightKg + 0.2017 * age
                          : -20.4022 + 0.4472 * bpm - 0.1263 * weightKg + 0.074 * age;
            var perMin = kj / 4.184;
            return perMin > 0 ? Math.min(perMin, 20) / 60 : 0;
        },
        // share of the age-predicted maximum (Tanaka: 208 - 0.7 x age), 0..1.2
        effort: function (bpm, age) { return bpm > 0 ? Math.min(1.2, bpm / (208 - 0.7 * age)) : 0; }
    };
})();
