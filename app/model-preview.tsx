'use client';
// This imperative Three.js lifecycle triggers a React Compiler hoisting invariant.
/* oxlint-disable react/react-compiler */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export type Mapping = {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  roughness: number;
  wireframe: boolean;
  spin: boolean;
};
export type ModelInfo = {
  name: string;
  meshes: number;
  missing: number;
  format: string;
};
export type PreviewHandle = {
  load: (file: File) => Promise<void>;
  preset: (name: string) => void;
  reset: () => void;
  generateUV: () => void;
  refresh: () => void;
};
type Engine = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  object: THREE.Object3D | null;
  textures: THREE.CanvasTexture[];
  materials: THREE.MeshStandardMaterial[];
  format: string;
  name: string;
  spin: boolean;
};
function release(object: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const value of Object.values(m))
          if (value instanceof THREE.Texture) textures.add(value);
        m.dispose();
      }
    }
  });
  textures.forEach((t) => t.dispose());
}
const ModelPreview = forwardRef<
  PreviewHandle,
  {
    canvas: HTMLCanvasElement | null;
    mapping: Mapping;
    onInfo: (info: ModelInfo) => void;
    onError: (message: string) => void;
  }
>(function ModelPreview({ canvas, mapping, onInfo, onError }, ref) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null),
    config = useRef(mapping),
    callbacks = useRef({ onInfo, onError });
  useEffect(() => {
    config.current = mapping;
    callbacks.current = { onInfo, onError };
    updateMapping();
  }, [mapping, onInfo, onError]);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  function updateMapping() {
    const e = engine.current;
    if (!e) return;
    const m = config.current;
    e.textures.forEach((t) => {
      t.repeat.set(m.repeatX, m.repeatY);
      t.offset.set(m.offsetX, m.offsetY);
      t.center.set(0.5, 0.5);
      t.rotation = (m.rotation * Math.PI) / 180;
      t.needsUpdate = true;
    });
    e.materials.forEach((mat) => {
      mat.roughness = m.roughness;
      mat.wireframe = m.wireframe;
    });
    e.spin = m.spin;
  }
  function apply(object: THREE.Object3D, name: string, format: string) {
    const e = engine.current;
    if (!e || !canvas) return;
    let meshes = 0,
      missing = 0;
    object.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes++;
    });
    if (!meshes) {
      release(object);
      throw new Error('This file does not contain a mesh.');
    }
    if (e.object) {
      e.root.remove(e.object);
      release(e.object);
    }
    e.textures.forEach((t) => t.dispose());
    e.textures = [];
    e.materials = [];
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object),
      size = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3());
    const scale = 3 / (Math.max(size.x, size.y, size.z) || 1);
    const wrapper = new THREE.Group();
    wrapper.add(object);
    object.position.sub(center);
    wrapper.scale.setScalar(scale);
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const source = Array.isArray(o.material) ? o.material : [o.material];
      const mapped = source.map((original) => {
        const originalMap = original.map as THREE.Texture | undefined;
        const channel = originalMap?.channel ?? 0;
        const attribute = channel === 0 ? 'uv' : `uv${channel}`;
        const hasUV = !!o.geometry.getAttribute(attribute);
        if (!hasUV) missing++;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.flipY = format !== 'GLB';
        texture.channel = channel;
        texture.anisotropy = e.renderer.capabilities.getMaxAnisotropy();
        const mat = new THREE.MeshStandardMaterial({
          color: hasUV ? '#ffffff' : '#b9bcc3',
          map: hasUV ? texture : null,
          roughness: config.current.roughness,
          metalness: 0.04,
          side: THREE.DoubleSide,
        });
        e.textures.push(texture);
        e.materials.push(mat);
        for (const value of Object.values(original))
          if (value instanceof THREE.Texture) value.dispose();
        original.dispose();
        return mat;
      });
      o.material = Array.isArray(o.material) ? mapped : mapped[0];
      o.castShadow = true;
      o.receiveShadow = true;
    });
    e.object = wrapper;
    e.root.add(wrapper);
    e.root.rotation.set(0, 0, 0);
    e.format = format;
    e.name = name;
    e.controls.target.set(0, 0, 0);
    e.camera.position.set(4.6, 3, 5.8);
    e.controls.update();
    updateMapping();
    callbacks.current.onInfo({ name, format, meshes, missing });
  }
  function preset(name: string) {
    generation.current++;
    const g =
      name === 'Sphere'
        ? new THREE.SphereGeometry(1.3, 64, 48)
        : name === 'Cube'
          ? new THREE.BoxGeometry(2.2, 2.2, 2.2)
          : name === 'Torus'
            ? new THREE.TorusGeometry(1, 0.42, 40, 100)
            : new THREE.CylinderGeometry(0.95, 0.95, 2.65, 96, 1, false);
    apply(
      new THREE.Mesh(g, new THREE.MeshStandardMaterial()),
      name,
      'Primitive',
    );
  }
  useImperativeHandle(ref, () => ({
    async load(file) {
      if (!engine.current)
        throw new Error('3D preview is not available on this device.');
      const version = ++generation.current;
      if (file.size > 100 * 1024 * 1024)
        throw new Error('Choose a model smaller than 100 MB.');
      let object: THREE.Object3D;
      const format = file.name.toLowerCase().endsWith('.glb') ? 'GLB' : 'OBJ';
      if (format === 'GLB')
        object = (
          await new GLTFLoader().parseAsync(await file.arrayBuffer(), '')
        ).scene;
      else object = new OBJLoader().parse(await file.text());
      if (version !== generation.current || !engine.current) {
        release(object);
        return;
      }
      apply(object, file.name, format);
    },
    preset,
    reset() {
      const e = engine.current;
      if (!e) return;
      e.camera.position.set(4.6, 3, 5.8);
      e.controls.target.set(0, 0, 0);
      e.root.rotation.set(0, 0, 0);
      e.controls.update();
    },
    refresh() {
      engine.current?.textures.forEach((t) => (t.needsUpdate = true));
    },
    generateUV() {
      const e = engine.current;
      if (!e?.object) return;
      e.object.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mats = (
          Array.isArray(o.material) ? o.material : [o.material]
        ) as THREE.MeshStandardMaterial[];
        if (mats.every((m) => m.map)) return;
        const geo = o.geometry;
        geo.computeBoundingBox();
        const box = geo.boundingBox!,
          size = box.getSize(new THREE.Vector3());
        const pos = geo.getAttribute('position'),
          uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          uv[i * 2] = (pos.getX(i) - box.min.x) / (size.x || 1);
          const v = (pos.getY(i) - box.min.y) / (size.y || 1);
          uv[i * 2 + 1] = e.format === 'GLB' ? 1 - v : v;
        }
        // Explicit planar fallback; original UV channels on mapped meshes remain untouched.
        if (!geo.getAttribute('uv'))
          geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        mats.forEach((m) => {
          if (!m.map) {
            const index = e.materials.indexOf(m);
            const t = e.textures[index];
            if (t.channel > 0)
              geo.setAttribute(
                `uv${t.channel}`,
                new THREE.BufferAttribute(uv.slice(), 2),
              );
            m.map = t;
            m.color.set('#ffffff');
            m.needsUpdate = true;
          }
        });
      });
      let meshes = 0;
      e.object.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes++;
      });
      callbacks.current.onInfo({
        name: e.name,
        format: `${e.format} · planar fallback`,
        meshes,
        missing: 0,
      });
    },
  }));
  useEffect(() => {
    if (!host.current || !canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() => setFailed(true));
      callbacks.current.onError(
        'WebGL is unavailable. The 2D editor and PNG export still work.',
      );
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(4.6, 3, 5.8);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    host.current.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = 15;
    scene.add(new THREE.HemisphereLight('#ffffff', '#929cab', 2.5));
    const key = new THREE.DirectionalLight('#ffffff', 4);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#ced9ff', 2);
    fill.position.set(-4, 2, -3);
    scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.15 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.55;
    floor.receiveShadow = true;
    scene.add(floor);
    const root = new THREE.Group();
    scene.add(root);
    engine.current = {
      renderer,
      scene,
      camera,
      controls,
      root,
      object: null,
      textures: [],
      materials: [],
      format: '',
      name: '',
      spin: config.current.spin,
    };
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    observer.observe(host.current);
    preset('Cylinder');
    const mountedEngine = engine.current;
    let previous = performance.now();
    renderer.setAnimationLoop((now) => {
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (engine.current?.spin) root.rotation.y += delta * 0.28;
      controls.update();
      renderer.render(scene, camera);
    });
    const contextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
      callbacks.current.onError(
        'The 3D graphics context was lost. Reload to restore the preview.',
      );
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    // Numeric generation and engine refs are intentionally invalidated on unmount.
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      controls.dispose();
      if (mountedEngine.object) release(mountedEngine.object);
      mountedEngine.textures.forEach((t) => t.dispose());
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
    // The GPU renderer lifetime follows the source canvas only; live settings use config above.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas]);
  return (
    <div
      className="model-viewport"
      ref={host}
      aria-label="Interactive 3D model. Drag to orbit, scroll to zoom, right drag to pan."
    >
      {failed && (
        <div className="webgl-failed">
          3D preview unavailable
          <br />
          <small>Enable WebGL or try another browser.</small>
        </div>
      )}
    </div>
  );
});
export default ModelPreview;
