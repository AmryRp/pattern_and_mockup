import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { drawPattern, initialPattern } from '../lib/pattern.ts';

function installCanvasDocument(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => createCanvas(1, 1) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
}
const square = {
  ...initialPattern.layers[0],
  kind: 'square',
  x: 512,
  y: 512,
  width: 1024,
  height: 1024,
  color: '#ff0000',
};
const pixel = (canvas, x, y) => [
  ...canvas.getContext('2d').getImageData(x, y, 1, 1).data,
];

test('blend modes and opacity produce the same pixels at preview and export scales', () => {
  for (const size of [64, 256]) {
    const canvas = createCanvas(size, size);
    const pattern = {
      background: '#0000ff',
      transparent: false,
      layers: [square],
    };
    for (const [blendMode, opacity, expected] of [
      ['Normal', 1, [255, 0, 0, 255]],
      ['Multiply', 1, [0, 0, 0, 255]],
      ['Screen', 1, [255, 0, 255, 255]],
      ['Multiply', 0.5, [0, 0, 127, 255]],
    ]) {
      drawPattern(
        canvas,
        { ...pattern, layers: [{ ...square, blendMode, opacity }] },
        new Map(),
      );
      const actual = pixel(canvas, size / 2, size / 2);
      actual.forEach((value, i) =>
        assert.ok(
          Math.abs(value - expected[i]) <= 1,
          `${String(blendMode)}: ${actual.join(', ')}`,
        ),
      );
    }
    // The next normal layer must not inherit the previous layer's blend mode.
    drawPattern(
      canvas,
      {
        ...pattern,
        layers: [
          { ...square, blendMode: 'Multiply' },
          { ...square, width: 256, height: 256, color: '#00ff00' },
        ],
      },
      new Map(),
    );
    assert.deepEqual(pixel(canvas, size / 2, size / 2), [0, 255, 0, 255]);
    assert.deepEqual(pixel(canvas, size / 8, size / 8), [0, 0, 0, 255]);
  }
});

test('image recolor preserves alpha and original pixels and can be undone', async (t) => {
  installCanvasDocument(t);
  const source = createCanvas(4, 4);
  const ctx = source.getContext('2d');
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.fillRect(0, 0, 2, 4);
  const image = await loadImage(source.toBuffer('image/png'));
  const images = new Map([['source', image]]);
  const canvas = createCanvas(64, 64);
  const layer = {
    ...square,
    kind: 'image',
    src: 'source',
    color: '#00ff00',
    recolor: true,
  };
  const pattern = { background: '#ffffff', transparent: true, layers: [layer] };
  drawPattern(canvas, pattern, images);
  assert.deepEqual(pixel(canvas, 8, 32), [0, 255, 0, 127]);
  assert.deepEqual(pixel(canvas, 56, 32), [0, 0, 0, 0]);
  drawPattern(
    canvas,
    { ...pattern, layers: [{ ...layer, color: '#0000ff' }] },
    images,
  );
  assert.deepEqual(pixel(canvas, 8, 32), [0, 0, 255, 127]);
  drawPattern(
    canvas,
    { ...pattern, layers: [{ ...layer, recolor: false }] },
    images,
  );
  assert.deepEqual(pixel(canvas, 8, 32), [255, 0, 0, 127]);
  drawPattern(canvas, pattern, images);
  assert.deepEqual(pixel(canvas, 8, 32), [0, 255, 0, 127]);
});

test('recolor and blending apply to wrapped image copies', async (t) => {
  installCanvasDocument(t);
  const source = createCanvas(4, 4);
  source.getContext('2d').fillRect(0, 0, 4, 4);
  const image = await loadImage(source.toBuffer('image/png'));
  const canvas = createCanvas(64, 64);
  drawPattern(
    canvas,
    {
      background: '#0000ff',
      transparent: false,
      layers: [
        {
          ...square,
          kind: 'image',
          src: 'source',
          recolor: true,
          blendMode: 'Screen',
          x: 0,
          y: 0,
          width: 256,
          height: 256,
        },
      ],
    },
    new Map([['source', image]]),
  );
  for (const [x, y] of [
    [2, 2],
    [61, 2],
    [2, 61],
    [61, 61],
  ]) {
    assert.deepEqual(pixel(canvas, x, y), [255, 0, 255, 255]);
  }
  assert.deepEqual(pixel(canvas, 32, 32), [0, 0, 255, 255]);
});
