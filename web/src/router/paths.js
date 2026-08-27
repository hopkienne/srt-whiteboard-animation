export const ROUTES = Object.freeze({
  home: "/",
  projects: "/projects",
  newProject: "/projects/new",
  studioPattern: "/studio/:projectId",
});

export function studioRoute(projectId) {
  return `/studio/${encodeURIComponent(projectId)}`;
}
