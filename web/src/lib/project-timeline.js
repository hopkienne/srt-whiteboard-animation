export function buildSceneTimeline(scenes) {
  let startMs = 0;
  return scenes.map((scene, index) => {
    const range = {
      scene,
      sceneIndex: index,
      startMs,
      endMs: startMs + scene.durationMs,
    };
    startMs = range.endMs;
    return range;
  });
}

export function locateSceneAt(timeline, projectTimeMs) {
  if (!timeline.length) return null;
  const totalDuration = timeline.at(-1).endMs;
  const safeProjectTime = Math.min(totalDuration, Math.max(0, projectTimeMs));
  const range = timeline.find((item, index) => safeProjectTime < item.endMs || index === timeline.length - 1);
  return {
    ...range,
    projectTimeMs: safeProjectTime,
    sceneTimeMs: Math.min(range.scene.durationMs, Math.max(0, safeProjectTime - range.startMs)),
  };
}
