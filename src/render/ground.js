// Búfer del suelo: chunks cacheados + capa dinámica (agentes, escenas, partículas, ondas).
// Se dibuja en espacio de tiles y luego el shader lo proyecta sobre la esfera.
import { ChunkCache, LODS } from './chunks.js';
import { CHUNK_PX } from './paint.js';
import { wrapDX } from '../world/planet.js';

export class Ground {
  constructor(world) {
    this.cache = new ChunkCache(world);
    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d');
    this.rect = new Float32Array(4);
    this.sb = 0.5;
  }
  resize(W, H) {
    this.cv.width = Math.ceil((W * 1.45) / 16) * 16;
    this.cv.height = Math.ceil((H * 1.45) / 16) * 16;
    this.ctx.imageSmoothingEnabled = false;
  }
  render(cam, layers, budgetMs) {
    const s = cam.s;
    let sb = LODS[0];
    for (const l of LODS) if (l <= s * 1.001) sb = l;
    this.sb = sb;
    const bw = this.cv.width, bh = this.cv.height;
    const ox = Math.floor(cam.cx * sb - bw / 2) / sb; // origen alineado a píxel
    const oy = Math.floor(cam.cy * sb - bh / 2) / sb;
    this.ox = ox;
    this.oy = oy;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, bw, bh);
    const cache = this.cache;
    cache.frame++;
    const ct = CHUNK_PX / sb;
    const [nx, ny] = ChunkCache.counts(sb);
    const i0 = Math.floor(ox / ct), i1 = Math.floor((ox + bw / sb) / ct);
    const j0 = Math.max(0, Math.floor(oy / ct)), j1 = Math.min(ny - 1, Math.floor((oy + bh / sb) / ct));
    const ccx = cam.cx / ct, ccy = cam.cy / ct;
    let missing = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const wi = ((i % nx) + nx) % nx;
        const prio = Math.hypot(i + 0.5 - ccx, j + 0.5 - ccy);
        const cv = cache.get(sb, wi, j, prio);
        const dx = Math.round((i * ct - ox) * sb), dy = Math.round((j * ct - oy) * sb);
        if (cv) ctx.drawImage(cv, dx, dy);
        else {
          missing++;
          // respaldo: chunk de menor detalle ampliado
          const pl = sb / 2;
          if (pl >= LODS[0]) {
            const pnx = ChunkCache.counts(pl)[0];
            const pi = Math.floor(wi / 2), pj = Math.floor(j / 2);
            const pcv = cache.peek(pl, pi % pnx, pj);
            if (pcv) {
              const sx = (wi % 2) * (CHUNK_PX / 2), sy = (j % 2) * (CHUNK_PX / 2);
              ctx.drawImage(pcv, sx, sy, CHUNK_PX / 2, CHUNK_PX / 2, dx, dy, CHUNK_PX, CHUNK_PX);
            }
          }
        }
      }
    }
    cache.process(missing ? budgetMs : budgetMs * 0.5);
    // capa dinámica
    const view = { ctx, sb, ox, oy, bw, bh, X: (tx) => wrapDX(tx - ox) * sb, Y: (ty) => (ty - oy) * sb };
    for (const L of layers) L.draw(view);
    // rectángulo relativo al centro de la cámara (para el shader)
    const r = this.rect;
    r[0] = wrapDX(ox - cam.cx);
    r[1] = oy - cam.cy;
    r[2] = bw / sb;
    r[3] = bh / sb;
  }
  inView(view, tx, ty, m = 2) {
    const x = wrapDX(tx - view.ox);
    return x > -m && x < view.bw / view.sb + m && ty > view.oy - m && ty < view.oy + view.bh / view.sb + m;
  }
}
