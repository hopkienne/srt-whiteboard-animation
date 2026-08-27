export const MIN_CLIP_DURATION_MS = 100;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundMs(value) {
  return Math.round(value);
}

export function adjustClipTiming(annotation, mode, deltaMs, sceneDuration, minDuration = MIN_CLIP_DURATION_MS) {
  const safeSceneDuration = Math.max(minDuration, sceneDuration);
  const startMs = clamp(annotation.startMs, 0, safeSceneDuration - minDuration);
  const endMs = clamp(startMs + annotation.durationMs, startMs + minDuration, safeSceneDuration);
  const roundedDelta = roundMs(deltaMs);

  if (mode === "move") {
    const durationMs = endMs - startMs;
    return {
      startMs: roundMs(clamp(startMs + roundedDelta, 0, safeSceneDuration - durationMs)),
      durationMs: roundMs(durationMs),
    };
  }

  if (mode === "resize-start") {
    const nextStartMs = clamp(startMs + roundedDelta, 0, endMs - minDuration);
    return {
      startMs: roundMs(nextStartMs),
      durationMs: roundMs(endMs - nextStartMs),
    };
  }

  if (mode === "resize-end") {
    const nextEndMs = clamp(endMs + roundedDelta, startMs + minDuration, safeSceneDuration);
    return {
      startMs: roundMs(startMs),
      durationMs: roundMs(nextEndMs - startMs),
    };
  }

  return { startMs: roundMs(startMs), durationMs: roundMs(endMs - startMs) };
}
