from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from render_document_annotation import (  # noqa: E402
    DocumentAnnotationRenderer,
    ProjectError,
    _camera_at,
    _find_font,
    _partial_polyline,
    _writing_hand_motion,
    _writing_hand_offset,
)


class GeometryTests(unittest.TestCase):
    def test_partial_polyline_uses_distance_not_point_count(self) -> None:
        result = _partial_polyline([(0, 0), (100, 0), (100, 10)], 0.5)
        self.assertEqual(result[-1], (55, 0))

    def test_text_hand_motion_is_deterministic_and_other_kinds_stay_exact(self) -> None:
        annotation = {"kind": "text", "text": "Viết chữ tự nhiên"}
        self.assertEqual(_writing_hand_offset(annotation, 0.37), _writing_hand_offset(annotation, 0.37))
        self.assertNotEqual(_writing_hand_offset(annotation, 0.37), (0, 0))
        self.assertEqual(_writing_hand_offset({"kind": "ellipse"}, 0.5), (0, 0))

    def test_text_hand_motion_matches_preview_fades_and_pen_intensity(self) -> None:
        annotation = {"kind": "text", "text": "Viết chữ tự nhiên"}
        self.assertEqual(_writing_hand_motion(annotation, 0.0, "pen")[-1], 0.0)
        self.assertEqual(_writing_hand_motion(annotation, 1.0, "pen")[-1], 0.0)
        marker = _writing_hand_motion(annotation, 0.37, "marker")
        pen = _writing_hand_motion(annotation, 0.37, "pen")
        self.assertLess(abs(marker[1]), abs(pen[1]))
        self.assertNotEqual(pen[2], 0.0)
        self.assertNotEqual(pen[3], 1.0)

    def test_camera_keyframes_interpolate(self) -> None:
        scene = {
            "cameraKeyframes": [
                {"atMs": 0, "center": [50, 50], "zoom": 1.0},
                {"atMs": 1000, "center": [70, 60], "zoom": 2.0, "easing": "linear"},
            ]
        }
        camera = _camera_at(scene, 500, 100, 100)
        self.assertAlmostEqual(camera["centerX"], 60)
        self.assertAlmostEqual(camera["centerY"], 55)
        self.assertAlmostEqual(camera["zoom"], 1.5)

    def test_times_new_roman_fallback_renders_vietnamese(self) -> None:
        font = _find_font(None, 28, "Times New Roman", "italic")
        text = "Tiếng Việt: người tham gia, đánh giá, nghiên cứu"
        self.assertIsNotNone(font.getmask(text).getbbox())
        self.assertGreater(font.getlength(text), 100)

    def test_patrick_hand_bundled_font_renders_vietnamese(self) -> None:
        font = _find_font(None, 28, "Patrick Hand", "regular")
        text = "Tiếng Việt: người tham gia, đánh giá, nghiên cứu"
        self.assertIsNotNone(font.getmask(text).getbbox())
        self.assertGreater(font.getlength(text), 100)


class RendererTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        background = Image.new("RGB", (100, 100), "white")
        for x in range(10, 20):
            for y in range(10, 20):
                background.putpixel((x, y), (20, 30, 40))
        background.save(self.root / "page.png")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _project(self, annotations: list[dict]) -> tuple[dict, Path]:
        project = {
            "version": 1,
            "canvas": {"width": 100, "height": 100, "fps": 10},
            "hand": {"enabled": False},
            "scenes": [
                {
                    "id": "page",
                    "background": "page.png",
                    "backgroundFit": "stretch",
                    "durationMs": 1000,
                    "annotations": annotations,
                }
            ],
        }
        path = self.root / "project.json"
        path.write_text(json.dumps(project), encoding="utf-8")
        return project, path

    def test_background_is_visible_before_annotations(self) -> None:
        project, path = self._project(
            [
                {
                    "kind": "path",
                    "points": [[10, 50], [90, 50]],
                    "color": "#FF0000",
                    "strokeWidth": 4,
                    "startMs": 500,
                    "durationMs": 500,
                }
            ]
        )
        renderer = DocumentAnnotationRenderer(project, path)
        before = renderer.render_scene_frame(0, 250, show_hand=False)
        during = renderer.render_scene_frame(0, 750, show_hand=False)
        after = renderer.render_scene_frame(0, 1000, show_hand=False)
        np.testing.assert_array_equal(before[15, 15], np.array([40, 30, 20], dtype=np.uint8))
        np.testing.assert_array_equal(before[50, 40], np.array([255, 255, 255], dtype=np.uint8))
        self.assertGreater(int(during[50, 30, 2]), 200)
        self.assertGreater(int(after[50, 88, 2]), 200)

    def test_transparent_overlay_can_follow_a_reveal_path(self) -> None:
        overlay = np.zeros((20, 30, 4), dtype=np.uint8)
        overlay[:, :, 0] = 255
        overlay[:, :, 3] = 255
        Image.fromarray(overlay, "RGBA").save(self.root / "overlay.png")
        project, path = self._project(
            [
                {
                    "kind": "image",
                    "source": "overlay.png",
                    "position": [30, 40],
                    "revealPath": [[0, 10], [29, 10]],
                    "brushWidth": 18,
                    "startMs": 0,
                    "durationMs": 800,
                }
            ]
        )
        renderer = DocumentAnnotationRenderer(project, path)
        final = renderer.render_scene_frame(0, 800, show_hand=False)
        self.assertGreater(int(final[50, 45, 2]), 200)

    def test_invalid_annotation_timing_is_rejected(self) -> None:
        project, path = self._project(
            [
                {
                    "kind": "path",
                    "points": [[0, 0], [10, 10]],
                    "startMs": 900,
                    "durationMs": 200,
                }
            ]
        )
        with self.assertRaises(ProjectError):
            DocumentAnnotationRenderer(project, path)

    def test_zero_height_is_valid_only_when_hand_overlay_is_disabled(self) -> None:
        project, path = self._project([])
        project["hand"] = {"enabled": False, "height": 0}
        DocumentAnnotationRenderer(project, path)

        project["hand"] = {"enabled": True, "height": 0}
        with self.assertRaises(ProjectError):
            DocumentAnnotationRenderer(project, path)

    def test_validate_only_loads_annotation_image_assets(self) -> None:
        project, path = self._project(
            [
                {
                    "kind": "image",
                    "source": "missing.png",
                    "startMs": 0,
                    "durationMs": 500,
                }
            ]
        )
        with self.assertRaises(ProjectError):
            DocumentAnnotationRenderer(project, path)

    def test_project_typography_is_applied_to_vietnamese_text(self) -> None:
        project, path = self._project(
            [
                {
                    "kind": "text",
                    "text": "Đánh giá người tham gia",
                    "position": [4, 35],
                    "fontSize": 16,
                    "color": "#CC2244",
                    "startMs": 0,
                    "durationMs": 700,
                }
            ]
        )
        project["typography"] = {
            "fontFamily": "Times New Roman",
            "fontStyle": "italic",
        }
        path.write_text(json.dumps(project, ensure_ascii=False), encoding="utf-8")
        renderer = DocumentAnnotationRenderer(project, path)
        final = renderer.render_scene_frame(0, 700, show_hand=False)
        red_pixels = (final[:, :, 2] > 140) & (final[:, :, 1] < 120)
        self.assertGreater(int(red_pixels.sum()), 20)

    def test_patrick_hand_annotation_renders_in_a_video_frame(self) -> None:
        project, path = self._project(
            [
                {
                    "kind": "text",
                    "text": "Tiếng Việt viết tay",
                    "position": [4, 35],
                    "fontFamily": "Patrick Hand",
                    "fontStyle": "regular",
                    "fontSize": 18,
                    "color": "#CC2244",
                    "startMs": 0,
                    "durationMs": 700,
                }
            ]
        )
        renderer = DocumentAnnotationRenderer(project, path)
        final = renderer.render_scene_frame(0, 700, show_hand=False)
        red_pixels = (final[:, :, 2] > 140) & (final[:, :, 1] < 120)
        self.assertGreater(int(red_pixels.sum()), 20)


if __name__ == "__main__":
    unittest.main()
