const HANDLE_ANCHORS = Object.freeze([
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { id: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { id: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { id: "w", x: 0, y: 0.5, cursor: "ew-resize" },
]);

export const SELECTION_PADDING = 10;
export const MIN_ANNOTATION_SIZE = 36;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function canResizeAnnotation(annotation) {
  return annotation?.kind === "ellipse" || annotation?.kind === "image";
}

export function getResizeHandles(bounds, padding = SELECTION_PADDING) {
  const selection = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };

  return HANDLE_ANCHORS.map((handle) => ({
    ...handle,
    x: selection.x + selection.width * handle.x,
    y: selection.y + selection.height * handle.y,
  }));
}

export function findResizeHandle(point, bounds, radius = 22) {
  return getResizeHandles(bounds).find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) <= radius) || null;
}

export function resizeTargetFromHandle(handlePosition, handleId, padding = SELECTION_PADDING) {
  return {
    x: handlePosition.x + (handleId.includes("w") ? padding : handleId.includes("e") ? -padding : 0),
    y: handlePosition.y + (handleId.includes("n") ? padding : handleId.includes("s") ? -padding : 0),
  };
}

function resizeCorner(bounds, handleId, point, options) {
  const movesLeft = handleId.includes("w");
  const movesTop = handleId.includes("n");
  const anchorX = movesLeft ? bounds.x + bounds.width : bounds.x;
  const anchorY = movesTop ? bounds.y + bounds.height : bounds.y;
  const directionX = movesLeft ? -1 : 1;
  const directionY = movesTop ? -1 : 1;
  const maxWidth = directionX > 0 ? options.canvasWidth - anchorX : anchorX;
  const maxHeight = directionY > 0 ? options.canvasHeight - anchorY : anchorY;
  let width = clamp((point.x - anchorX) * directionX, options.minWidth, maxWidth);
  let height = clamp((point.y - anchorY) * directionY, options.minHeight, maxHeight);

  if (options.preserveAspect) {
    const aspectRatio = bounds.width / bounds.height;
    if (width / height > aspectRatio) height = width / aspectRatio;
    else width = height * aspectRatio;

    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width *= scale;
    height *= scale;
  }

  return {
    x: directionX > 0 ? anchorX : anchorX - width,
    y: directionY > 0 ? anchorY : anchorY - height,
    width,
    height,
  };
}

export function resizeBounds(bounds, handleId, point, {
  canvasWidth,
  canvasHeight,
  minWidth = MIN_ANNOTATION_SIZE,
  minHeight = MIN_ANNOTATION_SIZE,
  preserveAspect = false,
}) {
  if (handleId.length === 2 && preserveAspect) {
    const resized = resizeCorner(bounds, handleId, point, { canvasWidth, canvasHeight, minWidth, minHeight, preserveAspect });
    return Object.fromEntries(Object.entries(resized).map(([key, value]) => [key, round(value)]));
  }

  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;

  if (handleId.includes("w")) left = clamp(point.x, 0, right - minWidth);
  if (handleId.includes("e")) right = clamp(point.x, left + minWidth, canvasWidth);
  if (handleId.includes("n")) top = clamp(point.y, 0, bottom - minHeight);
  if (handleId.includes("s")) bottom = clamp(point.y, top + minHeight, canvasHeight);

  return {
    x: round(left),
    y: round(top),
    width: round(right - left),
    height: round(bottom - top),
  };
}

export function applyAnnotationBounds(annotation, bounds) {
  if (annotation.kind === "ellipse") {
    return { ...annotation, rect: [bounds.x, bounds.y, bounds.width, bounds.height] };
  }
  if (annotation.kind === "image") {
    return {
      ...annotation,
      position: [bounds.x, bounds.y],
      previewWidth: bounds.width,
      previewHeight: bounds.height,
    };
  }
  return annotation;
}
