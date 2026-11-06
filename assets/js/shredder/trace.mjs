// Shredder - turn an ink mask into vector outlines (pixel-exact, holes kept).
// Walks the borders between inked and blank pixels, keeps only the corners,
// and drops specks smaller than `minArea` square pixels.

// mask: Float32Array/Uint8Array (w*h), inked where > threshold
// returns an SVG path "d" string in pixel units
export function tracePath(mask, w, h, { threshold = 0.5, minArea = 2 } = {}) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] > threshold;
  const W = w + 1, n = W * (h + 1);
  // up to two outgoing edges per corner point; direction 0 right, 1 down, 2 left, 3 up
  const out1 = new Int32Array(n).fill(-1), out2 = new Int32Array(n).fill(-1);
  const dir1 = new Int8Array(n), dir2 = new Int8Array(n);
  const add = (from, to, d) => { if (out1[from] < 0) { out1[from] = to; dir1[from] = d; } else { out2[from] = to; dir2[from] = d; } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const tl = y * W + x, tr = tl + 1, bl = tl + W, br = bl + 1;
    if (!on(x, y - 1)) add(tl, tr, 0);   // inked side always on the right of travel
    if (!on(x + 1, y)) add(tr, br, 1);
    if (!on(x, y + 1)) add(br, bl, 2);
    if (!on(x - 1, y)) add(bl, tl, 3);
  }
  const parts = [];
  for (let start = 0; start < n; start++) {
    while (out1[start] >= 0 || out2[start] >= 0) {
      const pts = [];
      let v = start, prev = -1;
      do {
        let to, d;
        const has1 = out1[v] >= 0, has2 = out2[v] >= 0;
        if (has1 && has2) {   // a saddle: two pixels touch at a corner - turn right to keep them apart
          const want = (prev + 1) & 3;
          if (prev >= 0 && dir2[v] === want) { to = out2[v]; d = dir2[v]; out2[v] = -1; }
          else { to = out1[v]; d = dir1[v]; out1[v] = out2[v]; dir1[v] = dir2[v]; out2[v] = -1; }
        } else if (has1) { to = out1[v]; d = dir1[v]; out1[v] = -1; }
        else if (has2) { to = out2[v]; d = dir2[v]; out2[v] = -1; }
        else break;   // should not happen on a closed border
        if (d !== prev) pts.push(v);
        prev = d; v = to;
      } while (v !== start);
      if (pts.length < 4) continue;
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        area += (a % W) * Math.floor(b / W) - (b % W) * Math.floor(a / W);
      }
      if (Math.abs(area / 2) < minArea) continue;
      let s = 'M' + (pts[0] % W) + ' ' + Math.floor(pts[0] / W), px = pts[0] % W, py = Math.floor(pts[0] / W);
      for (let i = 1; i < pts.length; i++) {
        const x = pts[i] % W, y = Math.floor(pts[i] / W);
        s += x !== px ? 'h' + (x - px) : 'v' + (y - py);
        px = x; py = y;
      }
      parts.push(s + 'z');
    }
  }
  return parts.join('');
}

const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// layers: [{ mask, ink }] painted in order; inks: { 1: '#111111', 2: '#e8402c' }
export function toSVG(layers, w, h, { inks, paper = null, outWidth = w, title = 'Shredder' } = {}) {
  const k = outWidth / w, outH = Math.round(h * k * 100) / 100;
  let body = paper ? `<rect width="${w}" height="${h}" fill="${esc(paper)}"/>` : '';
  layers.forEach((L, i) => {
    const d = tracePath(L.mask, w, h);
    if (d) body += `<path id="ink-${i + 1}" fill="${esc(inks[L.ink] || inks[1])}" fill-rule="evenodd" d="${d}"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(outWidth)}" height="${outH}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><title>${esc(title)}</title>${body}</svg>\n`;
}
