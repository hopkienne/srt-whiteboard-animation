import { useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  FilePdfIcon,
  FilmSlateIcon,
  ImagesSquareIcon,
  MusicNotesIcon,
  PencilLineIcon,
  PlayIcon,
  SubtitlesIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { fileToDataUrl, imageFileToPage, parseSrt, pdfFileToPages } from "./lib/media";
import { makeId } from "./lib/project";

const ACCEPT_DOCUMENTS = "image/png,image/jpeg,image/webp,application/pdf,.pdf";

function SetupStepper({ step }) {
  const labels = ["Tài liệu", "Phụ đề & âm thanh", "Thiết lập"];
  return (
    <ol className="setup-stepper" aria-label="Tiến trình tạo dự án">
      {labels.map((label, index) => {
        const number = index + 1;
        const state = number < step ? "done" : number === step ? "active" : "";
        return (
          <li key={label} className={state}>
            <span>{number < step ? <CheckCircleIcon weight="fill" /> : number}</span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}

function UploadAssetCard({ Icon, title, detail, filename, onClick, action = "Chọn tệp" }) {
  return (
    <button className={`setup-asset-card ${filename ? "has-file" : ""}`} type="button" onClick={onClick}>
      <span className="setup-asset-icon"><Icon size={26} weight="duotone" /></span>
      <span className="setup-asset-copy">
        <strong>{title}</strong>
        <small>{filename || detail}</small>
      </span>
      <span className="setup-asset-action">{filename ? "Đổi tệp" : action}</span>
      {filename && <CheckCircleIcon className="setup-check" size={20} weight="fill" />}
    </button>
  );
}

export function ProjectOnboarding({ startAt = "welcome", onStartProject, onUseSample, onCreateProject, onCancel, cancelLabel = "Quay lại" }) {
  const [step, setStep] = useState(1);
  const [pages, setPages] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);
  const [subtitles, setSubtitles] = useState([]);
  const [subtitleName, setSubtitleName] = useState("");
  const [audioAsset, setAudioAsset] = useState(null);
  const [projectName, setProjectName] = useState("Video chú thích của tôi");
  const [durationSeconds, setDurationSeconds] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const documentInput = useRef(null);
  const subtitleInput = useRef(null);
  const audioInput = useRef(null);

  async function importDocuments(fileList) {
    const files = [...fileList].filter((file) => file.type.startsWith("image/") || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) {
      setError("Hãy chọn ít nhất một tệp PDF, PNG, JPG hoặc WebP.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const nextPages = [];
      for (const file of files) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          nextPages.push(...await pdfFileToPages(file));
        } else {
          nextPages.push(await imageFileToPage(file));
        }
      }
      setPages(nextPages);
      setDocumentFiles(files);
      if (projectName === "Video chú thích của tôi") {
        setProjectName(files[0].name.replace(/\.[^.]+$/, "") || "Video chú thích của tôi");
      }
    } catch (importError) {
      setError(`Không thể đọc tài liệu: ${importError.message}`);
    } finally {
      setBusy(false);
      if (documentInput.current) documentInput.current.value = "";
    }
  }

  async function importSubtitle(file) {
    if (!file) return;
    const cues = parseSrt(await file.text());
    setSubtitles(cues);
    setSubtitleName(file.name);
    if (subtitleInput.current) subtitleInput.current.value = "";
  }

  async function importAudio(file) {
    if (!file) return;
    setBusy(true);
    try {
      setAudioAsset({ name: file.name, dataUrl: await fileToDataUrl(file) });
    } finally {
      setBusy(false);
      if (audioInput.current) audioInput.current.value = "";
    }
  }

  async function finishSetup() {
    const durationMs = Math.max(1000, Math.min(3600000, Number(durationSeconds || 8) * 1000));
    const scenes = pages.map((background, index) => ({
      id: makeId("scene"),
      name: index === 0 ? "Mở đầu" : `Cảnh ${index + 1}`,
      durationMs,
      background,
      sourceName: documentFiles[0]?.name || "Tài liệu",
      annotations: [],
    }));
    setBusy(true);
    setError("");
    try {
      await onCreateProject({
        scenes,
        documentName: documentFiles.length === 1 ? documentFiles[0].name : `${documentFiles.length} tệp`,
        subtitles,
        subtitleName,
        audioAsset,
        projectName: projectName.trim() || "Video chú thích của tôi",
      });
    } catch (createError) {
      setError(`Không thể tạo dự án: ${createError.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (startAt !== "setup") {
    return (
      <main className="onboarding-shell">
        <header className="welcome-header">
          <div className="welcome-brand"><span><PencilLineIcon size={26} weight="duotone" /></span><strong>Bảng Vẽ Video</strong></div>
          {onCancel ? <button className="welcome-sample-link" type="button" onClick={onCancel}><ArrowLeftIcon /> Quay lại editor</button> : <button className="welcome-sample-link" type="button" onClick={onUseSample}><PlayIcon weight="fill" /> Mở dự án mẫu</button>}
        </header>

        <section className="welcome-hero">
          <div className="welcome-copy">
            <span className="eyebrow">Từ tài liệu đến video — trong một luồng</span>
            <h1>Biến PDF và hình ảnh thành video chú thích sống động</h1>
            <p>Tải tài liệu lên, đặt nét vẽ trực tiếp trên trang và xuất MP4. Bạn không cần biết tọa độ hay chỉnh JSON.</p>
            <div className="welcome-actions">
              <button className="primary-welcome-button" type="button" onClick={onStartProject}>Tạo dự án đầu tiên <ArrowRightIcon weight="bold" /></button>
              <button className="secondary-welcome-button" type="button" onClick={onUseSample}><PlayIcon weight="fill" /> Thử với dự án mẫu</button>
            </div>
            <div className="welcome-steps">
              {[
                [FilePdfIcon, "01", "Tải tài liệu", "PDF hoặc nhiều ảnh"],
                [PencilLineIcon, "02", "Đặt chú thích", "Kéo thả ngay trên trang"],
                [FilmSlateIcon, "03", "Tạo video", "Xem thử và xuất MP4"],
              ].map(([Icon, number, title, detail]) => (
                <article key={number}>
                  <span className="welcome-step-icon"><Icon size={22} weight="duotone" /></span>
                  <span><small>{number}</small><strong>{title}</strong><em>{detail}</em></span>
                </article>
              ))}
            </div>
          </div>

          <div className="welcome-preview" aria-label="Xem trước giao diện biên tập">
            <div className="preview-window-bar"><i /><i /><i /><span>Bảng Vẽ Video · Dự án mẫu</span></div>
            <img src="/assets/editor-preview.jpg" alt="Giao diện biên tập video với bảng phân cảnh, trang tài liệu và timeline" />
            <div className="preview-note note-upload"><UploadSimpleIcon /> Tải PDF & ảnh</div>
            <div className="preview-note note-place"><PencilLineIcon /> Đặt nét vẽ trực tiếp</div>
          </div>
        </section>

        <footer className="welcome-footer"><span>Dự án được lưu trong trình duyệt của bạn</span><span>Hỗ trợ tiếng Việt · Times New Roman · Patrick Hand</span></footer>
      </main>
    );
  }

  return (
    <main className="setup-shell">
      <input ref={documentInput} hidden type="file" multiple accept={ACCEPT_DOCUMENTS} onChange={(event) => importDocuments(event.target.files)} />
      <input ref={subtitleInput} hidden type="file" accept=".srt,text/plain" onChange={(event) => importSubtitle(event.target.files[0])} />
      <input ref={audioInput} hidden type="file" accept="audio/*" onChange={(event) => importAudio(event.target.files[0])} />

      <header className="setup-header">
        <div className="welcome-brand"><span><PencilLineIcon size={24} weight="duotone" /></span><strong>Bảng Vẽ Video</strong></div>
        {onCancel && <button className="setup-close" type="button" onClick={onCancel}><XIcon /> {cancelLabel}</button>}
      </header>

      <section className="setup-card">
        <div className="setup-card-head">
          <div><span className="eyebrow">Dự án mới</span><h1>Chuẩn bị nội dung cho video</h1><p>Mất khoảng một phút. Bạn có thể thay đổi mọi thiết lập sau khi vào editor.</p></div>
          <SetupStepper step={step} />
        </div>

        <div className="setup-content">
          {step === 1 && (
            <section className="setup-panel">
              <div className="setup-panel-title"><span>1</span><div><h2>Chọn PDF hoặc hình ảnh</h2><p>Đây sẽ là nền cho các cảnh trong video của bạn.</p></div></div>
              <div
                className={`document-dropzone ${pages.length ? "has-pages" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); importDocuments(event.dataTransfer.files); }}
              >
                {pages.length ? (
                  <>
                    <div className="uploaded-summary"><span className="uploaded-icon"><CheckCircleIcon size={28} weight="fill" /></span><div><strong>Đã sẵn sàng {pages.length} trang</strong><small>{documentFiles.map((file) => file.name).join(", ")}</small></div><button type="button" onClick={() => documentInput.current?.click()}>Chọn lại</button></div>
                    <div className="page-preview-grid">{pages.slice(0, 6).map((page, index) => <figure key={`${page.slice(-24)}-${index}`}><img src={page} alt={`Trang ${index + 1}`} /><figcaption>Trang {index + 1}</figcaption></figure>)}{pages.length > 6 && <div className="more-pages">+{pages.length - 6}<small>trang khác</small></div>}</div>
                  </>
                ) : (
                  <>
                    <span className="dropzone-icon"><ImagesSquareIcon size={38} weight="duotone" /></span>
                    <h3>Kéo PDF hoặc ảnh vào đây</h3>
                    <p>Có thể chọn một PDF nhiều trang hoặc nhiều ảnh cùng lúc.</p>
                    <button type="button" onClick={() => documentInput.current?.click()}><UploadSimpleIcon weight="bold" /> Chọn PDF / ảnh</button>
                    <small>PDF, PNG, JPG, WebP · tự động căn khung dọc 9:16</small>
                  </>
                )}
                {busy && <div className="dropzone-busy"><span className="spinner" /> Đang xử lý tài liệu…</div>}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="setup-panel">
              <div className="setup-panel-title"><span>2</span><div><h2>Thêm phụ đề và thuyết minh</h2><p>Hai mục này không bắt buộc. Bạn có thể thêm sau trong editor.</p></div></div>
              <div className="optional-assets">
                <UploadAssetCard Icon={SubtitlesIcon} title="Phụ đề SRT" detail="Canh nội dung theo lời thoại" filename={subtitleName} onClick={() => subtitleInput.current?.click()} />
                <UploadAssetCard Icon={MusicNotesIcon} title="Âm thanh" detail="MP3, WAV, M4A hoặc định dạng trình duyệt hỗ trợ" filename={audioAsset?.name} onClick={() => audioInput.current?.click()} />
              </div>
              <div className="optional-tip"><CheckCircleIcon weight="duotone" /><span><strong>Có thể bỏ qua bước này.</strong> Video vẫn render bình thường nếu không có SRT hoặc âm thanh.</span></div>
            </section>
          )}

          {step === 3 && (
            <section className="setup-panel">
              <div className="setup-panel-title"><span>3</span><div><h2>Đặt tên và thời lượng mặc định</h2><p>Mỗi trang sẽ trở thành một cảnh riêng trong storyboard.</p></div></div>
              <div className="project-form">
                <label><span>Tên dự án</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Ví dụ: Giới thiệu sản phẩm" /></label>
                <label><span>Thời lượng mỗi cảnh</span><div className="duration-input"><input type="number" min="1" max="3600" value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} /><em>giây</em></div><small>Có thể chỉnh riêng từng cảnh, tối đa 60 phút.</small></label>
                <div className="format-summary"><span className="format-ratio">9:16</span><div><strong>Video dọc · 720 × 1280</strong><small>{pages.length} cảnh · khoảng {Math.round(pages.length * Number(durationSeconds || 0))} giây trước khi thêm chuyển cảnh</small></div><CheckCircleIcon weight="fill" /></div>
              </div>
            </section>
          )}
          {error && <p className="setup-error setup-global-error">{error}</p>}
        </div>

        <footer className="setup-actions">
          <button className="setup-back" type="button" onClick={() => step === 1 ? onCancel?.() : setStep((value) => value - 1)}><ArrowLeftIcon /> {step === 1 ? "Quay lại" : "Bước trước"}</button>
          <span>{step === 1 ? "Tài liệu được xử lý ngay trên máy của bạn" : step === 2 ? "Phụ đề và âm thanh là tùy chọn" : "Sẵn sàng để bắt đầu biên tập"}</span>
          {step < 3 ? <button className="setup-next" type="button" disabled={step === 1 && !pages.length} onClick={() => setStep((value) => value + 1)}>Tiếp tục <ArrowRightIcon weight="bold" /></button> : <button className="setup-next" type="button" disabled={!pages.length || busy} onClick={finishSetup}>{busy ? "Đang tạo dự án…" : "Tạo dự án & mở editor"} <ArrowRightIcon weight="bold" /></button>}
        </footer>
      </section>
    </main>
  );
}
