import { createInitialScenes, makeId } from "../../lib/project";
import { DEFAULT_HAND_SIZE } from "../../lib/render-config";

export const DEMO_PROJECT_ID = "demo";

export function createProjectRecord(input) {
  const now = new Date().toISOString();
  return {
    id: makeId("project"),
    name: input.projectName,
    documentName: input.documentName,
    scenes: input.scenes,
    subtitles: input.subtitles,
    subtitleName: input.subtitleName,
    audioAsset: input.audioAsset,
    handMode: "marker",
    handSize: DEFAULT_HAND_SIZE,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDemoProject() {
  const now = new Date().toISOString();
  return {
    id: DEMO_PROJECT_ID,
    name: "Dự án mẫu",
    documentName: "Tài liệu mẫu",
    scenes: createInitialScenes(),
    subtitles: [],
    subtitleName: "",
    audioAsset: null,
    handMode: "marker",
    handSize: DEFAULT_HAND_SIZE,
    createdAt: now,
    updatedAt: now,
  };
}
