import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHandSize, previewHandHeight, rendererHandConfig } from "../src/lib/render-config.js";

test("matches exported hand geometry to each preview mode", () => {
  assert.deepEqual(rendererHandConfig("marker"), { enabled: true, style: "marker", height: 300, anchor: [0, 0] });
  assert.deepEqual(rendererHandConfig("pen"), { enabled: true, style: "pen", height: 270, anchor: [0, 0] });
  assert.deepEqual(rendererHandConfig("none"), { enabled: false, style: "none", height: 300, anchor: [0, 0] });
});

test("scales the complete hand and pen overlay while preserving mode proportions", () => {
  assert.equal(previewHandHeight("marker", 75), 225);
  assert.equal(previewHandHeight("pen", 150), 405);
  assert.deepEqual(rendererHandConfig("marker", 120), { enabled: true, style: "marker", height: 360, anchor: [0, 0] });
});

test("normalizes persisted hand sizes to the supported slider range", () => {
  assert.equal(normalizeHandSize(undefined), 100);
  assert.equal(normalizeHandSize("127"), 125);
  assert.equal(normalizeHandSize(-10), 0);
  assert.equal(normalizeHandSize(10), 10);
  assert.equal(normalizeHandSize(999), 150);
  assert.equal(normalizeHandSize("not-a-number"), 100);
});

test("treats zero percent as a disabled hand overlay in preview and export", () => {
  assert.equal(previewHandHeight("marker", 0), 0);
  assert.deepEqual(rendererHandConfig("marker", 0), { enabled: false, style: "marker", height: 0, anchor: [0, 0] });
});
