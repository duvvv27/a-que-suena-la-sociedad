// Partículas (polvo, humo, papelitos, aserrín, hojas) y ondas de sonido, en espacio de tiles.
import { text, measure } from './font.js';

const MAX = 600;

export class FX {
  constructor() {
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0, max: 1, col: '#fff', sz: 1 });
    this.next = 0;
    this.rings = [];
    this.density = 1;
  }
  // z = altura en tiles (sube hacia la pantalla)
  add(x, y, z, vx, vy, vz, life, col, g = 0, sz = 1) {
    if (Math.random() > this.density) return;
    const q = this.p[this.next];
    this.next = (this.next + 1) % MAX;
    Object.assign(q, { on: true, x, y, z, vx, vy, vz, g, life, max: life, col, sz });
  }
  ring(x, y, r0, r1, life, col) {
    this.rings.push({ x, y, r0, r1, t: 0, life, col });
  }
  update(dt) {
    for (const q of this.p) {
      if (!q.on) continue;
      q.life -= dt;
      if (q.life <= 0) { q.on = false; continue; }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vz -= q.g * dt;
      q.z += q.vz * dt;
      if (q.z < 0) { q.z = 0; q.vz = 0; q.vx *= 0.5; q.vy *= 0.5; }
    }
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
  }
  draw(view) {
    const { ctx, sb } = view;
    if (sb < 1) return;
    const s = Math.max(1, Math.round(sb / 8));
    for (const q of this.p) {
      if (!q.on) continue;
      const x = Math.round(view.X(q.x)), y = Math.round(view.Y(q.y - q.z));
      ctx.fillStyle = q.col;
      ctx.fillRect(x, y, s * q.sz, s * q.sz);
    }
    for (const r of this.rings) {
      const u = r.t / r.life;
      const rad = (r.r0 + (r.r1 - r.r0) * u) * sb;
      pixelCircle(ctx, view.X(r.x), view.Y(r.y), rad, r.col, 1 - u);
    }
  }
}

// círculo pixelado y punteado
export function pixelCircle(ctx, cx, cy, r, col, alpha = 1) {
  if (r < 1) return;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = col;
  const n = Math.max(12, Math.round(r * 2.2));
  for (let i = 0; i < n; i++) {
    if (i % 4 === 3) continue;
    const a = (i / n) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), 1, 1);
  }
  ctx.globalAlpha = 1;
}

// cartel con texto (para el suelo)
export function signBoard(view, x, y, label, bg = '#ead4aa', fg = '#3a4466') {
  const { ctx, sb } = view;
  if (sb < 4) return;
  const px = Math.round(view.X(x)), py = Math.round(view.Y(y));
  const w = measure(label) + 6;
  const h = 11;
  const pole = sb >= 8 ? 6 : 3;
  ctx.fillStyle = '#733e39';
  ctx.fillRect(px - 1, py - pole, 2, pole);
  ctx.fillStyle = '#181425';
  ctx.fillRect(px - (w >> 1) - 1, py - pole - h - 1, w + 2, h + 2);
  ctx.fillStyle = bg;
  ctx.fillRect(px - (w >> 1), py - pole - h, w, h);
  if (sb >= 8) text(ctx, label, px, py - pole - h + 2, fg, 1, 'center', null);
}
