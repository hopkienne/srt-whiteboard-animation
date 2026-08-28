import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowDownRightIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CircleIcon,
  CopyIcon,
  CornersOutIcon,
  CursorIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  EyeIcon,
  FilePdfIcon,
  FilmSlateIcon,
  FloppyDiskIcon,
  GearSixIcon,
  HandPointingIcon,
  ImageSquareIcon,
  HandPalmIcon,
  MinusIcon,
  MusicNotesIcon,
  PauseIcon,
  PencilLineIcon,
  PlayIcon,
  PlusIcon,
  SelectionIcon,
  SubtitlesIcon,
  TextTIcon,
  TextUnderlineIcon,
  TrashIcon,
  UploadSimpleIcon,
  WaveformIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  fileToDataUrl,
  downloadJson,
  formatTime,
  imageFileToOverlay,
  imageFileToPage,
  loadImage,
  parseSrt,
  pdfFileToPages,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./lib/media";
import {
  annotationBounds,
  buildRendererPayload,
  createAnnotation,
  DEFAULT_COLORS,
  makeId,
  moveAnnotation,
} from "./lib/project";
import {
  applyAnnotationBounds,
  canResizeAnnotation,
  findResizeHandle,
  getResizeHandles,
  resizeBounds,
  resizeTargetFromHandle,
  SELECTION_PADDING,
} from "./lib/resize";
import { adjustClipTiming } from "./lib/timeline";
import { activeAnnotationAt, annotationPenPosition, easeProgress, ELLIPSE_ROTATION, ELLIPSE_START_ANGLE, partialPolyline, writingHandMotion } from "./lib/preview";
import { buildSceneTimeline, locateSceneAt } from "./lib/project-timeline";
import { removeScene } from "./lib/storyboard";
import {
  DEFAULT_HAND_SIZE,
  HAND_SIZE_STEP,
  MAX_HAND_SIZE,
  MIN_HAND_SIZE,
  normalizeHandSize,
  previewHandHeight,
} from "./lib/render-config";
import { FONT_FAMILIES, normalizeFontStyle, supportsFontStyles } from "./lib/fonts";

const TOOL_ITEMS = [
  { id: "select", label: "Chọn", Icon: SelectionIcon },
  { id: "path", label: "Vẽ tự do", Icon: PencilLineIcon },
  { id: "ellipse", label: "Khoanh tròn", Icon: CircleIcon },
  { id: "underline", label: "Gạch chân", Icon: TextUnderlineIcon },
  { id: "arrow", label: "Mũi tên", Icon: ArrowDownRightIcon },
  { id: "text", label: "Viết chữ", Icon: TextTIcon },
  { id: "image", label: "Chèn hình", Icon: ImageSquareIcon },
];

const KIND_LABELS = {
  path: "Vẽ tự do",
  ellipse: "Khoanh tròn",
  underline: "Gạch chân",
  arrow: "Mũi tên",
  text: "Viết chữ",
  image: "Hình ảnh",
};

const TOOL_PLACEMENT_HINTS = {
  path: "Nhấn giữ và kéo để vẽ tự do",
  arrow: "Nhấn giữ tại điểm A, kéo tới điểm B rồi thả",
};

function placementHint(tool) {
  return TOOL_PLACEMENT_HINTS[tool] || `Bấm vào trang để đặt ${KIND_LABELS[tool].toLowerCase()}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function annotationProgress(annotation, currentMs, previewing) {
  if (!previewing) return 1;
  if (currentMs < annotation.startMs) return 0;
  return easeProgress((currentMs - annotation.startMs) / annotation.durationMs, annotation.easing);
}

function annotationFont(annotation) {
  const style = normalizeFontStyle(annotation.fontFamily, annotation.fontStyle || "italic");
  const weight = style.toLowerCase().includes("bold") ? "700 " : "";
  const italic = style.toLowerCase().includes("italic") ? "italic " : "";
  return `${italic}${weight}${annotation.fontSize || 36}px "${annotation.fontFamily || "Times New Roman"}", serif`;
}

function opaqueImageBounds(image) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right >= left && bottom >= top) return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  } catch {
    // The bundled same-origin PNG is readable; retain a full-image fallback for custom hosts.
  }
  return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
}

function drawPreviewHand(context, handAsset, point, handMode, handSize, motion) {
  if (!handAsset || !point) return;
  const { image, crop } = handAsset;
  const height = previewHandHeight(handMode, handSize);
  if (height <= 0) return;
  const width = height * crop.width / crop.height;
  context.save();
  context.globalAlpha = motion.opacity;
  context.translate(point[0] + motion.offsetX, point[1] + motion.offsetY);
  context.rotate(motion.rotation);
  context.scale(motion.scale, motion.scale);
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  context.restore();
}

function drawAnnotation(context, annotation, progress, imageCache) {
  if (progress <= 0) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = annotation.color || "#d72f45";
  context.fillStyle = annotation.color || "#d72f45";
  context.lineWidth = annotation.strokeWidth || 7;
  if (["path", "underline"].includes(annotation.kind)) {
    const points = partialPolyline(annotation.points, progress);
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
    context.stroke();
  } else if (annotation.kind === "ellipse") {
    const [x, y, width, height] = annotation.rect;
    context.beginPath();
    context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, ELLIPSE_ROTATION, ELLIPSE_START_ANGLE, ELLIPSE_START_ANGLE + Math.PI * 2 * progress);
    context.stroke();
  } else if (annotation.kind === "arrow") {
    const points = partialPolyline(annotation.points, Math.min(1, progress / 0.82));
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
    context.stroke();
    if (progress > 0.82 && points.length > 1) {
      const [x2, y2] = points.at(-1);
      const [x1, y1] = points.at(-2);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = annotation.headLength || 28;
      context.beginPath();
      context.moveTo(x2, y2);
      context.lineTo(x2 - head * Math.cos(angle - 0.55), y2 - head * Math.sin(angle - 0.55));
      context.moveTo(x2, y2);
      context.lineTo(x2 - head * Math.cos(angle + 0.55), y2 - head * Math.sin(angle + 0.55));
      context.stroke();
    }
  } else if (annotation.kind === "text") {
    context.font = annotationFont(annotation);
    context.textBaseline = "top";
    const width = context.measureText(annotation.text).width;
    context.beginPath();
    context.rect(annotation.position[0], annotation.position[1], width * progress, (annotation.fontSize || 36) * 1.4);
    context.clip();
    context.fillText(annotation.text, annotation.position[0], annotation.position[1]);
  } else if (annotation.kind === "image") {
    const image = imageCache.get(annotation.id);
    if (image) {
      const width = annotation.previewWidth || image.naturalWidth;
      const height = annotation.previewHeight || image.naturalHeight;
      context.beginPath();
      context.rect(annotation.position[0], annotation.position[1], width * progress, height);
      context.clip();
      context.drawImage(image, annotation.position[0], annotation.position[1], width, height);
    }
  }
  context.restore();
}

function drawSelection(context, annotation) {
  const bounds = annotationBounds(annotation, context);
  if (!bounds) return;
  const padding = SELECTION_PADDING;
  const x = bounds.x - padding;
  const y = bounds.y - padding;
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  context.save();
  context.strokeStyle = "#d14343";
  context.lineWidth = 2;
  context.setLineDash([8, 7]);
  context.strokeRect(x, y, width, height);
  context.setLineDash([]);
  const handles = canResizeAnnotation(annotation) ? getResizeHandles(bounds, padding) : [];
  handles.forEach(({ x: handleX, y: handleY }) => {
    context.fillStyle = "#fffdf7";
    context.strokeStyle = "#d14343";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(handleX, handleY, 8, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  });
  context.restore();
}

function PaperCanvas({ scene, selectedId, tool, currentMs, previewing, handMode, handSize, onAdd, onSelect, onUpdate, onCommitText, onTransformStart, onTransformEnd, onToolDone, onDelete, onDuplicate, onCycleColor }) {
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const backgroundRef = useRef(null);
  const handAssetRef = useRef(null);
  const imageCacheRef = useRef(new Map());
  const pointerRef = useRef(null);
  const spacePressedRef = useRef(false);
  const inlineInputRef = useRef(null);
  const inlineFinishRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ width: 900, height: 600 });
  const [panning, setPanning] = useState(false);
  const [resizeCursor, setResizeCursor] = useState("");
  const [inlineText, setInlineText] = useState(null);

  useEffect(() => {
    if (!inlineText) return;
    inlineInputRef.current?.focus();
    inlineInputRef.current?.select();
  }, [inlineText?.id, scene.annotations.length]);

  useEffect(() => {
    setInlineText(null);
  }, [scene.id]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const keyDown = (event) => {
      if (event.code === "Space" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        spacePressedRef.current = true;
        event.preventDefault();
      }
    };
    const keyUp = (event) => {
      if (event.code === "Space") {
        spacePressedRef.current = false;
        setPanning(false);
      }
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadImage(scene.background).then((image) => {
      if (active) {
        backgroundRef.current = image;
        canvasRef.current?.dispatchEvent(new Event("redraw"));
      }
    });
    scene.annotations.filter((annotation) => annotation.kind === "image").forEach((annotation) => {
      if (!annotation.sourceDataUrl || imageCacheRef.current.has(annotation.id)) return;
      loadImage(annotation.sourceDataUrl).then((image) => {
        if (active) {
          imageCacheRef.current.set(annotation.id, image);
          canvasRef.current?.dispatchEvent(new Event("redraw"));
        }
      });
    });
    return () => { active = false; };
  }, [scene.background, scene.annotations]);

  useEffect(() => {
    if (handMode === "none" || handAssetRef.current) return undefined;
    let active = true;
    loadImage("/assets/drawing-hand.png").then((image) => {
      if (!active) return;
      handAssetRef.current = { image, crop: opaqueImageBounds(image) };
      canvasRef.current?.dispatchEvent(new Event("redraw"));
    });
    return () => { active = false; };
  }, [handMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const draw = () => {
      context.fillStyle = "#fffaf0";
      context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      if (backgroundRef.current) context.drawImage(backgroundRef.current, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      scene.annotations.forEach((annotation) => {
        drawAnnotation(context, annotation, annotationProgress(annotation, currentMs, previewing), imageCacheRef.current);
      });
      if (previewing && handMode !== "none") {
        const activeAnnotation = activeAnnotationAt(scene.annotations, currentMs);
        if (activeAnnotation) {
          const progress = annotationProgress(activeAnnotation, currentMs, true);
          let textWidth = 0;
          if (activeAnnotation.kind === "text") {
            context.save();
            context.font = annotationFont(activeAnnotation);
            textWidth = context.measureText(activeAnnotation.text || " ").width;
            context.restore();
          }
          drawPreviewHand(
            context,
            handAssetRef.current,
            annotationPenPosition(activeAnnotation, progress, textWidth),
            handMode,
            handSize,
            writingHandMotion(activeAnnotation, progress, handMode),
          );
        }
      }
      if (!previewing && selectedId) drawSelection(context, scene.annotations.find((annotation) => annotation.id === selectedId));
    };
    draw();
    canvas.addEventListener("redraw", draw);
    return () => canvas.removeEventListener("redraw", draw);
  }, [scene, selectedId, currentMs, previewing, handMode, handSize]);

  function canvasPoint(event) {
    const bounds = canvasRef.current.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) * VIDEO_WIDTH / bounds.width, 0, VIDEO_WIDTH),
      y: clamp((event.clientY - bounds.top) * VIDEO_HEIGHT / bounds.height, 0, VIDEO_HEIGHT),
    };
  }

  function hitTest(point) {
    const context = canvasRef.current.getContext("2d");
    return [...scene.annotations].reverse().find((annotation) => {
      const bounds = annotationBounds(annotation, context);
      return bounds && point.x >= bounds.x - 22 && point.x <= bounds.x + bounds.width + 22 && point.y >= bounds.y - 22 && point.y <= bounds.y + bounds.height + 22;
    });
  }

  function startInlineTextEdit(annotation) {
    inlineFinishRef.current = false;
    onSelect(annotation.id);
    setInlineText({ id: annotation.id, draft: annotation.text || "" });
  }

  function commitInlineText() {
    if (!inlineText || inlineFinishRef.current) return;
    inlineFinishRef.current = true;
    const annotation = scene.annotations.find((item) => item.id === inlineText.id);
    const text = inlineText.draft.trim() || " ";
    setInlineText(null);
    if (annotation && text !== annotation.text) onCommitText(annotation.id, { ...annotation, text });
    requestAnimationFrame(() => { inlineFinishRef.current = false; });
  }

  function cancelInlineText() {
    inlineFinishRef.current = true;
    setInlineText(null);
    requestAnimationFrame(() => { inlineFinishRef.current = false; });
  }

  function handlePointerDown(event) {
    if (previewing) return;
    canvasRef.current.setPointerCapture(event.pointerId);
    if (event.button === 1 || spacePressedRef.current) {
      const scroll = scrollRef.current;
      pointerRef.current = { mode: "pan", clientX: event.clientX, clientY: event.clientY, scrollLeft: scroll.scrollLeft, scrollTop: scroll.scrollTop };
      setPanning(true);
      event.preventDefault();
      return;
    }
    const point = canvasPoint(event);
    if (tool === "select") {
      const selectedAnnotation = scene.annotations.find((annotation) => annotation.id === selectedId);
      if (canResizeAnnotation(selectedAnnotation)) {
        const selectedBounds = annotationBounds(selectedAnnotation, canvasRef.current.getContext("2d"));
        const resizeHandle = selectedBounds && findResizeHandle(point, selectedBounds);
        if (resizeHandle) {
          onTransformStart();
          pointerRef.current = {
            mode: "resize",
            handle: resizeHandle.id,
            original: structuredClone(selectedAnnotation),
            bounds: selectedBounds,
            grabOffset: { x: point.x - resizeHandle.x, y: point.y - resizeHandle.y },
          };
          setResizeCursor(resizeHandle.cursor);
          event.preventDefault();
          return;
        }
      }
      const hit = hitTest(point);
      onSelect(hit?.id || null);
      if (hit) {
        onTransformStart();
        pointerRef.current = { mode: "drag", start: point, original: structuredClone(hit) };
      }
      return;
    }
    if (["path", "arrow"].includes(tool)) {
      const annotation = createAnnotation(tool, point.x, point.y, scene.annotations.length, scene.durationMs);
      annotation.points = [[point.x, point.y], [point.x + 1, point.y + 1]];
      onAdd(annotation);
      pointerRef.current = { mode: tool === "arrow" ? "draw-arrow" : "draw", id: annotation.id };
      return;
    }
    if (tool !== "image") {
      const annotation = createAnnotation(tool, point.x, point.y, scene.annotations.length, scene.durationMs);
      onAdd(annotation);
      if (annotation.kind === "text") startInlineTextEdit(annotation);
      onToolDone();
    }
  }

  function handleDoubleClick(event) {
    if (previewing || tool !== "select") return;
    const annotation = hitTest(canvasPoint(event));
    if (annotation?.kind !== "text") return;
    event.preventDefault();
    startInlineTextEdit(annotation);
  }

  function handlePointerMove(event) {
    const action = pointerRef.current;
    if (!action) {
      if (tool === "select") {
        const selectedAnnotation = scene.annotations.find((annotation) => annotation.id === selectedId);
        const selectedBounds = canResizeAnnotation(selectedAnnotation) ? annotationBounds(selectedAnnotation, canvasRef.current.getContext("2d")) : null;
        setResizeCursor(selectedBounds ? findResizeHandle(canvasPoint(event), selectedBounds)?.cursor || "" : "");
      }
      return;
    }
    if (action.mode === "pan") {
      scrollRef.current.scrollLeft = action.scrollLeft - (event.clientX - action.clientX);
      scrollRef.current.scrollTop = action.scrollTop - (event.clientY - action.clientY);
      return;
    }
    const point = canvasPoint(event);
    if (action.mode === "drag") {
      onUpdate(action.original.id, moveAnnotation(action.original, point.x - action.start.x, point.y - action.start.y));
    } else if (action.mode === "resize") {
      const handlePosition = {
        x: point.x - action.grabOffset.x,
        y: point.y - action.grabOffset.y,
      };
      const target = resizeTargetFromHandle(handlePosition, action.handle);
      const nextBounds = resizeBounds(action.bounds, action.handle, target, {
        canvasWidth: VIDEO_WIDTH,
        canvasHeight: VIDEO_HEIGHT,
        preserveAspect: event.shiftKey,
      });
      onUpdate(action.original.id, applyAnnotationBounds(action.original, nextBounds));
    } else if (action.mode === "draw") {
      const annotation = scene.annotations.find((item) => item.id === action.id);
      if (!annotation) return;
      const last = annotation.points.at(-1);
      if (Math.hypot(point.x - last[0], point.y - last[1]) > 5) {
        onUpdate(annotation.id, { ...annotation, points: [...annotation.points, [point.x, point.y]] });
      }
    } else if (action.mode === "draw-arrow") {
      const annotation = scene.annotations.find((item) => item.id === action.id);
      if (!annotation) return;
      onUpdate(annotation.id, { ...annotation, points: [annotation.points[0], [point.x, point.y]] });
    }
  }

  function handlePointerUp() {
    const action = pointerRef.current;
    if (["draw", "draw-arrow"].includes(action?.mode)) onToolDone();
    if (["drag", "resize"].includes(action?.mode)) onTransformEnd();
    pointerRef.current = null;
    setPanning(false);
    setResizeCursor("");
  }

  function changeZoom(nextZoom) {
    const next = clamp(Math.round(nextZoom * 4) / 4, 0.5, 3);
    setZoom(next);
    requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      scroll.scrollLeft = Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2);
      scroll.scrollTop = Math.max(0, (scroll.scrollHeight - scroll.clientHeight) / 2);
    });
  }

  const fitScale = Math.max(0.1, Math.min((viewport.width - 170) / VIDEO_WIDTH, (viewport.height - 64) / VIDEO_HEIGHT));
  const paperWidth = Math.round(VIDEO_WIDTH * fitScale * zoom);
  const paperHeight = Math.round(VIDEO_HEIGHT * fitScale * zoom);
  const selectedAnnotation = scene.annotations.find((annotation) => annotation.id === selectedId);
  const selectedBounds = selectedAnnotation && canvasRef.current ? annotationBounds(selectedAnnotation, canvasRef.current.getContext("2d")) : null;
  const inlineAnnotation = inlineText ? scene.annotations.find((annotation) => annotation.id === inlineText.id) : null;
  const inlineScale = paperWidth / VIDEO_WIDTH;
  const inlineLogicalWidth = inlineAnnotation ? Math.min(
    VIDEO_WIDTH - inlineAnnotation.position[0],
    Math.max(180, Math.min(620, (inlineText.draft.length + 1) * (inlineAnnotation.fontSize || 36) * 0.58 + 28)),
  ) : 180;

  return (
    <div className={`canvas-editor ${panning ? "is-panning" : ""}`}>
      <div
        ref={scrollRef}
        className="canvas-scroll"
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
        }}
      >
        <div className="canvas-stage" style={{ width: `max(100%, ${paperWidth + 170}px)`, height: `max(100%, ${paperHeight + 64}px)` }}>
          <div className="paper-shell" style={{ width: paperWidth, height: paperHeight }}>
            <canvas
              ref={canvasRef}
              className={`paper-canvas tool-${tool}`}
              style={resizeCursor ? { cursor: resizeCursor } : undefined}
              width={VIDEO_WIDTH}
              height={VIDEO_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={handleDoubleClick}
              onPointerLeave={() => { if (!pointerRef.current) setResizeCursor(""); }}
            />
            {!previewing && tool !== "select" && tool !== "image" && (
              <div className="placement-tip"><HandPointingIcon size={17} weight="bold" /> {placementHint(tool)}</div>
            )}
            {!previewing && inlineAnnotation && (
              <textarea
                ref={inlineInputRef}
                className="inline-text-editor"
                aria-label="Chỉnh chữ trực tiếp trên tài liệu"
                rows="1"
                value={inlineText.draft}
                style={{
                  left: `${inlineAnnotation.position[0] / VIDEO_WIDTH * 100}%`,
                  top: `${inlineAnnotation.position[1] / VIDEO_HEIGHT * 100}%`,
                  width: `${inlineLogicalWidth / VIDEO_WIDTH * 100}%`,
                  minHeight: `${Math.max(28, (inlineAnnotation.fontSize || 36) * 1.35 * inlineScale)}px`,
                  color: inlineAnnotation.color,
                  fontFamily: `"${inlineAnnotation.fontFamily || "Times New Roman"}", serif`,
                  fontSize: `${Math.max(10, (inlineAnnotation.fontSize || 36) * inlineScale)}px`,
                  fontStyle: normalizeFontStyle(inlineAnnotation.fontFamily, inlineAnnotation.fontStyle).toLowerCase().includes("italic") ? "italic" : "normal",
                  fontWeight: normalizeFontStyle(inlineAnnotation.fontFamily, inlineAnnotation.fontStyle).toLowerCase().includes("bold") ? "700" : "400",
                }}
                onChange={(event) => setInlineText((current) => ({ ...current, draft: event.target.value.replace(/[\r\n]/g, " ") }))}
                onBlur={commitInlineText}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitInlineText();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelInlineText();
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            )}
            {!previewing && !inlineText && selectedAnnotation && selectedBounds && (
              <div
                className="object-toolbar"
                style={{ left: `${(selectedBounds.x + selectedBounds.width / 2) / VIDEO_WIDTH * 100}%`, top: `${selectedBounds.y / VIDEO_HEIGHT * 100}%` }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span className="object-kind">{KIND_LABELS[selectedAnnotation.kind]}</span>
                <button type="button" title="Đổi màu" onClick={onCycleColor}><i style={{ background: selectedAnnotation.color }} /></button>
                <button type="button" title="Nhân bản" onClick={onDuplicate}><CopyIcon /></button>
                <button className="danger" type="button" title="Xóa" onClick={onDelete}><TrashIcon /></button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="canvas-zoom" aria-label="Điều khiển thu phóng">
        <button type="button" title="Thu nhỏ" disabled={zoom <= 0.5} onClick={() => changeZoom(zoom - 0.25)}><MinusIcon /></button>
        <button className="fit-button" type="button" title="Vừa màn hình" onClick={() => changeZoom(1)}><CornersOutIcon /><span>Vừa</span></button>
        <input aria-label="Mức thu phóng" type="range" min="50" max="300" step="25" value={zoom * 100} onChange={(event) => changeZoom(Number(event.target.value) / 100)} />
        <strong>{Math.round(zoom * 100)}%</strong>
        <button type="button" title="Phóng to" disabled={zoom >= 3} onClick={() => changeZoom(zoom + 0.25)}><PlusIcon /></button>
      </div>
      <div className="pan-hint"><HandPalmIcon /> Giữ Space để kéo trang · Ctrl + cuộn để zoom</div>
    </div>
  );
}

function WaveformCanvas({ progress = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas.getContext("2d");
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#a9a59b";
    context.lineWidth = 1;
    for (let x = 0; x < width; x += 4) {
      const amplitude = 4 + Math.abs(Math.sin(x * 0.087) * Math.cos(x * 0.023)) * (height * 0.32);
      context.beginPath();
      context.moveTo(x, height / 2 - amplitude);
      context.lineTo(x, height / 2 + amplitude);
      context.stroke();
    }
    context.fillStyle = "rgba(198, 58, 61, .16)";
    context.fillRect(0, 0, width * progress, height);
    context.strokeStyle = "#c43b3f";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(width * progress, 0);
    context.lineTo(width * progress, height);
    context.stroke();
  }, [progress]);
  return <canvas className="waveform-canvas" width="1100" height="44" ref={ref} />;
}

function TimelineClip({ annotation, sceneDuration, sceneOffset, projectDuration, selected, onSelect, onUpdate, onTransformStart, onTransformEnd }) {
  const dragRef = useRef(null);
  const [dragMode, setDragMode] = useState(null);
  const Icon = TOOL_ITEMS.find((item) => item.id === annotation.kind)?.Icon || TextUnderlineIcon;
  const startSeconds = (annotation.startMs / 1000).toFixed(1);
  const durationSeconds = (annotation.durationMs / 1000).toFixed(1);

  useEffect(() => {
    if (!dragMode) return undefined;

    const updateDrag = (event) => {
      const action = dragRef.current;
      if (!action || event.pointerId !== action.pointerId) return;
      const deltaMs = (event.clientX - action.startX) / action.trackWidth * projectDuration;
      const timing = adjustClipTiming(action.original, action.mode, deltaMs, sceneDuration);
      if (timing.startMs === action.lastTiming.startMs && timing.durationMs === action.lastTiming.durationMs) return;
      action.lastTiming = timing;
      onUpdate(action.original.id, { ...action.original, ...timing });
    };

    const finishDrag = (event) => {
      const action = dragRef.current;
      if (!action || event.pointerId !== action.pointerId) return;
      dragRef.current = null;
      setDragMode(null);
      onTransformEnd();
    };

    window.addEventListener("pointermove", updateDrag);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", updateDrag);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [dragMode, projectDuration, sceneDuration, onTransformEnd, onUpdate]);

  function beginDrag(event, mode) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const clip = event.currentTarget.closest(".timeline-clip");
    const trackWidth = clip?.parentElement?.getBoundingClientRect().width;
    if (!clip || !trackWidth) return;
    onSelect(annotation.id);
    onTransformStart();
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      trackWidth,
      original: structuredClone(annotation),
      lastTiming: { startMs: annotation.startMs, durationMs: annotation.durationMs },
    };
    setDragMode(mode);
  }

  function selectClip(event) {
    event.stopPropagation();
    onSelect(annotation.id);
  }

  return (
    <div
      className={`timeline-clip kind-${annotation.kind} ${selected ? "selected" : ""} ${dragMode ? `is-dragging is-${dragMode}` : ""}`}
      style={{ left: `${(sceneOffset + annotation.startMs) / projectDuration * 100}%`, width: `${annotation.durationMs / projectDuration * 100}%` }}
      title={`Bắt đầu ${startSeconds}s · Thời lượng ${durationSeconds}s`}
    >
      <button
        className="timeline-trim-handle start"
        type="button"
        aria-label={`Điều chỉnh điểm bắt đầu ${KIND_LABELS[annotation.kind].toLowerCase()}`}
        onPointerDown={(event) => beginDrag(event, "resize-start")}
      />
      <button
        className="timeline-clip-body"
        type="button"
        aria-label={`${KIND_LABELS[annotation.kind]}, bắt đầu ${startSeconds} giây, thời lượng ${durationSeconds} giây`}
        onPointerDown={(event) => beginDrag(event, "move")}
        onClick={selectClip}
      >
        <Icon />
        <span className="timeline-clip-label">{KIND_LABELS[annotation.kind]}</span>
        <small>{durationSeconds}s</small>
      </button>
      <button
        className="timeline-trim-handle end"
        type="button"
        aria-label={`Điều chỉnh điểm kết thúc ${KIND_LABELS[annotation.kind].toLowerCase()}`}
        onPointerDown={(event) => beginDrag(event, "resize-end")}
      />
    </div>
  );
}

function StoryCard({ scene, index, selected, canDelete, onClick, onDelete }) {
  return (
    <article className={`story-card ${selected ? "selected" : ""}`}>
      <button className="story-card-main" type="button" onClick={onClick} aria-label={`Mở ${scene.name}`} aria-current={selected ? "true" : undefined}>
        <div className="story-card-head"><span className="scene-number">{index + 1}</span><strong>{scene.name}</strong><time>{formatTime(scene.durationMs)}</time></div>
        <div className="story-thumb">
          <img src={scene.background} alt="" />
          <div className="thumb-annotation-count">{scene.annotations.length} chú thích</div>
        </div>
        <div className="story-meta"><span>{scene.annotations.length} chú thích</span><span className="mini-dots"><i /><i /><i /></span></div>
      </button>
      <button
        className="scene-delete-button"
        type="button"
        aria-label={`Xóa ${scene.name}`}
        title={canDelete ? `Xóa ${scene.name}` : "Dự án phải còn ít nhất một cảnh"}
        disabled={!canDelete}
        onClick={onDelete}
      >
        <TrashIcon size={15} weight="bold" />
      </button>
    </article>
  );
}

function MediaCard({ Icon, title, detail, status, onClick }) {
  return (
    <button className="media-card" onClick={onClick}>
      <span className="media-icon"><Icon size={23} weight="duotone" /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      {status === "ready" ? <CheckCircleIcon className="ready-icon" size={19} weight="fill" /> : <UploadSimpleIcon size={17} />}
    </button>
  );
}

function AnnotationInspector({ selectedAnnotation, tool, onPatch, onDelete, onDuplicate, scene, onSceneDuration }) {
  const contextTool = TOOL_ITEMS.find((item) => item.id === (selectedAnnotation?.kind || tool)) || TOOL_ITEMS[0];
  const ContextIcon = contextTool.Icon;
  const isCreating = !selectedAnnotation && tool !== "select";
  const selectedFontSupportsStyles = supportsFontStyles(selectedAnnotation?.fontFamily);

  return (
    <aside className="annotation-inspector">
      <div className="inspector-head"><div><strong>Thuộc tính</strong><span>{selectedAnnotation ? "Đối tượng đang chọn" : isCreating ? "Chế độ tạo chú thích" : "Chưa chọn đối tượng"}</span></div><CaretDownIcon /></div>

      {selectedAnnotation ? (
        <>
          <section className="inspector-object-summary">
            <span className="inspector-object-icon"><ContextIcon size={22} weight="duotone" /></span>
            <span><small>Loại đối tượng</small><strong>{KIND_LABELS[selectedAnnotation.kind]}</strong></span>
            <em><CheckCircleIcon weight="fill" /> Đang chọn</em>
          </section>
          {canResizeAnnotation(selectedAnnotation) && (
            <div className="resize-helper"><SelectionIcon weight="duotone" /><span><strong>Đổi kích thước trực tiếp</strong>Kéo tay nắm ở cạnh hoặc góc. Giữ Shift để khóa tỷ lệ.</span></div>
          )}
          {selectedAnnotation.kind === "text" && (
            <section className="inspector-section">
              <label className="inspector-label" htmlFor="annotation-content">Nội dung</label>
              <textarea id="annotation-content" value={selectedAnnotation.text} onChange={(event) => onPatch({ text: event.target.value || " " })} />
            </section>
          )}

          {selectedAnnotation.kind === "image" && (
            <section className="inspector-section inspector-file-info">
              <label className="inspector-label">Hình ảnh</label>
              <span><ImageSquareIcon /> {selectedAnnotation.sourceName || "Ảnh đã chèn"}</span>
            </section>
          )}

          {selectedAnnotation.kind === "text" && (
            <section className="inspector-section">
              <label className="inspector-label">Kiểu chữ</label>
              <div className="inspector-font-row">
                <select
                  aria-label="Kiểu chữ"
                  value={selectedAnnotation.fontFamily}
                  onChange={(event) => {
                    const fontFamily = event.target.value;
                    onPatch({ fontFamily, fontStyle: normalizeFontStyle(fontFamily, selectedAnnotation.fontStyle) });
                  }}
                >
                  {FONT_FAMILIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input aria-label="Cỡ chữ" type="number" min="12" max="96" value={selectedAnnotation.fontSize} onChange={(event) => onPatch({ fontSize: Number(event.target.value) })} />
              </div>
              <div className="inspector-style-row">
                {[['regular', 'Thường'], ['bold', 'Đậm'], ['italic', 'Nghiêng'], ['boldItalic', 'Đậm nghiêng']].map(([value, label]) => <button key={value} className={normalizeFontStyle(selectedAnnotation.fontFamily, selectedAnnotation.fontStyle || "italic") === value ? "active" : ""} type="button" disabled={!selectedFontSupportsStyles && value !== "regular"} title={!selectedFontSupportsStyles && value !== "regular" ? "Patrick Hand chỉ có dáng chữ thường" : undefined} onClick={() => onPatch({ fontStyle: value })}>{label}</button>)}
              </div>
            </section>
          )}

          <section className="inspector-section">
            <label className="inspector-label">Viền & màu</label>
            <div className="inspector-color-row">{DEFAULT_COLORS.map((color) => <button key={color} className={selectedAnnotation.color === color ? "active" : ""} style={{ backgroundColor: color }} type="button" onClick={() => onPatch({ color })} aria-label={`Màu ${color}`} />)}</div>
            {selectedAnnotation.kind !== "image" && <label className="inspector-compact-field"><span>Độ dày nét</span><select value={selectedAnnotation.strokeWidth || 7} onChange={(event) => onPatch({ strokeWidth: Number(event.target.value) })}><option value="3">3 px</option><option value="5">5 px</option><option value="7">7 px</option><option value="10">10 px</option><option value="14">14 px</option></select></label>}
          </section>

          <section className="inspector-section">
            <label className="inspector-label">Thời gian hiển thị</label>
            <div className="inspector-time-grid">
              <label><span>Bắt đầu</span><div><input type="number" min="0" step="0.1" value={(selectedAnnotation.startMs / 1000).toFixed(1)} onChange={(event) => onPatch({ startMs: clamp(Number(event.target.value) * 1000, 0, scene.durationMs - selectedAnnotation.durationMs) })} /><em>giây</em></div></label>
              <label><span>Thời lượng</span><div><input type="number" min="0.1" step="0.1" value={(selectedAnnotation.durationMs / 1000).toFixed(1)} onChange={(event) => onPatch({ durationMs: clamp(Number(event.target.value) * 1000, 100, scene.durationMs - selectedAnnotation.startMs) })} /><em>giây</em></div></label>
            </div>
          </section>

          <section className="inspector-section">
            <label className="inspector-label" htmlFor="annotation-note">Ghi chú</label>
            <textarea id="annotation-note" className="note-field" value={selectedAnnotation.note || ""} placeholder="Nhập ghi chú (tùy chọn)…" onChange={(event) => onPatch({ note: event.target.value })} />
          </section>

          <div className="inspector-object-actions"><button type="button" onClick={onDuplicate}><CopyIcon /> Nhân bản</button><button className="danger" type="button" onClick={onDelete}><TrashIcon /> Xóa</button></div>
        </>
      ) : (
        <div className={`inspector-empty ${isCreating ? "is-creating" : ""}`}>
          <span className="inspector-empty-icon"><ContextIcon size={28} weight="duotone" /></span>
          <span className="inspector-empty-kicker">{isCreating ? "Đang tạo chú thích" : "Sẵn sàng chỉnh sửa"}</span>
          <strong>{isCreating ? contextTool.label : "Chọn một đối tượng"}</strong>
          <p>{isCreating ? `${placementHint(tool)} trực tiếp trên tài liệu.` : "Bấm vào đối tượng trên trang hoặc clip trong timeline để mở thuộc tính."}</p>
          {isCreating && <span className="inspector-mode-badge"><span className="pulse-dot" /> Công cụ đang hoạt động</span>}
        </div>
      )}

      <section className="inspector-section scene-inspector">
        <label className="inspector-label">Cảnh hiện tại</label>
        <label className="inspector-compact-field"><span>Thời lượng cảnh</span><div className="scene-time-input"><input type="number" min="1" max="3600" step="1" value={Math.round(scene.durationMs / 1000)} onChange={(event) => onSceneDuration(event.target.value)} /><em>giây</em></div></label>
      </section>
    </aside>
  );
}

export function StudioEditor({ project, onAutoSave, onNewProject, onHome, onProjects }) {
  const [scenes, setScenes] = useState(() => structuredClone(project.scenes));
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState("select");
  const [projectCurrentMs, setProjectCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [subtitles, setSubtitles] = useState(() => structuredClone(project.subtitles || []));
  const [subtitleName, setSubtitleName] = useState(project.subtitleName || "");
  const [audioAsset, setAudioAsset] = useState(() => structuredClone(project.audioAsset || null));
  const [documentName, setDocumentName] = useState(project.documentName);
  const [projectName] = useState(project.name);
  const [hasImportedDocument, setHasImportedDocument] = useState(project.documentName !== "Tài liệu mẫu");
  const [notice, setNotice] = useState("Kéo chú thích trực tiếp trên trang — không cần nhập tọa độ.");
  const [busy, setBusy] = useState(false);
  const [renderJob, setRenderJob] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [handMode, setHandMode] = useState(project.handMode || "marker");
  const [handSize, setHandSize] = useState(() => normalizeHandSize(project.handSize));
  const [saveState, setSaveState] = useState(onAutoSave ? "saved" : "demo");
  const renderPollTimerRef = useRef(null);
  const renderSourceVersionRef = useRef(0);
  const activeRenderVersionRef = useRef(null);
  const projectCurrentMsRef = useRef(0);
  const hasAutoSaveMountedRef = useRef(false);
  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const transformSnapshotRef = useRef(null);
  const transformChangedRef = useRef(false);
  const documentInput = useRef(null);
  const subtitleInput = useRef(null);
  const audioInput = useRef(null);
  const overlayInput = useRef(null);
  const audioRef = useRef(null);

  const scene = scenes[sceneIndex];
  const selectedAnnotation = scene?.annotations.find((annotation) => annotation.id === selectedId) || null;
  const sceneTimeline = useMemo(() => buildSceneTimeline(scenes), [scenes]);
  const totalDuration = sceneTimeline.at(-1)?.endMs || 0;
  const activeSceneRange = sceneTimeline[sceneIndex];
  const sceneCurrentMs = clamp(projectCurrentMs - (activeSceneRange?.startMs || 0), 0, scene?.durationMs || 0);
  const activeCue = subtitles.find((cue) => projectCurrentMs >= cue.startMs && projectCurrentMs <= cue.endMs);

  useEffect(() => {
    if (!onAutoSave) return undefined;
    if (!hasAutoSaveMountedRef.current) {
      hasAutoSaveMountedRef.current = true;
      return undefined;
    }
    setSaveState("saving");
    const timeout = setTimeout(() => {
      Promise.resolve(onAutoSave({
        ...project,
        name: projectName,
        documentName,
        scenes,
        subtitles,
        subtitleName,
        audioAsset,
        handMode,
        handSize,
      })).then(() => setSaveState("saved")).catch((error) => {
        setSaveState("error");
        setNotice(`Không thể tự động lưu: ${error.message}`);
      });
    }, 700);
    return () => clearTimeout(timeout);
  }, [audioAsset, documentName, handMode, handSize, onAutoSave, project, projectName, scenes, subtitleName, subtitles]);

  useEffect(() => {
    setSelectedId((current) => current || scenes[0]?.annotations.find((annotation) => annotation.kind === "text")?.id || null);
  }, []);

  useEffect(() => {
    renderSourceVersionRef.current += 1;
    if (activeRenderVersionRef.current === null) return;
    activeRenderVersionRef.current = null;
    if (renderPollTimerRef.current) window.clearTimeout(renderPollTimerRef.current);
    renderPollTimerRef.current = null;
    setRenderJob(null);
    setBusy(false);
    setNotice("Dự án đã thay đổi. Hãy tạo MP4 mới để nhận đúng nội dung hiện tại.");
  }, [audioAsset, handMode, handSize, scenes]);

  useEffect(() => () => {
    if (renderPollTimerRef.current) window.clearTimeout(renderPollTimerRef.current);
  }, []);

  useEffect(() => {
    const location = locateSceneAt(sceneTimeline, projectCurrentMsRef.current);
    if (!location) return;
    projectCurrentMsRef.current = location.projectTimeMs;
    setProjectCurrentMs((current) => current === location.projectTimeMs ? current : location.projectTimeMs);
    setSceneIndex((current) => current === location.sceneIndex ? current : location.sceneIndex);
  }, [sceneTimeline]);

  useEffect(() => {
    if (!playing) return undefined;
    let frame;
    let previous = performance.now();
    const tick = (now) => {
      const delta = now - previous;
      previous = now;
      const nextTime = Math.min(totalDuration, projectCurrentMsRef.current + delta);
      projectCurrentMsRef.current = nextTime;
      setProjectCurrentMs(nextTime);
      const location = locateSceneAt(sceneTimeline, nextTime);
      if (location) setSceneIndex(location.sceneIndex);
      if (nextTime >= totalDuration) {
        setPlaying(false);
        setPreviewing(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    audioRef.current?.play().catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      audioRef.current?.pause();
    };
  }, [playing, sceneTimeline, totalDuration]);

  function seekProject(value, syncAudio = playing) {
    const location = locateSceneAt(sceneTimeline, value);
    if (!location) return;
    projectCurrentMsRef.current = location.projectTimeMs;
    setProjectCurrentMs(location.projectTimeMs);
    setSceneIndex(location.sceneIndex);
    if (syncAudio && audioRef.current) audioRef.current.currentTime = location.projectTimeMs / 1000;
  }

  function selectScene(index) {
    const range = sceneTimeline[index];
    if (!range) return;
    setPlaying(false);
    setPreviewing(false);
    seekProject(range.startMs, false);
    setSelectedId(null);
  }

  function commitScenes(updater) {
    setScenes((current) => {
      historyRef.current = [...historyRef.current.slice(-49), structuredClone(current)];
      futureRef.current = [];
      return typeof updater === "function" ? updater(current) : updater;
    });
  }

  function updateScene(updater) {
    commitScenes((current) => current.map((item, index) => index === sceneIndex ? updater(item) : item));
  }

  function undo() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(structuredClone(scenes));
    setScenes(previous);
    setSelectedId(null);
    setNotice("Đã hoàn tác thay đổi gần nhất.");
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(structuredClone(scenes));
    setScenes(next);
    setSelectedId(null);
    setNotice("Đã làm lại thay đổi.");
  }

  function addAnnotation(annotation) {
    updateScene((item) => ({ ...item, annotations: [...item.annotations, annotation] }));
    setSelectedId(annotation.id);
  }

  function updateAnnotation(id, value) {
    updateScene((item) => ({ ...item, annotations: item.annotations.map((annotation) => annotation.id === id ? value : annotation) }));
  }

  function beginAnnotationTransform() {
    if (transformSnapshotRef.current) return;
    transformSnapshotRef.current = structuredClone(scenes);
    transformChangedRef.current = false;
  }

  function updateAnnotationLive(id, value, targetSceneIndex = sceneIndex) {
    transformChangedRef.current = true;
    setScenes((current) => current.map((item, index) => index === targetSceneIndex
      ? { ...item, annotations: item.annotations.map((annotation) => annotation.id === id ? value : annotation) }
      : item));
  }

  function endAnnotationTransform() {
    if (transformSnapshotRef.current && transformChangedRef.current) {
      historyRef.current = [...historyRef.current.slice(-49), transformSnapshotRef.current];
      futureRef.current = [];
    }
    transformSnapshotRef.current = null;
    transformChangedRef.current = false;
  }

  function patchSelected(patch) {
    if (!selectedAnnotation) return;
    updateAnnotation(selectedAnnotation.id, { ...selectedAnnotation, ...patch });
  }

  function chooseTool(nextTool) {
    if (nextTool === "image") {
      overlayInput.current?.click();
      return;
    }
    setTool(nextTool);
    if (nextTool !== "select") setSelectedId(null);
  }

  async function handleDocumentFiles(event) {
    const files = [...event.target.files];
    if (!files.length) return;
    setBusy(true);
    setNotice("Đang chuyển tài liệu thành các trang 9:16…");
    try {
      const pages = [];
      for (const file of files) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          pages.push(...await pdfFileToPages(file));
        } else {
          pages.push(await imageFileToPage(file));
        }
      }
      const imported = pages.map((background, index) => ({
        id: makeId("scene"),
        name: index === 0 ? "Mở đầu" : `Cảnh ${index + 1}`,
        durationMs: 8000,
        background,
        sourceName: files[0].name,
        annotations: [],
      }));
      commitScenes((current) => hasImportedDocument ? [...current, ...imported] : imported);
      setHasImportedDocument(true);
      setDocumentName(files.length === 1 ? files[0].name : `${files.length} tệp ảnh`);
      const nextProjectTime = hasImportedDocument ? totalDuration : 0;
      projectCurrentMsRef.current = nextProjectTime;
      setProjectCurrentMs(nextProjectTime);
      setSceneIndex(hasImportedDocument ? scenes.length : 0);
      setSelectedId(null);
      setNotice(`Đã thêm ${pages.length} trang. Chọn công cụ rồi bấm trực tiếp lên trang.`);
    } catch (error) {
      setNotice(`Không thể đọc tài liệu: ${error.message}`);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleSubtitle(event) {
    const file = event.target.files[0];
    if (!file) return;
    const cues = parseSrt(await file.text());
    setSubtitles(cues);
    setSubtitleName(file.name);
    setNotice(`Đã đọc ${cues.length} câu phụ đề từ ${file.name}.`);
    event.target.value = "";
  }

  async function handleAudio(event) {
    const file = event.target.files[0];
    if (!file) return;
    setAudioAsset({ name: file.name, dataUrl: await fileToDataUrl(file) });
    setNotice(`Đã gắn âm thanh ${file.name}.`);
    event.target.value = "";
  }

  async function handleOverlay(event) {
    const file = event.target.files[0];
    if (!file) return;
    const overlay = await imageFileToOverlay(file);
    const annotation = {
      ...createAnnotation("image", 360 - overlay.width / 2, 640 - overlay.height / 2, scene.annotations.length, scene.durationMs),
      sourceDataUrl: overlay.dataUrl,
      sourceName: file.name,
      previewWidth: overlay.width,
      previewHeight: overlay.height,
      position: [360 - overlay.width / 2, 640 - overlay.height / 2],
      brushWidth: 48,
    };
    addAnnotation(annotation);
    setTool("select");
    setNotice("Hình đã được đặt giữa trang; kéo để chọn vị trí mong muốn.");
    event.target.value = "";
  }

  function addScene() {
    const newScene = {
      id: makeId("scene"),
      name: `Cảnh ${scenes.length + 1}`,
      durationMs: 8000,
      background: scene.background,
      sourceName: scene.sourceName,
      annotations: [],
    };
    commitScenes((current) => [...current, newScene]);
    projectCurrentMsRef.current = totalDuration;
    setProjectCurrentMs(totalDuration);
    setSceneIndex(scenes.length);
    setSelectedId(null);
    setNotice("Đã thêm cảnh mới từ trang hiện tại.");
  }

  function deleteScene(index) {
    const result = removeScene(scenes, index, sceneIndex);
    if (!result.deletedScene) {
      setNotice("Dự án phải còn ít nhất một cảnh.");
      return;
    }
    setPlaying(false);
    setPreviewing(false);
    commitScenes(result.scenes);
    const nextTimeline = buildSceneTimeline(result.scenes);
    const nextProjectTime = nextTimeline[result.sceneIndex]?.startMs || 0;
    projectCurrentMsRef.current = nextProjectTime;
    setProjectCurrentMs(nextProjectTime);
    setSceneIndex(result.sceneIndex);
    setSelectedId(null);
    setNotice(`Đã xóa ${result.deletedScene.name}. Nhấn Hoàn tác để khôi phục.`);
  }

  function deleteSelected() {
    if (!selectedAnnotation) return;
    updateScene((item) => ({ ...item, annotations: item.annotations.filter((annotation) => annotation.id !== selectedAnnotation.id) }));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selectedAnnotation) return;
    const duplicate = moveAnnotation({ ...structuredClone(selectedAnnotation), id: makeId(selectedAnnotation.kind) }, 24, 24);
    updateScene((item) => ({ ...item, annotations: [...item.annotations, duplicate] }));
    setSelectedId(duplicate.id);
    setTool("select");
    setNotice("Đã nhân bản chú thích; kéo bản sao tới vị trí mới.");
  }

  function cycleSelectedColor() {
    if (!selectedAnnotation) return;
    const currentIndex = DEFAULT_COLORS.indexOf(selectedAnnotation.color);
    patchSelected({ color: DEFAULT_COLORS[(currentIndex + 1) % DEFAULT_COLORS.length] });
  }

  function setSceneDuration(value) {
    const durationMs = clamp(Math.round(Number(value) * 1000), 1000, 60 * 60 * 1000);
    const nextSceneTime = Math.min(sceneCurrentMs, durationMs);
    updateScene((item) => ({
      ...item,
      durationMs,
      annotations: item.annotations.map((annotation) => {
        const startMs = Math.min(annotation.startMs, Math.max(0, durationMs - 100));
        return { ...annotation, startMs, durationMs: Math.min(annotation.durationMs, Math.max(100, durationMs - startMs)) };
      }),
    }));
    const nextProjectTime = (activeSceneRange?.startMs || 0) + nextSceneTime;
    projectCurrentMsRef.current = nextProjectTime;
    setProjectCurrentMs(nextProjectTime);
  }

  function togglePreview() {
    if (playing) {
      setPlaying(false);
      setPreviewing(false);
      return;
    }
    if (projectCurrentMs >= totalDuration) seekProject(0, false);
    if (audioRef.current) audioRef.current.currentTime = (projectCurrentMs >= totalDuration ? 0 : projectCurrentMs) / 1000;
    setPreviewing(true);
    setSelectedId(null);
    setPlaying(true);
  }

  async function pollRenderJob(jobId, sourceVersion) {
    try {
      const response = await fetch(`/api/jobs/${jobId}?t=${Date.now()}`, { cache: "no-store" });
      const job = await response.json();
      if (activeRenderVersionRef.current !== sourceVersion || renderSourceVersionRef.current !== sourceVersion) return;
      setRenderJob(job);
      setNotice(job.message);
      if (job.state === "complete" || job.state === "failed") {
        if (job.state === "failed") activeRenderVersionRef.current = null;
        setBusy(false);
        return;
      }
      renderPollTimerRef.current = window.setTimeout(() => pollRenderJob(jobId, sourceVersion), 1200);
    } catch {
      if (activeRenderVersionRef.current !== sourceVersion) return;
      activeRenderVersionRef.current = null;
      setBusy(false);
      setNotice("Mất kết nối với dịch vụ tạo video.");
    }
  }

  async function startRender() {
    const sourceVersion = renderSourceVersionRef.current;
    activeRenderVersionRef.current = sourceVersion;
    setBusy(true);
    setRenderJob(null);
    setNotice("Đang đóng gói project và tài nguyên…");
    try {
      const payload = await buildRendererPayload(scenes, audioAsset, handMode, handSize);
      if (activeRenderVersionRef.current !== sourceVersion || renderSourceVersionRef.current !== sourceVersion) return;
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (activeRenderVersionRef.current !== sourceVersion || renderSourceVersionRef.current !== sourceVersion) return;
      if (!response.ok) throw new Error(result.error || "Renderer từ chối project");
      setRenderJob({ jobId: result.jobId, state: result.state, message: "Đã xếp hàng render" });
      setNotice("Đã xếp hàng render. Bạn vẫn có thể tiếp tục chỉnh sửa.");
      pollRenderJob(result.jobId, sourceVersion);
    } catch (error) {
      if (activeRenderVersionRef.current !== sourceVersion) return;
      activeRenderVersionRef.current = null;
      setBusy(false);
      setNotice(`Render thất bại: ${error.message}. Vui lòng thử lại sau.`);
    }
  }

  function handleRenderedVideoDownload() {
    activeRenderVersionRef.current = null;
    setNotice("Đã bắt đầu tải MP4. Bạn có thể tiếp tục chỉnh sửa và tạo phiên bản mới.");
    window.setTimeout(() => setRenderJob(null), 100);
  }

  async function exportProject() {
    setBusy(true);
    try {
      const payload = await buildRendererPayload(scenes, audioAsset, handMode, handSize);
      downloadJson("whiteboard-project.json", payload.project);
      setNotice("Đã tải project JSON. Các vị trí được tạo tự động từ canvas.");
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  const timelineProgress = totalDuration ? projectCurrentMs / totalDuration : 0;

  return (
    <div className="studio-app">
      <input ref={documentInput} hidden type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={handleDocumentFiles} />
      <input ref={subtitleInput} hidden type="file" accept=".srt,text/plain" onChange={handleSubtitle} />
      <input ref={audioInput} hidden type="file" accept="audio/*" onChange={handleAudio} />
      <input ref={overlayInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={handleOverlay} />
      {audioAsset && <audio ref={audioRef} src={audioAsset.dataUrl} />}

      <header className="topbar">
        <div className="brand"><span className="brand-mark"><PencilLineIcon size={25} weight="duotone" /></span><span><strong>Bảng Vẽ Video</strong><small>{projectName}</small></span></div>
        <div className="history-actions"><button aria-label="Hoàn tác" onClick={undo}><ArrowCounterClockwiseIcon /></button><button aria-label="Làm lại" onClick={redo}><ArrowClockwiseIcon /></button></div>
        <div className={`save-state save-${saveState}`} role="status" aria-live="polite"><CheckCircleIcon size={16} weight="fill" /> {saveState === "saving" ? "Đang tự động lưu…" : saveState === "error" ? "Lưu thất bại" : saveState === "demo" ? "Dự án mẫu" : "Đã tự động lưu"}</div>
        <div className="top-actions">
          <button className="new-project-button" onClick={onNewProject}><PlusIcon weight="bold" /> Dự án mới</button>
          <button className="ratio-button"><FilmSlateIcon /> Dọc 9:16 <CaretDownIcon size={14} /></button>
          <button className="preview-button" onClick={togglePreview}>{playing ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />} {playing ? "Dừng" : "Xem thử"}</button>
          {renderJob?.state === "complete" ? (
            <a className="export-button ready" href={renderJob.video} download="whiteboard-video.mp4" onClick={handleRenderedVideoDownload}><DownloadSimpleIcon weight="bold" /> Tải MP4</a>
          ) : (
            <button className="export-button" disabled={busy} onClick={startRender}><DownloadSimpleIcon weight="bold" /> {renderJob && renderJob.state !== "failed" ? "Đang tạo…" : "Tạo MP4"}</button>
          )}
          <div className="menu-wrap">
            <button className="icon-button" aria-label="Tùy chọn" onClick={() => setMenuOpen((value) => !value)}><DotsThreeVerticalIcon size={22} /></button>
            {menuOpen && <div className="project-menu"><button onClick={onProjects}><FilmSlateIcon /> Danh sách dự án</button><button onClick={onNewProject}><PlusIcon /> Tạo dự án mới</button><button onClick={onHome}><EyeIcon /> Trang giới thiệu</button><button onClick={exportProject}><FloppyDiskIcon /> Tải project JSON</button><button onClick={() => setMenuOpen(false)}><XIcon /> Đóng menu</button></div>}
          </div>
        </div>
      </header>

      <section className="storyboard" aria-label="Bảng phân cảnh">
        <div className="story-scroll">
          {scenes.map((item, index) => (
            <StoryCard
              key={item.id}
              scene={item}
              index={index}
              selected={sceneIndex === index}
              canDelete={scenes.length > 1}
              onClick={() => selectScene(index)}
              onDelete={() => deleteScene(index)}
            />
          ))}
          <button className="add-scene-card" onClick={addScene}><PlusIcon size={28} /><span>Thêm cảnh</span></button>
        </div>
      </section>

      <main className="workspace">
        <aside className="media-panel">
          <div className="panel-title media-panel-head"><strong>Tài liệu & phương tiện</strong><button type="button" onClick={() => documentInput.current?.click()}><PlusIcon weight="bold" /> Thêm PDF / ảnh</button></div>
          <MediaCard Icon={FilePdfIcon} title="PDF / Ảnh" detail={`${documentName} · ${scenes.length} trang`} status="ready" onClick={() => documentInput.current?.click()} />
          <MediaCard Icon={SubtitlesIcon} title="SRT" detail={subtitleName || "Chưa tải phụ đề"} status={subtitleName ? "ready" : "empty"} onClick={() => subtitleInput.current?.click()} />
          <MediaCard Icon={MusicNotesIcon} title="Âm thanh" detail={audioAsset?.name || "Chưa tải thuyết minh"} status={audioAsset ? "ready" : "empty"} onClick={() => audioInput.current?.click()} />
          <div className="hand-style">
            <div className="panel-title"><strong>Kiểu tay viết</strong><span className="help-dot">?</span></div>
            <div className="hand-options">
              {[["marker", "Tay bút dạ"], ["pen", "Tay bút bi"], ["none", "Không hiện tay"]].map(([mode, label], index) => (
                <button key={mode} className={handMode === mode ? "selected" : ""} title={label} onClick={() => { setHandMode(mode); setNotice(mode === "none" ? "Đã ẩn bàn tay khi render." : `Đã chọn ${label.toLowerCase()}.`); }}>
                  {index < 2 ? <img src="/assets/drawing-hand.png" alt="" /> : <EyeIcon size={24} />}
                </button>
              ))}
            </div>
            <div className={`hand-size-control ${handMode === "none" ? "disabled" : ""}`}>
              <div className="hand-size-heading">
                <label htmlFor="hand-size">Kích thước tay &amp; bút</label>
                <output htmlFor="hand-size">{handSize}%</output>
              </div>
              <div className="hand-size-slider-row">
                <MinusIcon size={15} aria-hidden="true" />
                <input
                  id="hand-size"
                  type="range"
                  min={MIN_HAND_SIZE}
                  max={MAX_HAND_SIZE}
                  step={HAND_SIZE_STEP}
                  value={handSize}
                  disabled={handMode === "none"}
                  aria-label="Kích thước bàn tay và cây bút"
                  onChange={(event) => {
                    const nextSize = normalizeHandSize(event.target.value);
                    setHandSize(nextSize);
                    setNotice(`Kích thước tay và bút: ${nextSize}%.`);
                  }}
                />
                <PlusIcon size={15} aria-hidden="true" />
              </div>
              <button
                type="button"
                className="hand-size-reset"
                disabled={handMode === "none" || handSize === DEFAULT_HAND_SIZE}
                onClick={() => {
                  setHandSize(DEFAULT_HAND_SIZE);
                  setNotice("Đã đưa kích thước tay và bút về mặc định 100%.");
                }}
              >
                Mặc định
              </button>
            </div>
          </div>
          <button className="project-settings"><GearSixIcon size={20} /> Cài đặt dự án</button>
        </aside>

        <section className="canvas-workspace">
          <PaperCanvas
            scene={scene}
            selectedId={selectedId}
            tool={tool}
            currentMs={sceneCurrentMs}
            previewing={previewing}
            handMode={handMode}
            handSize={handSize}
            onAdd={addAnnotation}
            onSelect={setSelectedId}
            onUpdate={updateAnnotationLive}
            onCommitText={updateAnnotation}
            onTransformStart={beginAnnotationTransform}
            onTransformEnd={endAnnotationTransform}
            onToolDone={() => setTool("select")}
            onDelete={deleteSelected}
            onDuplicate={duplicateSelected}
            onCycleColor={cycleSelectedColor}
          />
          <nav className="floating-tools" aria-label="Công cụ chú thích">
            {TOOL_ITEMS.map(({ id, label, Icon }) => (
              <button key={id} className={tool === id ? "active" : ""} onClick={() => chooseTool(id)} title={label}>
                <Icon size={23} weight={tool === id ? "bold" : "regular"} /><span>{label}</span>
              </button>
            ))}
          </nav>
        </section>
        <AnnotationInspector
          selectedAnnotation={selectedAnnotation}
          tool={tool}
          onPatch={patchSelected}
          onDelete={deleteSelected}
          onDuplicate={duplicateSelected}
          scene={scene}
          onSceneDuration={setSceneDuration}
        />
      </main>

      <section className="timeline">
        <div className="timeline-ruler">
          {Array.from({ length: 7 }, (_, index) => <span key={index} style={{ left: `${index / 6 * 100}%` }}>{Math.round(totalDuration / 1000 * index / 6)}s</span>)}
        </div>
        <div className="timeline-row annotation-track">
          <button className="timeline-play" onClick={togglePreview}>{playing ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}</button>
          <span className="track-label">Chú thích</span>
          <div className="clips-area" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seekProject((event.clientX - rect.left) / rect.width * totalDuration); setSelectedId(null); }}>
            {sceneTimeline.slice(1).map((range) => <i key={range.scene.id} className="scene-boundary" style={{ left: `${range.startMs / totalDuration * 100}%` }} title={`${range.scene.name} · ${formatTime(range.startMs)}`} />)}
            {sceneTimeline.flatMap((range) => range.scene.annotations.map((annotation) => (
              <TimelineClip
                key={annotation.id}
                annotation={annotation}
                sceneDuration={range.scene.durationMs}
                sceneOffset={range.startMs}
                projectDuration={totalDuration}
                selected={sceneIndex === range.sceneIndex && selectedId === annotation.id}
                onSelect={(id) => { seekProject(range.startMs + annotation.startMs); setSelectedId(id); setTool("select"); }}
                onUpdate={(id, value) => updateAnnotationLive(id, value, range.sceneIndex)}
                onTransformStart={beginAnnotationTransform}
                onTransformEnd={endAnnotationTransform}
              />
            )))}
            <i className="playhead" style={{ left: `${timelineProgress * 100}%` }} />
          </div>
        </div>
        <div className="timeline-row audio-track">
          <span className="track-spacer" />
          <span className="track-label"><WaveformIcon /> Âm thanh</span>
          <div className="waveform-wrap"><WaveformCanvas progress={timelineProgress} /></div>
        </div>
      </section>

      <footer className="statusbar">
        <span className={busy ? "status busy" : "status"}>{busy && <span className="spinner" />}{notice}</span>
        <span>{activeCue?.text || (subtitles.length ? `${subtitles.length} câu SRT đã sẵn sàng` : "Có thể render không cần SRT/audio")}</span>
        <strong>{formatTime(projectCurrentMs)} / {formatTime(totalDuration)} · {scene.name} {formatTime(sceneCurrentMs)} / {formatTime(scene.durationMs)}</strong>
      </footer>
    </div>
  );
}
