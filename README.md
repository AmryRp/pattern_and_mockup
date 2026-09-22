# Tileform

A local-first seamless pattern editor with an interactive Three.js model preview.

## Run

Requires Node.js 22.13 or newer. A compatible project-local Node runtime is included as a development dependency.

```sh
npm install
npm run dev
```

On Windows PowerShell with script execution disabled, use `npm.cmd`.

## Use

- Drag PNG, JPG, WebP, AVIF or GIF images into the workspace, or select **Add your artwork**. Images become independent layers; GIF imports use a single frame. Images are resized to a maximum of 2048 pixels to keep editing responsive.
- Move layers on the canvas. Corner handles scale proportionally; the round handle rotates. Hold Shift to snap rotation to 15 degrees. Numeric fields support independent width/height and exact position/rotation.
- Use the layer panel for stacking, duplication, visibility and locking. Arrow keys move a selected layer by 1 pixel, or 10 with Shift. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes.
- Edge copies are rendered into the exported tile. **Check repeat** shows a 3×3 tiled preview.
- Background removal performs local edge-connected color removal using the top-left pixel and adjustable tolerance. It is for flat backgrounds, not AI subject segmentation. Existing PNG transparency is retained. Turn on the tile background switch to export RGBA.
- Import uncompressed, self-contained GLB or OBJ models. GLB uses glTF texture orientation; OBJ uses standard UV orientation. Existing UV coordinates and the original material's color-texture UV channel are retained. Preview materials are replaced with the pattern material. Animation playback, external GLB resources, Draco, KTX2 and OBJ material/MTL import are not included.
- Missing UV channels are reported. Optional planar UV generation is a fallback, not a distortion-free unwrap. Author a proper UV layout in a modeling app for best results. A seamless texture does not remove seams caused by discontinuous model UVs.
- **UV & material** controls repeat, offset, rotation, roughness, wireframe and auto rotation. Transparent tile areas show the underlying white preview material.
- Export PNG tiles at 1024, 2048 or 4096 pixels. The downloaded PNG is the tile, not the model. Apply the same repeat/offset/rotation values in your 3D software.

All image and model processing takes place in the browser. No files are uploaded. Work is held in memory and clears on reload; export your tile before closing.

## Verify

```sh
npm run check
npm test
npm run build
```

Tests cover wrap copies, rotated hit testing, layer ordering, transparent rendering, background flood fill, and GLB/OBJ UV retention. Browser interaction and GPU rendering should also be checked on target devices before production use.

Three.js references: [texture transforms](https://threejs.org/docs/pages/Texture.html), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [CanvasTexture](https://threejs.org/docs/pages/CanvasTexture.html).
