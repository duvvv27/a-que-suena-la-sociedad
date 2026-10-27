// Simulación de la ciudad activa: autos con semáforos y colas, peatones por las veredas.
// Solo se simula al detalle la ciudad que la cámara está mirando.
import { mulberry32 } from '../core/rng.js';
import { PITCH, ROAD, blockExists, nodeExists, hEdge, vEdge, nodeX, nodeY, BT } from './cities.js';
import { SPR } from '../render/sprites.js';

export const edgeKey = (a, b) => (a < b ? a * 100000 + b : b * 100000 + a);

export class CitySim {
  constructor() {
    this.city = null;
    this.cars = [];
    this.peds = [];
    this.blocked = new Set();
    this.blockMap = new Map(); // calles cerradas por ciudad
    this.t = 0;
  }
  setCity(c, seed) {
    this.city = c;
    this.cars.length = 0;
    this.peds.length = 0;
    if (!c) return;
    this.blocked = this.blockMap.get(c.id) || new Set();
    const rng = mulberry32(seed ^ (c.id * 977));
    this.rng = rng;
    const nW = c.bx + 1;
    this.nW = nW;
    const nodes = [];
    for (let j = 0; j <= c.by; j++) {
      for (let i = 0; i <= c.bx; i++) {
        const id = j * nW + i;
        if (!nodeExists(c, i, j)) { nodes[id] = null; continue; }
        const nb = [];
        if (i < c.bx && hEdge(c, i, j)) nb.push(id + 1);
        if (i > 0 && hEdge(c, i - 1, j)) nb.push(id - 1);
        if (j < c.by && vEdge(c, i, j)) nb.push(id + nW);
        if (j > 0 && vEdge(c, i, j - 1)) nb.push(id - nW);
        nodes[id] = { id, i, j, x: nodeX(c, i), y: nodeY(c, j), nb, off: rng() * 10 };
      }
    }
    this.nodes = nodes;
    const edges = [];
    for (const n of nodes) if (n) for (const m of n.nb) if (m > n.id) edges.push([n.id, m]);
    this.edges = edges;
    const nCars = Math.min(150, Math.round(edges.length * 0.6));
    for (let k = 0; k < nCars; k++) {
      const e = edges[(rng() * edges.length) | 0];
      if (this.blocked.has(edgeKey(e[0], e[1]))) continue;
      const fw = rng() < 0.5;
      this.cars.push({
        a: fw ? e[0] : e[1], b: fw ? e[1] : e[0], t: rng() * (PITCH - 2), v: 0,
        vmax: 3.2 + rng() * 1.6, spr: SPR.cars[(rng() * SPR.cars.length) | 0], x: 0, y: 0, dir: 'E',
      });
    }
    let nBlocks = 0;
    for (let k = 0; k < c.types.length; k++) if (c.types[k]) nBlocks++;
    const nPeds = Math.min(260, nBlocks * 3);
    for (let k = 0; k < nPeds; k++) {
      let bi, bj, tries = 0;
      do { bi = (rng() * c.bx) | 0; bj = (rng() * c.by) | 0; tries++; } while (!blockExists(c, bi, bj) && tries < 50);
      if (!blockExists(c, bi, bj)) continue;
      const type = c.types[bj * c.bx + bi];
      const wander = (type === BT.PLAZA || type === BT.PARK) && rng() < 0.6;
      const p = {
        bi, bj, c: (rng() * 4) | 0, dir: rng() < 0.5 ? 1 : -1, t: rng() * 9,
        v: 0.8 + rng() * 0.6, look: SPR.people[(rng() * SPR.people.length) | 0], dist: rng() * 4,
        cross: null, wander, wx: 0, wy: 0, wait: 0, x: 0, y: 0,
      };
      if (wander) this.newWander(p);
      this.peds.push(p);
    }
  }
  // cierra la calle entre los nodos a y b de la ciudad c
  block(c, a, b) {
    let set = this.blockMap.get(c.id);
    if (!set) this.blockMap.set(c.id, (set = new Set()));
    set.add(edgeKey(a, b));
    if (this.city === c) this.cars = this.cars.filter((car) => edgeKey(car.a, car.b) !== edgeKey(a, b));
  }
  corner(bi, bj, c) {
    const C = this.city;
    const X = C.x0 + bi * PITCH + ROAD, Y = C.y0 + bj * PITCH + ROAD;
    return [X + (c === 1 || c === 2 ? 9.5 : 0.5), Y + (c >= 2 ? 9.5 : 0.5)];
  }
  newWander(p) {
    const C = this.city;
    const X = C.x0 + p.bi * PITCH + ROAD + 1, Y = C.y0 + p.bj * PITCH + ROAD + 1;
    p.wx = X + 0.5 + this.rng() * 7;
    p.wy = Y + 0.8 + this.rng() * 7;
    if (!p.x) { p.x = X + 0.5 + this.rng() * 7; p.y = Y + 0.8 + this.rng() * 7; }
  }
  update(dt) {
    if (!this.city) return;
    this.t += dt;
    const nodes = this.nodes, P = PITCH;
    // agrupar autos por arista para respetar distancias
    const groups = new Map();
    for (const car of this.cars) {
      const k = car.a * 100000 + car.b;
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(car);
    }
    for (const g of groups.values()) g.sort((x, y) => y.t - x.t);
    for (const g of groups.values()) {
      for (let idx = 0; idx < g.length; idx++) {
        const car = g[idx];
        const A = nodes[car.a], Bn = nodes[car.b];
        if (!A || !Bn) continue;
        let limit = P + 0.5;
        if (idx > 0) limit = Math.min(limit, g[idx - 1].t - 1.5);
        const horiz = A.j === Bn.j;
        if (Bn.nb.length >= 3) {
          const green = ((this.t + Bn.off) % 10 < 5) === horiz;
          if (!green && car.t < P - 1.5) limit = Math.min(limit, P - 1.6);
        }
        const gap = limit - car.t;
        const target = gap > 2.5 ? car.vmax : Math.max(0, (gap / 2.5) * car.vmax);
        car.v += (target - car.v) * Math.min(1, dt * 3);
        car.t = Math.min(car.t + car.v * dt, Math.max(car.t, limit));
        if (car.t >= P) {
          // elegir siguiente calle (sin vuelta en U si hay opción)
          const opts = Bn.nb.filter((m) => m !== car.a && !this.blocked.has(edgeKey(Bn.id, m)));
          const nxt = opts.length ? opts[(this.rng() * opts.length) | 0] : car.a;
          car.a = Bn.id;
          car.b = nxt;
          car.t -= P;
        }
      }
    }
    for (const car of this.cars) {
      const A = nodes[car.a], Bn = nodes[car.b];
      if (!A || !Bn) continue;
      const ux = Math.sign(Bn.x - A.x), uy = Math.sign(Bn.y - A.y);
      car.x = A.x + ux * car.t + (uy > 0 ? -0.5 : uy < 0 ? 0.5 : 0);
      car.y = A.y + uy * car.t + (ux > 0 ? 0.5 : ux < 0 ? -0.5 : 0);
      car.dir = ux > 0 ? 'E' : ux < 0 ? 'W' : uy > 0 ? 'S' : 'N';
    }
    // peatones
    const C = this.city;
    for (const p of this.peds) {
      if (p.wait > 0) { p.wait -= dt; continue; }
      const step = p.v * dt;
      p.dist += step;
      if (p.wander) {
        const dx = p.wx - p.x, dy = p.wy - p.y, d = Math.hypot(dx, dy);
        if (d < 0.1) { p.wait = 1 + this.rng() * 4; this.newWander(p); }
        else { p.x += (dx / d) * Math.min(step, d); p.y += (dy / d) * Math.min(step, d); }
        continue;
      }
      if (p.cross) {
        const k = p.cross;
        k.t += step;
        const u = Math.min(1, k.t / k.len);
        p.x = k.x0 + (k.x1 - k.x0) * u;
        p.y = k.y0 + (k.y1 - k.y0) * u;
        if (u >= 1) { p.cross = null; p.bi = k.bi; p.bj = k.bj; p.c = k.c; p.t = 0; p.dir = this.rng() < 0.5 ? 1 : -1; }
        continue;
      }
      p.t += step;
      if (p.t >= 9) {
        p.t -= 9;
        p.c = (p.c + p.dir + 4) & 3;
        if (this.rng() < 0.25) {
          const opts = CROSS[p.c].filter(([di, dj]) => blockExists(C, p.bi + di, p.bj + dj));
          if (opts.length) {
            const [di, dj, nc] = opts[(this.rng() * opts.length) | 0];
            const [x0, y0] = this.corner(p.bi, p.bj, p.c), [x1, y1] = this.corner(p.bi + di, p.bj + dj, nc);
            p.cross = { x0, y0, x1, y1, t: 0, len: Math.hypot(x1 - x0, y1 - y0), bi: p.bi + di, bj: p.bj + dj, c: nc };
            continue;
          }
        }
      }
      const [x0, y0] = this.corner(p.bi, p.bj, p.c), [x1, y1] = this.corner(p.bi, p.bj, (p.c + p.dir + 4) & 3);
      const u = p.t / 9;
      p.x = x0 + (x1 - x0) * u;
      p.y = y0 + (y1 - y0) * u;
    }
  }
  draw(view) {
    if (!this.city || view.sb < 1) return;
    const { ctx, sb } = view;
    if (sb < 2) {
      // a escala de ciudad: puntos de tráfico
      for (const car of this.cars) {
        ctx.fillStyle = car.spr.col;
        ctx.fillRect(Math.round(view.X(car.x)), Math.round(view.Y(car.y)), 1, 1);
      }
      return;
    }
    const list = [];
    for (const car of this.cars) list.push(car);
    for (const p of this.peds) list.push(p);
    list.sort((a, b) => a.y - b.y);
    for (const o of list) {
      const x = view.X(o.x), y = view.Y(o.y);
      if (x < -20 || y < -20 || x > view.bw + 20 || y > view.bh + 20) continue;
      if (o.spr) {
        const s = o.spr[o.dir];
        const im = s.img(sb);
        ctx.drawImage(im, Math.round(x - im.width / 2), Math.round(y + (o.dir === 'N' || o.dir === 'S' ? im.height / 2 : sb * 0.4) - im.height));
      } else {
        const fr = o.wait > 0 ? 0 : Math.floor(o.dist * 2.5) & 1;
        const im = o.look.walk[fr].img(sb);
        ctx.drawImage(im, Math.round(x - im.width / 2), Math.round(y - im.height + sb * 0.3));
      }
    }
  }
}

// cruces posibles desde cada esquina: [di, dj, esquina destino]
const CROSS = [
  [[-1, 0, 1], [0, -1, 3]],
  [[1, 0, 0], [0, -1, 2]],
  [[1, 0, 3], [0, 1, 1]],
  [[-1, 0, 2], [0, 1, 0]],
];

