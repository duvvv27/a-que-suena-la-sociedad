// Ciudades: ubicación en el planeta, cuadrícula de manzanas, edificios (módulos plantilla) y carreteras.
import { mulberry32, ihash, clamp } from '../core/rng.js';
import { CW, CH, CELL, WT, B, cellVec, cellAt, makeName, wrapDX } from './planet.js';

export const PITCH = 12; // distancia entre calles (tiles)
export const ROAD = 2;   // ancho de calle (tiles)
export const BT = { NONE: 0, HOUSES: 1, APTS: 2, DOWNTOWN: 3, PARK: 4, PLAZA: 5, INDUSTRY: 6, CIVIC: 7, WORKS: 8 };

const pick = (rng, arr) => arr[(rng() * arr.length) | 0];
const HOUSE_ROOF = ['#be4a2f', '#a22633', '#733e39', '#124e89', '#3e8948', '#5a6988', '#d77643'];
const HOUSE_WALL = ['#ead4aa', '#e4a672', '#ffffff', '#e8b796', '#c0cbdc', '#f6757a', '#fee761'];
const APT_ROOF = ['#8b9bb4', '#5a6988', '#c0cbdc', '#b86f50', '#733e39'];
const APT_WALL = ['#c0cbdc', '#e4a672', '#ead4aa', '#d77643', '#8b9bb4', '#e8b796', '#b55088'];
const TOWER_ROOF = ['#5a6988', '#3a4466', '#8b9bb4', '#262b44'];
const TOWER_WALL = ['#3a4466', '#5a6988', '#262b44', '#124e89', '#8b9bb4'];

export function blockExists(c, i, j) {
  return i >= 0 && j >= 0 && i < c.bx && j < c.by && c.types[j * c.bx + i] !== 0;
}
export function nodeExists(c, i, j) {
  return blockExists(c, i - 1, j - 1) || blockExists(c, i, j - 1) || blockExists(c, i - 1, j) || blockExists(c, i, j);
}
// calle horizontal entre nodos (i,j) y (i+1,j)
export function hEdge(c, i, j) {
  return blockExists(c, i, j - 1) || blockExists(c, i, j);
}
// calle vertical entre nodos (i,j) y (i,j+1)
export function vEdge(c, i, j) {
  return blockExists(c, i - 1, j) || blockExists(c, i, j);
}
export const nodeX = (c, i) => c.x0 + i * PITCH + 1;
export const nodeY = (c, j) => c.y0 + j * PITCH + 1;

function makeCity(pl, cand, rank, rng, seed, id) {
  const big = rank < 7, med = rank < 22;
  const bx = big ? 9 + ((rng() * 3) | 0) : med ? 7 + ((rng() * 2) | 0) : 5 + ((rng() * 2) | 0);
  const by = big ? 7 + ((rng() * 2) | 0) : med ? 5 + ((rng() * 2) | 0) : 4 + ((rng() * 2) | 0);
  const w = bx * PITCH + ROAD, h = by * PITCH + ROAD;
  const ccx = cand.i * CELL + CELL / 2, ccy = cand.j * CELL + CELL / 2;
  const x0 = Math.round((ccx - w / 2) / PITCH) * PITCH;
  const y0 = Math.round((ccy - h / 2) / PITCH) * PITCH;
  if (x0 < 0 || x0 + w >= WT - 2) return null;

  const ok = new Uint8Array(bx * by);
  const cbi = bx >> 1, cbj = by >> 1;
  for (let bj = 0; bj < by; bj++) {
    for (let bi = 0; bi < bx; bi++) {
      const nx = ((bi + 0.5) / bx) * 2 - 1, ny = ((bj + 0.5) / by) * 2 - 1;
      const d = Math.hypot(nx, ny);
      let e = d + (ihash(bi, bj, cand.i, seed) - 0.5) * 0.6 < 1.05 || (Math.abs(bi - cbi) <= 1 && Math.abs(bj - cbj) <= 1);
      const tx = x0 + bi * PITCH + ROAD, ty = y0 + bj * PITCH + ROAD;
      for (const [ox, oy] of [[5, 5], [0, 0], [10, 0], [0, 10], [10, 10]]) {
        const cid = cellAt(tx + ox, ty + oy);
        const b = pl.biome[cid];
        if (!pl.land[cid] || pl.river[cid] || b === B.MOUNTAIN || b === B.PEAK || b === B.ICE) { e = false; break; }
      }
      ok[bj * bx + bi] = e ? 1 : 0;
    }
  }
  // conectividad desde el centro
  let start = -1;
  if (ok[cbj * bx + cbi]) start = cbj * bx + cbi;
  else for (let k = 0; k < ok.length; k++) if (ok[k]) { start = k; break; }
  if (start < 0) return null;
  const seen = new Uint8Array(bx * by);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const k = stack.pop();
    count++;
    const i = k % bx, j = (k / bx) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + dx, nj = j + dy;
      if (ni < 0 || nj < 0 || ni >= bx || nj >= by) continue;
      const nk = nj * bx + ni;
      if (ok[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
    }
  }
  if (count < bx * by * 0.45 || count < 12) return null;

  const types = new Uint8Array(bx * by);
  const plazaK = start;
  for (let k = 0; k < types.length; k++) {
    if (!seen[k]) continue;
    const i = k % bx, j = (k / bx) | 0;
    const r = Math.hypot(((i + 0.5) / bx) * 2 - 1, ((j + 0.5) / by) * 2 - 1);
    const q = rng();
    let t;
    if (k === plazaK) t = BT.PLAZA;
    else if (r < 0.34 && big) t = q < 0.14 ? BT.CIVIC : BT.DOWNTOWN;
    else if (r < 0.34) t = q < 0.2 ? BT.CIVIC : q < 0.3 ? BT.PARK : BT.APTS;
    else if (r < 0.66) t = q < 0.13 ? BT.PARK : q < 0.2 ? BT.CIVIC : q < 0.4 && big ? BT.DOWNTOWN : BT.APTS;
    else t = q < 0.1 ? BT.PARK : q < 0.22 && (big || med) ? BT.INDUSTRY : BT.HOUSES;
    types[k] = t;
  }

  let name = makeName(rng);
  const nq = rng();
  if (nq < 0.2) name = 'Puerto ' + name;
  else if (nq < 0.33) name = 'San ' + name;
  else if (nq < 0.42) name = name + ' del Sur';
  const cid = cellAt(ccx, ccy);
  return {
    id, name, rank, x0, y0, bx, by, w, h,
    cx: x0 + w / 2, cy: y0 + h / 2,
    seed: (seed * 31 + cand.i * 7 + cand.j * 13) >>> 0,
    types, country: pl.country[cid], capital: false,
    v: cellVec(cand.i, cand.j), score: cand.score,
    blockCache: new Map(),
  };
}

export function placeCities(pl, seed) {
  const rng = mulberry32(seed ^ 0xc17e5);
  const cands = [];
  for (let k = 0; k < 9000; k++) {
    const i = (rng() * CW) | 0, j = (CH * 0.2 + rng() * CH * 0.6) | 0;
    const id = j * CW + i;
    const b = pl.biome[id];
    if (!pl.land[id] || pl.river[id] || b === B.ICE || b === B.SNOW || b === B.PEAK || b === B.MOUNTAIN || b === B.TUNDRA) continue;
    if (b === B.DESERT && rng() < 0.7) continue;
    let coast = 0, riv = 0;
    for (let dj = -3; dj <= 3; dj++) {
      for (let di = -3; di <= 3; di++) {
        const nid = clamp(j + dj, 0, CH - 1) * CW + ((i + di + CW) % CW);
        if (!pl.land[nid]) coast = 1;
        if (pl.river[nid]) riv = 1;
      }
    }
    cands.push({ i, j, score: pl.moist[id] * 0.6 + coast * 0.45 + riv * 0.35 + rng() * 0.35 });
  }
  cands.sort((a, b) => b.score - a.score);

  const cities = [];
  const minDot = Math.cos(0.16);
  for (const c of cands) {
    if (cities.length >= 48) break;
    const v = cellVec(c.i, c.j);
    if (cities.some((o) => o.v[0] * v[0] + o.v[1] * v[1] + o.v[2] * v[2] > minDot)) continue;
    const city = makeCity(pl, c, cities.length, rng, seed, cities.length);
    if (city) cities.push(city);
  }
  for (const co of pl.countries) {
    let best = null;
    for (const c of cities) if (c.country === co.id && (!best || c.rank < best.rank)) best = c;
    if (best) { best.capital = true; co.capital = best; }
  }
  // huella urbana para el globo
  for (const c of cities) markUrban(pl, c);

  // carreteras entre ciudades cercanas
  const roads = [];
  const linked = new Set();
  for (const a of cities) {
    const near = cities
      .filter((b) => b !== a)
      .map((b) => ({ b, d: a.v[0] * b.v[0] + a.v[1] * b.v[1] + a.v[2] * b.v[2] }))
      .filter((o) => o.d > Math.cos(0.45))
      .sort((x, y) => y.d - x.d)
      .slice(0, 2);
    for (const { b } of near) {
      const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
      if (linked.has(key)) continue;
      const bxx = a.cx + wrapDX(b.cx - a.cx);
      let landN = 0;
      for (let s = 0; s <= 24; s++) {
        const t = s / 24;
        const cid = cellAt(a.cx + (bxx - a.cx) * t, a.cy + (b.cy - a.cy) * t);
        if (pl.land[cid]) landN++;
      }
      if (landN < 20) continue;
      linked.add(key);
      roads.push({ ax: a.cx, ay: a.cy, bx: bxx, by: b.cy, kind: 'hwy' });
    }
  }
  return { cities, roads };
}

function markUrban(pl, c) {
  for (let bj = 0; bj < c.by; bj++) {
    for (let bi = 0; bi < c.bx; bi++) {
      if (!c.types[bj * c.bx + bi]) continue;
      const x = c.x0 + bi * PITCH, y = c.y0 + bj * PITCH;
      for (let ty = y; ty < y + PITCH + ROAD; ty += CELL / 2) {
        for (let tx = x; tx < x + PITCH + ROAD; tx += CELL / 2) pl.urban[cellAt(tx, ty)] = 1;
      }
    }
  }
}

// Comunidad en el bosque (escenario 4): lejos de las ciudades, rodeada de bosque.
export function placeVillage(pl, cities, avoid, seed) {
  const rng = mulberry32(seed ^ 0xf0e57);
  let best = null;
  for (let tries = 0; tries < 6000; tries++) {
    const i = (4 + rng() * (CW - 8)) | 0, j = (CH * 0.28 + rng() * CH * 0.44) | 0;
    let good = 0;
    for (let dj = -3; dj <= 3; dj++) {
      for (let di = -3; di <= 3; di++) {
        const b = pl.biome[(j + dj) * CW + i + di];
        if ((b === B.FOREST || b === B.JUNGLE || b === B.TAIGA) && !pl.river[(j + dj) * CW + i + di]) good++;
      }
    }
    if (good < 49) continue;
    const v = cellVec(i, j);
    let minD = 9;
    for (const c of cities) minD = Math.min(minD, Math.acos(clamp(c.v[0] * v[0] + c.v[1] * v[1] + c.v[2] * v[2], -1, 1)));
    let far = 9;
    for (const a of avoid) far = Math.min(far, Math.acos(clamp(a[0] * v[0] + a[1] * v[1] + a[2] * v[2], -1, 1)));
    if (minD < 0.08) continue;
    const score = Math.min(far, 1.4) + Math.min(minD, 0.3) + rng() * 0.2;
    if (!best || score > best.score) best = { i, j, v, score, minD };
  }
  if (!best) return null;
  const x = best.i * CELL + 4, y = best.j * CELL + 4;
  // vecino más cercano para el camino de tierra
  let near = null, nd = -2;
  for (const c of cities) {
    const d = c.v[0] * best.v[0] + c.v[1] * best.v[1] + c.v[2] * best.v[2];
    if (d > nd) { nd = d; near = c; }
  }
  return {
    x, y, v: best.v,
    huts: [[-5, -3], [-1, -6], [3, -4], [-6, 2], [-2, 4], [2, 1]].map(([dx, dy]) => [x + dx - 12, y + dy]),
    village: { x: x - 12, y, r: 8 },
    cut: { x: x + 6, y: y + 1, r: 9 },
    road: near ? { ax: x - 12, ay: y, bx: x - 12 + wrapDX(near.cx - (x - 12)), by: near.cy, kind: 'dirt' } : null,
    city: near,
  };
}

// Manzanas: módulos plantilla ensamblados según el tipo de barrio
export function getBlock(c, bi, bj) {
  const key = bj * c.bx + bi;
  let blk = c.blockCache.get(key);
  if (blk) return blk;
  const type = c.types[key];
  const rng = mulberry32(c.seed * 131 + key * 7919 + 17);
  const X = c.x0 + bi * PITCH + ROAD, Y = c.y0 + bj * PITCH + ROAD; // manzana 10x10 con vereda
  const ix = X + 1, iy = Y + 1; // interior 8x8
  const items = [];
  let ground = '#63c74d';
  const bld = (x, y, w, d, h, roof, wall, shape = 'flat', style = 0) =>
    items.push({ k: 'b', x, y, w, d, h, roof, wall, shape, style, s: (rng() * 1e9) | 0 });
  const tree = (x, y, sp = 0) => items.push({ k: 't', x, y, sp });
  const prop = (x, y, s, extra) => items.push({ k: 'p', x, y, s, ...extra });

  switch (type) {
    case BT.HOUSES: {
      ground = '#63c74d';
      for (let gy = 0; gy < 8; gy += 2) {
        for (let gx = 0; gx < 8; gx += 2) {
          const edge = gx === 0 || gx === 6 || gy === 0 || gy === 6;
          if (!edge) continue;
          if (rng() < 0.16) { tree(ix + gx + 1, iy + gy + 1.8, rng() < 0.5 ? 0 : 1); continue; }
          bld(ix + gx + 0.15, iy + gy + 0.25, 1.7, 1.6, 7 + ((rng() * 5) | 0), pick(rng, HOUSE_ROOF), pick(rng, HOUSE_WALL), 'gable');
        }
      }
      if (rng() < 0.35) prop(ix + 3, iy + 3.2, 'pool');
      const nt = 1 + ((rng() * 3) | 0);
      for (let t = 0; t < nt; t++) tree(ix + 2.6 + rng() * 2.8, iy + 3 + rng() * 2.8, (rng() * 3) | 0);
      break;
    }
    case BT.APTS: {
      ground = rng() < 0.5 ? '#8b9bb4' : '#63c74d';
      const roof = pick(rng, APT_ROOF), wall = pick(rng, APT_WALL);
      if (rng() < 0.35) {
        bld(ix + 0.3, iy + 0.3, 7.4, 3.2, 16 + ((rng() * 10) | 0), roof, wall, 'flat', 0);
        bld(ix + 0.3, iy + 4.5, 7.4, 3.2, 16 + ((rng() * 10) | 0), pick(rng, APT_ROOF), pick(rng, APT_WALL), 'flat', 0);
      } else {
        for (const [gx, gy] of [[0, 0], [4, 0], [0, 4], [4, 4]]) {
          if (rng() < 0.12) { tree(ix + gx + 2, iy + gy + 3, 0); continue; }
          bld(ix + gx + 0.3, iy + gy + 0.4, 3.4, 3.2, 14 + ((rng() * 14) | 0), rng() < 0.5 ? roof : pick(rng, APT_ROOF), rng() < 0.6 ? wall : pick(rng, APT_WALL), 'flat', (rng() * 2) | 0);
        }
      }
      break;
    }
    case BT.DOWNTOWN: {
      ground = '#8b9bb4';
      const q = rng();
      const tw = () => pick(rng, TOWER_WALL), tr = () => pick(rng, TOWER_ROOF);
      if (q < 0.25) bld(ix + 0.5, iy + 0.5, 7, 7, 44 + ((rng() * 22) | 0), tr(), tw(), 'flat', 2);
      else if (q < 0.55) {
        bld(ix + 0.3, iy + 0.5, 3.4, 7, 30 + ((rng() * 30) | 0), tr(), tw(), 'flat', 2);
        bld(ix + 4.3, iy + 0.5, 3.4, 7, 30 + ((rng() * 30) | 0), tr(), tw(), 'flat', (rng() * 3) | 0);
      } else {
        for (const [gx, gy] of [[0, 0], [4, 0], [0, 4], [4, 4]]) {
          bld(ix + gx + 0.3, iy + gy + 0.4, 3.4, 3.2, 22 + ((rng() * 34) | 0), tr(), tw(), 'flat', (rng() * 3) | 0);
        }
      }
      break;
    }
    case BT.CIVIC: {
      ground = '#e8b796';
      const kind = (rng() * 3) | 0; // 0 hospital, 1 escuela, 2 municipalidad
      const roof = ['#ffffff', '#d77643', '#a22633'][kind];
      const wall = ['#c0cbdc', '#fee761', '#ead4aa'][kind];
      bld(ix + 0.5, iy + 0.4, 7, 4.2, 14 + kind * 2, roof, wall, kind === 2 ? 'gable' : 'flat', 3 + kind);
      if (kind === 1) items.push({ k: 'g', x: ix + 0.5, y: iy + 5.2, w: 7, h: 2.4, c: '#3e8948', field: 1 });
      else {
        tree(ix + 1, iy + 7.6, 0);
        tree(ix + 7, iy + 7.6, 0);
        prop(ix + 4, iy + 6.6, 'flag', { c: '#e43b44' });
      }
      break;
    }
    case BT.PARK: {
      ground = '#3e8948';
      items.push({ k: 'g', x: ix + 3.5, y: iy, w: 1, h: 8, c: '#e4a672' });
      items.push({ k: 'g', x: ix, y: iy + 3.5, w: 8, h: 1, c: '#e4a672' });
      if (rng() < 0.5) prop(ix + 5.8, iy + 6, 'pond');
      const nt = 7 + ((rng() * 6) | 0);
      for (let t = 0; t < nt; t++) {
        const x = ix + 0.6 + rng() * 6.8, y = iy + 1.2 + rng() * 6.6;
        if (Math.abs(x - ix - 4) < 0.9 || Math.abs(y - iy - 4.2) < 0.9) continue;
        tree(x, y, (rng() * 3) | 0);
      }
      prop(ix + 2.5, iy + 3.3, 'bench');
      prop(ix + 5, iy + 4.9, 'bench');
      break;
    }
    case BT.PLAZA: {
      ground = '#e8b796';
      items.push({ k: 'g', x: ix, y: iy, w: 8, h: 8, c: '#c28569', tiles: 1 });
      prop(ix + 4, iy + 4.6, 'fountain');
      for (const [tx, ty] of [[0.8, 1.6], [7.2, 1.6], [0.8, 7.7], [7.2, 7.7]]) tree(ix + tx, iy + ty, 0);
      prop(ix + 2, iy + 2.4, 'bench');
      prop(ix + 5.3, iy + 2.4, 'bench');
      prop(ix + 2, iy + 6.6, 'bench');
      prop(ix + 5.3, iy + 6.6, 'bench');
      for (const [lx, ly] of [[0.3, 4], [7.7, 4]]) prop(ix + lx, iy + ly, 'lamp');
      break;
    }
    case BT.INDUSTRY: {
      ground = '#b86f50';
      bld(ix + 0.3, iy + 0.4, 7.4, 3.3, 10 + ((rng() * 4) | 0), '#8b9bb4', '#c0cbdc', 'saw', 0);
      bld(ix + 0.3, iy + 4.6, 4.6, 3.1, 9, '#5a6988', '#e4a672', 'flat', 0);
      prop(ix + 6.4, iy + 7.4, 'chimney');
      break;
    }
    case BT.WORKS: {
      ground = '#b86f50';
      items.push({ k: 'g', x: ix + 1, y: iy + 1.5, w: 4, h: 3, c: '#733e39' });
      break;
    }
  }
  items.sort((a, b) => baseY(a) - baseY(b));
  blk = { type, X, Y, ix, iy, ground, items };
  c.blockCache.set(key, blk);
  return blk;
}

export function baseY(it) {
  if (it.k === 'b') return it.y + it.d;
  if (it.k === 'g') return -1e9;
  return it.y;
}

export function cityAt(cities, tx, ty, margin = 0) {
  for (const c of cities) {
    const dx = wrapDX(tx - c.x0);
    if (dx >= -margin && dx < c.w + margin && ty >= c.y0 - margin && ty < c.y0 + c.h + margin) return c;
  }
  return null;
}
