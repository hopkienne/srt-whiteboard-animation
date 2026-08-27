import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAnnotationBounds,
  findResizeHandle,
  getResizeHandles,
  resizeBounds,
  resizeTargetFromHandle,
} from "../src/lib/resize.js";

const canvas = { canvasWidth: 720, canvasHeight: 1280 };
const bounds = { x: 100, y: 200, width: 300, height: 120 };

test("exposes eight resize handles around the selection", () => {
  const handles = getResizeHandles(bounds);
  assert.equal(handles.length, 8);
  assert.deepEqual(handles.find(({ id }) => id === "nw"), { id: "nw", x: 90, y: 190, cursor: "nwse-resize" });
  assert.deepEqual(handles.find(({ id }) => id === "e"), { id: "e", x: 410, y: 260, cursor: "ew-resize" });
});

test("finds a nearby handle and ignores points inside the object", () => {
  assert.equal(findResizeHandle({ x: 412, y: 261 }, bounds)?.id, "e");
  assert.equal(findResizeHandle({ x: 250, y: 260 }, bounds), null);
});

test("resizes an ellipse from each axis without moving the opposite edge", () => {
  assert.deepEqual(resizeBounds(bounds, "e", { x: 510, y: 260 }, canvas), { x: 100, y: 200, width: 410, height: 120 });
  assert.deepEqual(resizeBounds(bounds, "w", { x: 40, y: 260 }, canvas), { x: 40, y: 200, width: 360, height: 120 });
  assert.deepEqual(resizeBounds(bounds, "n", { x: 250, y: 150 }, canvas), { x: 100, y: 150, width: 300, height: 170 });
  assert.deepEqual(resizeBounds(bounds, "s", { x: 250, y: 390 }, canvas), { x: 100, y: 200, width: 300, height: 190 });
});

test("keeps the original aspect ratio for a shifted corner drag", () => {
  const resized = resizeBounds(bounds, "se", { x: 600, y: 500 }, { ...canvas, preserveAspect: true });
  assert.equal(resized.width / resized.height, 2.5);
  assert.equal(resized.x, bounds.x);
  assert.equal(resized.y, bounds.y);
});

test("constrains resize operations to the canvas and minimum size", () => {
  assert.deepEqual(resizeBounds(bounds, "nw", { x: 900, y: 900 }, canvas), { x: 364, y: 284, width: 36, height: 36 });
  assert.deepEqual(resizeBounds(bounds, "se", { x: 900, y: 1400 }, canvas), { x: 100, y: 200, width: 620, height: 1080 });
});

test("maps padded visual handles back to annotation edges", () => {
  assert.deepEqual(resizeTargetFromHandle({ x: 520, y: 330 }, "se"), { x: 510, y: 320 });
  assert.deepEqual(resizeTargetFromHandle({ x: 70, y: 170 }, "nw"), { x: 80, y: 180 });
});

test("applies resized bounds to ellipse and image annotations", () => {
  const next = { x: 20, y: 30, width: 420, height: 180 };
  assert.deepEqual(applyAnnotationBounds({ id: "a", kind: "ellipse", rect: [0, 0, 1, 1] }, next).rect, [20, 30, 420, 180]);
  assert.deepEqual(applyAnnotationBounds({ id: "b", kind: "image", position: [0, 0] }, next), {
    id: "b",
    kind: "image",
    position: [20, 30],
    previewWidth: 420,
    previewHeight: 180,
  });
});
