#!/usr/bin/env python3
"""HTTP API and production static server for the document-annotation editor.

The browser sends a renderer project plus data-URL assets.  Each render gets an
isolated job directory, then the existing Python renderer produces the MP4 in a
background worker. The server remains dependency-free and can run locally or in
a single-container deployment.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = REPO_ROOT / "web"
DATA_ROOT = Path(
    os.environ.get("DATA_ROOT", str(WEB_ROOT / ".local-data" / "jobs"))
).expanduser().resolve()
SCRIPT_ROOT = REPO_ROOT / "scripts"
RENDERER_SCRIPT = SCRIPT_ROOT / "render_document_annotation.py"


MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(160 * 1024 * 1024)))
RENDER_WORKERS = max(1, int(os.environ.get("RENDER_WORKERS", "1")))
CORS_ORIGIN = os.environ.get("CORS_ORIGIN")
DATA_URL_RE = re.compile(r"^data:(?P<mime>[-\w.+/]+)?;base64,(?P<data>.+)$", re.DOTALL)
JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()
EXECUTOR = ThreadPoolExecutor(
    max_workers=RENDER_WORKERS,
    thread_name_prefix="whiteboard-render",
)


class RendererProcessError(ValueError):
    """Raised when a fresh renderer process rejects or fails a project."""


def _safe_name(value: str) -> str:
    name = Path(value).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip(".-")
    if not cleaned:
        raise ValueError("Tên tệp không hợp lệ")
    return cleaned[:120]


def _decode_data_url(value: str) -> tuple[bytes, str]:
    match = DATA_URL_RE.match(value)
    if not match:
        raise ValueError("Asset phải là data URL base64")
    return base64.b64decode(match.group("data"), validate=True), match.group("mime") or "application/octet-stream"


def _validate_asset_references(project: dict[str, Any], uploaded_names: set[str]) -> None:
    """Keep every user-controlled file reference inside the isolated job dir."""

    def require_uploaded(value: Any, field: str) -> None:
        reference = str(value or "")
        if not reference or reference != _safe_name(reference) or reference not in uploaded_names:
            raise ValueError(f"{field} phải tham chiếu tới asset đã tải lên")

    if project.get("audio"):
        require_uploaded(project["audio"], "audio")

    typography = project.get("typography") or {}
    if typography.get("fontPath"):
        require_uploaded(typography["fontPath"], "typography.fontPath")

    hand = project.get("hand") or {}
    if hand.get("image"):
        require_uploaded(hand["image"], "hand.image")

    for scene_index, scene in enumerate(project.get("scenes") or []):
        if not isinstance(scene, dict):
            continue
        require_uploaded(scene.get("background"), f"scenes[{scene_index}].background")
        for annotation_index, annotation in enumerate(scene.get("annotations") or []):
            if not isinstance(annotation, dict):
                continue
            prefix = f"scenes[{scene_index}].annotations[{annotation_index}]"
            if annotation.get("fontPath"):
                require_uploaded(annotation["fontPath"], f"{prefix}.fontPath")
            if annotation.get("kind") == "image":
                require_uploaded(annotation.get("source"), f"{prefix}.source")


def _set_job(job_id: str, **updates: Any) -> None:
    with JOBS_LOCK:
        JOBS.setdefault(job_id, {}).update(updates)


def _run_renderer(project_path: Path, output_path: Path, *, validate_only: bool = False) -> None:
    command = [sys.executable, str(RENDERER_SCRIPT), str(project_path), str(output_path)]
    if validate_only:
        command.append("--validate-only")
    result = subprocess.run(
        command,
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode == 0:
        return
    detail = (result.stderr or result.stdout or "Renderer không trả về chi tiết lỗi").strip()
    if detail.startswith("[err] "):
        detail = detail[6:]
    raise RendererProcessError(detail)


def _render_job(job_id: str, project_path: Path, output_path: Path) -> None:
    try:
        _set_job(job_id, state="rendering", message="Đang dựng từng khung hình…")
        # A new process loads the latest renderer code for every job. This keeps
        # Vite preview changes and downloaded MP4 behavior aligned during local development.
        _run_renderer(project_path, output_path)
        _set_job(
            job_id,
            state="complete",
            message="Video đã sẵn sàng",
            video=f"/api/jobs/{job_id}/video",
        )
    except Exception as exc:  # surfaced to the local UI
        _set_job(job_id, state="failed", message=str(exc))


class WhiteboardHandler(SimpleHTTPRequestHandler):
    server_version = "WhiteboardStudio/1.0"

    def end_headers(self) -> None:
        if CORS_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        request_path = urlsplit(self.path).path
        if request_path == "/api/health":
            self._json({"ok": True, "renderer": "document-annotation"})
            return
        if request_path == "/api/capabilities":
            self._json(
                {
                    "annotationKinds": ["path", "underline", "ellipse", "arrow", "text", "image"],
                    "fontFamilies": ["Times New Roman", "serif"],
                    "canvasPresets": [{"label": "Dọc 9:16", "width": 720, "height": 1280, "fps": 24}],
                }
            )
            return
        job_match = re.fullmatch(r"/api/jobs/([0-9a-f-]+)", request_path)
        if job_match:
            with JOBS_LOCK:
                job = dict(JOBS.get(job_match.group(1), {}))
            if not job:
                self._json({"error": "Không tìm thấy job"}, HTTPStatus.NOT_FOUND)
                return
            self._json(job)
            return
        video_match = re.fullmatch(r"/api/jobs/([0-9a-f-]+)/video", request_path)
        if video_match:
            job_id = video_match.group(1)
            with JOBS_LOCK:
                job = dict(JOBS.get(job_id, {}))
            output = DATA_ROOT / job_id / "video.mp4"
            if job.get("state") != "complete" or not output.exists():
                self._json({"error": "Video chưa sẵn sàng"}, HTTPStatus.NOT_FOUND)
                return
            self._send_file(output, "video/mp4")
            return
        if request_path.startswith("/api/"):
            self._json({"error": "Không tìm thấy endpoint"}, HTTPStatus.NOT_FOUND)
            return

        # React Router owns clean browser routes such as /projects and
        # /studio/:projectId. Serve index.html for HTML navigation requests,
        # while preserving real 404s for missing JS, CSS, images, and fonts.
        static_root = Path(self.directory).resolve()
        requested_file = (static_root / request_path.lstrip("/")).resolve()
        accepts_html = "text/html" in self.headers.get("Accept", "")
        try:
            is_inside_static_root = requested_file.is_relative_to(static_root)
        except AttributeError:  # Python 3.8 compatibility
            is_inside_static_root = static_root == requested_file or static_root in requested_file.parents
        if (
            accepts_html
            and is_inside_static_root
            and not requested_file.exists()
            and (static_root / "index.html").exists()
        ):
            self._send_file(static_root / "index.html", "text/html; charset=utf-8")
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/render":
            self._json({"error": "Không tìm thấy endpoint"}, HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("Dữ liệu render trống hoặc vượt quá 160 MB")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            project = payload.get("project")
            assets = payload.get("assets", [])
            if not isinstance(project, dict) or not isinstance(assets, list):
                raise ValueError("Payload phải có project và assets")

            seen: set[str] = set()
            decoded_assets: list[tuple[str, bytes]] = []
            for asset in assets:
                if not isinstance(asset, dict):
                    raise ValueError("Asset không hợp lệ")
                name = _safe_name(str(asset.get("name", "")))
                if name in seen:
                    raise ValueError(f"Tên asset bị trùng: {name}")
                seen.add(name)
                raw, _mime = _decode_data_url(str(asset.get("dataUrl", "")))
                decoded_assets.append((name, raw))

            _validate_asset_references(project, seen)
            job_id = str(uuid.uuid4())
            job_dir = DATA_ROOT / job_id
            job_dir.mkdir(parents=True, exist_ok=False)
            for name, raw in decoded_assets:
                (job_dir / name).write_bytes(raw)

            project_path = job_dir / "project.json"
            project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = job_dir / "video.mp4"
            # Validate synchronously so malformed jobs fail before being queued.
            _run_renderer(project_path, output_path, validate_only=True)
            _set_job(job_id, id=job_id, state="queued", message="Đã xếp hàng render")
            EXECUTOR.submit(_render_job, job_id, project_path, output_path)
            self._json({"jobId": job_id, "state": "queued"}, HTTPStatus.ACCEPTED)
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def _json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, content_type: str | None = None) -> None:
        body = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Content-Disposition", f'inline; filename="{path.name}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[web] {self.address_string()} - {format % args}")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="API cho SRT Whiteboard Studio")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8787")))
    parser.add_argument(
        "--static",
        type=Path,
        default=os.environ.get("STATIC_ROOT"),
        help="Thư mục frontend build để phục vụ cùng API",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    static_root = args.static.resolve() if args.static else WEB_ROOT
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    handler = lambda *handler_args, **handler_kwargs: WhiteboardHandler(  # noqa: E731
        *handler_args, directory=str(static_root), **handler_kwargs
    )
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Whiteboard Studio API: http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        EXECUTOR.shutdown(wait=False, cancel_futures=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
