# 文档手写标注动画

`render_document_annotation.py` 是独立于白板模式的新渲染器。它用于制作“论文/报告页面始终可见，手部随后圈选、下划线、画箭头并写注释”的竖屏或横屏视频。

## 与白板模式的区别

| 项目 | 白板模式 | 文档标注模式 |
|---|---|---|
| 首帧 | 空白纸张 | 完整文档页 |
| 动画内容 | 原图中的线稿与颜色 | 显式定义的 annotation layer |
| 文档文字 | 不建议出现 | 作为背景保留，不参与重绘 |
| 笔迹 | 自动从整图提取 | 路径、椭圆、箭头、文字或透明 PNG |
| 多页 | 渲染单幕后合并 | 一个项目可直接包含多页 |
| 镜头 | 固定 | 支持 zoom/pan keyframe |
| 音频 | 需后期处理 | 可直接指定音频并自动补齐/裁切 |

## 快速开始

生成内置的 9:16 双页示例：

```bash
python scripts/create_document_annotation_demo.py
```

先校验配置，再渲染：

```bash
<ENV_PY> scripts/render_document_annotation.py \
  examples/document-annotation/project.json \
  examples/document-annotation/demo.mp4 \
  --validate-only

<ENV_PY> scripts/render_document_annotation.py \
  examples/document-annotation/project.json \
  examples/document-annotation/demo.mp4
```

覆盖音频或手部素材：

```bash
<ENV_PY> scripts/render_document_annotation.py project.json output.mp4 \
  --audio narration.wav \
  --hand custom-hand.png
```

音频合成需要系统 `ffmpeg`；无音频时可用系统 ffmpeg 或 PyAV 输出 H.264。

## 项目格式

机器可读的 JSON Schema 位于 [`document-annotation.schema.json`](document-annotation.schema.json)，可用于编辑器补全和外部校验。

```json
{
  "version": 1,
  "canvas": { "width": 720, "height": 1280, "fps": 24 },
  "typography": {
    "fontFamily": "Times New Roman",
    "fontStyle": "italic",
    "fontSize": 28
  },
  "audio": "narration.wav",
  "hand": {
    "enabled": true,
    "image": "../../assets/drawing-hand.png",
    "height": 430,
    "anchor": [0.0, 0.0]
  },
  "scenes": [
    {
      "id": "page-01",
      "background": "page-01.png",
      "backgroundFit": "cover",
      "durationMs": 5000,
      "cameraKeyframes": [
        { "atMs": 0, "center": [360, 640], "zoom": 1.0 },
        { "atMs": 5000, "center": [370, 600], "zoom": 1.08, "easing": "easeInOut" }
      ],
      "annotations": []
    }
  ]
}
```

路径均相对于项目 JSON；也可使用绝对路径。画布宽高必须是正偶数。多幕按数组顺序硬切，适合参考视频中的换页方式。

### typography 与 tiếng Việt

`text` 标注默认优先使用 **Times New Roman**。Windows 使用系统的 `times.ttf`；Linux/macOS 会按顺序回退到 Liberation Serif、DejaVu Serif 或系统 Times New Roman，这些字体均覆盖常用越南语字符。

- `fontFamily`：内置支持 `Times New Roman`（也接受 `serif`）。其他字体请提供 `fontPath`。
- `fontStyle`：`regular`、`bold`、`italic`、`boldItalic`。
- `fontSize`：项目级默认字号。
- `fontPath`：可选的 `.ttf/.otf` 路径，优先级最高。

每个 `text` annotation 可用同名字段覆盖项目默认值。例如：

```json
{
  "kind": "text",
  "text": "Số lượng người tham gia: 62 bệnh nhân",
  "position": [80, 520],
  "fontFamily": "Times New Roman",
  "fontStyle": "italic",
  "fontSize": 30,
  "color": "#D43F68",
  "startMs": 1400,
  "durationMs": 900
}
```

Nếu máy đích không có Times New Roman, nên đóng gói font trong thư mục dự án và cấu hình `fontPath`, ví dụ `fonts/times.ttf`; renderer sẽ báo lỗi rõ ràng thay vì âm thầm dùng font thiếu dấu.

### hand

- `enabled`：关闭后不叠加手部。
- `image`：透明 PNG；无 alpha 时会把近白区域视为透明。
- `height`：手部素材在场景坐标中的高度。
- `anchor`：素材内部与落墨点对齐的归一化坐标。内置素材的笔尖在左上角，使用 `[0, 0]`。

### cameraKeyframes

- `atMs`：场景内时间。
- `center`：镜头中心的场景像素坐标。
- `zoom`：`1` 显示完整画布，数值越大越放大。
- `easing`：`linear`、`easeIn`、`easeOut` 或 `easeInOut`。

镜头变换在文档、标注和手部合成之后应用，因此三者不会错位。

## Annotation 类型

所有 annotation 都需要 `kind`、`startMs`、`durationMs`。可选 `easing` 与镜头相同。时间必须完全位于所属场景内。

### path / underline

```json
{
  "kind": "underline",
  "points": [[80, 360], [240, 365], [500, 361]],
  "color": "#D43F68",
  "strokeWidth": 7,
  "startMs": 500,
  "durationMs": 900
}
```

渲染器按几何长度而非点数推进，稀疏与密集采样不会造成速度跳变。

### ellipse

```json
{
  "kind": "ellipse",
  "rect": [50, 140, 620, 120],
  "color": "#D43F68",
  "strokeWidth": 7,
  "startMs": 200,
  "durationMs": 850
}
```

### arrow

```json
{
  "kind": "arrow",
  "points": [[610, 300], [570, 350], [500, 390]],
  "headLength": 28,
  "headWidth": 18,
  "color": "#2E8B57",
  "strokeWidth": 6,
  "startMs": 1500,
  "durationMs": 700
}
```

箭杆先完成，最后绘制两侧箭头。

### text

```json
{
  "kind": "text",
  "text": "Kết quả chính",
  "position": [350, 260],
  "fontSize": 28,
  "fontFamily": "Times New Roman",
  "fontStyle": "italic",
  "color": "#2E8B57",
  "startMs": 2400,
  "durationMs": 900
}
```

文字从左向右显示。要获得与真人书写完全一致的字形和笔顺，使用下方的透明图片模式。

### image

透明 PNG 可保存设计师或手写板制作的完整标注。`revealPath` 使用图片局部坐标，笔刷只揭示路径经过的 alpha 像素。

```json
{
  "kind": "image",
  "source": "handwritten-note.png",
  "position": [300, 250],
  "revealPath": [[10, 35], [80, 30], [150, 38], [230, 34]],
  "brushWidth": 36,
  "startMs": 2200,
  "durationMs": 1200
}
```

未提供 `revealPath` 时，图片按从左到右擦入。

## 推荐制作流程

1. 从 PDF 或截图导出每页背景图，先确定最终 9:16 或 16:9 裁切。
2. 根据旁白/SRT 把圈选、下划线、箭头和批注分配到场景时间轴。
3. 简单标注直接写为 vector；复杂手写文字导出透明 PNG，并提供 reveal path。
4. 用 `--validate-only` 检查路径、时序、画布和资源。
5. 渲染后抽查每幕开始、每个标注中段、换页前一帧和最终帧。
6. 指定最终旁白音频重新渲染；渲染器会将短音频补静音、长音频裁切到视频长度。

## 质量检查

- 首帧完整显示文档，不会重新绘制印刷文字。
- annotation 开始前完全不可见，结束后永久保留至该场景结束。
- 笔尖紧贴当前揭示前沿，镜头缩放时不漂移。
- 换页为干净硬切；下一页不会残留上一页 annotation。
- 输出为偶数尺寸、H.264/yuv420p；指定音频后含 AAC 音轨且总时长与视频一致。
