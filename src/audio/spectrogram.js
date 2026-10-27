// Espectrograma en cascada (pixel art): el tiempo corre hacia la izquierda, la frecuencia en escala logarítmica.
const RAMP = ['#181425', '#262b44', '#3a4466', '#68386c', '#b55088', '#e43b44', '#f77622', '#feae34', '#fee761', '#ffffff'];
const RGB = RAMP.map((h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });

export class Spectrogram {
  constructor(w = 96, h = 40) {
    this.cv = document.createElement('canvas');
    this.cv.width = w;
    this.cv.height = h;
    this.ctx = this.cv.getContext('2d');
    this.ctx.fillStyle = RAMP[0];
    this.ctx.fillRect(0, 0, w, h);
    this.col = this.ctx.createImageData(1, h);
    this.acc = 0;
    this.bars = new Float32Array(16);
  }
  update(audio, dt, gainK = 1) {
    this.acc += dt;
    if (this.acc < 1 / 40) return;
    this.acc = 0;
    const { cv, ctx } = this;
    const w = cv.width, h = cv.height;
    ctx.drawImage(cv, -1, 0);
    const d = this.col.data;
    const fr = audio && audio.analyser ? audio.freq : null;
    if (fr) audio.analyser.getByteFrequencyData(fr);
    const sr = audio && audio.ctx ? audio.ctx.sampleRate : 44100;
    const nb = fr ? fr.length : 1;
    for (let y = 0; y < h; y++) {
      const f = 60 * Math.pow(12000 / 60, 1 - y / (h - 1));
      let v = 0;
      if (fr) {
        const b = Math.min(nb - 1, Math.round((f / (sr / 2)) * nb));
        v = Math.max(fr[b], fr[Math.max(0, b - 1)]) / 255;
      }
      v = Math.min(1, Math.pow(v * gainK, 1.4));
      const c = RGB[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
      d[y * 4] = c[0]; d[y * 4 + 1] = c[1]; d[y * 4 + 2] = c[2]; d[y * 4 + 3] = 255;
    }
    ctx.putImageData(this.col, w - 1, 0);
    // barras para el ecualizador
    for (let i = 0; i < 16; i++) {
      const f = 80 * Math.pow(10000 / 80, i / 15);
      const b = fr ? Math.min(nb - 1, Math.round((f / (sr / 2)) * nb)) : 0;
      const v = fr ? (fr[b] / 255) * gainK : 0;
      this.bars[i] = Math.max(v, this.bars[i] * 0.85);
    }
  }
}
