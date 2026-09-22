'use client';
// Local data URLs need native images; the workspace is also a file-drop target.
/* oxlint-disable next/no-img-element, jsx-a11y/no-noninteractive-element-interactions */
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  ChevronRight,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Grid2X2,
  ImagePlus,
  Layers,
  LockKeyhole,
  MousePointer2,
  Move,
  Redo2,
  RotateCcw,
  RotateCw,
  Scan,
  Shapes,
  Square,
  Trash2,
  Undo2,
  UnlockKeyhole,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  copies,
  drawPattern,
  hitLayer,
  initialPattern,
  removeFlatBackground,
  SIZE,
  wrap,
  type Layer,
  type Pattern,
} from '@/lib/pattern';
import ModelPreview, {
  type Mapping,
  type ModelInfo,
  type PreviewHandle,
} from './model-preview';

const uid = () => crypto.randomUUID();
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
function NumberField({
  label,
  value,
  onChange,
  min = -10000,
  max = 10000,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          step={step}
          min={min}
          max={max}
          value={Math.round(value * 100) / 100}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) onChange(clamp(n, min, max));
          }}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}
function Picker({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label}>
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export default function Studio() {
  const [pattern, setPattern] = useState<Pattern>(initialPattern),
    patternRef = useRef(pattern);
  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);
  const [selected, setSelected] = useState<string | null>('b'),
    [tile] = useState<HTMLCanvasElement | null>(() => {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = c.height = SIZE;
      return c;
    });
  const [version, setVersion] = useState(0),
    [repeatView, setRepeatView] = useState(false),
    [tool, setTool] = useState<'move' | 'rotate'>('move');
  const [info, setInfo] = useState<ModelInfo>({
    name: 'Cylinder',
    meshes: 1,
    missing: 0,
    format: 'Primitive',
  });
  const [mapping, setMapping] = useState<Mapping>({
    repeatX: 2,
    repeatY: 2,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    roughness: 0.6,
    wireframe: false,
    spin: false,
  });
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(''),
    [tolerance, setTolerance] = useState(16),
    [dragging, setDragging] = useState(false),
    [historyState, setHistoryState] = useState({ past: 0, future: 0 });
  const [resolution, setResolution] = useState('2048');
  const history = useRef<{ past: Pattern[]; future: Pattern[] }>({
    past: [],
    future: [],
  });
  const images = useRef(new Map<string, HTMLImageElement>()),
    display = useRef<HTMLCanvasElement>(null),
    tileArea = useRef<HTMLDivElement>(null),
    preview = useRef<PreviewHandle>(null);
  const imageInput = useRef<HTMLInputElement>(null),
    modelInput = useRef<HTMLInputElement>(null);
  const layer = pattern.layers.find((l) => l.id === selected);
  const gesture = useRef<{
    mode: 'move' | 'rotate' | 'scale';
    startX: number;
    startY: number;
    layer: Layer;
    pattern: Pattern;
    angle: number;
    distance: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  const record = useCallback((before: Pattern) => {
    history.current.past.push(before);
    if (history.current.past.length > 60) history.current.past.shift();
    history.current.future = [];
    setHistoryState({
      past: history.current.past.length,
      future: history.current.future.length,
    });
  }, []);
  const commit = useCallback(
    (next: Pattern | ((p: Pattern) => Pattern)) => {
      const before = patternRef.current;
      const value = typeof next === 'function' ? next(before) : next;
      record(before);
      patternRef.current = value;
      setPattern(value);
    },
    [record],
  );
  const patchLayer = (patch: Partial<Layer>, id = selected) =>
    commit((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  const undo = useCallback(() => {
    const p = history.current.past.pop();
    if (!p) return;
    history.current.future.push(patternRef.current);
    patternRef.current = p;
    setPattern(p);
    setHistoryState({
      past: history.current.past.length,
      future: history.current.future.length,
    });
  }, []);
  const redo = useCallback(() => {
    const p = history.current.future.pop();
    if (!p) return;
    history.current.past.push(patternRef.current);
    patternRef.current = p;
    setPattern(p);
    setHistoryState({
      past: history.current.past.length,
      future: history.current.future.length,
    });
  }, []);
  const remove = () => {
    if (!layer || layer.locked) return;
    commit((p) => ({
      ...p,
      layers: p.layers.filter((l) => l.id !== selected),
    }));
    setSelected(null);
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          'input,textarea,[contenteditable="true"],[role="slider"],[role="combobox"]',
        )
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault();
        redo();
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        layer &&
        !layer.locked
      ) {
        event.preventDefault();
        remove();
      } else if (event.key === 'Escape') setSelected(null);
      else if (event.key.toLowerCase() === 'v') setTool('move');
      else if (event.key.toLowerCase() === 'r') setTool('rotate');
      else if (
        layer &&
        !layer.locked &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        const d = event.shiftKey ? 10 : 1;
        patchLayer({
          x: wrap(
            layer.x +
              (event.key === 'ArrowLeft'
                ? -d
                : event.key === 'ArrowRight'
                  ? d
                  : 0),
          ),
          y: wrap(
            layer.y +
              (event.key === 'ArrowUp'
                ? -d
                : event.key === 'ArrowDown'
                  ? d
                  : 0),
          ),
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  useEffect(() => {
    if (!tile) return;
    drawPattern(tile, pattern, images.current);
    preview.current?.refresh();
    const c = display.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const count = repeatView ? 3 : 1;
    for (let x = 0; x < count; x++)
      for (let y = 0; y < count; y++)
        ctx.drawImage(
          tile,
          (x * SIZE) / count,
          (y * SIZE) / count,
          SIZE / count,
          SIZE / count,
        );
  }, [pattern, tile, repeatView, version]);
  function add(kind: Layer['kind']) {
    const item: Layer = {
      id: uid(),
      name: `${kind[0].toUpperCase() + kind.slice(1)} ${pattern.layers.length + 1}`,
      kind,
      x: 512,
      y: 512,
      width: 260,
      height: 260,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      color: '#334cdd',
    };
    commit((p) => ({ ...p, layers: [...p.layers, item] }));
    setSelected(item.id);
  }
  function duplicate() {
    if (!layer) return;
    const copy = {
      ...layer,
      id: uid(),
      name: `${layer.name} copy`,
      x: wrap(layer.x + 60),
      y: wrap(layer.y + 60),
      locked: false,
    };
    commit((p) => ({ ...p, layers: [...p.layers, copy] }));
    setSelected(copy.id);
  }
  function reorder(delta: number) {
    const index = pattern.layers.findIndex((l) => l.id === selected),
      target = index + delta;
    if (index < 0 || target < 0 || target >= pattern.layers.length) return;
    const items = [...pattern.layers];
    [items[index], items[target]] = [items[target], items[index]];
    commit({ ...pattern, layers: items });
  }
  async function decode(src: string) {
    const img = new Image();
    img.src = src;
    await img.decode();
    images.current.set(src, img);
    return img;
  }
  async function importImages(files: File[]) {
    if (!files.length) return;
    setBusy('Importing images…');
    const imported: Layer[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        if (!/\.(png|jpe?g|webp|avif|gif)$/i.test(file.name))
          throw new Error(`${file.name}: use PNG, JPG, WebP, AVIF or GIF.`);
        if (file.size > 25 * 1024 * 1024)
          throw new Error(`${file.name}: choose an image under 25 MB.`);
        const url = URL.createObjectURL(file);
        let img: HTMLImageElement;
        try {
          img = new Image();
          img.src = url;
          await img.decode();
        } finally {
          URL.revokeObjectURL(url);
        }
        const scale = Math.min(
          1,
          2048 / Math.max(img.naturalWidth, img.naturalHeight),
        );
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        const src = c.toDataURL('image/png');
        await decode(src);
        const ratio = 360 / Math.max(c.width, c.height);
        imported.push({
          id: uid(),
          name: file.name,
          kind: 'image',
          x: 512,
          y: 512,
          width: c.width * ratio,
          height: c.height * ratio,
          rotation: 0,
          color: '#ffffff',
          opacity: 1,
          visible: true,
          locked: false,
          src,
          original: src,
        });
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : 'An image could not be loaded.',
        );
      }
    }
    if (imported.length) {
      commit((p) => ({ ...p, layers: [...p.layers, ...imported] }));
      setSelected(imported[imported.length - 1].id);
      setVersion((v) => v + 1);
    }
    setBusy('');
    setNotice(
      errors.length
        ? errors.join(' ')
        : `${imported.length} image${imported.length === 1 ? '' : 's'} added. Transparency preserved.`,
    );
  }
  async function importModel(file?: File) {
    if (!file) return;
    if (!/\.(glb|obj)$/i.test(file.name)) {
      setNotice('Choose a .glb or .obj model.');
      return;
    }
    setBusy('Loading model…');
    try {
      if (!preview.current) throw new Error('The 3D preview is not ready.');
      await preview.current.load(file);
    } catch (e) {
      setNotice(
        `Could not load model: ${e instanceof Error ? e.message : 'Invalid file.'} Compressed GLB files should be exported without Draco or KTX2 compression.`,
      );
    } finally {
      setBusy('');
    }
  }
  async function removeBackground() {
    if (!layer?.original || layer.locked) return;
    const target = layer;
    setBusy('Removing background…');
    try {
      const img =
        images.current.get(target.original!) ??
        (await decode(target.original!));
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height);
      removeFlatBackground(pixels.data, c.width, c.height, tolerance);
      ctx.putImageData(pixels, 0, 0);
      const src = c.toDataURL('image/png');
      await decode(src);
      patchLayer({ src }, target.id);
      setVersion((v) => v + 1);
      setNotice(
        'Edge-connected background removed. Adjust tolerance and apply again if needed.',
      );
    } catch {
      setNotice('Background removal failed. Try a smaller image.');
    } finally {
      setBusy('');
    }
  }
  function exportTile() {
    const c = document.createElement('canvas');
    c.width = c.height = Number(resolution);
    drawPattern(c, pattern, images.current);
    c.toBlob((blob) => {
      if (!blob) {
        setNotice('Export failed. Try a smaller resolution.');
        return;
      }
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `tileform-pattern-${resolution}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${resolution} × ${resolution} seamless PNG exported.`);
    }, 'image/png');
  }
  function point(e: ReactPointerEvent) {
    const rect = tileArea.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
    };
  }
  function begin(
    e: ReactPointerEvent,
    mode?: 'rotate' | 'scale',
    target?: Layer,
    center?: { x: number; y: number },
  ) {
    if (repeatView || e.button !== 0) return;
    e.preventDefault();
    const p = point(e);
    const hit =
      target ??
      [...pattern.layers].reverse().find((l) => hitLayer(l, p.x, p.y));
    if (!hit) {
      setSelected(null);
      return;
    }
    setSelected(hit.id);
    if (hit.locked) return;
    const c =
      center ??
      copies(hit).reduce((best, c) =>
        Math.hypot(c.x - p.x, c.y - p.y) <
        Math.hypot(best.x - p.x, best.y - p.y)
          ? c
          : best,
      );
    gesture.current = {
      mode: mode ?? tool,
      startX: p.x,
      startY: p.y,
      layer: hit,
      pattern: patternRef.current,
      angle: Math.atan2(p.y - c.y, p.x - c.x),
      distance: Math.max(1, Math.hypot(p.x - c.x, p.y - c.y)),
      centerX: c.x,
      centerY: c.y,
    };
    tileArea.current!.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e),
      original = g.layer;
    let patch: Partial<Layer>;
    if (g.mode === 'move')
      patch = {
        x: wrap(original.x + p.x - g.startX),
        y: wrap(original.y + p.y - g.startY),
      };
    else if (g.mode === 'rotate') {
      let angle =
        original.rotation +
        ((Math.atan2(p.y - g.centerY, p.x - g.centerX) - g.angle) * 180) /
          Math.PI;
      if (e.shiftKey) angle = Math.round(angle / 15) * 15;
      patch = { rotation: wrap(angle, 360) };
    } else {
      const ratio = Math.hypot(p.x - g.centerX, p.y - g.centerY) / g.distance;
      const scale = clamp(
        ratio,
        8 / Math.min(original.width, original.height),
        2048 / Math.max(original.width, original.height),
      );
      patch = {
        width: original.width * scale,
        height: original.height * scale,
      };
    }
    const next = {
      ...patternRef.current,
      layers: patternRef.current.layers.map((l) =>
        l.id === original.id ? { ...l, ...patch } : l,
      ),
    };
    patternRef.current = next;
    setPattern(next);
  }
  function end(e: ReactPointerEvent) {
    if (gesture.current) {
      record(gesture.current.pattern);
      gesture.current = null;
    }
    if (tileArea.current?.hasPointerCapture(e.pointerId))
      tileArea.current.releasePointerCapture(e.pointerId);
  }
  const map = (values: Partial<Mapping>) =>
    setMapping((m) => ({ ...m, ...values }));
  return (
    <main
      className="studio"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        const model = files.find((f) => /\.(glb|obj)$/i.test(f.name));
        if (model) void importModel(model);
        const pics = files.filter((f) => !/\.(glb|obj)$/i.test(f.name));
        if (pics.length) void importImages(pics);
      }}
    >
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        multiple
        hidden
        onChange={(e) => {
          void importImages(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={modelInput}
        type="file"
        accept=".glb,.obj"
        hidden
        onChange={(e) => {
          void importModel(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <header className="app-header">
        <Link className="brand" href="/" aria-label="Tileform home">
          <span className="brand-mark">
            <Grid2X2 size={23} />
          </span>
          tileform<span className="brand-dot">®</span>
        </Link>
        <span className="header-divider" />
        <span className="project-title">
          Untitled pattern <span className="project-badge">STUDIO</span>
        </span>
        <div className="header-actions">
          <span className="local-label">
            <span /> Local workspace
          </span>
          <Picker
            label="Export resolution"
            value={resolution}
            onChange={setResolution}
            items={['1024', '2048', '4096']}
          />
          <button className="button primary" onClick={exportTile}>
            <Download size={16} />
            Export tile
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="layers-panel">
          <div className="panel-heading">
            <h2>
              <Layers size={17} /> Layers
            </h2>
            <span className="count">{pattern.layers.length}</span>
          </div>
          <button
            className="import-image"
            onClick={() => imageInput.current?.click()}
            disabled={!!busy}
          >
            <ImagePlus size={21} />
            <strong>Add your artwork</strong>
            <span>Drop images or browse files</span>
            <small>PNG, JPG, WebP · transparency supported</small>
          </button>
          <div className="section-label">ADD A SHAPE</div>
          <div className="shape-buttons">
            <button onClick={() => add('circle')}>
              <Circle size={18} />
              Disc
            </button>
            <button onClick={() => add('ring')}>
              <Circle size={18} strokeWidth={4} />
              Ring
            </button>
            <button onClick={() => add('square')}>
              <Square size={18} />
              Square
            </button>
          </div>
          <div className="layer-list-label">
            <span>OBJECTS</span>
            <small>Top layer first</small>
          </div>
          <div className="layer-list">
            {[...pattern.layers].reverse().map((item) => (
              <div
                className={`layer-row ${item.id === selected ? 'selected' : ''}`}
                key={item.id}
              >
                <button
                  className="layer-select"
                  onClick={() => setSelected(item.id)}
                >
                  <span
                    className={`layer-thumb ${item.kind}`}
                    style={{ '--swatch': item.color } as React.CSSProperties}
                  >
                    {item.kind === 'image' ? (
                      <img src={item.src} alt="" />
                    ) : (
                      <span />
                    )}
                  </span>
                  <span className="layer-name">
                    {item.name}
                    <small>
                      {item.kind === 'image' ? 'Image' : 'Shape'}
                      {item.locked ? ' · Locked' : ''}
                    </small>
                  </span>
                </button>
                <IconButton
                  label={
                    item.visible ? `Hide ${item.name}` : `Show ${item.name}`
                  }
                  onClick={() =>
                    patchLayer({ visible: !item.visible }, item.id)
                  }
                >
                  {item.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </IconButton>
              </div>
            ))}
            {pattern.layers.length === 0 && (
              <p className="empty-layers">
                Add an image or shape to start your pattern.
              </p>
            )}
          </div>
          <div className="layer-actions">
            <IconButton
              label="Move layer up"
              disabled={
                !layer || layer.locked || pattern.layers.at(-1)?.id === selected
              }
              onClick={() => reorder(1)}
            >
              <ArrowUp size={16} />
            </IconButton>
            <IconButton
              label="Move layer down"
              disabled={
                !layer || layer.locked || pattern.layers[0]?.id === selected
              }
              onClick={() => reorder(-1)}
            >
              <ArrowDown size={16} />
            </IconButton>
            <IconButton
              label="Duplicate layer"
              disabled={!layer}
              onClick={duplicate}
            >
              <Copy size={16} />
            </IconButton>
            <IconButton
              label={layer?.locked ? 'Unlock layer' : 'Lock layer'}
              disabled={!layer}
              onClick={() => layer && patchLayer({ locked: !layer.locked })}
            >
              {layer?.locked ? (
                <LockKeyhole size={16} />
              ) : (
                <UnlockKeyhole size={16} />
              )}
            </IconButton>
            <IconButton
              label="Delete layer"
              disabled={!layer || layer.locked}
              onClick={remove}
            >
              <Trash2 size={16} />
            </IconButton>
          </div>
          <div className="tile-settings">
            <div className="section-label">TILE BACKGROUND</div>
            <div className="color-row">
              <input
                aria-label="Tile background color"
                type="color"
                value={pattern.background}
                disabled={pattern.transparent}
                onChange={(e) =>
                  commit({ ...pattern, background: e.target.value })
                }
              />
              <span>
                {pattern.transparent
                  ? 'Transparent'
                  : pattern.background.toUpperCase()}
              </span>
              <Switch
                aria-label="Transparent tile background"
                checked={pattern.transparent}
                onCheckedChange={(v) => commit({ ...pattern, transparent: v })}
              />
            </div>
            <p>Use the switch for a transparent PNG.</p>
          </div>
          <div className="sidebar-footer">
            <span className="privacy-dot" />
            Your images stay on this device.
          </div>
        </aside>
        <section className="working-area">
          <div className="workspace-title">
            <div>
              <span className="eyebrow">PATTERN WORKSPACE</span>
              <h1>Make it repeat.</h1>
            </div>
            <div className="history-buttons">
              <IconButton
                label="Undo (Ctrl+Z)"
                disabled={!historyState.past}
                onClick={undo}
              >
                <Undo2 size={18} />
              </IconButton>
              <IconButton
                label="Redo (Ctrl+Shift+Z)"
                disabled={!historyState.future}
                onClick={redo}
              >
                <Redo2 size={18} />
              </IconButton>
            </div>
          </div>
          <div className="view-grid">
            <section className="editor-card">
              <div className="view-heading">
                <h2>
                  <span className="view-number">01</span> Pattern editor
                </h2>
                <span className="subtle">1024 × 1024</span>
              </div>
              <div className="editor-tools">
                <div className="tool-group">
                  <IconButton
                    label="Move tool (V)"
                    aria-pressed={tool === 'move'}
                    onClick={() => setTool('move')}
                  >
                    <MousePointer2 size={17} />
                  </IconButton>
                  <IconButton
                    label="Rotate tool (R)"
                    aria-pressed={tool === 'rotate'}
                    onClick={() => setTool('rotate')}
                  >
                    <RotateCw size={17} />
                  </IconButton>
                </div>
                <button
                  className={`repeat-toggle ${repeatView ? 'active' : ''}`}
                  onClick={() => setRepeatView((v) => !v)}
                >
                  <Grid2X2 size={15} />
                  {repeatView ? 'Edit single tile' : 'Check repeat'}
                </button>
              </div>
              <div className="canvas-space">
                <div
                  className={`tile-area checker ${repeatView ? 'repeat-mode' : ''}`}
                  ref={tileArea}
                  onPointerDown={(e) => begin(e)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  onLostPointerCapture={(e) => {
                    if (gesture.current) end(e);
                  }}
                >
                  <canvas
                    ref={display}
                    width={SIZE}
                    height={SIZE}
                    aria-label="Seamless pattern canvas. Select layers and use transform fields or drag handles to edit."
                  />
                  {!repeatView && layer?.visible && !layer.locked && (
                    <svg
                      className="gizmo"
                      viewBox={`0 0 ${SIZE} ${SIZE}`}
                      aria-label="Layer transform handles"
                    >
                      {copies(layer).map((p, i) => (
                        <g
                          key={i}
                          transform={`translate(${p.x} ${p.y}) rotate(${layer.rotation})`}
                        >
                          <rect
                            x={-layer.width / 2}
                            y={-layer.height / 2}
                            width={layer.width}
                            height={layer.height}
                            fill="none"
                            stroke="#4668ff"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                          <path
                            d={`M 0 ${-layer.height / 2} v -65`}
                            stroke="#4668ff"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                          <circle
                            cx={0}
                            cy={-layer.height / 2 - 65}
                            r={17}
                            className="rotate-handle"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              begin(e, 'rotate', layer, p);
                            }}
                          />
                          {[
                            [-1, -1],
                            [1, -1],
                            [1, 1],
                            [-1, 1],
                          ].map(([x, y], k) => (
                            <rect
                              key={k}
                              x={(x * layer.width) / 2 - 11}
                              y={(y * layer.height) / 2 - 11}
                              width={22}
                              height={22}
                              className="scale-handle"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                begin(e, 'scale', layer, p);
                              }}
                            />
                          ))}
                          <circle r={7} fill="#4668ff" />
                        </g>
                      ))}
                    </svg>
                  )}
                  {repeatView && <div className="center-tile-guide" />}
                </div>
                <div className="tile-caption">
                  <span className="status-dot" />
                  {repeatView
                    ? '3 × 3 repeat preview'
                    : 'Edges wrap automatically'}
                </div>
              </div>
              <div className="view-footer">
                <Move size={14} />
                <span>
                  {repeatView
                    ? 'Return to single tile to edit artwork'
                    : 'Drag to move · corner to scale · handle to rotate'}
                </span>
              </div>
            </section>
            <section className="preview-card">
              <div className="view-heading">
                <h2>
                  <span className="view-number">02</span> 3D preview
                </h2>
                <span className="live-badge">
                  <span />
                  LIVE
                </span>
              </div>
              <div className="preview-tools">
                <Picker
                  label="Preview model"
                  value={
                    ['Cylinder', 'Sphere', 'Cube', 'Torus'].includes(info.name)
                      ? info.name
                      : 'Custom model'
                  }
                  onChange={(v) => preview.current?.preset(v)}
                  items={[
                    'Cylinder',
                    'Sphere',
                    'Cube',
                    'Torus',
                    ...(!['Cylinder', 'Sphere', 'Cube', 'Torus'].includes(
                      info.name,
                    )
                      ? ['Custom model']
                      : []),
                  ]}
                />
                <IconButton
                  label="Reset camera"
                  onClick={() => preview.current?.reset()}
                >
                  <Scan size={17} />
                </IconButton>
              </div>
              <div className="model-space">
                <ModelPreview
                  ref={preview}
                  canvas={tile}
                  mapping={mapping}
                  onInfo={setInfo}
                  onError={setNotice}
                />
                <span className="model-label">
                  <Box size={14} />
                  {info.name}
                </span>
                <div className="axis-legend">
                  <span>Y</span>
                  <span>Z</span>
                  <span>X</span>
                </div>
              </div>
              <div className="view-footer">
                <RotateCw size={14} />
                <span>Drag to orbit · scroll to zoom · right drag to pan</span>
              </div>
            </section>
          </div>
          <div className="workspace-bottom">
            <div>
              <span className="seamless-mark">
                <Check size={15} />
              </span>
              <span>One tile. Endless possibilities.</span>
            </div>
            <button
              className="text-button"
              onClick={() => modelInput.current?.click()}
              disabled={!!busy}
            >
              <Upload size={15} />
              Import your own 3D model <ChevronRight size={15} />
            </button>
          </div>
          <div className="inspector">
            <Tabs defaultValue="layer">
              <div className="inspector-top">
                <TabsList variant="line">
                  <TabsTrigger value="layer">
                    <Shapes size={15} />
                    Layer properties
                  </TabsTrigger>
                  <TabsTrigger value="mapping">
                    <Box size={15} />
                    UV & material
                  </TabsTrigger>
                </TabsList>
                <span className="subtle">
                  {layer ? layer.name : 'No layer selected'}
                </span>
              </div>
              <TabsContent value="layer">
                {layer ? (
                  <div className="properties-grid">
                    <div className="property-block">
                      <div className="section-label">POSITION</div>
                      <div className="field-pair">
                        <NumberField
                          label="X"
                          value={layer.x}
                          onChange={(n) =>
                            !layer.locked && patchLayer({ x: wrap(n) })
                          }
                          suffix="px"
                        />
                        <NumberField
                          label="Y"
                          value={layer.y}
                          onChange={(n) =>
                            !layer.locked && patchLayer({ y: wrap(n) })
                          }
                          suffix="px"
                        />
                      </div>
                    </div>
                    <div className="property-block">
                      <div className="section-label">SIZE & ROTATION</div>
                      <div className="field-triple">
                        <NumberField
                          label="W"
                          value={layer.width}
                          min={8}
                          max={2048}
                          onChange={(n) =>
                            !layer.locked && patchLayer({ width: n })
                          }
                        />
                        <NumberField
                          label="H"
                          value={layer.height}
                          min={8}
                          max={2048}
                          onChange={(n) =>
                            !layer.locked && patchLayer({ height: n })
                          }
                        />
                        <NumberField
                          label="Angle"
                          value={layer.rotation}
                          min={-360}
                          max={360}
                          onChange={(n) =>
                            !layer.locked && patchLayer({ rotation: n })
                          }
                          suffix="°"
                        />
                      </div>
                    </div>
                    <div className="property-block">
                      <div className="section-label">
                        APPEARANCE{' '}
                        <span>{Math.round(layer.opacity * 100)}%</span>
                      </div>
                      <div className="appearance-controls">
                        {layer.kind !== 'image' && (
                          <input
                            aria-label="Shape color"
                            type="color"
                            value={layer.color}
                            disabled={layer.locked}
                            onChange={(e) =>
                              patchLayer({ color: e.target.value })
                            }
                          />
                        )}
                        <Slider
                          aria-label="Layer opacity"
                          value={[layer.opacity * 100]}
                          min={0}
                          max={100}
                          disabled={layer.locked}
                          onValueChange={(v) =>
                            patchLayer({
                              opacity: (Array.isArray(v) ? v[0] : v) / 100,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="inspector-empty">
                    <MousePointer2 size={18} />
                    Select a layer to adjust its position, scale and appearance.
                  </div>
                )}
                {layer?.kind === 'image' && (
                  <div className="background-tools">
                    <WandSparkles size={18} />
                    <div>
                      <strong>Remove flat background</strong>
                      <p>
                        Uses the top-left color. Best for solid backgrounds;
                        preserves enclosed areas.
                      </p>
                    </div>
                    <NumberField
                      label="Tolerance"
                      value={tolerance}
                      min={0}
                      max={100}
                      onChange={setTolerance}
                    />
                    <button
                      className="button"
                      disabled={!!busy || layer.locked}
                      onClick={removeBackground}
                    >
                      Remove background
                    </button>
                    <IconButton
                      label="Restore original image"
                      disabled={layer.src === layer.original || layer.locked}
                      onClick={() => patchLayer({ src: layer.original })}
                    >
                      <RotateCcw size={17} />
                    </IconButton>
                  </div>
                )}
                {layer?.locked && (
                  <p className="locked-notice">
                    <LockKeyhole size={14} />
                    This layer is locked. Unlock it in the layers panel to edit.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="mapping">
                <div className="properties-grid mapping-grid">
                  <div className="property-block">
                    <div className="section-label">TEXTURE REPEAT</div>
                    <div className="field-pair">
                      <NumberField
                        label="U"
                        value={mapping.repeatX}
                        min={0.1}
                        max={20}
                        step={0.1}
                        onChange={(n) => map({ repeatX: n })}
                        suffix="×"
                      />
                      <NumberField
                        label="V"
                        value={mapping.repeatY}
                        min={0.1}
                        max={20}
                        step={0.1}
                        onChange={(n) => map({ repeatY: n })}
                        suffix="×"
                      />
                    </div>
                  </div>
                  <div className="property-block">
                    <div className="section-label">UV TRANSFORM</div>
                    <div className="field-triple">
                      <NumberField
                        label="Offset U"
                        value={mapping.offsetX}
                        min={-10}
                        max={10}
                        step={0.05}
                        onChange={(n) => map({ offsetX: n })}
                      />
                      <NumberField
                        label="Offset V"
                        value={mapping.offsetY}
                        min={-10}
                        max={10}
                        step={0.05}
                        onChange={(n) => map({ offsetY: n })}
                      />
                      <NumberField
                        label="Rotation"
                        value={mapping.rotation}
                        min={-360}
                        max={360}
                        onChange={(n) => map({ rotation: n })}
                        suffix="°"
                      />
                    </div>
                  </div>
                  <div className="property-block">
                    <div className="section-label">
                      ROUGHNESS <span>{mapping.roughness.toFixed(2)}</span>
                    </div>
                    <Slider
                      aria-label="Material roughness"
                      value={[mapping.roughness * 100]}
                      min={0}
                      max={100}
                      onValueChange={(v) =>
                        map({ roughness: (Array.isArray(v) ? v[0] : v) / 100 })
                      }
                    />
                  </div>
                </div>
                <div className="mapping-options">
                  <label htmlFor="auto-rotate">
                    <Switch
                      id="auto-rotate"
                      checked={mapping.spin}
                      onCheckedChange={(v) => map({ spin: v })}
                    />
                    Auto rotate
                  </label>
                  <label htmlFor="wireframe">
                    <Switch
                      id="wireframe"
                      checked={mapping.wireframe}
                      onCheckedChange={(v) => map({ wireframe: v })}
                    />
                    Wireframe
                  </label>
                  <span>
                    {info.format} · {info.meshes} mesh
                    {info.meshes !== 1 ? 'es' : ''} ·{' '}
                    {info.missing ? 'UVs missing' : 'UVs ready'}
                  </span>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          {info.missing > 0 && (
            <div className="uv-warning">
              <span>
                Some model surfaces have no UV coordinates. Re-export with UVs
                for accurate placement, or try a planar projection (may
                stretch).
              </span>
              <button
                className="button"
                onClick={() => preview.current?.generateUV()}
              >
                Generate planar UVs
              </button>
            </div>
          )}
        </section>
      </div>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {busy || 'All changes previewed live'}
        </span>
        <span>
          GLB + OBJ supported <span className="footer-divider">/</span> PNG
          export up to 4K
        </span>
        <span>
          TILEFORM STUDIO <span className="footer-divider">/</span> 01
        </span>
      </footer>
      {notice && (
        <output className="notification" aria-live="polite">
          <span>{notice}</span>
          <IconButton
            label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X size={17} />
          </IconButton>
        </output>
      )}
      {dragging && (
        <div className="drop-overlay">
          <div>
            <Upload size={44} />
            <h2>Drop it into your workspace</h2>
            <p>Images become layers. GLB and OBJ files open in 3D.</p>
          </div>
        </div>
      )}
    </main>
  );
}
