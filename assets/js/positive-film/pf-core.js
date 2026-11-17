// Positive Film formula - measured from an original Ricoh GR (2013), 6 RAW+JPEG pairs.
// Enrico Policardo, 2026. Free to use. See tools/positive-film/ for the method.
export const FORMULA = {"name":"Ricoh GR Positive Film (original GR, 2013)","version":"0.1","date":"2026-11-17","curve":{"stops":[-8.0,-7.95,-7.9,-7.85,-7.8,-7.75,-7.7,-7.65,-7.6,-7.55,-7.5,-7.45,-7.4,-7.35,-7.3,-7.25,-7.2,-7.15,-7.1,-7.05,-7.0,-6.95,-6.9,-6.85,-6.8,-6.75,-6.7,-6.65,-6.6,-6.55,-6.5,-6.45,-6.4,-6.35,-6.3,-6.25,-6.2,-6.15,-6.1,-6.05,-6.0,-5.95,-5.9,-5.85,-5.8,-5.75,-5.7,-5.65,-5.6,-5.55,-5.5,-5.45,-5.4,-5.35,-5.3,-5.25,-5.2,-5.15,-5.1,-5.05,-5.0,-4.95,-4.9,-4.85,-4.8,-4.75,-4.7,-4.65,-4.6,-4.55,-4.5,-4.45,-4.4,-4.35,-4.3,-4.25,-4.2,-4.15,-4.1,-4.05,-4.0,-3.95,-3.9,-3.85,-3.8,-3.75,-3.7,-3.65,-3.6,-3.55,-3.5,-3.45,-3.4,-3.35,-3.3,-3.25,-3.2,-3.15,-3.1,-3.05,-3.0,-2.95,-2.9,-2.85,-2.8,-2.75,-2.7,-2.65,-2.6,-2.55,-2.5,-2.45,-2.4,-2.35,-2.3,-2.25,-2.2,-2.15,-2.1,-2.05,-2.0,-1.95,-1.9,-1.85,-1.8,-1.75,-1.7,-1.65,-1.6,-1.55,-1.5,-1.45,-1.4,-1.35,-1.3,-1.25,-1.2,-1.15,-1.1,-1.05,-1.0,-0.95,-0.9,-0.85,-0.8,-0.75,-0.7,-0.65,-0.6,-0.55,-0.5,-0.45,-0.4,-0.35,-0.3,-0.25,-0.2,-0.15,-0.1,-0.05,-0.0,0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9,0.95,1.0,1.05,1.1,1.15,1.2,1.25,1.3,1.35,1.4,1.45,1.5,1.55,1.6,1.65,1.7,1.75,1.8,1.85,1.9,1.95,2.0,2.05,2.1,2.15,2.2,2.25,2.3,2.35,2.4,2.45,2.5,2.55,2.6,2.65,2.7,2.75,2.8,2.85,2.9,2.95,3.0],"Lstar":[0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.821,0.822,0.823,0.824,0.826,0.829,0.832,0.835,0.839,0.842,0.845,0.848,0.851,0.855,0.861,0.87,0.885,0.908,0.94,0.981,1.033,1.094,1.163,1.241,1.325,1.416,1.513,1.616,1.723,1.836,1.953,2.076,2.206,2.346,2.496,2.66,2.839,3.037,3.254,3.493,3.752,4.033,4.337,4.664,5.016,5.397,5.811,6.261,6.749,7.278,7.847,8.454,9.097,9.773,10.479,11.213,11.972,12.758,13.569,14.405,15.268,16.156,17.069,18.007,18.969,19.956,20.967,22.003,23.062,24.144,25.247,26.368,27.506,28.663,29.84,31.042,32.271,33.529,34.815,36.123,37.447,38.776,40.1,41.414,42.71,43.987,45.243,46.478,47.694,48.89,50.068,51.227,52.371,53.499,54.615,55.721,56.817,57.906,58.985,60.055,61.111,62.152,63.173,64.173,65.152,66.108,67.042,67.952,68.84,69.707,70.555,71.386,72.199,72.994,73.767,74.514,75.233,75.92,76.578,77.21,77.824,78.428,79.029,79.634,80.247,80.873,81.513,82.167,82.829,83.493,84.148,84.788,85.407,86.008,86.596,87.178,87.761,88.348,88.939,89.531,90.121,90.705,91.278,91.837,92.38,92.906,93.415,93.907,94.385,94.853,95.314,95.769,96.215,96.644,97.043,97.401,97.703,97.944,98.124,98.423,98.423,98.423,98.423,98.423,98.423,98.423,98.423,98.423,98.423],"note":"Input: linear RGB channel value, 1.0 = raw clip, mid grey 0.18. Output: CIE L*. Apply to R, G and B separately."},"hue_bands":[{"name":"red","centre":20},{"name":"orange","centre":50},{"name":"yellow","centre":85},{"name":"green","centre":135},{"name":"aqua","centre":190},{"name":"blue","centre":250},{"name":"purple","centre":300},{"name":"magenta","centre":340}],"light_bands":[25,45,65,85],"sat_log_hue":[0.1502,0.1751,-0.1609,-0.6649,-0.0001,0.124,-0.1453,0.0466],"sat_log_light":[0.1065,0.0082,0.0,-0.0645],"hue_shift":[-0.528,-15.189,-25.823,2.41,40.21,6.364,1.462,6.975],"lightness_shift":[1.686,1.3,1.068,0.141,-2.513,0.193,0.668,-3.614,-1.043,0.146,-0.191,0.015],"grey_cast_ab":[1.113,-0.681]};

const F = FORMULA, ST0 = F.curve.stops[0], STEP = F.curve.stops[1] - F.curve.stops[0];
const LS = F.curve.Lstar, NB = F.hue_bands.length;
const HC = F.hue_bands.map(b => b.centre), LB = F.light_bands;
const WX = 0.95045592705, WZ = 1.08905775076; // D65 white (CIE 1931 2°)
const M = [0.4123907993, 0.3575843394, 0.1804807884, 0.2126390059, 0.7151686788, 0.0721923154, 0.0193308187, 0.1191947798, 0.9505321522];
const MI = [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142];

const L2Y = L => L > 8 ? ((L + 16) / 116) ** 3 : L / 903.2962962962963;
const Y2L = Y => Y > 0.008856451679035631 ? 116 * Math.cbrt(Y) - 16 : 903.2962962962963 * Y;
const fLab = t => t > 0.008856451679035631 ? Math.cbrt(t) : (903.2962962962963 * t + 16) / 116;
const fInv = t => t > 0.20689655172413793 ? t * t * t : (116 * t - 16) / 903.2962962962963;
export const encode = v => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
export const decode = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

// Tone curve: linear channel value (1.0 = clip, 0.18 = mid grey) -> linear output
const CR = 100, CN = Math.round((F.curve.stops[F.curve.stops.length - 1] - ST0) * CR) + 1;
const CLUT = new Float32Array(CN);
function interpL(s) {
  const x = (s - ST0) / STEP, i = Math.max(0, Math.min(LS.length - 2, Math.floor(x))), t = Math.max(0, Math.min(1, x - i));
  return LS[i] * (1 - t) + LS[i + 1] * t;
}
for (let k = 0; k < CN; k++) CLUT[k] = L2Y(interpL(ST0 + k / CR));
export function curve(c) {
  if (!(c > 1e-9)) c = 1e-9;
  const x = (Math.log2(c / 0.18) - ST0) * CR;
  if (x <= 0) return CLUT[0];
  if (x >= CN - 1) return CLUT[CN - 1];
  const i = x | 0, t = x - i; return CLUT[i] * (1 - t) + CLUT[i + 1] * t;
}
// Inverse of the curve on luminance, used to approximate scene light from an ordinary JPEG
const ILUT = new Float32Array(1001);
(function () {
  const Lmin = LS[0], Lmax = LS[LS.length - 1];
  for (let k = 0; k <= 1000; k++) {
    const L = Math.max(Lmin + 1e-3, Math.min(Lmax - 1e-3, k / 10));
    let j = 0; while (j < LS.length - 2 && LS[j + 1] < L) j++;
    const a = LS[j], b = LS[j + 1], t = b > a ? (L - a) / (b - a) : 0;
    ILUT[k] = 0.18 * Math.pow(2, ST0 + (j + t) * STEP);
  }
})();
export function uncurve(Y) {
  const x = Math.max(0, Math.min(1000, Y2L(Math.max(Y, 0)) * 10)), i = Math.min(999, x | 0), t = x - i;
  return ILUT[i] * (1 - t) + ILUT[i + 1] * t;
}

// Colour stage, in CIE LCh after the curve
function stage(L, a, b, out, o) {
  const C = Math.hypot(a, b); let h = Math.atan2(b, a) * 57.29577951308232; if (h < 0) h += 360;
  // two nearest hue bands, linear weights
  let i1 = -1, i2 = -1, d1 = 1e9, d2 = 1e9;
  for (let k = 0; k < NB; k++) {
    const d = Math.abs(((h - HC[k] + 540) % 360) - 180);
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = k; } else if (d < d2) { d2 = d; i2 = k; }
  }
  const sd = d1 + d2, w1 = sd > 0 ? 1 - d1 / sd : 1, w2 = 1 - w1;
  const Lc = Math.max(LB[0], Math.min(LB[LB.length - 1], L));
  let k = 1; while (k < LB.length - 1 && LB[k] < Lc) k++;
  const t = (Lc - LB[k - 1]) / (LB[k] - LB[k - 1]), v1 = 1 - t, v2 = t;
  const g = w1 * F.sat_log_hue[i1] + w2 * F.sat_log_hue[i2] + v1 * F.sat_log_light[k - 1] + v2 * F.sat_log_light[k];
  const C2 = C * Math.exp(g);
  const h2 = (h + w1 * F.hue_shift[i1] + w2 * F.hue_shift[i2]) / 57.29577951308232;
  out[o] = L + w1 * F.lightness_shift[i1] + w2 * F.lightness_shift[i2] + v1 * F.lightness_shift[NB + k - 1] + v2 * F.lightness_shift[NB + k];
  out[o + 1] = C2 * Math.cos(h2) + F.grey_cast_ab[0];
  out[o + 2] = C2 * Math.sin(h2) + F.grey_cast_ab[1];
}

// Full formula on one pixel. rgb: linear sRGB (camera WB, 1.0 = clip). Returns linear sRGB in out[o..o+2].
const tmp = new Float64Array(3);
export function pixel(r, g, b, out, o, colourAmount = 1) {
  r = curve(r); g = curve(g); b = curve(b);
  const X = (M[0] * r + M[1] * g + M[2] * b) / WX, Y = M[3] * r + M[4] * g + M[5] * b, Z = (M[6] * r + M[7] * g + M[8] * b) / WZ;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  const L = 116 * fy - 16, a = 500 * (fx - fy), bb = 200 * (fy - fz);
  stage(L, a, bb, tmp, 0);
  const L2 = L + (tmp[0] - L) * colourAmount, a2 = a + (tmp[1] - a) * colourAmount, b2 = bb + (tmp[2] - bb) * colourAmount;
  const gy = (L2 + 16) / 116, gx = gy + a2 / 500, gz = gy - b2 / 200;
  const X2 = fInv(gx) * WX, Y2 = fInv(gy), Z2 = fInv(gz) * WZ;
  out[o] = MI[0] * X2 + MI[1] * Y2 + MI[2] * Z2;
  out[o + 1] = MI[3] * X2 + MI[4] * Y2 + MI[5] * Z2;
  out[o + 2] = MI[6] * X2 + MI[7] * Y2 + MI[8] * Z2;
}
export function lab(r, g, b) { // linear sRGB -> Lab (for tests)
  const X = (M[0] * r + M[1] * g + M[2] * b) / WX, Y = M[3] * r + M[4] * g + M[5] * b, Z = (M[6] * r + M[7] * g + M[8] * b) / WZ;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z); return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
