// Generación procedural del planeta: elevación, biomas, ríos y países.
// El mundo es una cuadrícula equirectangular de celdas (CW x CH); cada celda = CELL x CELL "tiles" de calle.
import { mulberry32, fbm3, ihash, h12, vn, clamp, smooth } from '../core/rng.js';
import { hexU32, shadeU32, mixU32 } from '../core/palette.js';

export const CW = 1024, CH = 512, CELL = 8;
export const WT = CW * CELL, HT = CH * CELL;
export const K = WT / (2 * Math.PI); // tiles por radián
const N = CW * CH;

export const B = {
  DEEP: 0, OCEAN: 1, SHALLOW: 2, BEACH: 3, GRASS: 4, FOREST: 5, JUNGLE: 6, SAVANNA: 7,
  DESERT: 8, STEPPE: 9, TAIGA: 10, TUNDRA: 11, SNOW: 12, MOUNTAIN: 13, PEAK: 14, ICE: 15,
};
const BCOL = [
  '#0f3d6e', '#124e89', '#1b78b8', '#ead4aa', '#63c74d', '#3e8948', '#265c42', '#a8b44f',
  '#e4a672', '#9fb85a', '#2e6b4e', '#8b9bb4', '#eef3fa', '#8a6a55', '#c0cbdc', '#dfe9f5',
].map(hexU32);
const RIVER_U32 = hexU32('#1b78b8');
const BORDER_U32 = hexU32('#fee761');
const FOAM_U32 = hexU32('#7fd8f0');
const COAST_U32 = hexU32('#2a2440');

// Árboles por tile según bioma (para el suelo)
export const TREE_DENSITY = [0, 0, 0, 0, 0.035, 0.42, 0.55, 0.06, 0.004, 0.02, 0.38, 0.02, 0, 0.01, 0, 0];

export function lonLatToVec(lon, lat) {
  const c = Math.cos(lat);
  return [c * Math.sin(lon), Math.sin(lat), c * Math.cos(lon)];
}
export function cellVec(i, j) {
  return lonLatToVec(((i + 0.5) / CW) * 2 * Math.PI, Math.PI / 2 - ((j + 0.5) / CH) * Math.PI);
}
export function tileVec(tx, ty) {
  return lonLatToVec(tx / K, Math.PI / 2 - ty / K);
}
export const wrapX = (x) => ((x % WT) + WT) % WT;
export const wrapDX = (dx) => dx - WT * Math.round(dx / WT);

const SYL_A = ['Val', 'Mor', 'Ket', 'San', 'Tal', 'Bri', 'Or', 'Lu', 'Ner', 'Ar', 'Cal', 'Zen', 'Ix', 'Qui', 'Mal', 'Ter', 'Sol', 'Ven', 'Ru', 'Pa', 'Ka', 'Do', 'Ama', 'Esk', 'Yu'];
const SYL_B = ['a', 'e', 'i', 'o', 'u', 'an', 'or', 'el', 'ir', 'ul', 'ar'];
const SYL_C = ['ia', 'ana', 'dor', 'ara', 'ova', 'eth', 'una', 'ica', 'ora', 'istán', 'ea', 'ón', 'ay'];
export function makeName(rng) {
  let s = SYL_A[(rng() * SYL_A.length) | 0];
  if (rng() < 0.6) s += SYL_B[(rng() * SYL_B.length) | 0];
  return s + SYL_C[(rng() * SYL_C.length) | 0];
}

export function* generatePlanet(seed) {
  const pl = {
    seed,
    elev: new Float32Array(N), moist: new Float32Array(N),
    biome: new Uint8Array(N), land: new Uint8Array(N), country: new Uint8Array(N),
    urban: new Uint8Array(N), river: new Uint8Array(N), col: new Uint32Array(N),
    countries: [],
  };
  const { elev, moist, biome, land, country, river, col } = pl;

  // Elevación y humedad sobre la esfera (sin costuras)
  for (let j = 0; j < CH; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / CH) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < CW; i++) {
      const lon = ((i + 0.5) / CW) * 2 * Math.PI;
      const x = cl * Math.sin(lon), y = sl, z = cl * Math.cos(lon);
      const id = j * CW + i;
      const base = fbm3(x * 1.35 + 7, y * 1.35, z * 1.35, 6, seed);
      const ridge = 1 - Math.abs(2 * fbm3(x * 3.2, y * 3.2 + 3, z * 3.2, 3, seed + 99) - 1);
      elev[id] = base + ridge * ridge * 0.09;
      moist[id] = fbm3(x * 2.1 - 4, y * 2.1, z * 2.1 + 9, 4, seed + 501);
    }
    if ((j & 15) === 15) yield 0.05 + 0.55 * (j / CH);
  }

  // Nivel del mar: ~37% de tierra
  const sample = [];
  for (let id = 0; id < N; id += 7) sample.push(elev[id]);
  sample.sort((a, b) => a - b);
  const sea = sample[Math.floor(sample.length * 0.63)];
  const emax = sample[sample.length - 1], emin = sample[0];
  pl.sea = sea;

  // Biomas
  for (let j = 0; j < CH; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / CH) * Math.PI;
    const tLat = 1 - Math.abs(lat) / (Math.PI / 2);
    for (let i = 0; i < CW; i++) {
      const id = j * CW + i;
      const e = elev[id];
      const m = moist[id];
      let b;
      if (e < sea) {
        const depth = (sea - e) / (sea - emin);
        b = depth > 0.33 ? B.DEEP : depth > 0.07 ? B.OCEAN : B.SHALLOW;
        if (tLat < 0.07 + (m - 0.5) * 0.08) { b = B.ICE; land[id] = 1; }
      } else {
        land[id] = 1;
        const h = (e - sea) / (emax - sea);
        const t = tLat - h * 0.5 + (m - 0.5) * 0.08;
        if (h > 0.6) b = B.PEAK;
        else if (h > 0.4) b = B.MOUNTAIN;
        else if (t < 0.13) b = B.SNOW;
        else if (t < 0.26) b = B.TUNDRA;
        else if (t < 0.38) b = m > 0.47 ? B.TAIGA : B.TUNDRA;
        else if (h < 0.022 && t > 0.3) b = B.BEACH;
        else if (t > 0.7) b = m < 0.4 ? B.DESERT : m < 0.53 ? B.SAVANNA : B.JUNGLE;
        else b = m < 0.37 ? B.STEPPE : m < 0.54 ? B.GRASS : B.FOREST;
      }
      biome[id] = b;
    }
  }
  yield 0.66;

  const rng = mulberry32(seed ^ 0x51a7);

  // Ríos: descenso por la pendiente hasta el mar
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  let rivers = 0;
  for (let tries = 0; tries < 3000 && rivers < 70; tries++) {
    let i = (rng() * CW) | 0, j = (CH * 0.12 + rng() * CH * 0.76) | 0;
    let id = j * CW + i;
    const b0 = biome[id];
    if (b0 !== B.MOUNTAIN && !(moist[id] > 0.55 && land[id] && b0 !== B.SNOW && b0 !== B.ICE)) continue;
    const path = [];
    for (let step = 0; step < 400; step++) {
      path.push(id);
      if (!land[id] || biome[id] === B.ICE) break;
      let best = -1, be = elev[id];
      for (const [dx, dy] of nb) {
        const ni = (i + dx + CW) % CW, nj = j + dy;
        if (nj < 0 || nj >= CH) continue;
        const nid = nj * CW + ni;
        if (elev[nid] < be) { be = elev[nid]; best = nid; }
      }
      if (best < 0) break;
      id = best; i = id % CW; j = (id / CW) | 0;
    }
    const last = path[path.length - 1];
    if (path.length < 14 || land[last]) continue;
    for (let k = 0; k < path.length - 1; k++) if (biome[path[k]] !== B.PEAK) river[path[k]] = 1;
    rivers++;
  }
  yield 0.72;

  // Países: semillas en tierra + Voronoi esférico deformado por ruido
  const seeds = [];
  for (let tries = 0; tries < 4000 && seeds.length < 26; tries++) {
    const i = (rng() * CW) | 0, j = (CH * 0.16 + rng() * CH * 0.68) | 0;
    const id = j * CW + i;
    if (!land[id] || biome[id] === B.ICE || biome[id] === B.PEAK || biome[id] === B.SNOW) continue;
    const v = cellVec(i, j);
    if (seeds.some((s) => s.v[0] * v[0] + s.v[1] * v[1] + s.v[2] * v[2] > Math.cos(0.3))) continue;
    seeds.push({ v, i, j });
  }
  pl.countries = seeds.map((s, k) => ({
    id: k + 1,
    name: makeName(rng),
    hue: rng(),
    seed: s,
    capital: null,
  }));
  for (let j = 0; j < CH; j++) {
    for (let i = 0; i < CW; i++) {
      const id = j * CW + i;
      if (!land[id] || biome[id] === B.ICE) continue;
      const v = cellVec(i, j);
      const w = (moist[id] - 0.5) * 0.35 + (elev[id] - sea) * 0.6;
      const vx = v[0] + w * 0.4, vy = v[1] - w * 0.3, vz = v[2] + w * 0.2;
      let best = 0, bd = -9;
      for (let k = 0; k < seeds.length; k++) {
        const s = seeds[k].v;
        const d = s[0] * vx + s[1] * vy + s[2] * vz;
        if (d > bd) { bd = d; best = k + 1; }
      }
      country[id] = best;
    }
    if ((j & 63) === 63) yield 0.72 + 0.18 * (j / CH);
  }

  // Colores con sombreado de relieve (cuantizado para look pixel-art)
  for (let j = 0; j < CH; j++) {
    for (let i = 0; i < CW; i++) {
      const id = j * CW + i;
      const b = biome[id];
      let c = BCOL[b];
      if (land[id] && b !== B.ICE) {
        const ex = elev[j * CW + ((i + 1) % CW)] - elev[j * CW + ((i - 1 + CW) % CW)];
        const ey = elev[Math.min(CH - 1, j + 1) * CW + i] - elev[Math.max(0, j - 1) * CW + i];
        const s = -(ex + ey) * 30;
        const k = s > 0.35 ? 1.12 : s < -0.35 ? 0.86 : 1;
        c = shadeU32(c, k * (0.97 + ihash(i, j, 3) * 0.06));
      } else {
        c = shadeU32(c, 0.98 + ihash(i, j, 5) * 0.04);
      }
      col[id] = c;
    }
  }
  yield 0.95;
  return pl;
}

// Texturas para el shader del globo
export function buildTextures(pl) {
  const color = new Uint8Array(pl.col.buffer.slice(0));
  const data = new Uint8Array(N * 4);
  for (let id = 0; id < N; id++) {
    data[id * 4] = pl.country[id];
    data[id * 4 + 1] = pl.urban[id] ? 255 : 0;
    data[id * 4 + 2] = pl.land[id] ? 255 : 0;
    data[id * 4 + 3] = pl.biome[id] * 16 + (pl.river[id] ? 8 : 0);
  }
  return { color, data };
}

export function cellAt(tx, ty) {
  const i = ((Math.floor(tx / CELL) % CW) + CW) % CW;
  const j = clamp(Math.floor(ty / CELL), 0, CH - 1);
  return j * CW + i;
}

// Muestreo del terreno en coordenadas de tile (igual que planet() en el shader).
// p = píxeles por tile. Devuelve color u32 y deja el id de celda en sampleTerrain.cell
export function sampleTerrain(pl, tx, ty, p) {
  const cpx = CELL * p;
  const jit = smooth(0.8, 2.5, cpx) * CELL * 0.9;
  const jx = (vn(tx * 0.17, ty * 0.17) - 0.5) * jit;
  const jy = (vn(tx * 0.17 + 41.3, ty * 0.17 + 41.3) - 0.5) * jit;
  const ax = tx + jx, ay = ty + jy;
  const id = cellAt(ax, ay);
  sampleTerrain.cell = id;
  // los ríos usan menos deformación para que no se corten
  const isRiver = pl.river[cellAt(tx + jx * 0.4, ty + jy * 0.4)];
  sampleTerrain.river = isRiver;
  let c = isRiver ? RIVER_U32 : pl.col[id];
  const tpp = 1 / p;
  const idx = cellAt(ax + tpp, ay), idy = cellAt(ax, ay + tpp);
  const L = pl.land[id] && !isRiver;
  const Lx = pl.land[idx], Ly = pl.land[idy];
  if (isRiver) c = RIVER_U32;
  else if (L && (!Lx || !Ly)) c = mixU32(c, COAST_U32, 0.45);
  else if (!L && (Lx || Ly)) c = mixU32(c, FOAM_U32, 0.5);
  else if (L) {
    const cc = pl.country[id];
    if (cc && ((pl.country[idx] && pl.country[idx] !== cc) || (pl.country[idy] && pl.country[idy] !== cc))) {
      if ((((ax * p) >> 1) + ((ay * p) >> 1)) & 1) c = mixU32(c, BORDER_U32, 0.55);
    }
  }
  if (p >= 2) {
    // micro-detalle por píxel
    const r = h12(Math.floor(tx * p), Math.floor(ty * p));
    if (L) {
      if (r > 0.93) c = shadeU32(c, 0.86);
      else if (r < 0.04) c = shadeU32(c, 1.12);
    } else if (r > 0.975 && ((Math.floor(tx * p) + Math.floor(ty * p * 3)) & 3) === 0) {
      c = shadeU32(c, 1.3);
    }
  }
  return c;
}
