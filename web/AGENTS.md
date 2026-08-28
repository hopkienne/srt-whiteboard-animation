# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Selected product direction

- The user selected visual option 3: a warm editorial storyboard workspace.
- Preserve the top scene cards, direct-on-paper annotation canvas, floating tool palette, and scene timeline.
- Vietnamese UI and Times New Roman-safe annotation text are product requirements.
- Users must never be asked to type X/Y coordinates; positions come from direct manipulation on the canvas.
- The website must include a real first-run onboarding screen and a guided new-project flow before the editor.
- PDF and image upload must always have a visible button and drag-and-drop zone; never hide the primary document picker only behind media cards.
- Users can either create their own project or enter a working sample project, and both paths must lead to the functional editor.
- The guided flow must support required PDF/image input plus optional SRT and audio before project creation.
- Navigation must use real browser routes rather than component-only screen state: `/` for onboarding, `/projects` for the local library, `/projects/new` for project setup, and `/studio/:projectId` for the editor.
- Each storyboard scene card must expose a discoverable delete action. Deletion is undoable, keeps at least one scene, and moves selection to the nearest valid scene without losing the user's place.
- User projects must persist in IndexedDB so a studio deep link can be refreshed without losing scenes, uploads, or annotations. Keep lightweight project summaries separate from large data-URL assets.
- Legacy `/project`, `/project/new`, and `/studio` URLs should redirect into the current route flow instead of rendering duplicate screens.
- The canvas must support practical zoom from 50% to 300%, fit-to-screen, Ctrl/Cmd + wheel zoom, scroll, and Space/middle-button panning so dense documents remain readable.
- Ellipse and inserted-image selections must expose eight functional resize handles (four edges and four corners). Resizing stays in the 720 × 1280 canvas, enforces a useful minimum size, supports Shift-constrained corner resizing, and records the whole gesture as one undo step.
- Annotation editing uses a modern right-side inspector and a compact contextual toolbar near the selected object; do not restore the old full-width horizontal annotation property bar.
- Annotation creation belongs only in the floating canvas toolbar. Do not duplicate the annotation-type palette inside the inspector; the inspector is contextual and switches between selection guidance, active creation guidance, and properties for the selected object.
- Text creation is inline-first: choosing “Viết chữ” and placing it on the paper must autofocus an editor at that exact canvas position. Enter or blur commits, Escape cancels the edit, and double-clicking existing text reopens inline editing; the inspector remains synchronized for detailed styling.
- Arrow creation is gesture-based: pointer down defines point A, dragging previews the shaft in any direction, and pointer up defines point B with the arrowhead at B. The complete gesture is one undoable creation.
- Timeline clips are directly editable: dragging the clip body changes `startMs`, the left trim handle changes the start while preserving the end, and the right trim handle changes `durationMs`. Timing is constrained to the scene with a 100 ms minimum, stays synchronized with the inspector, and each gesture is one undo step.
- The bottom timeline and preview transport operate on cumulative project time, not only the selected scene. Playback crosses scene boundaries automatically, the ruler/playhead/waveform span the full project duration, and the footer shows both global and scene-local time.
- Preview mirrors the selected hand mode: marker/pen overlays the bundled transparent hand with its cropped top-left pen tip anchored to the active annotation's progressive endpoint; `none` never draws it. Text writing adds deterministic character-paced micro-motion, subtle wrist rotation/pressure variation, and pen-down/pen-up fades; the renderer applies the same positional rhythm. The hand is visible only while an annotation is actively revealing.
- Preview and MP4 export must share the same easing, hand crop anchor, mode-specific size, rotation, scale, opacity, and positional motion. A completed download returns the primary action to “Tạo MP4”, and any project edit invalidates a completed or in-flight render so stale output is never offered.
- Hand and pen are one visual overlay whose project-level size is adjustable from 60–160% in 5% steps (default 100%). The value must persist across reloads, update preview immediately, produce the same MP4 geometry, and invalidate stale renders when changed.
- The bundled hand-and-pen artwork must remain language-neutral: the pen barrel contains no Chinese characters, labels, logos, or other printed text in thumbnails, preview, or exported MP4.
