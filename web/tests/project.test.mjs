import assert from "node:assert/strict";
import test from "node:test";

import { rendererHandConfig } from "../src/lib/render-config.js";

test("matches exported hand geometry to each preview mode", () => {
  assert.deepEqual(rendererHandConfig("marker"), { enabled: true, style: "marker", height: 470, anchor: [0, 0] });
  assert.deepEqual(rendererHandConfig("pen"), { enabled: true, style: "pen", height: 420, anchor: [0, 0] });
  assert.deepEqual(rendererHandConfig("none"), { enabled: false, style: "none", height: 470, anchor: [0, 0] });
});
