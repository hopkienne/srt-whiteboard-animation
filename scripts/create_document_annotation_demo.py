#!/usr/bin/env python3
"""Create a portable two-page demo for render_document_annotation.py."""
from __future__ import annotations

import argparse
import json
import os
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from _utf8_stdio import configure_utf8_stdio

configure_utf8_stdio()

_ROOT = Path(__file__).resolve().parent.parent


def _font(
    size: int, bold: bool = False, italic: bool = False
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if bold and italic:
        windows_name = "timesbi.ttf"
        linux_name = "LiberationSerif-BoldItalic.ttf"
        mac_name = "Times New Roman Bold Italic.ttf"
    elif bold:
        windows_name = "timesbd.ttf"
        linux_name = "LiberationSerif-Bold.ttf"
        mac_name = "Times New Roman Bold.ttf"
    elif italic:
        windows_name = "timesi.ttf"
        linux_name = "LiberationSerif-Italic.ttf"
        mac_name = "Times New Roman Italic.ttf"
    else:
        windows_name = "times.ttf"
        linux_name = "LiberationSerif-Regular.ttf"
        mac_name = "Times New Roman.ttf"
    names = [
        f"C:/Windows/Fonts/{windows_name}",
        f"/usr/share/fonts/truetype/liberation2/{linux_name}",
        f"/usr/share/fonts/truetype/liberation/{linux_name}",
        f"/Library/Fonts/{mac_name}",
        f"/System/Library/Fonts/Supplemental/{mac_name}",
    ]
    for name in names:
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def _wrapped(draw: ImageDraw.ImageDraw, text: str, box: tuple[int, int, int, int], font, spacing: int = 8) -> int:
    x0, y0, x1, _ = box
    average = max(1, int((x1 - x0) / max(7, getattr(font, "size", 16) * 0.52)))
    lines = textwrap.wrap(text, width=average)
    y = y0
    for line in lines:
        draw.text((x0, y), line, font=font, fill="#222222")
        bbox = draw.textbbox((x0, y), line, font=font)
        y = bbox[3] + spacing
    return y


def _page(path: Path, page: int) -> None:
    width, height = 720, 1280
    image = Image.new("RGB", (width, height), "#F4F2EC")
    draw = ImageDraw.Draw(image)
    draw.rectangle((30, 24, width - 30, height - 24), fill="#FFFDF8", outline="#C8C3B8", width=2)
    draw.text((55, 54), "CLINICAL RESEARCH PAPER", font=_font(18, True), fill="#3D4B47")
    draw.text((500, 54), f"PAGE {page}", font=_font(16), fill="#66706C")
    draw.line((55, 88, 665, 88), fill="#A9AEA9", width=2)

    if page == 1:
        draw.text((55, 116), "Study", font=_font(23, True), fill="#A3344F")
        title = "Randomized clinical research and oral mucositis prevention"
        _wrapped(draw, title, (55, 156, 665, 290), _font(34, True), 7)
        draw.text((55, 300), "Elena M. Example · Minh T. Nguyen · Carlos A. Rivera", font=_font(16), fill="#3D6A85")
        draw.text((55, 350), "Abstract", font=_font(22, True), fill="#333333")
        abstract = (
            "Background: Oral mucositis is a frequent complication during treatment. "
            "This randomized study evaluates a supportive intervention and measures pain, "
            "inflammation, and recovery over twenty-one days. Participants were assigned "
            "to intervention and control groups using a blinded protocol."
        )
        y = _wrapped(draw, abstract, (55, 390, 665, 650), _font(19), 10)
        draw.text((55, y + 20), "Conclusion", font=_font(22, True), fill="#333333")
        conclusion = (
            "The intervention was feasible and showed a clinically meaningful reduction "
            "in symptom severity without serious adverse effects."
        )
        _wrapped(draw, conclusion, (55, y + 60, 665, 870), _font(19), 10)
        draw.text((55, 990), "Keywords: oral care · randomized trial · supportive therapy", font=_font(17), fill="#555555")
        draw.text((55, 1120), "DOI: 10.0000/example.2026.001", font=_font(15), fill="#777777")
    else:
        title = "Methods and participant flow"
        draw.text((55, 116), title, font=_font(34, True), fill="#222222")
        draw.text((55, 190), "Methods", font=_font(25, True), fill="#333333")
        methods = (
            "Sixty-two patients were randomly assigned to two groups. Assessments were "
            "performed at baseline and on days 1, 7, 15, and 21. The primary endpoint was "
            "change in oral mucositis severity; secondary endpoints included pain and diet."
        )
        y = _wrapped(draw, methods, (55, 235, 665, 520), _font(20), 11)
        draw.text((55, y + 22), "Results", font=_font(25, True), fill="#333333")
        results = (
            "The intervention group recovered earlier and reported lower pain scores. "
            "No treatment-related serious adverse events occurred."
        )
        y = _wrapped(draw, results, (55, y + 68, 665, 760), _font(20), 11)
        draw.text((55, y + 25), "Assessment schedule", font=_font(23, True), fill="#333333")
        draw.rectangle((80, y + 90, 640, y + 250), outline="#69736F", width=2)
        for column in range(1, 5):
            x = 80 + column * 112
            draw.line((x, y + 90, x, y + 250), fill="#909894", width=2)
        draw.line((80, y + 165, 640, y + 165), fill="#909894", width=2)
        labels = ["Baseline", "Day 1", "Day 7", "Day 15", "Day 21"]
        for index, label in enumerate(labels):
            draw.text((89 + index * 112, y + 110), label, font=_font(14), fill="#333333")
            draw.text((119 + index * 112, y + 190), "✓", font=_font(20, True), fill="#333333")
    image.save(path, quality=96)


def create_demo(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    _page(output_dir / "page-01.png", 1)
    _page(output_dir / "page-02.png", 2)
    hand_rel = Path(os.path.relpath(_ROOT / "assets" / "drawing-hand.png", output_dir)).as_posix()
    project = {
        "version": 1,
        "canvas": {"width": 720, "height": 1280, "fps": 24},
        "typography": {
            "fontFamily": "Times New Roman",
            "fontStyle": "italic",
            "fontSize": 28,
        },
        "hand": {"enabled": True, "image": hand_rel, "height": 430, "anchor": [0.0, 0.0]},
        "scenes": [
            {
                "id": "research-summary",
                "background": "page-01.png",
                "backgroundFit": "cover",
                "durationMs": 4500,
                "cameraKeyframes": [
                    {"atMs": 0, "center": [360, 640], "zoom": 1.0},
                    {"atMs": 4500, "center": [365, 590], "zoom": 1.06, "easing": "easeInOut"},
                ],
                "annotations": [
                    {
                        "id": "circle-title",
                        "kind": "ellipse",
                        "rect": [45, 144, 625, 132],
                        "color": "#D43F68",
                        "strokeWidth": 7,
                        "startMs": 300,
                        "durationMs": 900,
                    },
                    {
                        "id": "underline-outcome",
                        "kind": "underline",
                        "points": [[58, 454], [190, 460], [335, 456], [492, 462], [632, 458]],
                        "color": "#D43F68",
                        "strokeWidth": 7,
                        "startMs": 1350,
                        "durationMs": 850,
                    },
                    {
                        "id": "arrow-note",
                        "kind": "arrow",
                        "points": [[600, 345], [625, 320], [612, 280]],
                        "color": "#2E8B57",
                        "strokeWidth": 6,
                        "startMs": 2300,
                        "durationMs": 700,
                    },
                    {
                        "id": "note",
                        "kind": "text",
                        "text": "Điểm chính của nghiên cứu",
                        "position": [325, 265],
                        "fontSize": 25,
                        "color": "#2E8B57",
                        "startMs": 3100,
                        "durationMs": 900,
                    },
                ],
            },
            {
                "id": "methods",
                "background": "page-02.png",
                "backgroundFit": "cover",
                "durationMs": 4500,
                "cameraKeyframes": [
                    {"atMs": 0, "center": [360, 640], "zoom": 1.0},
                    {"atMs": 4500, "center": [350, 710], "zoom": 1.08, "easing": "easeInOut"},
                ],
                "annotations": [
                    {
                        "id": "circle-sample",
                        "kind": "ellipse",
                        "rect": [48, 232, 618, 108],
                        "color": "#D43F68",
                        "strokeWidth": 7,
                        "startMs": 250,
                        "durationMs": 950,
                    },
                    {
                        "id": "sample-note",
                        "kind": "text",
                        "text": "62 người tham gia",
                        "position": [78, 515],
                        "fontSize": 29,
                        "color": "#D43F68",
                        "startMs": 1400,
                        "durationMs": 850,
                    },
                    {
                        "id": "schedule-arrow",
                        "kind": "arrow",
                        "points": [[230, 575], [315, 650], [360, 782]],
                        "color": "#E28A27",
                        "strokeWidth": 7,
                        "startMs": 2450,
                        "durationMs": 850,
                    },
                    {
                        "id": "schedule-note",
                        "kind": "text",
                        "text": "Đánh giá theo 5 mốc thời gian",
                        "position": [250, 565],
                        "fontSize": 24,
                        "color": "#E28A27",
                        "startMs": 3400,
                        "durationMs": 750,
                    },
                ],
            },
        ],
    }
    project_path = output_dir / "project.json"
    project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
    return project_path


def main() -> None:
    parser = argparse.ArgumentParser(description="创建文档手写标注动画示例")
    parser.add_argument(
        "output_dir",
        nargs="?",
        default=str(_ROOT / "examples" / "document-annotation"),
        help="示例输出目录",
    )
    args = parser.parse_args()
    project = create_demo(Path(args.output_dir).resolve())
    print(f"PROJECT={project}")


if __name__ == "__main__":
    main()
