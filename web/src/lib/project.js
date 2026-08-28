import { urlToDataUrl, VIDEO_HEIGHT, VIDEO_WIDTH } from "./media";
import { rendererHandConfig } from "./render-config";
import { normalizeFontStyle } from "./fonts";

export const DEFAULT_TEXT = "Đối chứng: viêm niêm mạc";
export const DEFAULT_COLORS = ["#d72f45", "#d95f8d", "#e78418", "#2f925b", "#2e72d2", "#25282c"];

export function makeId(prefix = "item") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function withTiming(annotation, index = 0, sceneDuration = 8000) {
  const startMs = Math.min(600 + index * 1200, Math.max(0, sceneDuration - 1000));
  return {
    id: makeId(annotation.kind),
    startMs,
    durationMs: Math.min(1100, sceneDuration - startMs),
    easing: "easeInOut",
    color: "#d72f45",
    strokeWidth: 7,
    ...annotation,
  };
}

export function createAnnotation(kind, x = VIDEO_WIDTH / 2, y = VIDEO_HEIGHT / 2, index = 0, sceneDuration = 8000) {
  if (kind === "ellipse") {
    return withTiming({ kind, rect: [x - 185, y - 66, 370, 132] }, index, sceneDuration);
  }
  if (kind === "underline") {
    return withTiming({ kind, points: [[x - 150, y], [x + 150, y]] }, index, sceneDuration);
  }
  if (kind === "arrow") {
    return withTiming({ kind, points: [[x - 120, y - 90], [x, y]], color: "#e78418", headLength: 28, headWidth: 18 }, index, sceneDuration);
  }
  if (kind === "path") {
    return withTiming({ kind, points: [[x, y], [x + 1, y + 1]] }, index, sceneDuration);
  }
  if (kind === "text") {
    return withTiming({
      kind,
      text: DEFAULT_TEXT,
      position: [x, y],
      color: "#d72f45",
      fontFamily: "Times New Roman",
      fontStyle: "italic",
      fontSize: 40,
      opacity: 255,
    }, index, sceneDuration);
  }
  return withTiming({ kind }, index, sceneDuration);
}

function demoScene(id, name, durationMs, background, annotations) {
  return { id, name, durationMs, background, sourceName: "Tài liệu mẫu", annotations };
}

export function createInitialScenes() {
  return [
    demoScene("scene-1", "Mở đầu", 6000, "/assets/sample-page-01.png", [
      { ...createAnnotation("ellipse", 360, 210, 0, 6000), rect: [82, 142, 550, 130] },
      { ...createAnnotation("underline", 356, 548, 1, 6000), points: [[142, 548], [584, 548]] },
      { ...createAnnotation("text", 330, 650, 2, 6000), text: "Vấn đề nghiên cứu", fontSize: 34 },
    ]),
    demoScene("scene-2", "Ý chính", 8000, "/assets/sample-page-02.png", [
      { ...createAnnotation("ellipse", 350, 266, 0, 8000), rect: [75, 190, 560, 138] },
      { ...createAnnotation("arrow", 575, 600, 1, 8000), points: [[600, 500], [505, 625]] },
    ]),
    demoScene("scene-3", "Giải thích", 12000, "/assets/sample-page-02.png", [
      { ...createAnnotation("underline", 350, 352, 0, 12000), points: [[98, 352], [612, 352]] },
      { ...createAnnotation("ellipse", 360, 456, 1, 12000), rect: [92, 405, 536, 104] },
      { ...createAnnotation("arrow", 520, 685, 2, 12000), points: [[590, 560], [505, 690]] },
      { ...createAnnotation("text", 165, 735, 3, 12000), text: "Đối chứng: viêm niêm mạc", fontSize: 36 },
    ]),
    demoScene("scene-4", "Kết luận", 6000, "/assets/sample-page-01.png", [
      { ...createAnnotation("underline", 350, 720, 0, 6000), points: [[112, 720], [596, 720]] },
      { ...createAnnotation("text", 155, 770, 1, 6000), text: "Kết quả cần ghi nhớ", fontSize: 34 },
    ]),
  ];
}

export function annotationBounds(annotation, context) {
  if (!annotation) return null;
  if (annotation.kind === "ellipse") {
    const [x, y, width, height] = annotation.rect;
    return { x, y, width, height };
  }
  if (["path", "underline", "arrow"].includes(annotation.kind)) {
    const xs = annotation.points.map((point) => point[0]);
    const ys = annotation.points.map((point) => point[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x: x - 14, y: y - 14, width: Math.max(28, Math.max(...xs) - x + 28), height: Math.max(28, Math.max(...ys) - y + 28) };
  }
  if (annotation.kind === "text") {
    context.save();
    const fontStyle = normalizeFontStyle(annotation.fontFamily, annotation.fontStyle || "italic");
    const normalizedStyle = fontStyle.toLowerCase();
    context.font = `${normalizedStyle.includes("italic") ? "italic " : ""}${normalizedStyle.includes("bold") ? "bold " : ""}${annotation.fontSize || 36}px "${annotation.fontFamily || "Times New Roman"}", serif`;
    const width = Math.max(70, context.measureText(annotation.text || DEFAULT_TEXT).width);
    context.restore();
    return { x: annotation.position[0], y: annotation.position[1], width, height: (annotation.fontSize || 36) * 1.25 };
  }
  if (annotation.kind === "image") {
    return { x: annotation.position[0], y: annotation.position[1], width: annotation.previewWidth || 220, height: annotation.previewHeight || 220 };
  }
  return null;
}

export function moveAnnotation(annotation, dx, dy) {
  if (annotation.kind === "ellipse") {
    return { ...annotation, rect: [annotation.rect[0] + dx, annotation.rect[1] + dy, annotation.rect[2], annotation.rect[3]] };
  }
  if (["path", "underline", "arrow"].includes(annotation.kind)) {
    return { ...annotation, points: annotation.points.map(([x, y]) => [x + dx, y + dy]) };
  }
  if (["text", "image"].includes(annotation.kind)) {
    return { ...annotation, position: [annotation.position[0] + dx, annotation.position[1] + dy] };
  }
  return annotation;
}

function cleanAnnotation(annotation, imageAssets) {
  const base = {
    id: annotation.id,
    kind: annotation.kind,
    startMs: Math.round(annotation.startMs),
    durationMs: Math.max(1, Math.round(annotation.durationMs)),
    easing: annotation.easing || "easeInOut",
  };
  if (["path", "underline"].includes(annotation.kind)) {
    return { ...base, points: annotation.points, color: annotation.color, strokeWidth: annotation.strokeWidth };
  }
  if (annotation.kind === "ellipse") {
    return { ...base, rect: annotation.rect, color: annotation.color, strokeWidth: annotation.strokeWidth };
  }
  if (annotation.kind === "arrow") {
    return {
      ...base,
      points: annotation.points,
      color: annotation.color,
      strokeWidth: annotation.strokeWidth,
      headLength: annotation.headLength || 28,
      headWidth: annotation.headWidth || 18,
    };
  }
  if (annotation.kind === "text") {
    return {
      ...base,
      text: annotation.text,
      position: annotation.position,
      color: annotation.color,
      fontFamily: annotation.fontFamily || "Times New Roman",
      fontStyle: normalizeFontStyle(annotation.fontFamily, annotation.fontStyle || "italic"),
      fontSize: Number(annotation.fontSize) || 36,
      opacity: 255,
    };
  }
  if (annotation.kind === "image") {
    const name = `annotation-${imageAssets.length + 1}.png`;
    imageAssets.push({ name, dataUrl: annotation.sourceDataUrl });
    return { ...base, source: name, position: annotation.position, brushWidth: annotation.brushWidth || 48 };
  }
  return base;
}

export async function buildRendererPayload(scenes, audioAsset, handMode = "marker", handSize = 100) {
  const assets = [];
  const imageAssets = [];
  const rendererScenes = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const backgroundName = `scene-${index + 1}.png`;
    assets.push({ name: backgroundName, dataUrl: await urlToDataUrl(scene.background) });
    rendererScenes.push({
      id: scene.id,
      background: backgroundName,
      backgroundFit: "stretch",
      durationMs: scene.durationMs,
      cameraKeyframes: [{ atMs: 0, center: [VIDEO_WIDTH / 2, VIDEO_HEIGHT / 2], zoom: 1 }],
      annotations: scene.annotations
        .map((annotation) => ({
          ...annotation,
          startMs: Math.min(annotation.startMs, Math.max(0, scene.durationMs - 1)),
          durationMs: Math.min(annotation.durationMs, Math.max(1, scene.durationMs - Math.min(annotation.startMs, scene.durationMs - 1))),
        }))
        .map((annotation) => cleanAnnotation(annotation, imageAssets)),
    });
  }
  assets.push(...imageAssets);
  let audio;
  if (audioAsset?.dataUrl) {
    const extension = audioAsset.name?.split(".").pop()?.replace(/[^A-Za-z0-9]/g, "") || "mp3";
    audio = `audio.${extension}`;
    assets.push({ name: audio, dataUrl: audioAsset.dataUrl });
  }
  return {
    project: {
      version: 1,
      canvas: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, fps: 24 },
      ...(audio ? { audio } : {}),
      typography: { fontFamily: "Times New Roman", fontStyle: "italic", fontSize: 36 },
      hand: rendererHandConfig(handMode, handSize),
      scenes: rendererScenes,
    },
    assets,
  };
}
