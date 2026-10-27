// Motor de audio: grabaciones reales (si existen en /audio) o respaldo sintetizado.
// La señal de la problemática pasa por volumen + filtro pasa-bajos + paneo según cercanía (frío/caliente).
import { synth } from './synth.js';


export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.sources = {};
    this.vol = 0.8;
    this.muted = false;
    this.real = {};
  }
  // audio/sonidos.json declara qué grabaciones reales existen, p. ej. { "trafico": "trafico.ogg" }
  async loadOne(id, manifest) {
    const file = manifest[id];
    if (file) {
      try {
        const r = await fetch('audio/' + file);
        if (r.ok) {
          const dec = new OfflineAudioContext(2, 1, 44100);
          const buf = await dec.decodeAudioData(await r.arrayBuffer());
          this.real[id] = true;
          return buf;
        }
      } catch (err) {
        console.warn('No se pudo cargar audio/' + file + '; se usa el sonido sintetizado.', err);
      }
    }
    return synth(id);
  }
  async prepare(ids, onProgress) {
    let manifest = {};
    try {
      const r = await fetch('audio/sonidos.json', { cache: 'no-cache' });
      if (r.ok) manifest = await r.json();
    } catch (err) { /* sin manifiesto: todo sintetizado */ }
    let n = 0;
    await Promise.all(ids.map(async (id) => {
      this.buffers[id] = await this.loadOne(id, manifest);
      onProgress && onProgress(++n / ids.length);
    }));
  }
  start() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // bus de la señal (lo que ve el espectrograma)
    this.sig = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 18000;
    this.pan = ctx.createStereoPanner();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.35;
    this.analyser.minDecibels = -92;
    this.analyser.maxDecibels = -18;
    this.sig.connect(this.lp).connect(this.pan).connect(this.master);
    this.pan.connect(this.analyser);
    this.bedBus = ctx.createGain();
    this.bedBus.connect(this.master);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize);
  }
  loop(id, dest, vol, fade = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.buffers[id]) return null;
    const s = ctx.createBufferSource();
    s.buffer = this.buffers[id];
    s.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(vol, ctx.currentTime, fade / 3);
    s.connect(g).connect(dest);
    s.start(0, Math.random() * s.buffer.duration);
    return { s, g };
  }
  stopNode(n, fade = 1) {
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setTargetAtTime(0, t, fade / 3);
    n.s.stop(t + fade * 2 + 0.1);
  }
  // sonido de la problemática (pasa por el bus de señal)
  signal(id, fade = 1) {
    this.stopNode(this.cur, fade);
    this.cur = id ? this.loop(id, this.sig, 1, fade) : null;
    this.curId = id;
  }
  // capa de ambiente (no se analiza)
  bed(id, vol = 0.5, fade = 2) {
    if (this.bedId === id && this.bedNode) { this.bedNode.g.gain.setTargetAtTime(vol, this.ctx.currentTime, fade / 3); return; }
    this.stopNode(this.bedNode, fade);
    this.bedNode = id ? this.loop(id, this.bedBus, vol, fade) : null;
    this.bedId = id;
  }
  // c: 0 lejos .. 1 encima. pan: -1..1
  proximity(c, pan, full = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = full ? 1 : 0.12 + 0.88 * c * c;
    const f = full ? 16000 : 260 * Math.pow(60, c);
    this.sig.gain.setTargetAtTime(v, t, 0.08);
    this.lp.frequency.setTargetAtTime(Math.min(16000, f), t, 0.08);
    this.pan.pan.setTargetAtTime(full ? 0 : pan, t, 0.1);
  }
  setVolume(v) {
    this.vol = v;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  toggleMute() {
    this.muted = !this.muted;
    this.setVolume(this.vol);
    return this.muted;
  }
  level() {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.wave);
    let s = 0;
    for (let i = 0; i < this.wave.length; i += 4) { const v = (this.wave[i] - 128) / 128; s += v * v; }
    return Math.min(1, Math.sqrt(s / (this.wave.length / 4)) * 3);
  }
  // efectos de interfaz
  blip(kind) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const play = (type, f0, f1, at, len, g0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + at + len);
      g.gain.setValueAtTime(g0, t + at);
      g.gain.exponentialRampToValueAtTime(0.0005, t + at + len);
      o.connect(g).connect(this.master);
      o.start(t + at);
      o.stop(t + at + len + 0.02);
    };
    if (kind === 'click') play('square', 880, 0, 0, 0.05, 0.05);
    else if (kind === 'ok') [523, 659, 784, 1047].forEach((f, i) => play('triangle', f, 0, i * 0.07, 0.16, 0.12));
    else if (kind === 'bad') play('sawtooth', 200, 110, 0, 0.22, 0.09);
    else if (kind === 'mark') play('sine', 660, 990, 0, 0.12, 0.12);
    else if (kind === 'radio') { play('square', 1200, 0, 0, 0.04, 0.04); play('square', 1600, 0, 0.06, 0.04, 0.04); }
    else if (kind === 'tick') play('square', 1400, 0, 0, 0.02, 0.02);
  }
}
