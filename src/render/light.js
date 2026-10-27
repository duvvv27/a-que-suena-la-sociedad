// La partida avanza de la mañana a la tarde: cada ronda tiene su hora y su luz.
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

export const LIGHTS = {
  dawn: { time: '07:40', sun: norm([-0.78, 0.38, 0.5]), tint: [1.07, 0.96, 0.9], lift: [0.03, 0.0, 0.045], atm: [0.98, 0.7, 0.62], space: [0.1, 0.08, 0.17], shadow: [-1.0, -0.35] },
  noon: { time: '12:10', sun: norm([-0.12, 0.35, 0.93]), tint: [1, 1, 1], lift: [0, 0, 0], atm: [0.55, 0.8, 1.0], space: [0.094, 0.078, 0.145], shadow: [0.15, -0.3] },
  after: { time: '15:30', sun: norm([0.52, 0.3, 0.8]), tint: [1.05, 1.0, 0.92], lift: [0.012, 0.0, 0.0], atm: [0.72, 0.8, 1.0], space: [0.094, 0.078, 0.145], shadow: [0.7, -0.3] },
  golden: { time: '17:40', sun: norm([0.8, 0.22, 0.56]), tint: [1.13, 0.94, 0.76], lift: [0.03, 0.0, 0.0], atm: [1.0, 0.68, 0.42], space: [0.12, 0.07, 0.13], shadow: [1.15, -0.3] },
  dusk: { time: '18:30', sun: norm([0.9, 0.12, 0.42]), tint: [1.14, 0.84, 0.78], lift: [0.05, 0.0, 0.035], atm: [1.0, 0.52, 0.5], space: [0.14, 0.06, 0.14], shadow: [1.45, -0.25] },
};

const mix3 = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

export function blendLight(a, b, t) {
  return {
    time: t < 0.5 ? a.time : b.time,
    sun: norm(mix3(a.sun, b.sun, t)),
    tint: mix3(a.tint, b.tint, t),
    lift: mix3(a.lift, b.lift, t),
    atm: mix3(a.atm, b.atm, t),
    space: mix3(a.space, b.space, t),
    shadow: t < 0.5 ? a.shadow : b.shadow,
  };
}
