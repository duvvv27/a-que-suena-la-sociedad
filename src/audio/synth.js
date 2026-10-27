// Respaldo sintetizado: si no hay grabaciones reales en /audio, se generan loops con Web Audio.
// Se renderizan una sola vez (OfflineAudioContext) y el final se pliega sobre el inicio para un loop sin cortes.
import { mulberry32 } from '../core/rng.js';

const SR = 22050;
const DUR = 8;
const TAIL = 2;

function noiseBuffer(ctx, kind, seconds, rng) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return b;
}

function mk(ctx, rng) {
  const nb = { white: noiseBuffer(ctx, 'white', 2, rng), brown: noiseBuffer(ctx, 'brown', 2, rng) };
  const H = {
    noise(kind = 'white') {
      const s = ctx.createBufferSource();
      s.buffer = nb[kind];
      s.loop = true;
      s.loopEnd = 2;
      s.start(0, rng() * 1.5);
      return s;
    },
    osc(type, f) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start(0);
      return o;
    },
    filt(type, f, q = 1) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    },
    gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; },
    pan(v) { const p = ctx.createStereoPanner(); p.pan.value = v; return p; },
    chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; },
    env(param, t, a, hold, r, peak) {
      param.setValueAtTime(0, t);
      param.linearRampToValueAtTime(peak, t + a);
      param.setValueAtTime(peak, t + a + hold);
      param.linearRampToValueAtTime(0, t + a + hold + r);
    },
    // evento con oscilador de vida limitada
    tone(type, f, t, len, peak, dest, setup) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0;
      H.env(g.gain, t, Math.min(0.02, len / 4), Math.max(0, len - 0.06), 0.05, peak);
      o.connect(g);
      if (setup) setup(o, g);
      g.connect(dest);
      o.start(t);
      o.stop(t + len + 0.1);
      return o;
    },
    burst(t, len, peak, dest, ftype, f, q = 1, decay = true) {
      const s = ctx.createBufferSource();
      s.buffer = nb.white;
      const b = H.filt(ftype, f, q);
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      if (decay) g.gain.exponentialRampToValueAtTime(0.0008, t + len);
      else g.gain.setValueAtTime(0, t + len);
      s.connect(b).connect(g).connect(dest);
      s.start(t, rng() * 1.5);
      s.stop(t + len + 0.05);
    },
  };
  return H;
}

const RECIPES = {
  trafico(ctx, out, bed, H, R) {
    H.chain(H.noise('brown'), H.filt('lowpass', 220), H.gain(0.45), bed);
    H.chain(H.noise(), H.filt('bandpass', 900, 0.6), H.gain(0.045), bed);
    for (const f of [38, 46, 55]) H.chain(H.osc('sawtooth', f), H.filt('lowpass', 160), H.gain(0.06), bed);
    for (let k = 0; k < 18; k++) {
      const t = R() * DUR;
      const f = 330 + R() * 200;
      const p = H.pan((R() * 2 - 1) * 0.8);
      const bp = H.chain(H.filt('bandpass', 1100, 0.9), p, out);
      const kind = R();
      const beeps = kind < 0.25 ? [[0, 1.6 + R()]] : kind < 0.6 ? [[0, 0.12], [0.2, 0.12], [0.4, 0.3]] : [[0, 0.2 + R() * 0.7]];
      for (const [o, len] of beeps) {
        H.tone('square', f, t + o, len, 0.06, bp);
        H.tone('square', f * 1.26, t + o, len, 0.05, bp);
      }
    }
    for (let k = 0; k < 2; k++) {
      H.tone('sine', 2600, R() * DUR, 0.45, 0.015, out, (o) => {
        const l = H.osc('sine', 18); const lg = H.gain(60); l.connect(lg).connect(o.frequency);
      });
    }
  },
  obras(ctx, out, bed, H, R) {
    const siren = H.osc('triangle', 1000);
    const lfo = H.osc('sine', 1 / 2.5);
    H.chain(lfo, H.gain(320), siren.frequency);
    const sp = H.pan(0);
    const sl = H.osc('sine', 1 / 8);
    H.chain(sl, H.gain(0.6), sp.pan);
    H.chain(siren, H.filt('lowpass', 2500), H.gain(0.05), sp, bed);
    H.chain(H.osc('sawtooth', 32), H.filt('lowpass', 280), H.gain(0.12), bed);
    H.chain(H.osc('sawtooth', 64.5), H.filt('lowpass', 280), H.gain(0.06), bed);
    H.chain(H.noise('brown'), H.filt('lowpass', 150), H.gain(0.25), bed);
    // martillos neumáticos en ráfagas
    for (const [a, b, pv] of [[0.3, 2.4, -0.4], [3.1, 5.0, 0.3], [5.8, 7.7, -0.1]]) {
      const n = H.noise();
      const gate = H.gain(0.5);
      const sq = H.osc('square', 17 + R() * 3);
      H.chain(sq, H.gain(0.5), gate.gain);
      const bg = ctx.createGain();
      bg.gain.value = 0;
      H.env(bg.gain, a, 0.02, b - a - 0.05, 0.03, 0.2);
      H.chain(n, H.filt('bandpass', 1800, 1), gate, bg, H.pan(pv), out);
      const th = H.osc('square', 55);
      const g2 = H.gain(0.5);
      H.chain(sq, H.gain(0.5), g2.gain);
      const bg2 = ctx.createGain();
      bg2.gain.value = 0;
      H.env(bg2.gain, a, 0.02, b - a - 0.05, 0.03, 0.12);
      H.chain(th, H.filt('lowpass', 200), g2, bg2, out);
    }
    for (let t = 1; t < 5; t += 1) H.tone('sine', 1050, t, 0.45, 0.04, out);
    for (let k = 0; k < 7; k++) H.burst(R() * DUR, 0.45, 0.35, out, 'bandpass', 700 + R() * 1700, 18);
  },
  marcha(ctx, out, bed, H, R) {
    H.chain(H.noise(), H.filt('bandpass', 450, 0.8), H.gain(0.09), bed);
    H.chain(H.noise(), H.filt('bandpass', 1400, 1.2), H.gain(0.03), bed);
    // coro: varias voces con formantes que cambian por sílaba
    const voices = H.gain(0);
    for (let v = 0; v < 9; v++) {
      const f0 = v < 5 ? 150 + R() * 40 : 230 + R() * 50;
      H.chain(H.osc('sawtooth', f0), H.gain(0.06), voices);
    }
    const f1 = H.filt('bandpass', 500, 4), f2 = H.filt('bandpass', 1500, 5);
    voices.connect(f1); voices.connect(f2);
    const mix = H.gain(1.1);
    f1.connect(mix); f2.connect(mix);
    mix.connect(out);
    const VOW = [[730, 1100], [500, 1800], [350, 900], [450, 850], [300, 2200], [730, 1100], [500, 1800]];
    const beat = 0.5;
    for (let bar = 0; bar < 4; bar++) {
      const pattern = [0, 0.5, 1, 1.5, 2, 2.5, 3];
      pattern.forEach((b, si) => {
        const t = bar * 2 + b * beat;
        const [a1, a2] = VOW[si];
        f1.frequency.setValueAtTime(a1, t);
        f2.frequency.setValueAtTime(a2, t);
        voices.gain.setValueAtTime(0, t);
        voices.gain.linearRampToValueAtTime(1, t + 0.03);
        voices.gain.linearRampToValueAtTime(0.25, t + 0.2);
        voices.gain.linearRampToValueAtTime(0, t + (si === 6 ? 0.45 : 0.24));
      });
    }
    for (let k = 0; k < 16; k++) {
      const t = k * 0.5;
      H.tone('sine', 110, t, 0.2, 0.35, out, (o) => {
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      });
      H.burst(t + 0.25, 0.09, 0.12, out, 'highpass', 1500, 0.7);
    }
    for (let k = 0; k < 4; k++) {
      H.tone('sine', 2800 + R() * 400, R() * DUR, 0.4 + R() * 0.4, 0.04, H.chain(H.pan(R() * 1.6 - 0.8), out), (o) => {
        const l = H.osc('sine', 28); l.connect(H.gain(150)).connect(o.frequency);
      });
    }
    const ap = R() * 5;
    for (let k = 0; k < 40; k++) H.burst(ap + k * 0.04 + R() * 0.03, 0.03, 0.08 * (1 - k / 45), out, 'highpass', 1200);
  },
  tala(ctx, out, bed, H, R) {
    H.chain(H.noise(), H.filt('lowpass', 500), H.gain(0.05), bed);
    H.chain(H.noise(), H.filt('highpass', 4000), H.gain(0.01), bed);
    const shaper = () => {
      const w = ctx.createWaveShaper();
      const c = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; c[i] = Math.tanh(x * 4); }
      w.curve = c;
      return w;
    };
    for (const [gain, pv, segs] of [[0.14, -0.3, [[0.4, 3.2], [4.4, 7.4]]], [0.05, 0.6, [[1.5, 4.0], [5.5, 7.8]]]]) {
      const o1 = H.osc('sawtooth', 95), o2 = H.osc('square', 190);
      const g = H.gain(gain * 0.6);
      o1.frequency.setValueAtTime(92, 0);
      o2.frequency.setValueAtTime(184, 0);
      for (const [a, b] of segs) {
        for (const [o, m] of [[o1, 1], [o2, 2]]) {
          o.frequency.setTargetAtTime(148 * m, a, 0.15);
          o.frequency.setTargetAtTime(128 * m, a + 0.6, 0.4);
          o.frequency.setTargetAtTime(92 * m, b, 0.2);
        }
        g.gain.setTargetAtTime(gain, a, 0.1);
        g.gain.setTargetAtTime(gain * 0.6, b, 0.2);
      }
      const mixO = H.gain(0.5);
      o1.connect(mixO); o2.connect(mixO);
      H.chain(mixO, shaper(), H.filt('bandpass', 1100, 0.7), g, H.pan(pv), bed);
    }
    const tf = 5.6;
    for (let k = 0; k < 26; k++) H.burst(tf - 0.9 + Math.pow(k / 26, 0.6) * 0.9, 0.012, 0.25, out, 'bandpass', 2500, 2);
    const ws = ctx.createBufferSource();
    ws.buffer = noiseBuffer(ctx, 'white', 1.2, R);
    const wf = H.filt('bandpass', 900, 1.2);
    wf.frequency.setValueAtTime(900, tf);
    wf.frequency.exponentialRampToValueAtTime(180, tf + 0.9);
    const wg = H.gain(0);
    H.env(wg.gain, tf, 0.1, 0.6, 0.3, 0.12);
    ws.connect(wf).connect(wg).connect(out);
    ws.start(tf);
    H.tone('sine', 55, tf + 0.9, 0.7, 0.5, out, (o, g) => { g.gain.setValueAtTime(0.5, tf + 0.9); g.gain.exponentialRampToValueAtTime(0.001, tf + 1.6); });
    H.burst(tf + 0.9, 0.5, 0.35, out, 'lowpass', 300);
    const tr = H.osc('sawtooth', 48);
    const tg = H.gain(0);
    H.env(tg.gain, 0.8, 2.5, 1.5, 2.5, 0.07);
    H.chain(tr, H.filt('lowpass', 260), tg, out);
    for (let k = 0; k < 3; k++) {
      const t = R() * 3;
      H.tone('sine', 3400, t, 0.07, 0.03, out, (o) => { o.frequency.setValueAtTime(3000, t); o.frequency.linearRampToValueAtTime(4200, t + 0.06); });
    }
  },
  sanado(ctx, out, bed, H, R) {
    H.chain(H.noise(), H.filt('bandpass', 700, 0.3), H.gain(0.025), bed);
    H.chain(H.noise(), H.filt('highpass', 1800), H.gain(0.018), bed);
    H.chain(H.noise(), H.filt('bandpass', 380, 1), H.gain(0.03), bed);
    for (let k = 0; k < 24; k++) {
      const t = R() * DUR;
      const dest = H.chain(H.pan(R() * 1.6 - 0.8), out);
      const kind = R();
      if (kind < 0.45) {
        const n = 2 + ((R() * 3) | 0), f = 3000 + R() * 800;
        for (let i = 0; i < n; i++) {
          const ti = t + i * 0.09;
          H.tone('sine', f, ti, 0.06, 0.05, dest, (o) => { o.frequency.setValueAtTime(f, ti); o.frequency.linearRampToValueAtTime(f * 1.35, ti + 0.05); });
        }
      } else if (kind < 0.75) {
        H.tone('sine', 3500 + R() * 600, t, 0.35, 0.035, dest, (o, g) => {
          const l = H.osc('square', 26); l.connect(H.gain(0.5)).connect(g.gain);
        });
      } else {
        H.tone('sine', 3000, t, 0.15, 0.05, dest, (o) => { o.frequency.setValueAtTime(3000, t); o.frequency.exponentialRampToValueAtTime(2100, t + 0.14); });
      }
    }
    for (const f of [2100, 2650]) H.tone('sine', f, 4.2, 0.8, 0.04, out, (o, g) => { g.gain.setValueAtTime(0.04, 4.2); g.gain.exponentialRampToValueAtTime(0.001, 5.0); });
  },
  orbita(ctx, out, bed, H, R) {
    for (const [f, g] of [[55, 0.09], [82.4, 0.05], [110, 0.03], [164.8, 0.015]]) {
      const o = H.osc('sine', f);
      const tg = H.gain(g);
      const l = H.osc('sine', 0.12 + R() * 0.1);
      H.chain(l, H.gain(g * 0.6), tg.gain);
      H.chain(o, tg, bed);
    }
    H.chain(H.noise('brown'), H.filt('lowpass', 200), H.gain(0.05), bed);
  },
};

export async function synth(id) {
  const total = DUR + TAIL;
  const ctx = new OfflineAudioContext(2, SR * total, SR);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const R = mulberry32(h);
  const H = mk(ctx, R);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  // cama continua con fundido de entrada/salida para el pliegue
  const bed = ctx.createGain();
  bed.gain.setValueAtTime(0, 0);
  bed.gain.linearRampToValueAtTime(1, TAIL);
  bed.gain.setValueAtTime(1, DUR);
  bed.gain.linearRampToValueAtTime(0, DUR + TAIL);
  bed.connect(out);
  RECIPES[id](ctx, out, bed, H, R);
  const buf = await ctx.startRendering();
  const n = SR * DUR;
  const res = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c), o = res.getChannelData(c);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      o[i] = d[i] + (i + n < d.length ? d[i + n] : 0);
      peak = Math.max(peak, Math.abs(o[i]));
    }
    if (peak > 0.95) for (let i = 0; i < n; i++) o[i] *= 0.95 / peak;
  }
  return res;
}
