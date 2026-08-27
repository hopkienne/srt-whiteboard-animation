import assert from "node:assert/strict";
import test from "node:test";

import { removeScene } from "../src/lib/storyboard.js";

const scenes = [{ id: "one", name: "Cảnh 1" }, { id: "two", name: "Cảnh 2" }, { id: "three", name: "Cảnh 3" }];

test("keeps at least one scene", () => {
  const onlyScene = [scenes[0]];
  const result = removeScene(onlyScene, 0, 0);
  assert.equal(result.scenes, onlyScene);
  assert.equal(result.deletedScene, null);
});

test("keeps the same logical scene selected when an earlier scene is removed", () => {
  const result = removeScene(scenes, 0, 2);
  assert.deepEqual(result.scenes.map((scene) => scene.id), ["two", "three"]);
  assert.equal(result.sceneIndex, 1);
  assert.equal(result.scenes[result.sceneIndex].id, "three");
});

test("selects the next scene after deleting the current middle scene", () => {
  const result = removeScene(scenes, 1, 1);
  assert.equal(result.sceneIndex, 1);
  assert.equal(result.scenes[result.sceneIndex].id, "three");
});

test("selects the previous scene after deleting the current last scene", () => {
  const result = removeScene(scenes, 2, 2);
  assert.equal(result.sceneIndex, 1);
  assert.equal(result.scenes[result.sceneIndex].id, "two");
});
