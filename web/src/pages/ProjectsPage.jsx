import { useEffect, useState } from "react";
import { ArrowRightIcon, FilmSlateIcon, FolderOpenIcon, PencilLineIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { deleteProject, listProjectSummaries } from "../data/projectRepository";
import { formatTime } from "../lib/media";
import { ROUTES, studioRoute } from "../router/paths";

function ProjectCard({ project, onOpen, onDelete }) {
  return (
    <article className="project-library-card">
      <button className="project-card-preview" type="button" onClick={onOpen} aria-label={`Mở ${project.name}`}>
        {project.thumbnail ? <img src={project.thumbnail} alt="" /> : <FilmSlateIcon size={38} weight="duotone" />}
        <span>{project.sceneCount} cảnh</span>
      </button>
      <div className="project-card-content">
        <div><strong>{project.name}</strong><small>{project.documentName}</small></div>
        <dl><div><dt>Thời lượng</dt><dd>{formatTime(project.totalDurationMs)}</dd></div><div><dt>Cập nhật</dt><dd>{new Date(project.updatedAt).toLocaleDateString("vi-VN")}</dd></div></dl>
        <div className="project-card-actions"><button type="button" onClick={onOpen}><FolderOpenIcon /> Mở studio</button><button className="delete" type="button" onClick={onDelete} aria-label={`Xóa ${project.name}`}><TrashIcon /></button></div>
      </div>
    </article>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    listProjectSummaries().then((items) => {
      if (!active) return;
      setProjects(items);
      setStatus("ready");
    }).catch((loadError) => {
      if (!active) return;
      setError(loadError.message);
      setStatus("error");
    });
    return () => { active = false; };
  }, []);

  async function removeProject(project) {
    if (!window.confirm(`Xóa dự án “${project.name}”? Thao tác này không thể hoàn tác.`)) return;
    setActionError("");
    try {
      await deleteProject(project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (deleteError) {
      setActionError(`Không thể xóa dự án: ${deleteError.message}`);
    }
  }

  return (
    <main className="projects-page">
      <header className="projects-header">
        <button className="welcome-brand projects-brand" type="button" onClick={() => navigate(ROUTES.home)}><span><PencilLineIcon size={24} weight="duotone" /></span><strong>Bảng Vẽ Video</strong></button>
        <div><button className="secondary-welcome-button" type="button" onClick={() => navigate(studioRoute("demo"))}><FilmSlateIcon /> Dự án mẫu</button><button className="primary-welcome-button" type="button" onClick={() => navigate(ROUTES.newProject)}><PlusIcon weight="bold" /> Dự án mới</button></div>
      </header>

      <section className="projects-hero">
        <span className="eyebrow">Thư viện trên thiết bị</span>
        <h1>Dự án của bạn</h1>
        <p>Mở lại dự án đã làm hoặc bắt đầu từ một tài liệu mới. Dữ liệu được lưu bằng IndexedDB trên trình duyệt này.</p>
      </section>

      {status === "loading" && <div className="route-state" role="status" aria-live="polite"><span className="spinner" /><strong>Đang tải dự án…</strong></div>}
      {status === "error" && <div className="route-state route-error"><strong>Không thể đọc thư viện</strong><p>{error}</p></div>}
      {actionError && <p className="projects-action-error" role="alert">{actionError}</p>}
      {status === "ready" && projects.length === 0 && (
        <section className="empty-projects"><span><FilmSlateIcon size={38} weight="duotone" /></span><h2>Chưa có dự án nào</h2><p>Tải PDF hoặc hình ảnh để tạo video đầu tiên.</p><button type="button" onClick={() => navigate(ROUTES.newProject)}>Tạo dự án <ArrowRightIcon /></button></section>
      )}
      {status === "ready" && projects.length > 0 && <section className="projects-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} onOpen={() => navigate(studioRoute(project.id))} onDelete={() => removeProject(project)} />)}</section>}
    </main>
  );
}
