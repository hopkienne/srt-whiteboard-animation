import assert from "node:assert/strict";
import test from "node:test";
import { adjustClipTiming } from "../src/lib/timeline.js";

const annotation = { startMs: 2000, durationMs: 1500 };
const sceneDuration = 5000;

test("moves a timeline clip without changing its duration", () => {
  assert.deepEqual(adjustClipTiming(annotation, "move", 750, sceneDuration), { startMs: 2750, durationMs: 1500 });
});

test("constrains a moved clip to the scene", () => {
  assert.deepEqual(adjustClipTiming(annotation, "move", -4000, sceneDuration), { startMs: 0, durationMs: 1500 });
  assert.deepEqual(adjustClipTiming(annotation, "move", 4000, sceneDuration), { startMs: 3500, durationMs: 1500 });
});

test("resizes the start while keeping the end fixed", () => {
  assert.deepEqual(adjustClipTiming(annotation, "resize-start", -500, sceneDuration), { startMs: 1500, durationMs: 2000 });
  assert.deepEqual(adjustClipTiming(annotation, "resize-start", 500, sceneDuration), { startMs: 2500, durationMs: 1000 });
});

test("resizes the end while keeping the start fixed", () => {
  assert.deepEqual(adjustClipTiming(annotation, "resize-end", -500, sceneDuration), { startMs: 2000, durationMs: 1000 });
  assert.deepEqual(adjustClipTiming(annotation, "resize-end", 1000, sceneDuration), { startMs: 2000, durationMs: 2500 });
});

test("enforces minimum duration and scene boundaries while trimming", () => {
  assert.deepEqual(adjustClipTiming(annotation, "resize-start", 5000, sceneDuration), { startMs: 3400, durationMs: 100 });
  assert.deepEqual(adjustClipTiming(annotation, "resize-end", -5000, sceneDuration), { startMs: 2000, durationMs: 100 });
  assert.deepEqual(adjustClipTiming(annotation, "resize-end", 5000, sceneDuration), { startMs: 2000, durationMs: 3000 });
});
