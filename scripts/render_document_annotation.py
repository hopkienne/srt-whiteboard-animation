#!/usr/bin/env python3
"""Render document-markup videos with a persistent paper background.

Unlike the whiteboard renderer, this mode keeps the source document visible from
the first frame and animates only explicit annotation layers (paths, ellipses,
arrows, text, or transparent overlay images).  Projects may contain multiple
pages, camera keyframes, a moving hand/pen asset, and an optional audio track.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from _utf8_stdio import configure_utf8_stdio

configure_utf8_stdio()

_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))
import stream_render as sr  # noqa: E402

DEFAULT_HAND = _SCRIPT_DIR.parent / "assets" / "drawing-hand.png"
SUPPORTED_KINDS = {"path", "underline", "ellipse", "arrow", "text", "image"}


class ProjectError(ValueError):
    """Raised when a document-annotation project is invalid."""


def _resolve(base: Path, value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (base / path).resolve()


def _read_image(path: Path, flags: int = cv2.IMREAD_COLOR) -> np.ndarray:
    image = sr._imread_any(path, flags)
    if image is None:
        raise ProjectError(f"无法读取图片: {path}")
    return image


def _color_bgr(value: str) -> tuple[int, int, int]:
    raw = value.strip().lstrip("#")
    if len(raw) != 6:
        raise ProjectError(f"颜色必须是 #RRGGBB: {value}")
    try:
        r, g, b = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    except ValueError as exc:
        raise ProjectError(f"颜色必须是 #RRGGBB: {value}") from exc
    return b, g, r


def _ease(value: float, mode: str = "easeInOut") -> float:
    value = float(np.clip(value, 0.0, 1.0))
    if mode == "linear":
        return value
    if mode == "easeIn":
        return value * value
    if mode == "easeOut":
        return 1.0 - (1.0 - value) ** 2
    if mode != "easeInOut":
        raise ProjectError(f"不支持的 easing: {mode}")
    return value * value * (3.0 - 2.0 * value)


def _writing_hand_motion(
    annotation: dict, progress: float, hand_style: str = "marker"
) -> tuple[float, float, float, float, float]:
    """Match the browser's deterministic text-writing hand motion."""
    if annotation.get("kind") != "text":
        return 0.0, 0.0, 0.0, 1.0, 1.0
    character_count = max(1, len(str(annotation.get("text", " "))))
    cycles = float(np.clip(character_count / 3.0, 2.0, 8.0))
    safe_progress = float(np.clip(progress, 0.0, 1.0))
    phase = safe_progress * cycles * math.tau
    intensity = 1.0 if hand_style == "pen" else 0.82
    offset_x = math.sin(phase * 0.53) * 1.4 * intensity
    offset_y = (math.sin(phase) * 2.8 + math.sin(phase * 0.5) * 0.8) * intensity
    rotation = math.radians(-1.2 + math.sin(phase * 0.7) * 1.6)
    scale = 1.0 + math.sin(phase * 0.41) * 0.006
    fade_in = float(np.clip(safe_progress / 0.06, 0.0, 1.0))
    fade_out = float(np.clip((1.0 - safe_progress) / 0.08, 0.0, 1.0))
    return offset_x, offset_y, rotation, scale, min(fade_in, fade_out)


def _writing_hand_offset(annotation: dict, progress: float) -> tuple[int, int]:
    """Backward-compatible positional part of the writing-hand motion."""
    offset_x, offset_y, _rotation, _scale, _opacity = _writing_hand_motion(annotation, progress)
    return int(round(offset_x)), int(round(offset_y))


def _as_points(value: Any, field: str) -> list[tuple[float, float]]:
    if not isinstance(value, list) or len(value) < 2:
        raise ProjectError(f"{field} 至少需要两个点")
    points: list[tuple[float, float]] = []
    for item in value:
        if not isinstance(item, list) or len(item) != 2:
            raise ProjectError(f"{field} 中每个点必须是 [x, y]")
        points.append((float(item[0]), float(item[1])))
    return points


def _partial_polyline(
    points: Sequence[tuple[float, float]], progress: float
) -> list[tuple[int, int]]:
    """Return a length-proportional prefix, including an interpolated endpoint."""
    if not points:
        return []
    if len(points) == 1 or progress <= 0:
        x, y = points[0]
        return [(int(round(x)), int(round(y)))]
    if progress >= 1:
        return [(int(round(x)), int(round(y))) for x, y in points]

    lengths = [0.0]
    for first, second in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.dist(first, second))
    total = lengths[-1]
    if total <= 1e-6:
        x, y = points[-1]
        return [(int(round(x)), int(round(y)))]

    target = total * progress
    result: list[tuple[int, int]] = []
    for index, point in enumerate(points):
        if lengths[index] <= target:
            result.append((int(round(point[0])), int(round(point[1]))))
            continue
        previous = points[index - 1]
        segment = lengths[index] - lengths[index - 1]
        ratio = 0.0 if segment <= 1e-6 else (target - lengths[index - 1]) / segment
        x = previous[0] + (point[0] - previous[0]) * ratio
        y = previous[1] + (point[1] - previous[1]) * ratio
        result.append((int(round(x)), int(round(y))))
        break
    return result


def _ellipse_points(rect: Sequence[float], samples: int = 128) -> list[tuple[float, float]]:
    if len(rect) != 4:
        raise ProjectError("ellipse.rect 必须是 [x, y, width, height]")
    x, y, width, height = map(float, rect)
    if width <= 0 or height <= 0:
        raise ProjectError("ellipse 的 width/height 必须大于 0")
    cx, cy = x + width / 2.0, y + height / 2.0
    start = -0.12 * math.pi
    return [
        (
            cx + math.cos(start + 2.0 * math.pi * i / (samples - 1)) * width / 2.0,
            cy + math.sin(start + 2.0 * math.pi * i / (samples - 1)) * height / 2.0,
        )
        for i in range(samples)
    ]


def _font_candidates(family: str, style: str) -> list[Path]:
    normalized_family = "".join(character for character in family.lower() if character.isalnum())
    times_aliases = {
        "timesnewroman",
        "timesroman",
        "timenewroman",
        "timenewromain",
        "serif",
    }
    if normalized_family not in times_aliases:
        raise ProjectError(
            f"当前 fontFamily 仅内置 Times New Roman/serif；其他字体请使用 fontPath: {family}"
        )
    style_key = style.lower().replace("-", "").replace("_", "")
    styles = {
        "regular": ("times.ttf", "LiberationSerif-Regular.ttf", "DejaVuSerif.ttf", "Times New Roman.ttf"),
        "bold": ("timesbd.ttf", "LiberationSerif-Bold.ttf", "DejaVuSerif-Bold.ttf", "Times New Roman Bold.ttf"),
        "italic": ("timesi.ttf", "LiberationSerif-Italic.ttf", "DejaVuSerif-Italic.ttf", "Times New Roman Italic.ttf"),
        "bolditalic": (
            "timesbi.ttf",
            "LiberationSerif-BoldItalic.ttf",
            "DejaVuSerif-BoldItalic.ttf",
            "Times New Roman Bold Italic.ttf",
        ),
    }
    if style_key not in styles:
        raise ProjectError(f"fontStyle 必须是 regular/bold/italic/boldItalic: {style}")
    windows_name, liberation_name, dejavu_name, mac_name = styles[style_key]
    return [
        Path("C:/Windows/Fonts") / windows_name,
        Path("/usr/share/fonts/truetype/liberation2") / liberation_name,
        Path("/usr/share/fonts/truetype/liberation") / liberation_name,
        Path("/usr/share/fonts/truetype/dejavu") / dejavu_name,
        Path("/Library/Fonts") / mac_name,
        Path("/System/Library/Fonts/Supplemental") / mac_name,
    ]


def _find_font(
    font_path: Path | None,
    size: int,
    family: str = "Times New Roman",
    style: str = "regular",
) -> ImageFont.FreeTypeFont:
    candidates = [font_path] if font_path else _font_candidates(family, style)
    for candidate in candidates:
        if candidate and candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size)
            except OSError as exc:
                raise ProjectError(f"无法加载字体: {candidate}") from exc
    if font_path:
        raise ProjectError(f"字体文件不存在: {font_path}")
    raise ProjectError(
        "未找到支持越南语的 Times New Roman 兼容字体；"
        "请安装 Times New Roman/Liberation Serif/DejaVu Serif，或配置 fontPath"
    )


def _fit_background(image: np.ndarray, width: int, height: int, fit: str) -> np.ndarray:
    src_h, src_w = image.shape[:2]
    if fit == "stretch":
        return cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
    if fit not in {"cover", "contain"}:
        raise ProjectError(f"backgroundFit 必须是 cover/contain/stretch: {fit}")
    scale = max(width / src_w, height / src_h) if fit == "cover" else min(width / src_w, height / src_h)
    if fit == "cover":
        new_w, new_h = max(1, math.ceil(src_w * scale)), max(1, math.ceil(src_h * scale))
    else:
        new_w, new_h = max(1, round(src_w * scale)), max(1, round(src_h * scale))
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    canvas = np.full((height, width, 3), 246, dtype=np.uint8)
    if fit == "cover":
        x0, y0 = max(0, (new_w - width) // 2), max(0, (new_h - height) // 2)
        return resized[y0:y0 + height, x0:x0 + width].copy()
    x0, y0 = (width - new_w) // 2, (height - new_h) // 2
    canvas[y0:y0 + new_h, x0:x0 + new_w] = resized
    return canvas


def _camera_at(scene: dict, at_ms: float, width: int, height: int) -> dict[str, float]:
    frames = scene.get("cameraKeyframes") or [
        {"atMs": 0, "center": [width / 2, height / 2], "zoom": 1.0}
    ]
    normalized = sorted(frames, key=lambda item: float(item.get("atMs", 0)))

    def values(item: dict) -> tuple[float, float, float]:
        center = item.get("center", [width / 2, height / 2])
        return float(center[0]), float(center[1]), float(item.get("zoom", 1.0))

    if at_ms <= float(normalized[0].get("atMs", 0)):
        x, y, zoom = values(normalized[0])
        return {"centerX": x, "centerY": y, "zoom": zoom}
    for first, second in zip(normalized, normalized[1:]):
        t0, t1 = float(first.get("atMs", 0)), float(second.get("atMs", 0))
        if at_ms <= t1:
            raw = 1.0 if t1 <= t0 else (at_ms - t0) / (t1 - t0)
            ratio = _ease(raw, second.get("easing", "easeInOut"))
            x0, y0, z0 = values(first)
            x1, y1, z1 = values(second)
            return {
                "centerX": x0 + (x1 - x0) * ratio,
                "centerY": y0 + (y1 - y0) * ratio,
                "zoom": z0 + (z1 - z0) * ratio,
            }
    x, y, zoom = values(normalized[-1])
    return {"centerX": x, "centerY": y, "zoom": zoom}


def _apply_camera(frame: np.ndarray, camera: dict[str, float]) -> np.ndarray:
    height, width = frame.shape[:2]
    zoom = max(0.05, float(camera["zoom"]))
    center_x, center_y = float(camera["centerX"]), float(camera["centerY"])
    matrix = np.array(
        [
            [zoom, 0.0, width / 2.0 - zoom * center_x],
            [0.0, zoom, height / 2.0 - zoom * center_y],
        ],
        dtype=np.float32,
    )
    return cv2.warpAffine(
        frame,
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _alpha_blend_bgra(
    canvas: np.ndarray, overlay: np.ndarray, x: int, y: int, reveal_mask: np.ndarray | None = None
) -> None:
    height, width = canvas.shape[:2]
    overlay_h, overlay_w = overlay.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(width, x + overlay_w), min(height, y + overlay_h)
    if x1 <= x0 or y1 <= y0:
        return
    ox0, oy0 = x0 - x, y0 - y
    ox1, oy1 = ox0 + (x1 - x0), oy0 + (y1 - y0)
    source = overlay[oy0:oy1, ox0:ox1]
    alpha = source[:, :, 3].astype(np.float32) / 255.0
    if reveal_mask is not None:
        alpha *= reveal_mask[oy0:oy1, ox0:ox1].astype(np.float32) / 255.0
    alpha = alpha[:, :, None]
    target = canvas[y0:y1, x0:x1].astype(np.float32)
    canvas[y0:y1, x0:x1] = np.clip(
        target * (1.0 - alpha) + source[:, :, :3].astype(np.float32) * alpha,
        0,
        255,
    ).astype(np.uint8)


@dataclass
class LoadedScene:
    spec: dict
    background: np.ndarray


class DocumentAnnotationRenderer:
    def __init__(self, project: dict, project_path: Path, hand_override: Path | None = None) -> None:
        if not isinstance(project, dict):
            raise ProjectError("项目 JSON 顶层必须是对象")
        self.project = project
        self.project_path = project_path.resolve()
        self.base_dir = self.project_path.parent
        canvas = project.get("canvas")
        if not isinstance(canvas, dict) or "width" not in canvas or "height" not in canvas:
            raise ProjectError("canvas.width/height 不能为空")
        try:
            self.width = int(canvas["width"])
            self.height = int(canvas["height"])
            self.fps = int(canvas.get("fps", 24))
        except (TypeError, ValueError) as exc:
            raise ProjectError("canvas.width/height/fps 必须是整数") from exc
        self.image_cache: dict[Path, np.ndarray] = {}
        self.text_cache: dict[str, np.ndarray] = {}
        self.hand_style = str(self.project.get("hand", {}).get("style", "marker"))
        self._validate()
        self.scenes = self._load_scenes()
        self.tip = self._load_tip(hand_override)
        for scene in self.project["scenes"]:
            for annotation in scene.get("annotations", []):
                if annotation["kind"] == "image":
                    self._overlay_image(annotation)
                elif annotation["kind"] == "text":
                    self._text_image(annotation)

    def _validate(self) -> None:
        if int(self.project.get("version", 1)) != 1:
            raise ProjectError("当前只支持 version=1")
        if self.width <= 0 or self.height <= 0 or self.width % 2 or self.height % 2:
            raise ProjectError("canvas.width/height 必须是正偶数")
        if not 1 <= self.fps <= 120:
            raise ProjectError("canvas.fps 必须在 1..120")
        if self.project.get("audio"):
            audio = _resolve(self.base_dir, self.project["audio"])
            if not audio.exists():
                raise ProjectError(f"音频文件不存在: {audio}")
        hand = self.project.get("hand", {})
        if not isinstance(hand, dict):
            raise ProjectError("hand 必须是对象")
        anchor = hand.get("anchor", [0.0, 0.0])
        if not isinstance(anchor, list) or len(anchor) != 2:
            raise ProjectError("hand.anchor 必须是 [x, y]")
        try:
            if not all(0.0 <= float(value) <= 1.0 for value in anchor):
                raise ProjectError("hand.anchor 必须在 0..1")
            hand_height = int(hand.get("height", max(1, round(self.height * 0.38))))
            if hand_height < 0 or (hand.get("enabled", True) is not False and hand_height == 0):
                raise ProjectError("hand.height 必须为非负数，启用手部素材时必须大于 0")
        except (TypeError, ValueError) as exc:
            raise ProjectError("hand.anchor/height 数值无效") from exc
        typography = self.project.get("typography", {})
        if not isinstance(typography, dict):
            raise ProjectError("typography 必须是对象")
        try:
            if int(typography.get("fontSize", 34)) <= 0:
                raise ProjectError("typography.fontSize 必须大于 0")
        except (TypeError, ValueError) as exc:
            raise ProjectError("typography.fontSize 必须是正整数") from exc
        if typography.get("fontPath"):
            font_path = _resolve(self.base_dir, typography["fontPath"])
            if not font_path.exists():
                raise ProjectError(f"字体文件不存在: {font_path}")
        scenes = self.project.get("scenes")
        if not isinstance(scenes, list) or not scenes:
            raise ProjectError("项目至少需要一个 scene")
        for scene_index, scene in enumerate(scenes, start=1):
            prefix = f"scenes[{scene_index - 1}]"
            if not isinstance(scene, dict):
                raise ProjectError(f"{prefix} 必须是对象")
            if not scene.get("background"):
                raise ProjectError(f"{prefix}.background 不能为空")
            try:
                duration = int(scene.get("durationMs", 0))
            except (TypeError, ValueError) as exc:
                raise ProjectError(f"{prefix}.durationMs 必须是整数") from exc
            if duration <= 0:
                raise ProjectError(f"{prefix}.durationMs 必须大于 0")
            annotations = scene.get("annotations", [])
            if not isinstance(annotations, list):
                raise ProjectError(f"{prefix}.annotations 必须是数组")
            for annotation_index, annotation in enumerate(annotations):
                name = f"{prefix}.annotations[{annotation_index}]"
                if not isinstance(annotation, dict):
                    raise ProjectError(f"{name} 必须是对象")
                kind = annotation.get("kind")
                if kind not in SUPPORTED_KINDS:
                    raise ProjectError(f"{name}.kind 不支持: {kind}")
                try:
                    start = int(annotation.get("startMs", -1))
                    ann_duration = int(annotation.get("durationMs", 0))
                except (TypeError, ValueError) as exc:
                    raise ProjectError(f"{name}.startMs/durationMs 必须是整数") from exc
                if start < 0 or ann_duration <= 0 or start + ann_duration > duration:
                    raise ProjectError(f"{name} 的 startMs/durationMs 超出场景时长")
                _ease(0.5, annotation.get("easing", "easeInOut"))
                if annotation.get("color"):
                    _color_bgr(annotation["color"])
                try:
                    if int(annotation.get("strokeWidth", 1)) <= 0:
                        raise ProjectError(f"{name}.strokeWidth 必须大于 0")
                except (TypeError, ValueError) as exc:
                    raise ProjectError(f"{name}.strokeWidth 必须是正整数") from exc
                if kind in {"path", "underline", "arrow"}:
                    _as_points(annotation.get("points"), f"{name}.points")
                elif kind == "ellipse":
                    _ellipse_points(annotation.get("rect", []))
                elif kind == "text" and not str(annotation.get("text", "")):
                    raise ProjectError(f"{name}.text 不能为空")
                elif kind == "text":
                    position = annotation.get("position", [0, 0])
                    if not isinstance(position, list) or len(position) != 2:
                        raise ProjectError(f"{name}.position 必须是 [x, y]")
                    if annotation.get("fontPath"):
                        font_path = _resolve(self.base_dir, annotation["fontPath"])
                        if not font_path.exists():
                            raise ProjectError(f"字体文件不存在: {font_path}")
                elif kind == "image":
                    if not annotation.get("source"):
                        raise ProjectError(f"{name}.source 不能为空")
                    source = _resolve(self.base_dir, annotation["source"])
                    if not source.exists():
                        raise ProjectError(f"annotation image 不存在: {source}")
                    position = annotation.get("position", [0, 0])
                    if not isinstance(position, list) or len(position) != 2:
                        raise ProjectError(f"{name}.position 必须是 [x, y]")
                    if annotation.get("revealPath"):
                        _as_points(annotation["revealPath"], f"{name}.revealPath")
                    if int(annotation.get("brushWidth", 32)) <= 0:
                        raise ProjectError(f"{name}.brushWidth 必须大于 0")
            previous = -1.0
            for keyframe in scene.get("cameraKeyframes", []):
                at_ms = float(keyframe.get("atMs", 0))
                if at_ms < 0 or at_ms > duration or at_ms < previous:
                    raise ProjectError(f"{prefix}.cameraKeyframes 时间无效")
                if float(keyframe.get("zoom", 1.0)) <= 0:
                    raise ProjectError(f"{prefix}.cameraKeyframes.zoom 必须大于 0")
                center = keyframe.get("center", [self.width / 2, self.height / 2])
                if not isinstance(center, list) or len(center) != 2:
                    raise ProjectError(f"{prefix}.cameraKeyframes.center 必须是 [x, y]")
                _ease(0.5, keyframe.get("easing", "easeInOut"))
                previous = at_ms

    def _load_scenes(self) -> list[LoadedScene]:
        loaded: list[LoadedScene] = []
        for scene in self.project["scenes"]:
            path = _resolve(self.base_dir, scene["background"])
            if not path.exists():
                raise ProjectError(f"背景文件不存在: {path}")
            image = _read_image(path)
            fitted = _fit_background(
                image,
                self.width,
                self.height,
                scene.get("backgroundFit", "cover"),
            )
            loaded.append(LoadedScene(scene, fitted))
        return loaded

    def _load_tip(self, hand_override: Path | None) -> sr.TipOverlay | None:
        hand = self.project.get("hand", {})
        if hand.get("enabled", True) is False:
            return None
        source = hand_override or _resolve(self.base_dir, hand.get("image", str(DEFAULT_HAND)))
        target_height = int(hand.get("height", round(self.height * 0.38)))
        loaded = sr._load_hand(source, target_height)
        if loaded is None:
            raise ProjectError(f"无法读取手部素材: {source}")
        anchor = hand.get("anchor", [0.0, 0.0])
        return sr.TipOverlay(loaded[0], loaded[1], float(anchor[0]), float(anchor[1]))

    def _overlay_image(self, annotation: dict) -> np.ndarray:
        path = _resolve(self.base_dir, annotation["source"])
        if path not in self.image_cache:
            image = _read_image(path, cv2.IMREAD_UNCHANGED)
            if image.ndim != 3 or image.shape[2] != 4:
                raise ProjectError(f"annotation image 必须是带 alpha 的 PNG: {path}")
            self.image_cache[path] = image
        return self.image_cache[path]

    def _text_image(self, annotation: dict) -> np.ndarray:
        typography = self.project.get("typography", {})
        key = json.dumps(
            {"annotation": annotation, "typography": typography},
            ensure_ascii=False,
            sort_keys=True,
        )
        if key in self.text_cache:
            return self.text_cache[key]
        size = int(annotation.get("fontSize", typography.get("fontSize", 34)))
        font_path_value = annotation.get("fontPath", typography.get("fontPath"))
        font_path = _resolve(self.base_dir, font_path_value) if font_path_value else None
        family = str(annotation.get("fontFamily", typography.get("fontFamily", "Times New Roman")))
        style = str(annotation.get("fontStyle", typography.get("fontStyle", "regular")))
        font = _find_font(font_path, size, family, style)
        text = str(annotation["text"])
        bbox = font.getbbox(text)
        padding = max(4, int(annotation.get("strokeWidth", 2)) + 2)
        width = max(1, bbox[2] - bbox[0] + padding * 2)
        height = max(1, bbox[3] - bbox[1] + padding * 2)
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        b, g, r = _color_bgr(annotation.get("color", "#D33F6A"))
        draw.text(
            (padding - bbox[0], padding - bbox[1]),
            text,
            font=font,
            fill=(r, g, b, int(annotation.get("opacity", 255))),
        )
        rgba = np.array(image)
        self.text_cache[key] = cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA)
        return self.text_cache[key]

    def _draw_polyline(
        self, canvas: np.ndarray, points: list[tuple[float, float]], annotation: dict, progress: float
    ) -> tuple[int, int]:
        partial = _partial_polyline(points, progress)
        color = _color_bgr(annotation.get("color", "#D33F6A"))
        width = max(1, int(annotation.get("strokeWidth", 6)))
        if len(partial) == 1:
            cv2.circle(canvas, partial[0], max(1, width // 2), color, -1, cv2.LINE_AA)
        else:
            cv2.polylines(canvas, [np.array(partial, np.int32)], False, color, width, cv2.LINE_AA)
        return partial[-1]

    def _draw_arrow(self, canvas: np.ndarray, annotation: dict, progress: float) -> tuple[int, int]:
        points = _as_points(annotation["points"], "arrow.points")
        main_progress = min(1.0, progress / 0.82)
        pen = self._draw_polyline(canvas, points, annotation, main_progress)
        if progress <= 0.82 or len(points) < 2:
            return pen
        end = np.array(points[-1], dtype=np.float64)
        previous = np.array(points[-2], dtype=np.float64)
        direction = end - previous
        length = float(np.linalg.norm(direction))
        if length <= 1e-6:
            return pen
        direction /= length
        normal = np.array([-direction[1], direction[0]])
        head_length = float(annotation.get("headLength", max(16, annotation.get("strokeWidth", 6) * 4)))
        head_width = float(annotation.get("headWidth", head_length * 0.65))
        wing_a = end - direction * head_length + normal * head_width
        wing_b = end - direction * head_length - normal * head_width
        head_progress = (progress - 0.82) / 0.18
        color = _color_bgr(annotation.get("color", "#D33F6A"))
        width = max(1, int(annotation.get("strokeWidth", 6)))
        current = end + (wing_a - end) * min(1.0, head_progress * 2.0)
        cv2.line(canvas, tuple(np.round(end).astype(int)), tuple(np.round(current).astype(int)), color, width, cv2.LINE_AA)
        pen = tuple(np.round(current).astype(int))
        if head_progress > 0.5:
            current = end + (wing_b - end) * min(1.0, (head_progress - 0.5) * 2.0)
            cv2.line(canvas, tuple(np.round(end).astype(int)), tuple(np.round(current).astype(int)), color, width, cv2.LINE_AA)
            pen = tuple(np.round(current).astype(int))
        return int(pen[0]), int(pen[1])

    def _draw_text(self, canvas: np.ndarray, annotation: dict, progress: float) -> tuple[int, int]:
        overlay = self._text_image(annotation)
        position = annotation.get("position", [0, 0])
        x, y = int(position[0]), int(position[1])
        mask = np.zeros(overlay.shape[:2], dtype=np.uint8)
        reveal_width = max(1, min(overlay.shape[1], int(round(overlay.shape[1] * progress))))
        mask[:, :reveal_width] = 255
        _alpha_blend_bgra(canvas, overlay, x, y, mask)
        return x + reveal_width - 1, y + int(overlay.shape[0] * 0.72)

    def _draw_image(self, canvas: np.ndarray, annotation: dict, progress: float) -> tuple[int, int]:
        overlay = self._overlay_image(annotation)
        position = annotation.get("position", [0, 0])
        x, y = int(position[0]), int(position[1])
        mask = np.zeros(overlay.shape[:2], dtype=np.uint8)
        if annotation.get("revealPath"):
            local_points = _as_points(annotation["revealPath"], "image.revealPath")
            partial = _partial_polyline(local_points, progress)
            brush = max(1, int(annotation.get("brushWidth", 32)))
            if len(partial) == 1:
                cv2.circle(mask, partial[0], brush // 2, 255, -1, cv2.LINE_AA)
            else:
                cv2.polylines(mask, [np.array(partial, np.int32)], False, 255, brush, cv2.LINE_AA)
            pen = partial[-1]
            _alpha_blend_bgra(canvas, overlay, x, y, mask)
            return x + pen[0], y + pen[1]
        reveal_width = max(1, min(overlay.shape[1], int(round(overlay.shape[1] * progress))))
        mask[:, :reveal_width] = 255
        _alpha_blend_bgra(canvas, overlay, x, y, mask)
        return x + reveal_width - 1, y + overlay.shape[0] // 2

    def _draw_annotation(
        self, canvas: np.ndarray, annotation: dict, progress: float
    ) -> tuple[int, int]:
        kind = annotation["kind"]
        if kind in {"path", "underline"}:
            return self._draw_polyline(
                canvas, _as_points(annotation["points"], f"{kind}.points"), annotation, progress
            )
        if kind == "ellipse":
            return self._draw_polyline(canvas, _ellipse_points(annotation["rect"]), annotation, progress)
        if kind == "arrow":
            return self._draw_arrow(canvas, annotation, progress)
        if kind == "text":
            return self._draw_text(canvas, annotation, progress)
        if kind == "image":
            return self._draw_image(canvas, annotation, progress)
        raise ProjectError(f"不支持的 annotation kind: {kind}")

    def render_scene_frame(self, scene_index: int, at_ms: float, show_hand: bool = True) -> np.ndarray:
        loaded = self.scenes[scene_index]
        scene = loaded.spec
        frame = loaded.background.copy()
        active_hand: tuple[float, float, float, float, float] | None = None
        annotations = sorted(scene.get("annotations", []), key=lambda item: int(item["startMs"]))
        for annotation in annotations:
            start = float(annotation["startMs"])
            duration = float(annotation["durationMs"])
            if at_ms < start:
                continue
            raw_progress = min(1.0, (at_ms - start) / duration)
            progress = _ease(raw_progress, annotation.get("easing", "easeInOut"))
            pen = self._draw_annotation(frame, annotation, progress)
            if start <= at_ms < start + duration:
                offset_x, offset_y, rotation, scale, opacity = _writing_hand_motion(
                    annotation, progress, self.hand_style
                )
                active_hand = pen[0] + offset_x, pen[1] + offset_y, rotation, scale, opacity
        if show_hand and self.tip is not None and active_hand is not None:
            x, y, rotation, scale, opacity = active_hand
            self.tip.stamp(
                frame,
                x,
                y,
                rotation_radians=rotation,
                scale=scale,
                opacity=opacity,
            )
        return _apply_camera(frame, _camera_at(scene, at_ms, self.width, self.height))

    @property
    def duration_ms(self) -> int:
        return sum(int(scene.spec["durationMs"]) for scene in self.scenes)

    @property
    def total_frames(self) -> int:
        return sum(
            max(1, round(int(scene.spec["durationMs"]) * self.fps / 1000.0))
            for scene in self.scenes
        )

    @property
    def encoded_duration_ms(self) -> int:
        return round(self.total_frames * 1000.0 / self.fps)

    def render_raw(self, output: Path) -> Path:
        output.parent.mkdir(parents=True, exist_ok=True)
        writer = cv2.VideoWriter(
            str(output),
            cv2.VideoWriter_fourcc(*"mp4v"),
            self.fps,
            (self.width, self.height),
        )
        if not writer.isOpened():
            raise RuntimeError(f"无法打开视频写入器: {output}")
        try:
            for scene_index, loaded in enumerate(self.scenes):
                duration_ms = int(loaded.spec["durationMs"])
                frame_count = max(1, round(duration_ms * self.fps / 1000.0))
                for frame_index in range(frame_count):
                    at_ms = (
                        float(duration_ms)
                        if frame_index == frame_count - 1
                        else frame_index * 1000.0 / self.fps
                    )
                    writer.write(self.render_scene_frame(scene_index, at_ms))
        finally:
            writer.release()
        return output


def _mux_audio(video: Path, audio: Path, output: Path, duration_ms: int) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise RuntimeError("音频合成需要系统 ffmpeg")
    command = [
        ffmpeg,
        "-y",
        "-loglevel",
        "error",
        "-i",
        str(video),
        "-i",
        str(audio),
        "-filter_complex",
        "[1:a]apad[audio]",
        "-map",
        "0:v:0",
        "-map",
        "[audio]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        f"{duration_ms / 1000.0:.3f}",
        "-movflags",
        "+faststart",
        str(output),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"音频合成失败: {result.stderr.strip()}")
    video.unlink(missing_ok=True)
    return output


def render_project(
    project_path: Path,
    output: Path,
    audio_override: Path | None = None,
    hand_override: Path | None = None,
) -> Path:
    project = json.loads(project_path.read_text(encoding="utf-8"))
    renderer = DocumentAnnotationRenderer(project, project_path, hand_override)
    raw = output.with_name(f"{output.stem}.raw.mp4")
    renderer.render_raw(raw)

    audio_value = audio_override or (
        _resolve(project_path.parent, project["audio"]) if project.get("audio") else None
    )
    if audio_value is not None and not audio_value.exists():
        raise ProjectError(f"音频文件不存在: {audio_value}")

    if audio_value is None:
        encoded = sr.transcode_h264(raw, output)
        if encoded != output:
            shutil.move(str(encoded), str(output))
        return output

    silent = output.with_name(f"{output.stem}.silent.mp4")
    encoded = sr.transcode_h264(raw, silent)
    return _mux_audio(encoded, audio_value, output, renderer.encoded_duration_ms)


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="把文档页制作成手写标注动画")
    parser.add_argument("project", help="document annotation 项目 JSON")
    parser.add_argument("output", help="输出 MP4 路径")
    parser.add_argument("--audio", help="覆盖项目中的音频路径")
    parser.add_argument("--hand", help="覆盖项目中的手部 PNG 素材")
    parser.add_argument("--validate-only", action="store_true", help="只校验项目，不渲染")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    project_path = Path(args.project).resolve()
    if not project_path.exists():
        print(f"[err] 项目文件不存在: {project_path}", file=sys.stderr)
        return 2
    try:
        project = json.loads(project_path.read_text(encoding="utf-8"))
        renderer = DocumentAnnotationRenderer(
            project,
            project_path,
            Path(args.hand).resolve() if args.hand else None,
        )
        if args.audio and not Path(args.audio).resolve().exists():
            raise ProjectError(f"音频文件不存在: {Path(args.audio).resolve()}")
        if args.validate_only:
            print(
                f"[ok] 项目有效: {len(renderer.scenes)} 幕, "
                f"{renderer.width}x{renderer.height}, {renderer.fps}fps, "
                f"{renderer.duration_ms}ms"
            )
            return 0
        output = render_project(
            project_path,
            Path(args.output).resolve(),
            Path(args.audio).resolve() if args.audio else None,
            Path(args.hand).resolve() if args.hand else None,
        )
    except (OSError, json.JSONDecodeError, ProjectError, RuntimeError) as exc:
        print(f"[err] {exc}", file=sys.stderr)
        return 1
    print(f"OUTPUT={output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
