export const DEFAULT_HAND_SIZE = 100;
export const MIN_HAND_SIZE = 0;
export const MAX_HAND_SIZE = 150;
export const HAND_SIZE_STEP = 5;

export function normalizeHandSize(handSize = DEFAULT_HAND_SIZE) {
  const numericSize = Number(handSize);
  if (!Number.isFinite(numericSize)) return DEFAULT_HAND_SIZE;
  const clampedSize = Math.min(MAX_HAND_SIZE, Math.max(MIN_HAND_SIZE, numericSize));
  return Math.round(clampedSize / HAND_SIZE_STEP) * HAND_SIZE_STEP;
}

export function previewHandHeight(handMode = "marker", handSize = DEFAULT_HAND_SIZE) {
  const normalizedMode = handMode === true ? "marker" : handMode === false ? "none" : handMode;
  const baseHeight = normalizedMode === "pen" ? 270 : 300;
  return Math.round(baseHeight * normalizeHandSize(handSize) / 100);
}

export function rendererHandConfig(handMode = "marker", handSize = DEFAULT_HAND_SIZE) {
  const normalizedMode = handMode === true ? "marker" : handMode === false ? "none" : handMode;
  const height = previewHandHeight(normalizedMode, handSize);
  return {
    enabled: normalizedMode !== "none" && height > 0,
    style: normalizedMode,
    height,
    anchor: [0, 0],
  };
}
