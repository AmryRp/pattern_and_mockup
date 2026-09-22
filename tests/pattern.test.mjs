import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  copies,
  drawPattern,
  hitLayer,
  initialPattern,
  removeFlatBackground,
  wrap,
} from '../lib/pattern.ts';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

test('objects crossing both tile edges appear in all four corners', () => {
  const layer = {
    ...initialPattern.layers[0],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  assert.deepEqual(copies(layer), [
    { x: 0, y: 0 },
    { x: 0, y: 1024 },
    { x: 1024, y: 0 },
    { x: 1024, y: 1024 },
  ]);
  assert.ok(hitLayer(layer, 1020, 1020));
  assert.equal(wrap(-10), 1014);
});
test('large rotated artwork wraps beyond immediate neighbors', () => {
  const layer = {
    ...initialPattern.layers[0],
    x: 512,
    y: 512,
    width: 4096,
    height: 4096,
    rotation: 45,
  };
  assert.ok(copies(layer).length > 9);
});
test('hit testing handles rotation and rejects locked/hidden artwork', () => {
  const layer = {
    ...initialPattern.layers[0],
    x: 512,
    y: 512,
    width: 200,
    height: 40,
    rotation: 90,
  };
  assert.ok(hitLayer(layer, 512, 590));
  assert.equal(hitLayer(layer, 590, 512), false);
  assert.equal(hitLayer({ ...layer, locked: true }, 512, 512), false);
  assert.equal(hitLayer({ ...layer, visible: false }, 512, 512), false);
});
test('transparent exports clear old pixels and respect stack order', () => {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_t, key) =>
        (...args) =>
          calls.push([key, ...args]),
      set: (_t, key, value) => {
        calls.push([key, value]);
        return true;
      },
    },
  );
  drawPattern(
    { width: 2048, height: 2048, getContext: () => ctx },
    {
      ...initialPattern,
      transparent: true,
      layers: [
        initialPattern.layers[0],
        { ...initialPattern.layers[1], visible: false },
        initialPattern.layers[2],
      ],
    },
    new Map(),
  );
  assert.deepEqual(calls[0], ['clearRect', 0, 0, 2048, 2048]);
  assert.deepEqual(calls[2], ['scale', 2, 2]);
  const colors = calls.filter((c) => c[0] === 'fillStyle').map((c) => c[1]);
  assert.deepEqual([...new Set(colors)], ['#334cdd', '#272a2c']);
  assert.equal(colors.at(-1), '#272a2c');
});
test('background removal preserves enclosed whites and existing alpha', () => {
  const data = new Uint8ClampedArray(5 * 5 * 4).fill(255);
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 3; x++)
      if (x !== 2 || y !== 2) {
        const i = (y * 5 + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
  data[3] = 0;
  removeFlatBackground(data, 5, 5, 0);
  assert.equal(data[(2 * 5 + 2) * 4 + 3], 255);
  assert.equal(data[(1 * 5 + 1) * 4 + 3], 255);
  assert.equal(data[4 * 4 + 3], 0);
  assert.equal(data[3], 0);
});
test('background tolerance accepts near-white without removing dark subject', () => {
  const data = new Uint8ClampedArray([
    255, 255, 255, 255, 244, 245, 244, 255, 0, 0, 0, 255,
  ]);
  removeFlatBackground(data, 3, 1, 8);
  assert.deepEqual([data[3], data[7], data[11]], [0, 0, 255]);
});
test('OBJ loader preserves provided UVs and exposes missing UVs', () => {
  const vertices = 'v 0 0 0\nv 1 0 0\nv 0 1 0\n';
  const mapped = new OBJLoader().parse(
    vertices + 'vt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n',
  );
  assert.deepEqual(
    Array.from(mapped.children[0].geometry.attributes.uv.array),
    [0, 0, 1, 0, 0, 1],
  );
  const unmapped = new OBJLoader().parse(vertices + 'f 1 2 3\n');
  assert.equal(unmapped.children[0].geometry.attributes.uv, undefined);
});
test('GLB binary loader retains authored UV coordinates', async () => {
  const bin = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.25, 1, 0.25, 0, 0.75,
  ]);
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
    ],
  });
  const jsonBytes = new TextEncoder().encode(
    json.padEnd(Math.ceil(json.length / 4) * 4, ' '),
  );
  const buffer = new ArrayBuffer(28 + jsonBytes.length + bin.byteLength),
    view = new DataView(buffer);
  [0x46546c67, 2, buffer.byteLength, jsonBytes.length, 0x4e4f534a].forEach(
    (n, i) => view.setUint32(i * 4, n, true),
  );
  new Uint8Array(buffer, 20, jsonBytes.length).set(jsonBytes);
  view.setUint32(20 + jsonBytes.length, bin.byteLength, true);
  view.setUint32(24 + jsonBytes.length, 0x004e4942, true);
  new Uint8Array(buffer, 28 + jsonBytes.length).set(new Uint8Array(bin.buffer));
  const model = await new GLTFLoader().parseAsync(buffer, '');
  assert.deepEqual(
    Array.from(model.scene.children[0].geometry.attributes.uv.array),
    [0, 0.25, 1, 0.25, 0, 0.75],
  );
});
