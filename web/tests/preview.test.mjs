import assert from "node:assert/strict";
import test from "node:test";
import { activeAnnotationAt, annotationPenPosition, easeProgress, ELLIPSE_ROTATION, partialPolyline, writingHandMotion } from "../src/lib/preview.js";

test("reveals a two-point stroke continuously", () => {
  assert.deepEqual(partialPolyline([[0, 0], [100, 0]], 0.25), [[0, 0], [25, 0]]);
});

test("walks a multi-segment stroke by distance", () => {
  assert.deepEqual(partialPolyline([[0, 0], [30, 0], [30, 40]], 0.5), [[0, 0], [30, 0], [30, 5]]);
});

test("uses the same easing curve as the MP4 renderer", () => {
  assert.equal(easeProgress(0.25, "linear"), 0.25);
  assert.equal(easeProgress(0.5, "easeIn"), 0.25);
  assert.equal(easeProgress(0.5, "easeOut"), 0.75);
  assert.equal(easeProgress(0.5, "easeInOut"), 0.5);
});

test("places the pen at the visible end of text and arrows", () => {
  assert.deepEqual(annotationPenPosition({ kind: "text", position: [20, 40], fontSize: 50 }, 0.5, 200), [120, 76]);
  assert.deepEqual(annotationPenPosition({ kind: "arrow", points: [[10, 10], [110, 10]] }, 0.41), [60, 10]);
});

test("keeps ellipse axes horizontal and vertical", () => {
  const ellipse = { kind: "ellipse", rect: [100, 200, 300, 120] };
  assert.equal(ELLIPSE_ROTATION, 0);
  assert.deepEqual(annotationPenPosition(ellipse, 0.06), [400, 260]);
  assert.deepEqual(annotationPenPosition(ellipse, 0.31), [250, 320]);
});

test("chooses the latest active annotation and hides the hand between clips", () => {
  const annotations = [
    { id: "a", startMs: 0, durationMs: 1000 },
    { id: "b", startMs: 500, durationMs: 1000 },
  ];
  assert.equal(activeAnnotationAt(annotations, 750)?.id, "b");
  assert.equal(activeAnnotationAt(annotations, 1600), null);
});

test("adds deterministic micro-motion and pen lift only while writing text", () => {
  const text = { kind: "text", text: "Viết chữ tự nhiên" };
  const first = writingHandMotion(text, 0.37, "pen");
  const repeated = writingHandMotion(text, 0.37, "pen");
  assert.deepEqual(first, repeated);
  assert.notEqual(first.offsetY, 0);
  assert.notEqual(first.rotation, 0);
  assert.equal(writingHandMotion(text, 0, "pen").opacity, 0);
  assert.equal(writingHandMotion(text, 1, "pen").opacity, 0);
  assert.deepEqual(writingHandMotion({ kind: "ellipse" }, 0.5, "pen"), { offsetX: 0, offsetY: 0, rotation: 0, scale: 1, opacity: 1 });
});
