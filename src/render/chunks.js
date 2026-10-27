// Caché LRU de chunks del suelo por nivel de detalle, con generación repartida entre cuadros.
import { paintChunk, CHUNK_PX } from './paint.js';
import { WT, HT } from '../world/planet.js';

export const LODS = [0.5, 1, 2, 4, 8];

export class ChunkCache {
  constructor(world) {
    this.world = world;
    this.map = new Map();
    this.pending = new Map();
    this.pool = [];
    this.max = 360;
    this.frame = 0;
    this.light = null;
    this.generatedThisFrame = 0;
  }
  setLight(light) {
    this.light = light;
    this.clear();
  }
  clear() {
    for (const e of this.map.values()) this.pool.push(e.cv);
    this.map.clear();
    this.pending.clear();
  }
  key(lod, cx, cy) { return lod * 100000000 + cy * 100000 + cx; }
  // cx ya envuelto
  get(lod, cx, cy, prio) {
    const k = this.key(lod, cx, cy);
    const e = this.map.get(k);
    if (e) { e.used = this.frame; return e.cv; }
    const pr = this.pending.get(k);
    if (!pr || pr.prio > prio) this.pending.set(k, { lod, cx, cy, prio, k });
    return null;
  }
  peek(lod, cx, cy) {
    const e = this.map.get(this.key(lod, cx, cy));
    if (e) e.used = this.frame;
    return e ? e.cv : null;
  }
  process(budgetMs) {
    this.generatedThisFrame = 0;
    if (!this.pending.size) return 0;
    const t0 = performance.now();
    const list = [...this.pending.values()].sort((a, b) => a.prio - b.prio);
    this.pending.clear();
    let n = 0;
    for (const job of list) {
      if (performance.now() - t0 > budgetMs && n > 0) break;
      this.generate(job);
      n++;
    }
    this.generatedThisFrame = n;
    this.evict();
    return n;
  }
  generate({ lod, cx, cy, k }) {
    const cv = this.pool.pop() || document.createElement('canvas');
    cv.width = cv.height = CHUNK_PX;
    const ct = CHUNK_PX / lod;
    paintChunk(cv, this.world, lod, cx * ct, cy * ct, this.light);
    this.map.set(k, { cv, used: this.frame });
  }
  evict() {
    if (this.map.size <= this.max) return;
    const arr = [...this.map.entries()].sort((a, b) => a[1].used - b[1].used);
    const n = this.map.size - this.max;
    for (let i = 0; i < n; i++) {
      this.pool.push(arr[i][1].cv);
      this.map.delete(arr[i][0]);
    }
  }
  static counts(lod) {
    const ct = CHUNK_PX / lod;
    return [Math.round(WT / ct), Math.round(HT / ct)];
  }
}
