# SRT 白板动画 Skill

将 SRT 字幕转为按叙事顺序绘制的白板手绘视频Skill。它结合了**分区遮罩编排**与**流式笔迹绘制**：每个元素跟随字幕依次出场，笔尖在区域内连续落墨，再逐步添彩，最终导出 MP4。

适合把知识讲解、故事口播、课程字幕或短视频文案制作成暖米黄色纸张底的手绘动画。

## 效果示例

**场景：猴子山抢香蕉** —— 随着字幕的叙事顺序，依次绘制假山与小猴、抢香蕉的大猴，以及围观小朋友。

![猴子山抢香蕉：SRT 白板动画演示](examples/scene-01-monkey-mountain-stream.gif)

原始线稿：[查看 PNG](examples/scene-01-monkey-mountain.png)。

## 核心能力

- 解析 SRT 字幕，并按建议的 25–35 秒时长拆分场景
- 先输出分镜与配图策略，确保每一幕只表达一个核心意思
- 按字幕事件而非画面坐标，为元素建立语义化的绘制顺序
- 用 `annotation.json` 管理区域、时序、字幕关联和重叠保护区
- 每个区域采用连续流式笔迹：先 `ink` 铺线稿，再 `color` 添彩
- 支持浏览器预览台调整区域、顺序、时间和字幕关联
- 支持逐幕渲染与多幕合并，输出完整 MP4

## 新功能：文档手写标注动画

仓库现在提供独立的 `render_document_annotation.py`，用于制作论文、报告或截图上的真人手写标注效果：原始文档从首帧保持可见，只让圈选、下划线、箭头、批注文字或透明 PNG 标注沿笔尖逐步出现。

它支持：

- 9:16 / 16:9 自定义偶数画布
- `path`、`underline`、`ellipse`、`arrow`、`text` 与透明 `image` 标注
- 多页硬切、zoom/pan 镜头关键帧、手部 PNG 跟随真实揭示前沿
- H.264 输出，以及用 ffmpeg 自动合成并补齐/裁切旁白音频
- 内置支持越南语的 Times New Roman 与 Patrick Hand，并可按项目或单条批注选择字体

快速体验：

```bash
python scripts/create_document_annotation_demo.py
<ENV_PY> scripts/render_document_annotation.py \
  examples/document-annotation/project.json \
  examples/document-annotation/demo.mp4
```

完整项目格式、字段说明与制作流程见 [文档手写标注动画指南](docs/document-annotation.md)。

## Web editor end-to-end

Thư mục `web/` cung cấp trình biên tập tiếng Việt theo hướng trực quan: người dùng không nhập `position: [x, y]`, mà chọn công cụ rồi bấm, vẽ hoặc kéo trực tiếp trên tờ giấy. Tọa độ canvas được tự động chuyển sang project JSON 720 × 1280 của renderer.

Luồng được hỗ trợ:

- onboarding cho người dùng mới, có thể mở dự án mẫu hoặc tạo dự án riêng;
- routing thật theo URL: `/` là onboarding, `/projects` là thư viện, `/projects/new` là wizard và `/studio/:projectId` là editor;
- lưu dự án bằng IndexedDB, hỗ trợ mở lại từ thư viện hoặc reload trực tiếp URL studio mà không mất dữ liệu;
- wizard 3 bước với vùng kéo-thả PDF/ảnh, tài nguyên SRT/audio tùy chọn và thiết lập tên/thời lượng;
- tải PDF hoặc nhiều ảnh và tự tạo scene cho từng trang;
- tải SRT, audio thuyết minh và ảnh overlay;
- thêm/kéo `path`, `underline`, `ellipse`, `arrow`, `text`, `image` trực tiếp trên canvas;
- phóng to/thu nhỏ canvas 50–300%, vừa màn hình, Ctrl/Cmd + cuộn và giữ Space để kéo tài liệu;
- chỉnh đối tượng bằng inspector bên phải và toolbar ngữ cảnh ngay cạnh chú thích đang chọn;
- nhập chữ tiếng Việt với Times New Roman hoặc Patrick Hand, chọn dáng chữ, cỡ chữ, màu và thời điểm xuất hiện;
- thay đổi thời lượng từng scene đến 3600 giây, thêm scene để tạo video dài;
- xem thử animation, hoàn tác/làm lại, bật/tắt và điều chỉnh kích thước tay cầm bút;
- tải project JSON hoặc gọi renderer local để nhận MP4.

Khởi động toàn bộ frontend và renderer API bằng một lệnh:

```bash
cd web
npm install
npm run dev:full
```

Nếu chưa có `.venv`, hãy chạy `python scripts/prepare_env.py` ở thư mục gốc repo trước. `npm run dev:full` sẽ in URL của website; onboarding dẫn người dùng từ tài liệu đầu vào tới editor, còn nút **Tạo MP4** gửi project cùng assets vào renderer local và đổi thành **Tải MP4** khi hoàn tất.

### Deploy miễn phí lên Render

Repo có sẵn `Dockerfile` production và `render.yaml` để chạy frontend, Python API, FFmpeg và font hỗ trợ tiếng Việt trong cùng một Render Web Service.

1. Fork hoặc push repo vào tài khoản GitHub của bạn.
2. Trong Render Dashboard, chọn **New → Blueprint** và kết nối repo.
3. Xác nhận service `srt-whiteboard-animation`; Render sẽ đọc `render.yaml`, build Docker image và kiểm tra `/api/health`.
4. Mở URL `https://<service>.onrender.com` sau khi deploy thành công.

Có thể kiểm tra image trước khi push:

```bash
docker build --platform linux/amd64 -t srt-whiteboard-animation:render .
docker run --rm -p 10000:10000 srt-whiteboard-animation:render
```

Gói Free dùng filesystem tạm thời: dự án vẫn được giữ trong IndexedDB của trình duyệt, nhưng MP4 trên server có thể mất khi service ngủ, restart hoặc deploy lại. Vì vậy người dùng nên tải video ngay sau khi render hoàn tất. Khi nâng cấp lên gói có persistent disk, đổi `DATA_ROOT` sang mount path của disk.

## 工作方式

该 Skill 的关键在于“字幕驱动、逐步确认”。每一步完成后都等待确认，避免在分镜、线稿或标注尚未定稿时浪费渲染成本：

1. 解析 SRT，输出分镜与配图策略。
2. 确认后生成统一风格的线稿。
3. 确认线稿后，结合字幕和原图创建标注，并载入预览台。
4. 确认标注后，生成分区与方向检查图。
5. 在预览台调整区域、叙事顺序、时序和字幕关联并保存。
6. 确认最终标注后，逐幕渲染 MP4。
7. 多幕项目在确认各幕成片后合并。

## 视觉规范

- 暖米黄色纸张背景：建议 `#F5EBD7`
- 深灰色素描线条，红、橙、蓝仅作少量概念性点缀
- 极简手绘、干净背景与充足留白
- 不使用场景文字、标签、摄影感、3D 效果或复杂纹理

## 安装与环境

Skill 自带独立的 Python 虚拟环境准备脚本。首次运行时执行：

```bash
python scripts/prepare_env.py --check
python scripts/prepare_env.py
```

成功后第一条命令会输出 `ENV_PY=<路径>`；后续渲染请使用该解释器，确保依赖隔离。

## 项目素材结构

```text
assets/whiteboard/<项目名>/
├── scene-01-<名称>.png
├── scene-01-<名称>.annotation.json
├── scene-01-<名称>-whiteboard.mp4
└── scene-01-<名称>-preview.mp4
```

图片与标注必须同名，例如 `scene-01-demo.png` 对应 `scene-01-demo.annotation.json`。

## 标注格式

每个元素使用原图的整数像素坐标，并通过 `sequence`、`subtitle` 与 `narrativeRole` 关联字幕中的事件。区域应按“场景铺垫 → 关键人物/物体 → 动作或变化 → 反应/结果”排序。

```json
{
  "sceneId": "scene-01",
  "canvas": { "width": 1672, "height": 941 },
  "storyBasis": "小猴在猴子山上拿着香蕉，大猴抢走香蕉，孩子们在旁观看。",
  "sceneDurationMs": 9000,
  "elements": [
    {
      "id": "rockery",
      "label": "猴子山场景",
      "sequence": 1,
      "narrativeRole": "故事的场景铺垫",
      "subtitle": "小猴子坐在猴子山顶，手里拿着香蕉。",
      "type": "structure",
      "region": { "x": 20, "y": 120, "width": 540, "height": 780 },
      "reveal": {
        "direction": "top_to_bottom",
        "startMs": 300,
        "durationMs": 2600,
        "maskPaddingPx": 22,
        "protectedRegions": []
      },
      "handPath": { "start": [290, 130], "end": [290, 890], "easing": "easeInOut" }
    }
  ]
}
```

`direction` 和 `handPath` 用于预览台的矩形代理；最终成片的真实笔迹由流式绘制器自动生成。对于相互遮挡的对象，在较早元素的 `protectedRegions` 中标出需要延后显示的区域，避免后续内容提前露出。

## 常用命令

解析字幕并生成建议分镜：

```bash
python scripts/parse_srt.py <字幕.srt> --target-sec 30 --min-sec 25 --max-sec 35
```

生成区域检查图：

```bash
python scripts/render_annotation_preview.py <图片路径> <标注路径> <预览图输出路径>
```

打开 `assets/preview.html`，使用“打开文件夹”载入场景目录，即可编辑区域、顺序、时间与字幕关联。

渲染单幕：

```bash
<ENV_PY> scripts/render_stream_whiteboard.py <图片路径> <标注路径> <输出.mp4> assets/drawing-hand.png \
  --ink-path grid --color-fill contour-wipe
```

合并多幕：

```bash
<ENV_PY> scripts/merge_scenes.py --inputs 幕1.mp4 幕2.mp4 幕3.mp4 --output final.mp4
```

## 质量检查

- 首帧是干净的暖米黄纸张底色，没有提前露出的线条
- `canvas` 与原图尺寸一致，所有区域都是画布内的整数像素坐标
- `sequence`、`startMs` 与字幕的叙事顺序一致
- 中段帧中，未开始区域和保护区不会提前出现
- 笔尖贴近当前流式笔迹；线稿清晰时可选择 `--ink-path skeleton`
- 每幕结束后至少停留 0.5 秒完整画面；多幕合并顺序与字幕分镜一致

## 仓库内容

```text
srt-whiteboard-animation/
├── SKILL.md                         # 完整工作流与约束
├── assets/
│   ├── drawing-hand.png              # 手部素材
│   ├── preview.html                  # 本地编辑预览台
├── examples/                         # README 案例素材
├── scripts/
│   ├── parse_srt.py                  # 字幕解析与分镜建议
│   ├── render_annotation_preview.py  # 标注检查图
│   ├── render_stream_whiteboard.py   # 流式笔迹 MP4 渲染器
│   ├── render_document_annotation.py # 文档手写标注动画渲染器
│   ├── create_document_annotation_demo.py # 生成可运行的双页示例
│   ├── merge_scenes.py               # 多幕合并
│   └── prepare_env.py                # 依赖环境准备
└── agents/openai.yaml                # Codex 元数据
```

## 贡献

欢迎提交 Issue 或 Pull Request。任何涉及绘制逻辑的改动，都应使用真实的字幕、标注和成片检查遮罩保护、时序与最终画面。

## 许可证

本项目基于 MIT License 开源，详见 [LICENSE](LICENSE)。

## 关于作者

一个爱养鱼的老登 / AI Builder / 用 AI 团队打造一人公司。

抖音、B站、公众号：江哥是老登啊
