function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const ELLIPSE_ROTATION = 0;
export const ELLIPSE_START_ANGLE = -Math.PI * 0.12;

export function easeProgress(value, mode = "easeInOut") {
  const progress = clamp(value, 0, 1);
  if (mode === "linear") return progress;
  if (mode === "easeIn") return progress * progress;
  if (mode === "easeOut") return 1 - (1 - progress) ** 2;
  return progress * progress * (3 - 2 * progress);
}

export function partialPolyline(points, progress) {
  if (!points?.length) return [];
  if (points.length === 1 || progress <= 0) return [points[0]];
  if (progress >= 1) return points;

  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
  const targetLength = lengths.reduce((sum, length) => sum + length, 0) * clamp(progress, 0, 1);
  const partial = [points[0]];
  let travelled = 0;

  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    const start = points[index];
    const end = points[index + 1];
    if (travelled + segmentLength <= targetLength) {
      partial.push(end);
      travelled += segmentLength;
      continue;
    }
    const segmentProgress = segmentLength ? (targetLength - travelled) / segmentLength : 0;
    partial.push([
      start[0] + (end[0] - start[0]) * segmentProgress,
      start[1] + (end[1] - start[1]) * segmentProgress,
    ]);
    break;
  }
  return partial;
}

export function activeAnnotationAt(annotations, currentMs) {
  return [...annotations]
    .filter((annotation) => annotation.startMs <= currentMs && currentMs < annotation.startMs + annotation.durationMs)
    .sort((left, right) => left.startMs - right.startMs)
    .at(-1) || null;
}

export function annotationPenPosition(annotation, progress, textWidth = 0) {
  const safeProgress = clamp(progress, 0, 1);
  if (["path", "underline"].includes(annotation.kind)) {
    return partialPolyline(annotation.points, safeProgress).at(-1) || null;
  }
  if (annotation.kind === "arrow") {
    return partialPolyline(annotation.points, Math.min(1, safeProgress / 0.82)).at(-1) || null;
  }
  if (annotation.kind === "ellipse") {
    const [x, y, width, height] = annotation.rect;
    const angle = ELLIPSE_START_ANGLE + Math.PI * 2 * safeProgress;
    const localX = width / 2 * Math.cos(angle);
    const localY = height / 2 * Math.sin(angle);
    return [
      x + width / 2 + localX,
      y + height / 2 + localY,
    ];
  }
  if (annotation.kind === "text") {
    return [annotation.position[0] + textWidth * safeProgress, annotation.position[1] + (annotation.fontSize || 36) * 0.72];
  }
  if (annotation.kind === "image") {
    return [
      annotation.position[0] + (annotation.previewWidth || 220) * safeProgress,
      annotation.position[1] + (annotation.previewHeight || 220) / 2,
    ];
  }
  return null;
}

export function writingHandMotion(annotation, progress, handMode = "marker") {
  const safeProgress = clamp(progress, 0, 1);
  if (annotation.kind !== "text") {
    return { offsetX: 0, offsetY: 0, rotation: 0, scale: 1, opacity: 1 };
  }

  const characterCount = Math.max(1, Array.from(annotation.text || " ").length);
  const cycles = clamp(characterCount / 3, 2, 8);
  const phase = safeProgress * cycles * Math.PI * 2;
  const intensity = handMode === "pen" ? 1 : 0.82;
  const fadeIn = clamp(safeProgress / 0.06, 0, 1);
  const fadeOut = clamp((1 - safeProgress) / 0.08, 0, 1);

  return {
    offsetX: Math.sin(phase * 0.53) * 1.4 * intensity,
    offsetY: (Math.sin(phase) * 2.8 + Math.sin(phase * 0.5) * 0.8) * intensity,
    rotation: (-1.2 + Math.sin(phase * 0.7) * 1.6) * Math.PI / 180,
    scale: 1 + Math.sin(phase * 0.41) * 0.006,
    opacity: Math.min(fadeIn, fadeOut),
  };
}
