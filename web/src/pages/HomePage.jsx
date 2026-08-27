import { useNavigate } from "react-router";
import { ProjectOnboarding } from "../ProjectOnboarding";
import { ROUTES, studioRoute } from "../router/paths";

export function HomePage() {
  const navigate = useNavigate();
  return (
    <ProjectOnboarding
      startAt="welcome"
      onStartProject={() => navigate(ROUTES.newProject)}
      onUseSample={() => navigate(studioRoute("demo"))}
    />
  );
}
