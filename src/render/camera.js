// Cámara orbital con altitud continua: del globo completo a la calle.
// Estado en coordenadas de tile (cx, cy) + zoom ls = log2(píxeles por tile).
import { K, WT, HT, wrapX, wrapDX, tileVec } from '../world/planet.js';
import { clamp, smooth } from '../core/rng.js';

const FOV = (40 * Math.PI) / 180;
export const LS_MAX = 4; // 16 px por tile

export class Camera {
  constructor() {
    this.cx = WT * 0.3;
    this.cy = HT * 0.42;
    this.ls = -3;
    this.tls = -3;
    this.vx = 0;
    this.vy = 0;
    this.anchor = null;
    this.flight = null;
    this.autoSpin = 0;
    this.reduced = false;
    this.rot = new Float32Array(9);
  }
  resize(W, H) {
    if (!(W > 0 && H > 0)) return; // pestaña oculta o sin tamaño: esperar a uno válido
    this.W = W;
    this.H = H;
    const m = Math.min(W, H);
    this.f = m / 2 / Math.tan(FOV / 2);
    const r0 = 0.37 * m;
    const D = Math.sqrt(1 + (this.f / r0) ** 2);
    this.lsMin = Math.log2(this.f / ((D - 1) * K));
    if (this.ls < this.lsMin || !this.sized || !Number.isFinite(this.ls)) this.ls = this.tls = this.lsMin;
    if (!Number.isFinite(this.cx) || !Number.isFinite(this.cy)) { this.cx = WT * 0.3; this.cy = HT * 0.42; }
    this.sized = true;
    this.compute();
  }
  get s() { return 2 ** this.ls; }
  compute() {
    const s = 2 ** this.ls;
    this.h = this.f / (s * K);
    this.D = 1 + this.h;
    this.m = smooth(-2.6, -0.9, this.ls);
    const lon = this.cx / K, lat = Math.PI / 2 - this.cy / K;
    this.lon = lon;
    this.lat = lat;
    // R = Ry(lon) * Rx(-lat)  (cámara -> mundo), guardado por columnas para GL
    const cb = Math.cos(lon), sb = Math.sin(lon), ca = Math.cos(-lat), sa = Math.sin(-lat);
    const R = [
      [cb, sb * sa, sb * ca],
      [0, ca, -sa],
      [-sb, cb * sa, cb * ca],
    ];
    this.R = R;
    const r = this.rot;
    r[0] = R[0][0]; r[1] = R[1][0]; r[2] = R[2][0];
    r[3] = R[0][1]; r[4] = R[1][1]; r[5] = R[2][1];
    r[6] = R[0][2]; r[7] = R[1][2]; r[8] = R[2][2];
  }
  // píxel de pantalla -> desplazamiento en tiles respecto al centro (igual que toRel del shader)
  screenToRel(sx, sy) {
    const px = sx + 0.5 - this.W / 2, py = this.H / 2 - (sy + 0.5);
    const len = Math.hypot(px, py, this.f);
    const dx = px / len, dy = py / len, dz = -this.f / len;
    const D = this.D;
    const b = D * dz;
    const disc = b * b - (D * D - 1);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    const Px = t * dx, Py = t * dy, Pz = D + t * dz;
    const R = this.R;
    const Wx = R[0][0] * Px + R[0][1] * Py + R[0][2] * Pz;
    const Wy = R[1][0] * Px + R[1][1] * Py + R[1][2] * Pz;
    const Wz = R[2][0] * Px + R[2][1] * Py + R[2][2] * Pz;
    const lon = Math.atan2(Wx, Wz), lat = Math.asin(clamp(Wy, -1, 1));
    const tX = wrapDX(lon * K - this.cx), tY = (Math.PI / 2 - lat) * K - this.cy;
    const lX = Math.atan2(Px, Pz) * K, lY = -Math.asin(clamp(Py, -1, 1)) * K;
    const m = this.m;
    return [tX + (lX - tX) * m, tY + (lY - tY) * m];
  }
  screenToTile(sx, sy) {
    const r = this.screenToRel(sx, sy);
    return r ? [wrapX(this.cx + r[0]), this.cy + r[1]] : null;
  }
  // tiles por píxel en el centro (horizontal y vertical)
  tilesPerPx() {
    const v = (this.h * K) / this.f;
    return [v / (Math.cos(this.lat) + (1 - Math.cos(this.lat)) * this.m), v];
  }
  pan(dtx, dty) {
    this.cx = wrapX(this.cx + dtx);
    this.cy = clamp(this.cy + dty, HT * 0.1, HT * 0.9);
  }
  // arrastre de (x0,y0) a (x1,y1) manteniendo el punto agarrado bajo el puntero
  drag(x0, y0, x1, y1, dt) {
    const a = this.screenToRel(x0, y0), b = this.screenToRel(x1, y1);
    let dX, dY;
    if (a && b) {
      dX = a[0] - b[0];
      dY = a[1] - b[1];
    } else {
      const [tx, ty] = this.tilesPerPx();
      dX = -(x1 - x0) * tx;
      dY = -(y1 - y0) * ty;
    }
    this.pan(dX, dY);
    this.compute();
    if (dt > 0) {
      const k = 0.5;
      this.vx = this.vx * (1 - k) + (dX / dt) * k;
      this.vy = this.vy * (1 - k) + (dY / dt) * k;
    }
    this.flight = null;
  }
  release() {
    if (this.reduced) { this.vx = this.vy = 0; }
  }
  stop() { this.vx = this.vy = 0; }
  zoomBy(delta, sx, sy) {
    this.tls = clamp(this.tls + delta, this.lsMin, LS_MAX);
    if (this.ls > -1 || this.tls > -1) {
      // en el suelo, encajar en potencias de 2 para que el pixel art quede nítido
      if (Math.abs(delta) >= 0.5) this.tls = clamp(Math.round(this.tls), this.lsMin, LS_MAX);
    }
    if (sx !== undefined) {
      const t = this.screenToTile(sx, sy);
      this.anchor = t ? { sx, sy, t } : null;
    } else this.anchor = null;
    this.flight = null;
  }
  flyTo(cx, cy, ls, dur = 1.6, hop = true) {
    const dist = Math.hypot(wrapDX(cx - this.cx), cy - this.cy) / K; // radianes aprox.
    this.flight = {
      x0: this.cx, y0: this.cy, l0: this.ls,
      dx: wrapDX(cx - this.cx), dy: cy - this.cy, l1: ls,
      hop: hop ? Math.min(3, dist * 3) : 0,
      t: 0, dur: this.reduced ? Math.min(dur, 0.6) : dur,
    };
    this.anchor = null;
    this.vx = this.vy = 0;
  }
  get flying() { return !!this.flight; }
  update(dt) {
    if (this.flight) {
      const F = this.flight;
      F.t += dt;
      const u = Math.min(1, F.t / F.dur);
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      this.cx = wrapX(F.x0 + F.dx * e);
      this.cy = F.y0 + F.dy * e;
      const l = F.l0 + (F.l1 - F.l0) * e - F.hop * Math.sin(Math.PI * e);
      this.ls = this.tls = clamp(l, this.lsMin, LS_MAX);
      if (u >= 1) this.flight = null;
      this.compute();
      return;
    }
    // zoom suave
    const prev = this.ls;
    this.ls += (this.tls - this.ls) * (1 - Math.exp(-dt * (this.reduced ? 30 : 11)));
    if (Math.abs(this.tls - this.ls) < 0.002) this.ls = this.tls;
    this.compute();
    if (this.anchor && prev !== this.ls) {
      for (let i = 0; i < 2; i++) {
        const now = this.screenToTile(this.anchor.sx, this.anchor.sy);
        if (!now) break;
        this.pan(wrapDX(this.anchor.t[0] - now[0]), this.anchor.t[1] - now[1]);
        this.compute();
      }
    }
    // inercia
    if (this.vx || this.vy) {
      this.pan(this.vx * dt, this.vy * dt);
      const k = Math.exp(-dt * 5);
      this.vx *= k;
      this.vy *= k;
      if (Math.abs(this.vx) + Math.abs(this.vy) < 0.05 * (this.h * K) / this.f) this.vx = this.vy = 0;
      this.compute();
    }
    if (this.autoSpin) {
      this.pan(this.autoSpin * dt * (this.h * K) / this.f, 0);
      this.compute();
    }
  }
  centerVec() { return tileVec(this.cx, this.cy); }
}
