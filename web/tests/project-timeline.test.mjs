import assert from "node:assert/strict";
import test from "node:test";

import { buildSceneTimeline, locateSceneAt } from "../src/lib/project-timeline.js";

const timeline = buildSceneTimeline([
  { id: "one", durationMs: 5000 },
  { id: "two", durationMs: 8000 },
]);

test("builds cumulative scene ranges for the complete project", () => {
  assert.deepEqual(timeline.map(({ startMs, endMs }) => [startMs, endMs]), [[0, 5000], [5000, 13000]]);
});

test("switches to the next scene exactly at a scene boundary", () => {
  assert.equal(locateSceneAt(timeline, 4999).sceneIndex, 0);
  assert.deepEqual(
    (({ sceneIndex, projectTimeMs, sceneTimeMs }) => ({ sceneIndex, projectTimeMs, sceneTimeMs }))(locateSceneAt(timeline, 5000)),
    { sceneIndex: 1, projectTimeMs: 5000, sceneTimeMs: 0 },
  );
});

test("clamps seeks to the full project duration", () => {
  const location = locateSceneAt(timeline, 20000);
  assert.equal(location.sceneIndex, 1);
  assert.equal(location.projectTimeMs, 13000);
  assert.equal(location.sceneTimeMs, 8000);
});
