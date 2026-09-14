# CDN Library Selection Guide

Use this reference only after identifying a capability that native HTML/CSS/SVG/Canvas cannot implement cleanly. The goal is a smaller, clearer app—not the largest possible library stack.

CDN snippets below deliberately pin a stable major or tested release. Before shipping, verify the selected version against the library's official documentation, test it in the target browser, and keep all imports for one library on the same version and CDN.

## Fast decision table

| Need | Default choice | Use when | Avoid when |
|---|---|---|---|
| Small educational process or material flow | SVG + CSS/Web Animations | Tens of labeled objects, stable routes, accessible text | Hundreds of sprites or complex automatic graph layout |
| Synchronized narrative timeline | GSAP | Play/pause/replay/seek, overlapping beats, path motion | One or two simple fades/transforms |
| Automatic directed-graph layout | Dagre | Small/medium acyclic node-edge diagrams | Compound graphs or many hard constraints |
| Constraint-rich graph layout | ELK.js | Ports, layers, nested/compound graphs, many edges | A simple five-node diagram |
| Common business/scientific chart | Chart.js | Line, bar, scatter, doughnut, radar | Custom networks or spatial processes |
| Complex dashboard/map | Apache ECharts | Linked views, large option sets, maps, richer interaction | A tiny single chart |
| Bespoke data visualization | D3 | Custom scales, joins, axes, geometry | Standard charts already covered above |
| Many 2D sprites/particles | PixiJS | High object count makes DOM/SVG expensive | Text-heavy diagrams with few objects |
| Meaningful 3D | Three.js | Camera, depth, lighting, models are part of the lesson | Decorative particles or a flat process diagram |
| Lightweight DOM behavior | Alpine.js | Tabs, disclosure, modal, small reactive state | An app already using React/Vue/Svelte |
| Icons | Lucide | A small, consistent outline icon set | Icons can be expressed more clearly as text |
| Carousel/touch panels | Swiper | Touch-first slides are core interaction | Content should be visible together for comparison |
| Drag sorting | SortableJS | Reordering is the actual task | Dragging is merely decorative |

## UI and CSS

### Native CSS — default for generated single-file apps

Prefer CSS custom properties, Grid/Flexbox, container/media queries, and a small component vocabulary. It loads instantly, works offline, and prevents a prototype CDN from becoming a hidden runtime dependency.

### Tailwind CSS browser CDN — prototype only

Tailwind's official Play CDN is intended for development, not production. Use it for a disposable prototype when utility classes materially speed iteration:

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```

For a finished deployable app, compile Tailwind at build time or replace it with authored CSS.

### daisyUI — fast conventional controls

Use for forms, buttons, cards, and dialogs in a prototype. The full CDN CSS is not a substitute for information architecture, and the browser Tailwind runtime retains the prototype-only limitation:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```

If only a few components are needed, load daisyUI's component-specific CSS files instead of the full sheet.

### shadcn/ui — not a CDN choice

shadcn/ui distributes component source for framework projects. Use it in an existing React/Next/Vite codebase with its normal installation workflow; do not pretend it is a drop-in script for a standalone HTML file.

Bootstrap and Bulma remain reasonable for conventional form-heavy interfaces, especially when the project already uses them. Do not add either merely to style an educational diagram.

## Motion and narrative timing

### GSAP — primary timeline choice

Use GSAP when the app needs one authoritative, seekable timeline. Load only the plugins used:

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"></script>
<script>gsap.registerPlugin(ScrollTrigger);</script>
```

ScrollTrigger is for scroll-controlled stories, not button-driven process playback. For a process diagram, prefer a normal `gsap.timeline({ paused: true })` controlled by Play/Pause/Step buttons.

Use Motion or anime.js for smaller declarative/tweening needs when their API clearly fits the existing stack. Use AOS only for simple content entrance; it should not drive the core explanation. Use Lottie only when a supplied animation asset conveys real content—never as a substitute for a controllable process model.

## Graph layout: the missing category for complex diagrams

Animation does not solve crossed edges or unstable placement. For flows, dependency maps, pathways, and state machines, separate the system into:

1. **Data model:** nodes, typed ports, edges, labels, stages.
2. **Layout pass:** Dagre or ELK computes positions and routes.
3. **SVG render:** draw nodes, routes, markers, and readable labels.
4. **Narrative timeline:** move tokens along the already stable routes.

Use Dagre for straightforward layered directed graphs. Use ELK.js when ports, nested nodes, orthogonal routing, or more layout constraints matter. Cache the computed geometry; do not rerun layout on every animation frame.

For a small educational process, an authored SVG layout is often clearer than automatic layout. Reserve automatic layout for cases where hand placement is the source of overlap, crossing, or maintenance problems.

## Charts and data visualization

### Chart.js — standard default

Use for familiar quantitative charts:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
```

Give the canvas a responsive parent, label axes and units, and disable or reduce animation when it does not teach anything.

### ECharts and D3

Choose ECharts for complex dashboard interaction, linked charts, maps, or large configuration-driven visuals. Choose D3 only when the visualization's geometry or interaction is genuinely custom. Both are excessive for a small material-flow diagram.

## 2D, 3D, and Canvas

Choose PixiJS when there are enough moving 2D objects that SVG/DOM performance becomes a measured problem. Keep labels and controls in the DOM for accessibility.

Three.js supports CDN imports through ES modules/import maps. Pin one version and use the same CDN/version for core and addons:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@VERSION/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@VERSION/examples/jsm/"
  }
}
</script>
```

Replace `VERSION` with one tested version before delivery. Do not use Three.js just to create a moving dot or decorative particle background.

## Behavior, icons, and fonts

Alpine.js is useful for a standalone HTML app with small reactive UI behavior. Swiper and SortableJS are task-specific: include them only when sliding or reordering is central to the interaction.

Use Lucide as the default icon family and load only the needed icons where practical. Icons support labels; they should not replace unfamiliar concepts with ambiguous symbols.

Prefer a system-font stack for performance, Chinese glyph coverage, and offline reliability. Use Google Fonts only when typography is important, network use is acceptable, and a suitable Chinese fallback is defined. Avoid loading many weights.

## Reliability and performance gate

Before delivery:

- Confirm every CDN request succeeds and produces no console warning/error.
- Test once with the network disabled. The page should show a clear dependency failure or retain a meaningful fallback—not a blank stage.
- Pin versions; do not mix `latest`, unversioned packages, or different versions of one library.
- Count runtime dependencies and remove overlapping libraries.
- Measure the main interaction, not just first paint. Pause animations offscreen and on `document.hidden`.
- Honor `prefers-reduced-motion` while preserving step controls and explanatory state changes.
- Keep content labels in real HTML/SVG text where possible; Canvas/WebGL should not make the lesson inaccessible.
