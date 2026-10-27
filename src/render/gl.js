// Renderizador WebGL: un único shader de pantalla completa.
// Raycast contra la esfera -> coordenadas de tile (mezcla mapeo real/local según altitud)
// -> terreno procedural del planeta o búfer del suelo (chunks + sprites), nubes, atmósfera y estrellas.

const VS = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FS = `
precision highp float;
uniform vec2 uRes;
uniform float uF, uD, uK, uM, uS, uTime, uGA, uCA;
uniform mat3 uRot;
uniform vec2 uCT, uWT;
uniform sampler2D uTex, uDat, uCld, uGnd;
uniform vec4 uGR;
uniform vec3 uSun, uTint, uLift, uAtm, uSpace;
uniform vec4 uHot;
uniform vec3 uHotFx;
uniform vec2 uHeat;
const float PI = 3.14159265;
const float CELL = 8.0;
const vec2 CG = vec2(1024.0, 512.0);

float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3. - 2. * f);
  float a = h12(i), b = h12(i + vec2(1., 0.)), c = h12(i + vec2(0., 1.)), d = h12(i + vec2(1., 1.));
  return a + (b - a) * f.x + (c - a) * f.y + (a - b - c + d) * f.x * f.y;
}
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float bayer4(vec2 a){ return bayer2(.5 * a) * .25 + bayer2(a); }

vec2 toRel(vec3 P){
  vec3 W = uRot * P;
  float lon = atan(W.x, W.z);
  float lat = asin(clamp(W.y, -1., 1.));
  vec2 dT = vec2(lon * uK, (PI * .5 - lat) * uK) - uCT;
  dT.x -= uWT.x * floor(dT.x / uWT.x + .5);
  vec2 dL = vec2(atan(P.x, P.z) * uK, -asin(clamp(P.y, -1., 1.)) * uK);
  return mix(dT, dL, uM);
}
vec2 cellUV(vec2 t){ return (floor(t / CELL) + .5) / CG; }

vec3 planet(vec2 tile, out float water){
  float cpx = uS * CELL;
  float jit = smoothstep(.8, 2.5, cpx) * CELL * .9;
  vec2 j = vec2(vn(tile * .17), vn(tile * .17 + 41.3)) - .5;
  vec2 a = tile + j * jit;
  vec4 c = texture2D(uTex, cellUV(a));
  vec4 dt = texture2D(uDat, cellUV(a));
  float tpp = 1. / uS;
  vec4 dx = texture2D(uDat, cellUV(a + vec2(tpp, 0.)));
  vec4 dy = texture2D(uDat, cellUV(a + vec2(0., tpp)));
  float L = step(.5, dt.b), Lx = step(.5, dx.b), Ly = step(.5, dy.b);
  vec3 col = c.rgb;
  float rv = texture2D(uDat, cellUV(tile + j * jit * .4)).a * 255.;
  bool river = mod(rv, 16.) > 7.5;
  if (river) { col = vec3(.106, .471, .722); L = 0.; }
  else if (L > .5 && (Lx < .5 || Ly < .5)) col = mix(col, vec3(.165, .141, .251), .45);
  else if (L < .5 && (Lx > .5 || Ly > .5)) col = mix(col, vec3(.498, .847, .941), .5);
  else if (L > .5 && dt.r > 0.) {
    float bx = (dx.r > 0. && abs(dx.r - dt.r) > .001) ? 1. : 0.;
    float by = (dy.r > 0. && abs(dy.r - dt.r) > .001) ? 1. : 0.;
    if (bx + by > 0.) {
      float dash = mod(floor(a.x * uS * .5) + floor(a.y * uS * .5), 2.);
      col = mix(col, vec3(.996, .906, .38), .55 * dash * smoothstep(.15, .5, cpx));
    }
  }
  if (dt.g > .5) {
    vec3 u = vec3(.62, .6, .66);
    if (cpx > 1.2) {
      vec2 m = mod(tile, 12.);
      float hb = h12(floor(tile / 12.) * 1.3 + 7.);
      vec3 roof = hb < .33 ? vec3(.75, .42, .32) : hb < .66 ? vec3(.55, .6, .7) : vec3(.85, .75, .62);
      u = (m.x < 2. || m.y < 2.) ? vec3(.23, .27, .4) : roof;
    }
    col = mix(col, u, .85);
  }
  water = 1. - L;
  if (water > .5) {
    float sp = h12(floor(tile * uS / 2.) + floor(uTime * 2.5) * 7.31);
    col *= 1. + step(.993, sp) * .4;
  }
  return col;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = fc - uRes * .5;
  vec3 d = normalize(vec3(p, -uF));
  float bay = bayer4(fc);
  float b = uD * d.z;
  float disc = b * b - (uD * uD - 1.);
  vec3 col;
  if (disc < 0.) {
    vec3 wd = uRot * d;
    vec2 sc = floor(vec2(atan(wd.x, wd.z), asin(clamp(wd.y, -1., 1.))) * 110.);
    float st = h12(sc);
    col = uSpace;
    if (st > .994) col += vec3(.5 + .4 * sin(uTime * 2. + st * 80.)) * .8;
    float dmin = sqrt(max(uD * uD - b * b, 0.));
    float g = smoothstep(1.09, 1.0, dmin);
    g = floor(g * 5. + bay) / 5.;
    col = mix(col, uAtm, g * .8);
  } else {
    float t = -b - sqrt(disc);
    vec3 P = vec3(0., 0., uD) + t * d;
    vec2 rel = toRel(P);
    vec2 tile = uCT + rel;
    tile.x -= uWT.x * floor(tile.x / uWT.x);
    float water;
    col = planet(tile, water);
    float ga = 0.;
    if (uGA > 0.) {
      vec2 g = (rel - uGR.xy) / uGR.zw;
      if (g.x >= 0. && g.y >= 0. && g.x < 1. && g.y < 1.) {
        vec4 gc = texture2D(uGnd, g);
        ga = gc.a * uGA;
        col = mix(col, gc.rgb, ga);
      }
    }
    if (uCA > .01) {
      float den = texture2D(uCld, vec2(tile.x / uWT.x + uTime * .0015 + .003, tile.y / uWT.y)).r;
      col *= 1. - step(.56, den) * .18 * uCA;
    }
    float l = clamp(dot(P, uSun), 0., 1.);
    float lit = .36 + .64 * l;
    float lc = .36 + .64 * clamp(uSun.z, 0., 1.);
    float q = floor(lit * 12. + bay * .95) / 12.;
    lit = mix(q, min(1.15, lit / lc), max(ga, uM * .6));
    col *= lit;
    if (water > .5) {
      vec3 R = reflect(-uSun, P);
      float s = pow(max(dot(R, -d), 0.), 40.);
      col += step(.6, s + bay * .25) * .22 * (1. - ga);
    }
    float fres = 1. - max(dot(P, -d), 0.);
    float hz = pow(fres, 3.6) * .8;
    hz = floor(hz * 8. + bay) / 8.;
    col = mix(col, uAtm, hz);
    if (uHotFx.x + uHotFx.y > 0.) {
      float lon = tile.x / uK, lat = PI * .5 - tile.y / uK;
      vec3 Wv = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
      float ang = acos(clamp(dot(Wv, uHot.xyz), -1., 1.));
      float pxa = 1. / (uS * uK);
      float r = abs(ang - uHot.w * (1. + .08 * sin(uTime * 4.))) / pxa;
      float ring = step(r, 1.3) * step(.35, fract(atan(Wv.y - uHot.y, Wv.x - uHot.x) * 4. + uTime * .5));
      col = mix(col, vec3(1., .55, .2), ring * uHotFx.x);
      float gl = (1. - smoothstep(0., uHot.w, ang)) * uHotFx.y * (.6 + .4 * sin(uTime * 5.));
      col = mix(col, vec3(1., .45, .2), floor(gl * 4. + bay) / 4. * .45);
    }
  }
  if (uCA > .01) {
    float rc = 1.045;
    float dc = b * b - (uD * uD - rc * rc);
    if (dc > 0. && uD > rc) {
      float tc = -b - sqrt(dc);
      vec3 Pc = (vec3(0., 0., uD) + tc * d) / rc;
      vec2 tc2 = uCT + toRel(Pc);
      float den = texture2D(uCld, vec2(tc2.x / uWT.x + uTime * .0015, tc2.y / uWT.y)).r;
      float n = (bay - .5) * .06;
      float a = step(.56, den + n) * .5 + step(.68, den + n) * .32;
      float lc2 = .55 + .45 * clamp(dot(Pc, uSun), 0., 1.);
      col = mix(col, vec3(lc2) * vec3(1., .97, .95), a * uCA);
    }
  }
  vec2 q2 = (fc / uRes) * 2. - 1.;
  float v = smoothstep(.55, 1.3, length(q2 * vec2(1., .85)));
  vec3 hcol = mix(vec3(.2, .5, 1.), vec3(1., .3, .1), uHeat.x);
  float vv = floor(v * uHeat.y * 5. + bay) / 5.;
  col = mix(col, hcol, vv * .55);
  gl_FragColor = vec4(col * uTint + uLift, 1.);
}
`;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' });
    if (!gl) throw new Error('WebGL no disponible');
    this.gl = gl;
    this.canvas = canvas;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      this.u[info.name] = gl.getUniformLocation(prog, info.name);
    }
    this.tex = {};
    ['uTex', 'uDat', 'uCld', 'uGnd'].forEach((name, unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      const lin = name === 'uCld';
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lin ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST);
      const rep = name !== 'uGnd';
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      gl.uniform1i(this.u[name], unit);
      this.tex[name] = { t, unit };
    });
  }
  bind(name) {
    const { t, unit } = this.tex[name];
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, t);
  }
  setTexture(name, w, h, data, format) {
    const gl = this.gl;
    this.bind(name);
    const f = format === 'L' ? gl.LUMINANCE : gl.RGBA;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, f, w, h, 0, f, gl.UNSIGNED_BYTE, data);
  }
  uploadGround(canvas) {
    const gl = this.gl;
    this.bind('uGnd');
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }
  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }
  draw(U) {
    const gl = this.gl, u = this.u;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uF, U.f);
    gl.uniform1f(u.uD, U.D);
    gl.uniform1f(u.uK, U.K);
    gl.uniform1f(u.uM, U.m);
    gl.uniform1f(u.uS, U.s);
    gl.uniform1f(u.uTime, U.time);
    gl.uniform1f(u.uGA, U.ga);
    gl.uniform1f(u.uCA, U.ca);
    gl.uniformMatrix3fv(u.uRot, false, U.rot);
    gl.uniform2f(u.uCT, U.cx, U.cy);
    gl.uniform2f(u.uWT, U.WT, U.HT);
    gl.uniform4fv(u.uGR, U.gr);
    gl.uniform3fv(u.uSun, U.sun);
    gl.uniform3fv(u.uTint, U.tint);
    gl.uniform3fv(u.uLift, U.lift);
    gl.uniform3fv(u.uAtm, U.atm);
    gl.uniform3fv(u.uSpace, U.space);
    gl.uniform4fv(u.uHot, U.hot);
    gl.uniform3fv(u.uHotFx, U.hotFx);
    gl.uniform2fv(u.uHeat, U.heat);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
