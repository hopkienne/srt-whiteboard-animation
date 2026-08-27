import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { ROUTES } from "./paths";

const HomePage = lazy(() => import("../pages/HomePage").then((module) => ({ default: module.HomePage })));
const NewProjectPage = lazy(() => import("../pages/NewProjectPage").then((module) => ({ default: module.NewProjectPage })));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));
const ProjectsPage = lazy(() => import("../pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));
const StudioPage = lazy(() => import("../pages/StudioPage").then((module) => ({ default: module.StudioPage })));

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.projects} element={<ProjectsPage />} />
        <Route path={ROUTES.newProject} element={<NewProjectPage />} />
        <Route path={ROUTES.studioPattern} element={<StudioPage />} />
        <Route path="/project" element={<Navigate to={ROUTES.projects} replace />} />
        <Route path="/project/new" element={<Navigate to={ROUTES.newProject} replace />} />
        <Route path="/studio" element={<Navigate to={ROUTES.projects} replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

function RouteLoading() {
  return (
    <main className="app-route-loading" role="status" aria-live="polite">
      <span className="spinner" />
      <span>Đang mở trang…</span>
    </main>
  );
}
