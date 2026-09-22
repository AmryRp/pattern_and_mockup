export const SIZE = 1024;
export type Layer = {
  id: string;
  name: string;
  kind: 'circle' | 'ring' | 'square' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  opacity: number;
  visible: boolean;
  locked: boolean;
  src?: string;
  original?: string;
};
export type Pattern = {
  layers: Layer[];
  background: string;
  transparent: boolean;
};
export const wrap = (n: number, size = SIZE) => ((n % size) + size) % size;
export function copies(layer: Layer) {
  const radius = Math.hypot(layer.width, layer.height) / 2;
  const result: { x: number; y: number }[] = [];
  const x = wrap(layer.x),
    y = wrap(layer.y);
  for (
    let ix = Math.ceil((-radius - x) / SIZE);
    ix <= Math.floor((SIZE + radius - x) / SIZE);
    ix++
  )
    for (
      let iy = Math.ceil((-radius - y) / SIZE);
      iy <= Math.floor((SIZE + radius - y) / SIZE);
      iy++
    )
      result.push({ x: x + ix * SIZE, y: y + iy * SIZE });
  return result;
}
export function drawPattern(
  canvas: HTMLCanvasElement,
  pattern: Pattern,
  images: Map<string, HTMLImageElement>,
) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / SIZE, canvas.height / SIZE);
  if (!pattern.transparent) {
    ctx.fillStyle = pattern.background;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  for (const layer of pattern.layers) {
    if (!layer.visible) continue;
    for (const position of copies(layer)) {
      ctx.save();
      ctx.translate(position.x, position.y);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.globalAlpha = layer.opacity;
      ctx.fillStyle = layer.color;
      ctx.strokeStyle = layer.color;
      const { width: w, height: h } = layer;
      if (layer.kind === 'image' && layer.src) {
        const img = images.get(layer.src);
        if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else if (layer.kind === 'square') ctx.fillRect(-w / 2, -h / 2, w, h);
      else {
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          w * 0.5 * (layer.kind === 'ring' ? 0.76 : 1),
          h * 0.5 * (layer.kind === 'ring' ? 0.76 : 1),
          0,
          0,
          Math.PI * 2,
        );
        if (layer.kind === 'ring') {
          ctx.lineWidth = Math.min(w, h) * 0.22;
          ctx.stroke();
        } else ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
export function hitLayer(layer: Layer, x: number, y: number) {
  if (!layer.visible || layer.locked) return false;
  const r = (-layer.rotation * Math.PI) / 180;
  return copies(layer).some((p) => {
    const dx = x - p.x,
      dy = y - p.y;
    const lx = dx * Math.cos(r) - dy * Math.sin(r),
      ly = dx * Math.sin(r) + dy * Math.cos(r);
    return Math.abs(lx) <= layer.width / 2 && Math.abs(ly) <= layer.height / 2;
  });
}
export const initialPattern: Pattern = {
  background: '#f6f1e7',
  transparent: false,
  layers: [
    {
      id: 'a',
      name: 'Cobalt / disc',
      kind: 'circle',
      x: 220,
      y: 235,
      width: 330,
      height: 330,
      rotation: 0,
      color: '#334cdd',
      opacity: 1,
      visible: true,
      locked: false,
    },
    {
      id: 'b',
      name: 'Tangerine / ring',
      kind: 'ring',
      x: 740,
      y: 250,
      width: 385,
      height: 385,
      rotation: 0,
      color: '#f0784d',
      opacity: 1,
      visible: true,
      locked: false,
    },
    {
      id: 'c',
      name: 'Ink / diamond',
      kind: 'square',
      x: 225,
      y: 740,
      width: 245,
      height: 245,
      rotation: 45,
      color: '#272a2c',
      opacity: 1,
      visible: true,
      locked: false,
    },
    {
      id: 'd',
      name: 'Cobalt / ring',
      kind: 'ring',
      x: 750,
      y: 765,
      width: 385,
      height: 385,
      rotation: 0,
      color: '#334cdd',
      opacity: 1,
      visible: true,
      locked: false,
    },
    {
      id: 'e',
      name: 'Tangerine / edge',
      kind: 'circle',
      x: 0,
      y: 0,
      width: 160,
      height: 160,
      rotation: 0,
      color: '#f0784d',
      opacity: 1,
      visible: true,
      locked: false,
    },
  ],
};

// Remove only edge-connected pixels near the top-left background color.
// The queue stores every pixel at most once, bounding both memory and runtime.
export function removeFlatBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
) {
  const original = new Uint8ClampedArray(data),
    visited = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  const color = [original[0], original[1], original[2]];
  let head = 0,
    tail = 0;
  const push = (p: number) => {
    if (visited[p]) return;
    visited[p] = 1;
    const i = p * 4;
    const distance = Math.hypot(
      original[i] - color[0],
      original[i + 1] - color[1],
      original[i + 2] - color[2],
    );
    if (original[i + 3] === 0 || distance <= tolerance * 4.42)
      queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    data[p * 4 + 3] = 0;
    const x = p % width,
      y = Math.floor(p / width);
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }
  return data;
}
