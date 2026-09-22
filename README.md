# AtoZTileform

A local-first seamless pattern editor with an interactive Three.js model preview.

## Run

Requires Node.js 22.13 or newer. A compatible project-local Node runtime is included as a development dependency.

```sh
npm install
npm run dev
```

On Windows PowerShell with script execution disabled, use `npm.cmd`.

## Deploy to Vercel

The default `dev`, `build`, and `start` scripts use Vinext and Cloudflare Workers
for Sites. That Worker output cannot be served directly by Vercel.

Vercel uses the native Next.js build configured in `vercel.json`:

- Root Directory: the repository directory containing `package.json` and `vercel.json`.
- Framework Preset: **Next.js**.
- Build Command: `npm run build:vercel`.
- Output Directory: `.next-vercel` (isolated from Vinext's generated route types).
- Install Command: the default npm install command.
- Node.js: **22.x** or newer.

Commit and push the deployment configuration, dependency manifest, and lockfile,
then redeploy in Vercel. If an older deployment still returns `404 NOT_FOUND`,
redeploy without the existing build cache and verify the domain points to the
new deployment. Do not use `dist`, `dist/client`, or `public` as Vercel's output
directory; they do not contain the native Next.js deployment.

To verify the Vercel build locally:

```sh
npm run build:vercel
npm run start:vercel
```

For local development with the same framework, use `npm run dev:vercel`.

## Use

- The workspace fits the viewport. Long layer lists and properties scroll inside their panels; on smaller screens, switch between **Layers**, **Pattern**, and **Preview**.
- Select a layer and use **Layer properties → Color** to change a shape's fill or recolor an image while preserving its transparency. Turn off the image recolor switch to restore its original colors. **Blend** offers Normal, Multiply, Screen, Overlay, and other modes; opacity, blending, and recoloring also apply to repeat previews and exported PNGs. These edits support undo/redo.
- Choose **Plane** in the preview model menu for a front-facing flat surface. Orbit, zoom, texture repeat, and UV transforms work on the plane too; **Reset camera** returns it to the front view.
- Image background removal is under the **Background** tab.
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
