// Paleta base (Endesga 32) + utilidades de color.
export const P = {
  rust: '#be4a2f', ochre: '#d77643', cream: '#ead4aa', tan: '#e4a672', clay: '#b86f50',
  brown: '#733e39', plum: '#3e2731', wine: '#a22633', red: '#e43b44', orange: '#f77622',
  gold: '#feae34', yellow: '#fee761', green: '#63c74d', forest: '#3e8948', pine: '#265c42',
  teal: '#193c3e', blue: '#124e89', sky: '#0099db', cyan: '#2ce8f5', white: '#ffffff',
  silver: '#c0cbdc', steel: '#8b9bb4', slate: '#5a6988', navy: '#3a4466', night: '#262b44',
  ink: '#181425', pink: '#ff0044', violet: '#68386c', magenta: '#b55088', rose: '#f6757a',
  skin: '#e8b796', skin2: '#c28569',
};

export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Empaquetado para ImageData (little-endian: ABGR)
export function u32(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
export function hexU32(hex) {
  const [r, g, b] = rgb(hex);
  return u32(r, g, b);
}
export function shadeU32(c, k) {
  const r = Math.min(255, (c & 255) * k) | 0;
  const g = Math.min(255, ((c >>> 8) & 255) * k) | 0;
  const b = Math.min(255, ((c >>> 16) & 255) * k) | 0;
  return u32(r, g, b, c >>> 24);
}
export function mixU32(a, b, t) {
  const r = ((a & 255) * (1 - t) + (b & 255) * t) | 0;
  const g = (((a >>> 8) & 255) * (1 - t) + ((b >>> 8) & 255) * t) | 0;
  const bl = (((a >>> 16) & 255) * (1 - t) + ((b >>> 16) & 255) * t) | 0;
  return u32(r, g, bl);
}
export function shadeHex(hex, k) {
  const [r, g, b] = rgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
