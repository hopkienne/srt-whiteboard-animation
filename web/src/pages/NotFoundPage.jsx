import { ArrowLeftIcon, CompassIcon, PencilLineIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { ROUTES } from "../router/paths";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="not-found-page">
      <div className="welcome-brand"><span><PencilLineIcon size={24} weight="duotone" /></span><strong>Bảng Vẽ Video</strong></div>
      <section><CompassIcon size={46} weight="duotone" /><span className="eyebrow">404</span><h1>Trang này không tồn tại</h1><p>Đường dẫn có thể đã thay đổi hoặc không thuộc dự án hiện tại.</p><button type="button" onClick={() => navigate(ROUTES.home)}><ArrowLeftIcon /> Về trang chủ</button></section>
    </main>
  );
}
