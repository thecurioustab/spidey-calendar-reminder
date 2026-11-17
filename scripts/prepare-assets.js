// One-off asset cleanup: turns the supplied JPGs into transparent PNGs.
//  - spidey.jpg has a fake "transparency" checkerboard baked in -> flood-fill it away from the edges.
//  - web.jpg is red lines on white -> alpha from how much each pixel differs from white.
// Run with: npm run prepare-assets
const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'source');
const OUT = path.join(__dirname, '..', 'assets');

async function cleanSpidey() {
  const { data, info } = await sharp(path.join(SRC, 'spidey.jpg'))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x, y) => (y * W + x) * 4;

  // Background = low-saturation, fairly light pixels (checkerboard + the grey photo thread).
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max - min < 40 && max > 110;
  };

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, 0, x, H - 1); }
  for (let y = 0; y < H; y++) { stack.push(0, y, W - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = y * W + x;
    if (seen[k]) continue;
    seen[k] = 1;
    const i = k * 4;
    if (!isBg(i)) continue;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  // Enclosed checkerboard holes (e.g. between the arms and legs): large background-ish
  // components with lots of mid-grey checker squares. The white eyes are small/bright and survive.
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    const k0 = y0 * W + x0;
    if (seen[k0] || !isBg(k0 * 4)) continue;
    const comp = [], st = [k0];
    seen[k0] = 1;
    let grey = 0;
    while (st.length) {
      const k = st.pop();
      comp.push(k);
      const v = data[k * 4];
      if (v > 180 && v < 238) grey++;
      const x = k % W, y = (k - x) / W;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (!seen[nk] && isBg(nk * 4)) { seen[nk] = 1; st.push(nk); }
      }
    }
    const isChecker = comp.length > 3000 && grey / comp.length > 0.25;
    if (comp.length > 300) console.log('  component', comp.length, 'px, grey', (grey / comp.length).toFixed(2), isChecker ? '-> removed' : '-> kept');
    if (isChecker) for (const k of comp) data[k * 4 + 3] = 0;
  }

  // Soften the edge: semi-transparent for opaque pixels touching a cleared one.
  const alpha = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) alpha[k] = data[k * 4 + 3];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x;
    if (!alpha[k]) continue;
    const n = (alpha[k - 1] === 0) + (alpha[k + 1] === 0) + (alpha[k - W] === 0) + (alpha[k + W] === 0);
    if (n) data[k * 4 + 3] = 255 - n * 45;
  }

  // Remove isolated specks: keep only rows/cols where real content exists, then trim.
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png().trim({ threshold: 1 }).toFile(path.join(OUT, 'spidey.png'));
  const meta = await sharp(path.join(OUT, 'spidey.png')).metadata();
  console.log('spidey.png', meta.width + 'x' + meta.height);
}

async function cleanWeb() {
  const { data, info } = await sharp(path.join(SRC, 'web.jpg'))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const ink = 255 - Math.min(g, b);          // how far from white toward red
    const a = Math.max(0, Math.min(255, (ink - 25) * 1.6));
    data[i] = 226; data[i + 1] = 35; data[i + 2] = 40; data[i + 3] = a;
    void r;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().trim({ threshold: 1 }).toFile(path.join(OUT, 'web.png'));
  console.log('web.png done');
}

async function makeIcon() {
  // Square tray/app icon cropped around the mask (bottom of the upside-down figure).
  const m = await sharp(path.join(OUT, 'spidey.png')).metadata();
  const size = Math.round(m.width * 0.24);
  const left = Math.round(m.width * 0.514 - size / 2);
  const top = m.height - size;
  const head = await sharp(path.join(OUT, 'spidey.png'))
    .extract({ left, top, width: size, height: size }).png().toBuffer();
  await sharp(head)
    .rotate(180)
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(path.join(OUT, 'icon.png'));
  console.log('icon.png done');
}

(async () => { await cleanSpidey(); await cleanWeb(); await makeIcon(); })();
