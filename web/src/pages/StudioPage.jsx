import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon, FileXIcon, PencilLineIcon } from "@phosphor-icons/react";
import { useNavigate, useParams } from "react-router";
import { StudioEditor } from "../App";
import { getProject, saveProject } from "../data/projectRepository";
import { createDemoProject, DEMO_PROJECT_ID } from "../features/projects/projectModel";
import { ROUTES } from "../router/paths";

export function StudioPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError("");

    const loadProject = projectId === DEMO_PROJECT_ID ? Promise.resolve(createDemoProject()) : getProject(projectId);
    loadProject.then((loadedProject) => {
      if (!active) return;
      if (!loadedProject) {
        setStatus("not-found");
        return;
      }
      setProject(loadedProject);
      setStatus("ready");
    }).catch((loadError) => {
      if (!active) return;
      setError(loadError.message);
      setStatus("error");
    });

    return () => { active = false; };
  }, [projectId]);

  const autoSave = useCallback((nextProject) => saveProject(nextProject), []);

  if (status === "loading") return <RouteState title="Đang mở studio…" />;
  if (status === "not-found") return <RouteState title="Không tìm thấy dự án" detail="Dự án có thể đã bị xóa hoặc URL không còn hợp lệ." action={() => navigate(ROUTES.projects)} actionLabel="Về danh sách dự án" icon="missing" />;
  if (status === "error") return <RouteState title="Không thể mở dự án" detail={error} action={() => navigate(ROUTES.projects)} actionLabel="Về danh sách dự án" icon="missing" />;

  return (
    <StudioEditor
      key={project.id}
      project={project}
      onAutoSave={project.id === DEMO_PROJECT_ID ? undefined : autoSave}
      onNewProject={() => navigate(ROUTES.newProject)}
      onHome={() => navigate(ROUTES.home)}
      onProjects={() => navigate(ROUTES.projects)}
    />
  );
}

function RouteState({ title, detail, action, actionLabel, icon }) {
  const isMissing = icon === "missing";

  return (
    <main className="full-route-state">
      <div className="welcome-brand"><span><PencilLineIcon size={24} weight="duotone" /></span><strong>Bảng Vẽ Video</strong></div>
      <section role="status" aria-live="polite">
        {isMissing ? <FileXIcon className="route-state-icon" size={36} weight="duotone" /> : <span className="spinner" />}
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
        {action && <button type="button" onClick={action}><ArrowLeftIcon /> {actionLabel}</button>}
      </section>
    </main>
  );
}
