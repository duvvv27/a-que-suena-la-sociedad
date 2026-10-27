// Las 4 problemáticas como escenas vivas en la simulación, y su transformación al resolverlas.
import { mulberry32, clamp } from '../core/rng.js';
import { PITCH, ROAD, BT, blockExists, hEdge, vEdge, nodeX, nodeY, placeVillage } from './cities.js';
import { SPR } from '../render/sprites.js';
import { signBoard } from '../render/fx.js';
import { text } from '../render/font.js';

export const FIX_DUR = 4.6;
const angDist = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));

function spr(view, s, x, y, dy = 0, alpha = 1) {
  if (view.sb < 2) return;
  const im = s.img(view.sb);
  if (alpha < 1) view.ctx.globalAlpha = alpha;
  view.ctx.drawImage(im, Math.round(view.X(x) - im.width / 2), Math.round(view.Y(y) - im.height + dy));
  if (alpha < 1) view.ctx.globalAlpha = 1;
}
function dot(view, x, y, col, n = 1) {
  if (view.sb < 1) return;
  view.ctx.fillStyle = col;
  view.ctx.fillRect(Math.round(view.X(x)), Math.round(view.Y(y)), n, n);
}
function rectT(view, col, x, y, w, h) {
  const X = view.X(x), Y = view.Y(y);
  view.ctx.fillStyle = col;
  view.ctx.fillRect(Math.round(X), Math.round(Y), Math.max(1, Math.round(w * view.sb)), Math.max(1, Math.round(h * view.sb)));
}
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

class Scene {
  constructor() {
    this.state = 'problem';
    this.t = 0;
    this.ft = 0;
  }
  startFix() { this.state = 'fixing'; this.ft = 0; }
  get fixing() { return this.state !== 'problem'; }
  step(dt) {
    this.t += dt;
    if (this.state === 'fixing') { this.ft += dt; if (this.ft > FIX_DUR) this.state = 'fixed'; }
    if (this.state === 'fixed') this.ft += dt;
  }
  level() { return this.state === 'problem' ? 1 : this.state === 'fixing' ? Math.max(0.1, 1 - this.ft / 2) : 0.1; }
}

// Atasco
class TrafficScene extends Scene {
  constructor(city, rng, sim) {
    super();
    const c = city;
    this.city = c;
    const cand = [];
    for (let j = 1; j < c.by; j++) {
      for (let i0 = 0; i0 + 3 <= c.bx; i0++) {
        let ok = true;
        for (let i = i0; i < i0 + 3; i++) if (!hEdge(c, i, j)) ok = false;
        if (ok) cand.push([i0, j]);
      }
    }
    const [i0, j] = cand[(rng() * cand.length) | 0];
    const nW = c.bx + 1;
    for (let i = i0; i < i0 + 3; i++) sim.block(c, j * nW + i, j * nW + i + 1);
    this.xA = nodeX(c, i0);
    this.xB = nodeX(c, i0 + 3);
    this.yC = nodeY(c, j);
    this.x = (this.xA + this.xB) / 2;
    this.y = this.yC;
    this.r = 10;
    this.cars = [];
    const add = (x, y, dir, kind) =>
      this.cars.push({ x, y, dir, kind, k: (rng() * SPR.cars.length) | 0, honk: rng() * 2.5, hb: 0, v: 0, gone: false });
    let first = true;
    for (let x = this.xB - 2.2; x > this.xA + 1; x -= 1.45) { add(x, this.yC + 0.5, 'E', first ? 'truck' : 'car'); first = false; }
    first = true;
    for (let x = this.xA + 2.6; x < this.xB - 1; x += 1.45) { add(x, this.yC - 0.5, 'W', first ? 'bus' : 'car'); first = false; }
    for (let i = i0 + 1; i < i0 + 3; i++) {
      const nx = nodeX(c, i);
      if (vEdge(c, i, j - 1)) { add(nx - 0.5, this.yC - 2.2, 'S', 'car'); add(nx - 0.5, this.yC - 3.6, 'S', 'car'); }
      if (vEdge(c, i, j)) { add(nx + 0.5, this.yC + 2.4, 'N', 'car'); add(nx + 0.5, this.yC + 3.8, 'N', 'car'); }
    }
    this.cars.sort((a, b) => a.y - b.y);
    this.rng = rng;
  }
  update(dt, fx) {
    this.step(dt);
    for (const car of this.cars) {
      if (car.gone) continue;
      if (this.state === 'problem') {
        car.honk -= dt;
        car.hb -= dt;
        if (car.honk < 0) { car.hb = 0.55; car.honk = 0.7 + this.rng() * 2.6; }
        if (this.rng() < dt * 0.8) fx.add(car.x - (car.dir === 'E' ? 0.8 : -0.8), car.y, 0.2, 0, 0, 0.6, 1.2, '#8b9bb4');
      } else {
        car.hb = 0;
        const delay = Math.abs(car.x - (car.dir === 'E' ? this.xB : this.xA)) * 0.12;
        if (this.ft > delay) {
          car.v = Math.min(6, car.v + dt * 6);
          const s = car.v * dt;
          if (car.dir === 'E') car.x += s; else if (car.dir === 'W') car.x -= s; else if (car.dir === 'S') car.y += s; else car.y -= s;
          if (car.x > this.xB + 3 || car.x < this.xA - 3 || Math.abs(car.y - this.yC) > 7) car.gone = true;
        }
      }
    }
  }
  draw(view) {
    const { sb } = view;
    const lane = this.state === 'problem' ? 0 : clamp((this.ft - 1) / 2, 0, 1);
    if (lane > 0) {
      const L = (this.xB - this.xA - 2) * lane;
      rectT(view, '#a22633', this.xA + 1, this.yC, L, 1);
      rectT(view, '#3e8948', this.xA + 1, this.yC - 1, L, 1);
      if (sb >= 4) {
        rectT(view, '#ffffff', this.xA + 1, this.yC - 0.06, L, 0.12);
        if (sb >= 8) {
          for (let x = this.xA + 3; x < this.xA + 1 + L - 3; x += 8) {
            text(view.ctx, 'BUS', view.X(x), view.Y(this.yC + 0.15), '#ffffff', 1, 'left', null);
            const bx = Math.round(view.X(x + 2)), by = Math.round(view.Y(this.yC - 0.75));
            view.ctx.fillStyle = '#ffffff';
            view.ctx.fillRect(bx, by + 2, 1, 1); view.ctx.fillRect(bx + 4, by + 2, 1, 1);
            view.ctx.fillRect(bx + 1, by + 1, 3, 1); view.ctx.fillRect(bx + 2, by, 1, 1);
          }
        }
      }
    }
    for (const car of this.cars) {
      if (car.gone) continue;
      if (sb < 2) { dot(view, car.x, car.y, '#e43b44'); continue; }
      let s;
      if (car.kind === 'truck') s = SPR.truck;
      else if (car.kind === 'bus') s = SPR.busW;
      else s = SPR.cars[car.k][car.dir];
      const vert = car.dir === 'N' || car.dir === 'S';
      spr(view, s, car.x, car.y, vert ? s.img(sb).height / 2 : sb * 0.4);
      if (this.state === 'problem' && car.kind !== 'car' && Math.floor(this.t * 3) % 2) dot(view, car.x + (car.dir === 'E' ? 0.6 : -0.6), car.y, '#feae34', Math.max(1, sb >> 2));
      if (car.hb > 0) spr(view, SPR.bub.honk, car.x, car.y - 0.9);
    }
    if (this.state !== 'problem' && this.ft > 2.4) {
      const len = this.xB - this.xA + 4;
      const u = ((this.ft - 2.4) * 3) % len;
      if (sb >= 2) spr(view, SPR.bus, this.xA - 2 + u, this.yC + 0.5, sb * 0.4);
      else dot(view, this.xA - 2 + u, this.yC + 0.5, '#e43b44', 2);
      for (let k = 0; k < 3; k++) {
        const v = ((this.ft - 2.6) * 2.2 + k * 4.3) % len;
        if (this.ft - 2.6 - k * 0.4 > 0) spr(view, SPR.cyclists[k], this.xB + 2 - v, this.yC - 0.5, sb * 0.35);
      }
    }
  }
}

// Obra ruidosa
class WorksScene extends Scene {
  constructor(city, rng) {
    super();
    const c = city;
    this.city = c;
    const cand = [];
    for (let bj = 0; bj < c.by; bj++) {
      for (let bi = 0; bi < c.bx; bi++) {
        const t = c.types[bj * c.bx + bi];
        if ((t === BT.APTS || t === BT.HOUSES || t === BT.DOWNTOWN) && hEdge(c, bi, bj + 1) && blockExists(c, bi, bj - 1)) cand.push([bi, bj]);
      }
    }
    if (!cand.length) for (let k = 0; k < c.types.length; k++) if (c.types[k] && c.types[k] !== BT.PLAZA) cand.push([k % c.bx, (k / c.bx) | 0]);
    const [bi, bj] = cand[(rng() * cand.length) | 0];
    const k = bj * c.bx + bi;
    c.types[k] = BT.WORKS;
    c.blockCache.delete(k);
    const ix = c.x0 + bi * PITCH + ROAD + 1, iy = c.y0 + bj * PITCH + ROAD + 1;
    this.ix = ix; this.iy = iy;
    this.x = ix + 4; this.y = iy + 4; this.r = 10;
    this.roadY = nodeY(c, bj + 1);
    this.workers = [[ix + 1.4, iy + 2.6], [ix + 3.4, iy + 1.7], [ix + 6.5, iy + 3.2]];
    const P = SPR.people;
    this.residents = [
      [ix - 2.5, iy + 2.2], [ix + 9.6, iy + 5.5], [ix + 2.5, iy - 1.6], [ix + 6, iy - 1.6], [ix - 2.4, iy + 6.5],
    ].map(([x, y], n) => ({ x, y, look: P[(n * 7 + 3) % P.length], ph: rng() * 3 }));
    this.hedges = [];
    for (let x = ix + 0.6; x < ix + 8; x += 1.5) { this.hedges.push([x, iy + 0.5]); this.hedges.push([x, iy + 8.1]); }
    for (let y = iy + 2; y < iy + 7.5; y += 1.6) { this.hedges.push([ix + 0.3, y]); this.hedges.push([ix + 7.7, y]); }
    this.hedges.sort((a, b) => a[1] - b[1]);
    this.ambX = ix + 3;
  }
  update(dt, fx) {
    this.step(dt);
    const hammer = this.state === 'problem' ? 1 : 0.15;
    for (const [x, y] of this.workers.slice(0, 2)) {
      if (Math.random() < dt * 25 * hammer) fx.add(x + 0.3, y, 0.1, (Math.random() - 0.5) * 2, (Math.random() - 0.5), 1.5 + Math.random(), 0.7, Math.random() < 0.5 ? '#c28569' : '#ead4aa', 4);
    }
    if (this.state === 'problem' && Math.random() < dt * 3) fx.add(this.x - 1.2, this.y + 2.6, 0.5, -0.4, -0.2, 0.8, 1.6, '#5a6988');
    if (this.state !== 'problem' && this.ft > 0.6) this.ambX += dt * Math.min(6, (this.ft - 0.6) * 4);
  }
  draw(view) {
    const { ctx, sb } = view;
    const { ix, iy } = this;
    const fixed = this.state !== 'problem';
    if (sb < 2) {
      dot(view, this.x, this.y, '#feae34', 2);
      dot(view, this.x + 2, this.y - 1, '#fee761');
      return;
    }
    for (let x = ix; x < ix + 8; x += 0.5) {
      const col = Math.floor((x - ix) * 2) % 2 ? '#ffffff' : '#f77622';
      rectT(view, col, x, iy, 0.5, 0.18);
      rectT(view, col, x, iy + 7.82, 0.5, 0.18);
    }
    for (let y = iy; y < iy + 8; y += 0.5) {
      const col = Math.floor((y - iy) * 2) % 2 ? '#ffffff' : '#f77622';
      rectT(view, col, ix, y, 0.18, 0.5);
      rectT(view, col, ix + 7.82, y, 0.18, 0.5);
    }
    const ex = ix + 3 + Math.sin(this.t * (fixed ? 0.3 : 0.7)) * 1.3;
    spr(view, Math.cos(this.t * 0.7) > 0 ? SPR.excavator : SPR.excavatorW, ex, iy + 7.4);
    spr(view, SPR.dump, ix + 5.6, iy + 4.4);
    this.workers.forEach(([x, y], n) => {
      const shake = !fixed && n < 2 && Math.floor(this.t * 20) % 2 ? 1 : 0;
      spr(view, SPR.worker.walk[0], x, y, -shake);
      if (n < 2 && sb >= 4) rectT(view, '#3a4466', x + 0.25, y - 0.3, 0.15, 0.35);
    });
    this.drawCrane(view, ix + 6.4, iy + 6.6);
    if (this.ambX < ix + 16) {
      const s = SPR.amb[Math.floor(this.t * 6) % 2];
      spr(view, s, this.ambX, this.roadY + 0.5, sb * 0.4);
    }
    // vecinos molestos o tranquilos
    for (const r of this.residents) {
      if (!fixed) {
        spr(view, r.look.up, r.x, r.y);
        if (Math.floor(this.t * 1.5 + r.ph) % 3 === 0) spr(view, SPR.bub.ear, r.x, r.y - 1.1);
      } else spr(view, r.look.walk[0], r.x, r.y);
    }
    // arreglo: barrera verde + cartel de horario
    if (fixed) {
      const n = this.hedges.length;
      this.hedges.forEach(([x, y], i) => {
        const appear = clamp((this.ft - 0.4) * 1.4 - (i / n) * 2.2, 0, 1);
        if (appear <= 0) return;
        spr(view, appear < 0.5 ? SPR.sapling : SPR.trees[i % 2 ? 0 : 2][i % 3], x, y);
      });
      if (this.ft > 2.2) signBoard(view, ix + 4, iy + 9.05, 'OBRAS 8-18 h');
    }
    ctx.globalAlpha = 1;
  }
  drawCrane(view, x, y) {
    const { ctx, sb } = view;
    const X = Math.round(view.X(x)), Y = Math.round(view.Y(y));
    const H = Math.round(9.5 * sb), w = Math.max(2, Math.round(sb * 0.5));
    ctx.fillStyle = '#d77643';
    ctx.fillRect(X - w, Y - 2, w * 2 + 1, 2);
    ctx.fillStyle = '#feae34';
    ctx.fillRect(X - (w >> 1), Y - H, w, H);
    if (sb >= 8) {
      ctx.fillStyle = '#d77643';
      for (let k = 0; k < H; k += 4) ctx.fillRect(X - (w >> 1) + ((k >> 2) % 2 ? 0 : w - 1), Y - H + k, 1, 4);
    }
    const swing = Math.sin(this.t * (this.fixing ? 0.25 : 0.5));
    const jl = Math.round(7 * sb * swing), cj = Math.round(-2.5 * sb * swing);
    ctx.fillStyle = '#feae34';
    const top = Y - H - Math.max(1, sb >> 2);
    ctx.fillRect(Math.min(X, X + jl), top, Math.abs(jl) + 1, Math.max(1, sb >> 2));
    ctx.fillRect(Math.min(X, X + cj), top, Math.abs(cj) + 1, Math.max(1, sb >> 2));
    ctx.fillStyle = '#5a6988';
    ctx.fillRect(Math.min(X, X + cj) - (cj < 0 ? 2 : 0), top, 3, Math.max(2, sb >> 1));
    ctx.fillStyle = '#3a4466';
    const hx = X + Math.round(jl * 0.8), cable = Math.round(sb * (4 + Math.sin(this.t * 0.8) * 1.5));
    ctx.fillRect(hx, top, 1, cable);
    ctx.fillStyle = '#e43b44';
    ctx.fillRect(hx - 1, top + cable, 3, 2);
  }
}

// Marcha
class ProtestScene extends Scene {
  constructor(city, rng, sim) {
    super();
    const c = city;
    this.city = c;
    let bi = 0, bj = 0;
    for (let k = 0; k < c.types.length; k++) if (c.types[k] === BT.PLAZA) { bi = k % c.bx; bj = (k / c.bx) | 0; }
    const nW = c.bx + 1, id = (i, j) => j * nW + i;
    sim.block(c, id(bi, bj), id(bi + 1, bj));
    sim.block(c, id(bi, bj + 1), id(bi + 1, bj + 1));
    sim.block(c, id(bi, bj), id(bi, bj + 1));
    sim.block(c, id(bi + 1, bj), id(bi + 1, bj + 1));
    this.L = nodeX(c, bi); this.R = nodeX(c, bi + 1);
    this.T = nodeY(c, bj); this.B = nodeY(c, bj + 1);
    this.ix = c.x0 + bi * PITCH + ROAD + 1; this.iy = c.y0 + bj * PITCH + ROAD + 1;
    this.x = (this.L + this.R) / 2; this.y = (this.T + this.B) / 2; this.r = 10;
    this.per = 4 * PITCH;
    const P = SPR.people;
    this.crowd = [];
    const n = 46;
    const seats = [];
    for (const [tx, ty] of [[2, 1.6], [6, 1.6], [2, 6.8], [6, 6.8]]) {
      for (let s = 0; s < 12; s++) {
        const a = (s / 12) * Math.PI * 2;
        seats.push([this.ix + tx + Math.cos(a) * 1.55, this.iy + ty + 0.3 + Math.sin(a) * 1.0]);
      }
    }
    this.tables = [[2, 1.6], [6, 1.6], [2, 6.8], [6, 6.8]].map(([tx, ty]) => [this.ix + tx, this.iy + ty + 0.6]);
    for (let k = 0; k < n; k++) {
      this.crowd.push({
        s: (k / n) * this.per * 0.8 + rng() * 1.2, lat: (rng() - 0.5) * 1.6,
        look: P[(rng() * P.length) | 0], sign: rng() < 0.5 ? SPR.placards[(rng() * SPR.placards.length) | 0] : null,
        drum: k % 15 === 4, bub: 0, ph: rng() * 6, seat: seats[k % seats.length], x: 0, y: 0, x0: 0, y0: 0,
      });
    }
    this.rng = rng;
  }
  loop(s, lat) {
    const S = PITCH;
    s = ((s % this.per) + this.per) % this.per;
    if (s < S) return [this.L + s, this.T + lat];
    if (s < 2 * S) return [this.R + lat, this.T + (s - S)];
    if (s < 3 * S) return [this.R - (s - 2 * S), this.B + lat];
    return [this.L + lat, this.B - (s - 3 * S)];
  }
  update(dt, fx) {
    this.step(dt);
    for (const p of this.crowd) {
      if (this.state === 'problem') {
        p.s += dt * 0.55;
        [p.x, p.y] = this.loop(p.s, p.lat);
        p.x0 = p.x; p.y0 = p.y;
        p.bub -= dt;
        if (this.rng() < dt * 0.25) p.bub = 0.7;
      } else {
        const u = ease(clamp(this.ft / 3.2, 0, 1));
        p.x = p.x0 + (p.seat[0] - p.x0) * u;
        p.y = p.y0 + (p.seat[1] - p.y0) * u;
        p.bub -= dt;
        if (u >= 1 && this.rng() < dt * 0.15) p.bub = 1.2;
      }
    }
    if (this.state === 'problem' && this.rng() < dt * 14) {
      const p = this.crowd[(this.rng() * this.crowd.length) | 0];
      const cols = ['#fee761', '#2ce8f5', '#f6757a', '#63c74d', '#ffffff'];
      fx.add(p.x, p.y, 2.5, (this.rng() - 0.5) * 1.5, (this.rng() - 0.5) * 1.5, 0.6, 1.8, cols[(this.rng() * cols.length) | 0], 1.2);
    }
  }
  draw(view) {
    const { sb } = view;
    const fixed = this.state !== 'problem';
    if (fixed && this.ft > 1.2) {
      for (const [x, y] of this.tables) spr(view, SPR.table, x, y);
    }
    const list = [...this.crowd].sort((a, b) => a.y - b.y);
    for (const p of list) {
      if (sb < 2) { dot(view, p.x, p.y, p.look.col.a); continue; }
      const seated = fixed && this.ft > 3.2;
      let s;
      if (seated) s = p.look.sit;
      else if (p.drum && !fixed && Math.floor(this.t * 4 + p.ph) % 2) s = p.look.up;
      else s = p.look.walk[Math.floor(this.t * 3 + p.ph) & 1];
      spr(view, s, p.x, p.y);
      if (p.sign && !fixed) spr(view, p.sign, p.x, p.y - 0.9, (Math.floor(this.t * 3 + p.ph) & 1) * (sb >> 3));
      if (p.bub > 0) spr(view, fixed ? SPR.bub.talk : SPR.bub.note, p.x, p.y - (p.sign && !fixed ? 1.6 : 1.0));
    }
    if (!fixed && sb >= 4) {
      // pancarta delantera
      const lead = this.crowd.reduce((a, b) => (b.s > a.s ? b : a));
      const [bx, by] = this.loop(lead.s + 0.8, 0);
      const X = Math.round(view.X(bx)), Y = Math.round(view.Y(by) - sb * 1.5);
      const w = sb >= 8 ? 64 : 24;
      view.ctx.fillStyle = '#181425';
      view.ctx.fillRect(X - (w >> 1) - 1, Y - 1, w + 2, sb >= 8 ? 11 : 5);
      view.ctx.fillStyle = '#ffffff';
      view.ctx.fillRect(X - (w >> 1), Y, w, sb >= 8 ? 9 : 3);
      if (sb >= 8) text(view.ctx, 'VIVIENDA DIGNA', X, Y + 1, '#e43b44', 1, 'center', null);
    }
    if (fixed && this.ft > 2) signBoard(view, this.x, this.iy + 0.1, 'CABILDO ABIERTO', '#fee761', '#181425');
  }
}

// Tala
class ForestScene extends Scene {
  constructor(vil, rng) {
    super();
    this.vil = vil;
    const cut = vil.cut;
    this.x = cut.x; this.y = cut.y; this.r = 11;
    this.stumps = [];
    for (let k = 0; k < 400 && this.stumps.length < 46; k++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * (cut.r - 1);
      const x = cut.x + Math.cos(a) * rr, y = cut.y + Math.sin(a) * rr;
      if (this.stumps.some((s) => Math.hypot(s[0] - x, s[1] - y) < 1.35)) continue;
      this.stumps.push([x, y, (rng() * 3) | 0]);
    }
    this.stumps.sort((a, b) => a[1] - b[1]);
    this.fellers = [0.4, 2.0, 3.9, 5.2].map((a) => ({
      a, tx: cut.x + Math.cos(a) * (cut.r + 1.2), ty: cut.y + Math.sin(a) * (cut.r + 1.2) * 0.8,
      lx: cut.x + Math.cos(a) * (cut.r - 0.2), ly: cut.y + Math.sin(a) * (cut.r - 0.2) * 0.8,
      ph: rng() * 6,
    }));
    this.logs = [[0, 0], [0.4, 0.5], [-0.3, 1], [0.2, 1.5]].map(([dx, dy]) => [cut.x - 5 + dx, cut.y + 7 + dy]);
    this.villagers = [0, 1, 2, 3, 4, 5].map((k) => ({ look: SPR.people[(k * 5 + 1) % SPR.people.length], a: k, r: 3 + (k % 3) }));
    this.planters = [0, 1, 2, 3, 4, 5, 6].map((k) => ({ look: SPR.planter[k % 3], a: rng() * 6, r: 2 + rng() * 6, sp: 0.15 + rng() * 0.2 }));
    this.road = vil.road;
    this.birds = [];
    for (let k = 0; k < 7; k++) this.birds.push({ x: cut.x, y: cut.y, a: rng() * 6.28, d: rng() * 10, z: 2 + rng() * 2 });
    this.rng = rng;
  }
  update(dt, fx) {
    this.step(dt);
    if (this.state === 'problem') {
      for (const f of this.fellers) {
        const cyc = (this.t + f.ph) % 7;
        if (cyc < 3.5 && this.rng() < dt * 30) fx.add(f.lx + 0.4, f.ly, 0.3, (this.rng() - 0.5) * 2, (this.rng() - 0.5), 1.2, 0.6, '#ead4aa', 4);
        if (cyc > 3.5 && cyc < 3.55) for (let k = 0; k < 14; k++) fx.add(f.tx, f.ty, 1.5, (this.rng() - 0.5) * 3, (this.rng() - 0.5) * 2, 1, 1.5, k % 2 ? '#3e8948' : '#63c74d', 2);
      }
    }
    for (const b of this.birds) {
      if (this.state === 'problem') {
        b.d += dt * 4;
        if (b.d > 26) { b.d = 0; b.a = this.rng() * 6.28; }
        b.x = this.x + Math.cos(b.a) * b.d;
        b.y = this.y + Math.sin(b.a) * b.d * 0.7;
      } else {
        b.a += dt * 0.6;
        b.x = this.x + Math.cos(b.a) * (4 + b.z);
        b.y = this.y + Math.sin(b.a) * (3 + b.z) * 0.6;
      }
    }
  }
  draw(view) {
    const { sb } = view;
    const fixed = this.state !== 'problem';
    const n = this.stumps.length;
    // tocones o reforestación
    this.stumps.forEach(([x, y, v], i) => {
      if (!fixed) { if (sb < 2) dot(view, x, y, '#b86f50'); else spr(view, SPR.stump, x, y); return; }
      const g = (this.ft - 0.3) * 1.2 - (i / n) * 2;
      if (g <= 0) { if (sb < 2) dot(view, x, y, '#b86f50'); else spr(view, SPR.stump, x, y); return; }
      if (sb < 2) { dot(view, x, y, '#3e8948'); return; }
      spr(view, g < 0.6 ? SPR.sapling : g < 1.4 ? SPR.bush : SPR.trees[v === 1 ? 2 : 0][v], x, y);
    });
    if (!fixed) {
      for (const [x, y] of this.logs) spr(view, SPR.log, x, y);
      for (const f of this.fellers) {
        const cyc = (this.t + f.ph) % 7;
        if (cyc < 3.5) {
          const sh = Math.floor(this.t * 16) % 2 && cyc > 1 ? 1 : 0;
          spr(view, SPR.trees[2][1], f.tx + (sh ? 0.06 : 0), f.ty);
        } else if (cyc < 6) spr(view, SPR.log, f.tx, f.ty);
        const buzz = cyc < 3.5 && Math.floor(this.t * 20) % 2 ? 1 : 0;
        spr(view, SPR.logger.walk[0], f.lx, f.ly, -buzz);
        if (sb >= 4) { rectT(view, '#5a6988', f.lx + 0.3, f.ly - 0.45, 0.45, 0.2); rectT(view, '#f77622', f.lx + 0.3, f.ly - 0.55, 0.2, 0.15); }
      }
      if (this.road) {
        const dx = this.road.bx - this.road.ax, dy = this.road.by - this.road.ay, L = Math.hypot(dx, dy);
        for (let k = 0; k < 2; k++) {
          const d = (this.t * 3 + k * 16) % 34;
          const x = this.road.ax + (dx / L) * d, y = this.road.ay + (dy / L) * d;
          if (sb < 2) dot(view, x, y, '#3e8948', 2);
          else spr(view, dx > 0 ? SPR.logTruck : SPR.logTruckW, x, y, sb * 0.4);
        }
      }
    } else {
      for (const p of this.planters) {
        const a = p.a + this.ft * p.sp;
        const x = this.x + Math.cos(a) * p.r, y = this.y + Math.sin(a) * p.r * 0.7;
        if (sb < 2) dot(view, x, y, '#fee761');
        else spr(view, p.look.walk[Math.floor(this.ft * 3 + p.a) & 1], x, y, 0, clamp(this.ft - 0.5, 0, 1));
      }
      if (this.ft > 2.2) signBoard(view, this.x - 2, this.y + this.vil.cut.r * 0.8 + 0.5, 'TERRITORIO PROTEGIDO', '#63c74d', '#181425');
    }
    const v = this.vil.village;
    for (const p of this.villagers) {
      const a = p.a + this.t * 0.2;
      const x = v.x + Math.cos(a) * p.r, y = v.y + Math.sin(a) * p.r * 0.6;
      if (sb < 2) dot(view, x, y, p.look.col.a);
      else spr(view, p.look.walk[Math.floor(this.t * 3 + p.a) & 1], x, y);
    }
    if (sb >= 2) {
      for (const b of this.birds) {
        const im = SPR.bird[Math.floor(this.t * 8 + b.a) & 1].img(sb);
        view.ctx.drawImage(im, Math.round(view.X(b.x)), Math.round(view.Y(b.y - b.z)));
      }
    }
  }
}

// Elección de lugares
export function createScenes(world, sim, seed) {
  const rng = mulberry32(seed ^ 0x5ce4e);
  const cities = world.cities;
  const hasChain = (c) => {
    for (let j = 1; j < c.by; j++) for (let i0 = 0; i0 + 3 <= c.bx; i0++) if (hEdge(c, i0, j) && hEdge(c, i0 + 1, j) && hEdge(c, i0 + 2, j)) return true;
    return false;
  };
  const hasPlaza = (c) => c.types.some((t) => t === BT.PLAZA);
  const A = cities.find(hasChain);
  const Bc = cities
    .filter((c) => c !== A && c.rank < 30 && hasPlaza(c))
    .sort((x, y) => angDist(y.v, A.v) - angDist(x.v, A.v));
  const B = Bc[Math.min(Bc.length - 1, Math.floor(rng() * 3))];
  let C = cities.find((c) => c.capital && c.country === B.country && c !== B && c !== A && hasPlaza(c) && angDist(c.v, B.v) > 0.15);
  if (!C) {
    C = cities
      .filter((c) => c.capital && c !== A && c !== B && hasPlaza(c) && angDist(c.v, B.v) > 0.25 && angDist(c.v, A.v) > 0.4)
      .sort((x, y) => angDist(x.v, B.v) - angDist(y.v, B.v))[0] || cities.find((c) => c !== A && c !== B && hasPlaza(c));
  }
  A.name = 'Nova Aurora';
  B.name = 'Puerto Ceniza';
  C.name = 'Ciudad Solana';
  const vil = placeVillage(world.planet, cities, [C.v, A.v, B.v], seed);
  vil.name = 'Comunidad Wayra';
  world.village = vil;
  if (vil.road) world.roads.push(vil.road);
  return [
    new TrafficScene(A, rng, sim),
    new WorksScene(B, rng),
    new ProtestScene(C, rng, sim),
    new ForestScene(vil, rng),
  ];
}

export { angDist };
