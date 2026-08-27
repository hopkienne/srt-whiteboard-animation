import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const VIDEO_WIDTH = 720;
export const VIDEO_HEIGHT = 1280;

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Không thể đọc tệp"));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không thể đọc ảnh"));
    image.src = src;
  });
}

function makePaperCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffaf0";
  context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  return { canvas, context };
}

export async function normalizeImageDataUrl(dataUrl) {
  const image = await loadImage(dataUrl);
  const { canvas, context } = makePaperCanvas();
  const scale = Math.min(VIDEO_WIDTH / image.naturalWidth, VIDEO_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (VIDEO_WIDTH - width) / 2, (VIDEO_HEIGHT - height) / 2, width, height);
  return canvas.toDataURL("image/png");
}

export async function imageFileToPage(file) {
  return normalizeImageDataUrl(await fileToDataUrl(file));
}

export async function imageFileToOverlay(file, maxSize = 260) {
  const image = await loadImage(await fileToDataUrl(file));
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

export async function pdfFileToPages(file) {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pages = [];
  try {
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(VIDEO_WIDTH / base.width, VIDEO_HEIGHT / base.height);
      const viewport = page.getViewport({ scale });
      const { canvas, context } = makePaperCanvas();
      const left = (VIDEO_WIDTH - viewport.width) / 2;
      const top = (VIDEO_HEIGHT - viewport.height) / 2;
      await page.render({
        canvasContext: context,
        viewport,
        transform: [1, 0, 0, 1, left, top],
      }).promise;
      pages.push(canvas.toDataURL("image/png"));
      page.cleanup();
    }
    await pdf.cleanup();
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

function srtTimeToMs(value) {
  const match = value.trim().match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  return ((Number(match[1]) * 60 * 60 + Number(match[2]) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}

export function parseSrt(text) {
  const blocks = text.replace(/\r/g, "").trim().split(/\n{2,}/);
  return blocks.flatMap((block, blockIndex) => {
    const lines = block.split("\n").filter(Boolean);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) return [];
    const [start, end] = lines[timeIndex].split("-->");
    return [{
      id: `cue-${blockIndex + 1}`,
      startMs: srtTimeToMs(start),
      endMs: srtTimeToMs(end),
      text: lines.slice(timeIndex + 1).join(" ").trim(),
    }];
  }).filter((cue) => cue.text);
}

export async function urlToDataUrl(url) {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được asset: ${url}`);
  return fileToDataUrl(await response.blob());
}

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatTime(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
