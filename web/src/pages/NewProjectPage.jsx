import { useNavigate } from "react-router";
import { ProjectOnboarding } from "../ProjectOnboarding";
import { saveProject } from "../data/projectRepository";
import { createProjectRecord } from "../features/projects/projectModel";
import { ROUTES, studioRoute } from "../router/paths";

export function NewProjectPage() {
  const navigate = useNavigate();

  async function createProject(input) {
    const project = createProjectRecord(input);
    await saveProject(project);
    navigate(studioRoute(project.id), { replace: true });
  }

  return (
    <ProjectOnboarding
      startAt="setup"
      onCreateProject={createProject}
      onCancel={() => navigate(ROUTES.projects)}
      cancelLabel="Danh sách dự án"
    />
  );
}
