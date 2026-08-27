export function removeScene(scenes, deletedIndex, currentSceneIndex) {
  if (scenes.length <= 1 || deletedIndex < 0 || deletedIndex >= scenes.length) {
    return { scenes, sceneIndex: currentSceneIndex, deletedScene: null };
  }

  const deletedScene = scenes[deletedIndex];
  const remainingScenes = scenes.filter((_scene, index) => index !== deletedIndex);
  let nextSceneIndex = currentSceneIndex;
  if (deletedIndex < currentSceneIndex) nextSceneIndex -= 1;
  if (deletedIndex === currentSceneIndex) {
    nextSceneIndex = Math.min(currentSceneIndex, remainingScenes.length - 1);
  }

  return {
    scenes: remainingScenes,
    sceneIndex: Math.max(0, nextSceneIndex),
    deletedScene,
  };
}
