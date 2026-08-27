# Design QA — Bảng Vẽ Video

- Source visual truth: `C:\Users\kienth\.codex\generated_images\01a04181-ba04-71a2-8e75-3f3d4578c99e\exec-364bebe2-e834-442e-9651-940a579d1d7d.png`
- Implementation screenshot: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-implementation.jpg`
- Onboarding screenshot: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-onboarding.jpg`
- Upload wizard screenshot: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-upload-wizard.jpg`
- Post-onboarding editor screenshot: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-editor-onboarding.jpg`
- Combined source/editor comparison: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-comparison.jpg`
- Viewport: 1488 × 1058 CSS px
- Source pixels: 1487 × 1058 PNG
- Implementation pixels: 1488 × 1058 JPEG
- Density normalization: implementation captured at devicePixelRatio 1; heights match and the source is only one pixel narrower, so no resampling was required.
- State: desktop, Vietnamese UI, warm theme, first scene selected, Times New Roman text annotation selected, four sample scenes, no SRT/audio loaded.

## Full-view comparison evidence

The source and implementation were opened together at original resolution. The implementation preserves the selected direction's main hierarchy: warm editorial chrome, four scene cards plus add-scene action, left media/hand rail, centered paper canvas, floating annotation palette, contextual property bar, scene timeline, and prominent preview/export actions.

The implementation intentionally shows the complete 9:16 video frame instead of the source mock's wider, more zoomed document crop. This keeps pointer placement identical to the renderer's 720 × 1280 coordinate space and avoids the original UX problem of hidden coordinates. The surrounding region proportions, warm palette, terracotta selection color, ivory paper, restrained borders, and compact typography remain faithful.

No separate focused crop was needed: both original-resolution artifacts make the toolbar labels, property controls, scene cards, and timeline clips readable in the combined comparison.

## Required fidelity surfaces

- Fonts and typography: Segoe UI/system sans-serif closely matches the compact source chrome; document and annotation text use Times New Roman with Vietnamese diacritics. Hierarchy and wrapping are consistent. The smaller document body is an expected consequence of showing the full 9:16 frame.
- Spacing and layout rhythm: top bar, storyboard, workspace, properties, and timeline align to the source. Card radii, panel gaps, and toolbar spacing are consistent. No persistent controls are clipped at 1488 × 1058.
- Colors and tokens: warm ivory, parchment, carbon ink, terracotta red, orange, green, and blue state colors track the source closely and retain readable contrast.
- Image quality and asset fidelity: the implementation uses the renderer's real document-page PNGs and real drawing-hand PNG. Phosphor provides all UI icons; no placeholder imagery or handcrafted SVG assets are used.
- Copy and content: Vietnamese labels are concise and functional. Unloaded SRT/audio are represented truthfully rather than pretending demo files are already attached.

## Findings

- [P3] The source mock has a more zoomed paper preview and denser document typography.
  - Location: central canvas.
  - Evidence: the source crops the page more aggressively; the implementation displays the exact full 9:16 render frame.
  - Impact: slightly less visual drama, but much more reliable spatial authoring.
  - Follow-up: offer an editor-only zoom control while keeping coordinate conversion fixed.

- [P3] The source mock highlights the text tool while the implementation highlights selection for an already-selected text object.
  - Location: floating tool palette.
  - Evidence: source active state is “Viết chữ”; implementation active state is “Chọn”.
  - Impact: no usability regression; selection mode prevents accidental duplicate text creation.
  - Follow-up: none required.

## Comparison history

### Iteration 1 — blocked

- [P1] Browser completed MP4 rendering but stayed in “Đang dựng…” because cached job-state responses were reused.
- [P2] Long-video duration was not directly editable, text style was implicit, and visible undo/redo plus hand-style controls were static.

Fixes made:

- Added cache-busted, recursive job polling and `Cache-Control: no-store` for local API responses.
- Added editable scene duration up to 3600 seconds per scene, with safe annotation timing clamps.
- Added regular/bold/italic/bold-italic controls for Times New Roman text.
- Added working undo, redo, and hand visibility/style selection.

Post-fix evidence:

- A browser upload of `page-02.png` completed the whole flow and changed the primary action to “Tải MP4”; status read “Video đã sẵn sàng”.
- Editing scene duration from 6 to 15 seconds updated both the selected scene card (`00:15`) and ruler endpoint (`15s`).
- Adding text changed the clip count 3 → 4, undo changed it 4 → 3, and redo changed it 3 → 4.
- Direct placement, dragging, preview play/stop, image upload, hand visibility, renderer API smoke render, and download-link generation were exercised.
- Clean browser console check: no errors or warnings.

### Iteration 2 — passed

The revised implementation and source were reopened together at the normalized viewport. No actionable P0/P1/P2 fidelity or usability differences remain.

### Iteration 3 — onboarding and explicit uploads passed

User feedback showed that the first-use experience still hid document upload behind media cards and lacked a product-level entry flow. The implementation now adds:

- A real welcome screen with clear product value, a three-step explanation, a primary “Tạo dự án đầu tiên” action, and a working sample-project path.
- A guided three-step project wizard with a large visible PDF/image dropzone, explicit picker button, page previews, optional SRT/audio inputs, and project name/duration setup.
- A persistent visible “Thêm PDF / ảnh” action in the editor, plus “Dự án mới” and “Xem lại hướng dẫn” entry points.
- Times New Roman-first Vietnamese display typography on onboarding headings; the browser screenshot confirmed correct diacritic shaping.

Functional evidence:

- Uploaded a generated one-page PDF through the visible picker and confirmed one page preview.
- Uploaded a Vietnamese SRT and WAV through the optional second step; both filenames appeared in the editor media rail.
- Completed the wizard and confirmed the PDF became one 8-second scene with the SRT cue shown in the status bar.
- Rendered the resulting project end-to-end; the primary action changed from “Tạo MP4” to “Tải MP4” and status changed to “Video đã sẵn sàng”.
- The source visual and post-onboarding editor were opened in one side-by-side comparison input. The selected warm editorial hierarchy, tokens, panels, scene strip, paper canvas, toolbar, properties, and timeline remain aligned; the expected content-density difference comes from testing a new one-page user project rather than the four-scene sample.

No actionable P0/P1/P2 onboarding, upload, fidelity, or core-flow issues remain.

### Iteration 4 — zoom and modern annotation inspector passed

The user's dense-document screenshot and reference image 2 were used as the visual target for this scoped editor update. The previous full-width horizontal annotation property bar was removed and replaced with the modern behavior shown in the reference:

- A persistent right-side property inspector with annotation type, content, Times New Roman typography, color/stroke, timing, notes, duplicate/delete, and scene-duration controls.
- A compact contextual toolbar positioned directly above the selected object with color, duplicate, and delete actions.
- Selection handles remain attached to the object while the inspector and timeline stay synchronized.
- Practical canvas zoom from 50% to 300%, fit-to-screen, buttons, slider, Ctrl/Cmd + wheel, ordinary scroll, and Space/middle-button panning.

Visual evidence:

- Reference: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-reference-modern-inspector.png`
- Implementation: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-modern-inspector.jpg`
- Combined comparison: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-modern-inspector-comparison.jpg`

The side-by-side comparison confirms the requested interaction anatomy: readable zoomed document, selection bounds, contextual object toolbar, annotation-type controls, and a dedicated property inspector. The implementation intentionally retains the selected warm editorial visual system instead of copying the reference's dark theme.

Functional evidence:

- Zoom buttons reached and disabled correctly at 50% and 300%; fit returned to 100%.
- At 200%, a new ellipse was placed successfully and appeared as a fourth annotation in the scene and timeline.
- Contextual duplicate changed the scene to five annotations; contextual delete returned it to four.
- Renderer completed successfully after editing at high zoom and exposed the “Tải MP4” action.

No actionable P0/P1/P2 zoom, inspector, selection, or render issues remain.

### Iteration 5 — direct ellipse resizing passed

The user's selected-ellipse screenshot was used as the scoped source of truth for resize affordances.

- Source visual: `C:\Users\kienth\AppData\Local\Temp\codex-clipboard-2ca9f118-fca4-4355-90f4-5cce67e462d3.png`
- Implementation: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-resize-implementation.png`
- Combined comparison: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-resize-comparison.png`
- Viewport and density: both images are 816 × 562 pixels at devicePixelRatio 1; no density normalization was required.
- State: document editor at 175% zoom with an ellipse selected.

Focused comparison evidence:

- The implementation retains the source's dashed terracotta selection bounds and compact contextual toolbar.
- Eight circular handles now appear at all four corners and all four edge midpoints. Their size, contrast, and spacing remain legible at 175% zoom without covering the document text.
- The implementation intentionally adds the missing top and side midpoint handles; this is the requested functional improvement rather than visual drift.

Functional evidence:

- Dragging the right midpoint widened the ellipse while keeping its left edge and height fixed.
- One Undo restored the original ellipse dimensions, confirming that a continuous drag is recorded as one history operation.
- Pure geometry tests cover all four axes, corner resizing with Shift-constrained aspect ratio, minimum size, canvas bounds, padded-handle coordinates, ellipse output, and inserted-image output.
- Browser console check after resize and Undo: no errors.

Required fidelity surfaces:

- Fonts/typography, colors/tokens, document-image quality, and app copy are unchanged from the previously passed editor state.
- Spacing/layout remains consistent; the additional midpoint handles sit on the existing selection border and do not alter workspace geometry.
- The new inspector helper uses existing warm-surface, border, typography, and icon tokens.

No actionable P0/P1/P2 resize-affordance, interaction, or visual issues remain.

### Iteration 6 — contextual inspector flow passed

The user's duplicate annotation-type screenshot was used as the scoped before-state for this Creative Production refinement.

- Source visual: `C:\Users\kienth\AppData\Local\Temp\codex-clipboard-a618f31e-1757-4475-a7f3-161214990330.png`
- Implementation: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-contextual-inspector.png`
- Focused implementation crop: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-contextual-inspector-crop.png`
- Combined before/after comparison: `G:\zalo_mini_app\open-source\srt-whiteboard-animation\web\design-qa-contextual-inspector-comparison.png`
- Comparison size: both focused states are 410 × 570 pixels at devicePixelRatio 1.
- State: ellipse selected, floating creation toolbar visible, right-side inspector open.

Design decision and visible evidence:

- The floating toolbar is now the single place for choosing and creating annotation types.
- The duplicate six-item “Loại chú thích” grid was removed from the inspector.
- The inspector begins with a compact object summary that shows the selected type and selection state once, then proceeds directly to relevant properties.
- Removing the duplicate grid brings appearance, timing, notes, and object actions higher in the viewport and reduces unnecessary scrolling.
- The warm editorial palette, icon family, borders, spacing rhythm, typography, and existing canvas controls remain unchanged.

Interaction evidence:

- No selection: the inspector shows selection guidance.
- Active creation tool: the inspector shows the chosen tool, placement instruction, and active-mode status.
- Selected object: the inspector switches to the object summary and only its editable properties.
- Browser console check across all three states: no errors.

No actionable P0/P1/P2 information-architecture, duplication, interaction-state, or visual issues remain.

### Iteration 7 — inline text editing passed

The text tool now follows the canvas-first editing model used by modern visual editors.

- Choosing “Viết chữ” and clicking the document creates a text annotation and immediately opens an editor at that exact position.
- The inline field inherits the annotation's Times New Roman font, size, style, and color so the editing state stays visually aligned with the rendered result.
- Enter or moving focus away commits the text; Escape closes the inline editor without applying the draft.
- Double-clicking an existing text annotation reopens it for direct editing.
- Committed Vietnamese text is synchronized with the right-side “Nội dung” field, history, autosave, timeline, and renderer data.
- Browser verification covered create, focus/input, Enter commit, double-click reopen, Escape cancel, cleanup, autosave, and console errors.

No actionable P0/P1/P2 inline-editing, synchronization, or runtime issues remain.

### Iteration 8 — point-to-point arrow drawing passed

- Choosing “Mũi tên” now shows a specific A-to-B drag instruction on both the canvas and contextual inspector.
- Pointer down fixes point A, live pointer movement updates point B, and pointer up commits the arrow with its head at B.
- Browser verification drew an arrow from the lower-right toward the upper-left, confirming that direction is determined entirely by the user's gesture rather than a fixed diagonal preset.
- Releasing the pointer returned the editor to selection mode and created one timeline annotation.
- One Undo removed the complete arrow and restored the original three-annotation scene.

No actionable P0/P1/P2 arrow-direction, gesture, history, or runtime issues remain.

### Iteration 9 — draggable annotation timing passed

- Every annotation clip now exposes a draggable body plus start and end trim handles.
- Dragging the body changes the appearance time without changing duration.
- Dragging the left handle changes the start while preserving the clip end; dragging the right handle changes the duration while preserving the start.
- Clip timing is displayed inline, constrained to scene boundaries, and never drops below 100 ms.
- The right-side “Bắt đầu” and “Thời lượng” fields update during the gesture, and autosave receives the final values.
- Browser verification covered all three gestures on the arrow clip; the test values were restored to the original 4.0-second start and 1.0-second duration afterward.
- Pure timing tests cover movement, both trim directions, minimum duration, and both scene boundaries.

No actionable P0/P1/P2 timeline-trimming, synchronization, history, or runtime issues remain.

### Iteration 10 — writing-hand preview passed

- The selected marker/pen mode is now passed into the preview canvas instead of being used only for autosave and MP4 rendering.
- The bundled transparent hand asset is cropped to its opaque bounds and anchored by its pen tip to the active annotation endpoint.
- Freehand paths, underlines, arrows, ellipses, text, and inserted-image reveals expose a progressive pen position.
- Two-point strokes now reveal continuously, keeping the visible line and pen movement synchronized.
- The hand appears only during an active annotation interval and remains absent between clips or when “Không hiện tay” is selected.
- Browser verification captured an active pen preview, verified the no-hand mode, and restored the user's original “Tay bút bi” selection afterward.

No actionable P0/P1/P2 preview-hand visibility, timing, anchoring, or runtime issues remain.

### Iteration 11 — natural text-writing hand motion passed

- Text preview keeps the pen tip anchored to the progressive text reveal while adding deterministic character-paced vertical and horizontal micro-motion.
- Subtle wrist rotation and pressure-scale variation remove the rigid sliding appearance without moving the ink path.
- Pen-down and pen-up opacity ramps prevent the hand from popping abruptly at clip boundaries.
- Motion frequency adapts to text length and differs slightly between marker and pen modes.
- The Python MP4 renderer applies the same deterministic positional writing rhythm to text annotations.
- Browser verification covered the active text interval and confirmed that the hand leaves the document when the clip completes.

No actionable P0/P1/P2 text-hand realism, repeatability, synchronization, or runtime issues remain.

### Iteration 12 — MP4 export parity and repeat rendering passed

- Downloading a completed video now resets the primary action from “Tải MP4” to “Tạo MP4”, allowing repeated exports.
- Editing scenes, audio, or hand style invalidates any completed or in-flight job, preventing stale MP4 links from being presented as current.
- Preview and renderer now share the same easing curve, cropped-image anchor, marker/pen height, text micro-motion, wrist rotation, pressure scale, and pen-down/pen-up opacity.
- The local API launches a fresh renderer process per validation and render, so updated effects are included without a stale Python module cache.
- Browser verification covered create, completion, download/reset, stale-job invalidation, and console errors.
- Fresh MP4 frames were inspected during ellipse, arrow, and text clips; the pen tip stays on the progressive ink endpoint in each case.

No actionable P0/P1/P2 repeat-export, stale-job, preview-parity, or hand-alignment issues remain.

### Iteration 13 — scene deletion passed

- Every scene card now exposes a compact trash action when selected, hovered, or keyboard-focused.
- Deleting the active scene selects the next scene when available, otherwise the previous scene; deleting an earlier scene preserves the same logical current scene.
- A project can never lose its final remaining scene, and the disabled action explains that constraint.
- Scene deletion uses the existing history stack, so Undo restores the complete scene including annotations and media background.
- Pure tests cover the one-scene guard and selection behavior for first, middle, and last scene deletion.
- Browser verification confirmed accessible delete controls, selected-card visibility, stable card layout, and no console errors.

No actionable P0/P1/P2 scene-deletion, selection, layout, or accessibility issues remain.

### Iteration 14 — project-wide timeline playback passed

- The transport now uses one cumulative project playhead across every scene instead of stopping at the selected scene's duration.
- For a 5-second first scene and an 8-second second scene, the ruler, playhead, waveform, and footer all span 00:13.
- Preview switches the canvas and selected storyboard card to scene 2 exactly at 00:05, then stops at 00:13.
- Annotation clips from every scene share the global timeline while retaining scene-local timing constraints when moved or trimmed.
- Scene boundaries are marked in the annotation track, and clicking the timeline seeks to the matching scene and local time.
- Audio and SRT cues use global project time; the footer also reports the active scene's local time for editing context.
- A clean browser run completed all 13 seconds with no console warnings or errors.

No actionable P0/P1/P2 multi-scene playback, seeking, duration, or timeline synchronization issues remain.

## Follow-up polish

- Consider “zoom to selection” and a minimap for very long, dense pages.
- Lazy-load PDF.js to reduce the initial JavaScript bundle; current behavior is correct, but the production bundle emits a size warning.

## Implementation checklist

- [x] Direct-on-canvas placement with no X/Y fields
- [x] Supported annotation palette and editable text/font/timing
- [x] Multi-scene storyboard and adjustable long-video duration
- [x] PDF/image, SRT, audio, and overlay-image inputs
- [x] First-run onboarding, sample path, and guided project creation
- [x] Visible PDF/image dropzone and persistent editor upload CTA
- [x] 50–300% canvas zoom, fit, scrolling, and keyboard/mouse panning
- [x] Modern right-side inspector and contextual object toolbar
- [x] Inline text creation and double-click editing on the document
- [x] Point-to-point arrow drawing in any direction
- [x] Direct timeline move and start/end trimming for annotation clips
- [x] Writing-hand overlay synchronized with preview animation
- [x] Natural deterministic hand motion while writing text
- [x] Repeatable MP4 export with stale-job invalidation and preview parity
- [x] Undoable scene deletion with a one-scene safety guard
- [x] Project-wide timeline and seamless sequential scene preview
- [x] Preview playback and annotation timeline
- [x] Local renderer API and downloadable MP4
- [x] Build, renderer tests, Sites packaging tests, browser interactions, and console check

final result: passed
