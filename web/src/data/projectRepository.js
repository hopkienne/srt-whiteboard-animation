const DATABASE_NAME = "whiteboard-video";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const SUMMARY_STORE = "projectSummaries";

let databasePromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SUMMARY_STORE)) {
        const summaries = database.createObjectStore(SUMMARY_STORE, { keyPath: "id" });
        summaries.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Giao dịch lưu project đã bị hủy."));
  });
}

function toSummary(project) {
  return {
    id: project.id,
    name: project.name,
    documentName: project.documentName,
    sceneCount: project.scenes.length,
    totalDurationMs: project.scenes.reduce((sum, scene) => sum + scene.durationMs, 0),
    thumbnail: project.scenes[0]?.background || "",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export async function saveProject(project) {
  const database = await openDatabase();
  const now = new Date().toISOString();
  const persistedProject = {
    ...structuredClone(project),
    createdAt: project.createdAt || now,
    updatedAt: now,
  };
  const transaction = database.transaction([PROJECT_STORE, SUMMARY_STORE], "readwrite");
  transaction.objectStore(PROJECT_STORE).put(persistedProject);
  transaction.objectStore(SUMMARY_STORE).put(toSummary(persistedProject));
  await transactionToPromise(transaction);
  return persistedProject;
}

export async function getProject(projectId) {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECT_STORE, "readonly");
  return requestToPromise(transaction.objectStore(PROJECT_STORE).get(projectId));
}

export async function listProjectSummaries() {
  const database = await openDatabase();
  const transaction = database.transaction(SUMMARY_STORE, "readonly");
  const projects = await requestToPromise(transaction.objectStore(SUMMARY_STORE).getAll());
  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteProject(projectId) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECT_STORE, SUMMARY_STORE], "readwrite");
  transaction.objectStore(PROJECT_STORE).delete(projectId);
  transaction.objectStore(SUMMARY_STORE).delete(projectId);
  await transactionToPromise(transaction);
}
