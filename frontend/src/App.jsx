import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  FileVideo,
  Fingerprint,
  Gauge,
  Image as ImageIcon,
  LoaderCircle,
  ShieldCheck,
  Upload,
  Video,
  X,
} from "lucide-react";
import "./App.css";

// Use the Vercel environment variable in production.
// Fall back to the local FastAPI server during development.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

function App() {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [backendStatus, setBackendStatus] = useState("checking");

  // Check whether the backend and model are available.
  useEffect(() => {
    let active = true;

    async function checkBackend() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`);

        if (!response.ok) {
          throw new Error("Backend health check failed.");
        }

        const data = await response.json();

        if (active) {
          setBackendStatus(
            data.status === "online" && data.model_loaded
              ? "online"
              : "offline"
          );
        }
      } catch (err) {
        console.error("Backend connection failed:", err);

        if (active) {
          setBackendStatus("offline");
        }
      }
    }

    checkBackend();

    return () => {
      active = false;
    };
  }, []);

  // Create and clean up the video preview URL.
  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(selectedFile) {
    setError("");
    setResults(null);

    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("video/")) {
      setError("Please select a video file.");
      return;
    }

    if (selectedFile.size > 500 * 1024 * 1024) {
      setError("The maximum video size is 500 MB.");
      return;
    }

    setFile(selectedFile);
  }

  async function analyzeVideo() {
    if (!file) {
      setError("Upload a video before starting detection.");
      return;
    }

    setLoading(true);
    setError("");
    setResults(null);

    try {
      const formData = new FormData();
      formData.append("video", file);

      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Video analysis failed (${response.status}).`
        );
      }

      setResults(data);
    } catch (err) {
      console.error("Video analysis failed:", err);

      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to the backend. Check the backend status and CORS configuration, then try again."
          : err.message || "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  function clearVideo() {
    setFile(null);
    setResults(null);
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const frames = results?.results || [];
  const prediction = results?.overall_prediction?.toUpperCase() || "UNKNOWN";
  const isFake = prediction === "FAKE";
  const confidence = Number(results?.confidence ?? 0);

  const confidencePercent = Number.isFinite(confidence)
    ? Math.max(0, Math.min(100, confidence <= 1 ? confidence * 100 : confidence))
    : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="CompressGuard home">
          <div className="brand-icon">
            <ShieldCheck size={24} />
          </div>
          <div>
            <span className="brand-name">CompressGuard</span>
            <span className="brand-caption">VIDEO FORENSICS</span>
          </div>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <a className="nav-item active" href="#detector">
          <Fingerprint size={18} />
          <span>Deepfake detector</span>
        </a>

        <a className="nav-item" href="#results">
          <Activity size={18} />
          <span>Analysis results</span>
        </a>

        <div className="sidebar-bottom">
          <div className="status-card">
            <span
              className={`status-dot ${
                backendStatus === "online"
                  ? "dot-online"
                  : backendStatus === "offline"
                  ? "dot-offline"
                  : ""
              }`}
            />

            <div>
              <strong>
                {backendStatus === "online"
                  ? "Backend connected"
                  : backendStatus === "offline"
                  ? "Backend offline"
                  : "Checking backend"}
              </strong>

              <p>
                {backendStatus === "online"
                  ? "Model loaded and ready"
                  : "FastAPI · deployed service"}
              </p>
            </div>
          </div>

          <p className="sidebar-footnote">
            CompressGuard · Research prototype
          </p>
        </div>
      </aside>

      <main className="main-content" id="home">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Deepfake detector</strong>
          </div>

          <div className="topbar-right">
            <span className="model-chip">
              <span className="mini-dot" />
              XceptionNet
            </span>
            <span className="version-label">Research model</span>
          </div>
        </header>

        <section className="page-heading" id="detector">
          <div>
            <div className="eyebrow">VIDEO AUTHENTICITY ANALYSIS</div>
            <h1>Deepfake Detector</h1>
            <p>
              Upload a video to inspect sampled frames and evaluate whether
              the content appears real or manipulated.
            </p>
          </div>

          <div className="heading-icon">
            <Fingerprint size={30} />
          </div>
        </section>

        <section className="metrics-grid" aria-label="Analysis overview">
          <div className="metric-card">
            <div className="metric-top">
              <span>Detection model</span>
              <Gauge size={19} />
            </div>
            <strong>XceptionNet</strong>
            <p>Saved classification model</p>
          </div>

          <div className="metric-card">
            <div className="metric-top">
              <span>Input type</span>
              <Video size={19} />
            </div>
            <strong>Video</strong>
            <p>Sampled frames analyzed</p>
          </div>

          <div className="metric-card">
            <div className="metric-top">
              <span>API status</span>
              <Activity size={19} />
            </div>
            <strong
              className={backendStatus === "online" ? "online-text" : ""}
            >
              {backendStatus === "online"
                ? "Connected"
                : backendStatus === "checking"
                ? "Checking"
                : "Offline"}
            </strong>
            <p>FastAPI connection</p>
          </div>
        </section>

        <section className="content-grid">
          <div className="panel upload-panel">
            <div className="panel-heading">
              <div className="panel-title-icon">
                <Upload size={19} />
              </div>
              <div>
                <h2>Upload video</h2>
                <p>Select a video for frame extraction and analysis.</p>
              </div>
            </div>

            {!file ? (
              <div
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  selectFile(event.dataTransfer.files?.[0]);
                }}
              >
                <div className="upload-illustration">
                  <FileVideo size={30} />
                </div>

                <h3>Drop your video here</h3>
                <p>or browse files from your computer</p>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} /> Choose video
                </button>

                <span className="file-hint">
                  Video files · Maximum 500 MB
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(event) =>
                    selectFile(event.target.files?.[0])
                  }
                />
              </div>
            ) : (
              <div className="selected-file">
                <video
                  className="video-preview"
                  src={previewUrl}
                  controls
                  preload="metadata"
                />

                <div className="file-details">
                  <FileVideo size={20} />

                  <div className="file-name-wrap">
                    <strong title={file.name}>{file.name}</strong>
                    <span>
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>

                  <button
                    type="button"
                    className="icon-button"
                    onClick={clearVideo}
                    aria-label="Remove video"
                    title="Remove video"
                  >
                    <X size={18} />
                  </button>
                </div>

                <button
                  type="button"
                  className="primary-button analyze-button"
                  onClick={analyzeVideo}
                  disabled={loading || backendStatus !== "online"}
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="spin" size={18} />
                      Analyzing video...
                    </>
                  ) : (
                    <>
                      <Fingerprint size={18} />
                      Analyze video
                    </>
                  )}
                </button>

                {backendStatus !== "online" && !loading && (
                  <p className="processing-note">
                    The backend is not ready yet. Wait for the API status
                    to show Connected before analyzing a video.
                  </p>
                )}

                {loading && (
                  <p className="processing-note">
                    Extracting frames and running model inference.
                    Larger videos may take longer.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="error-message" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="panel summary-panel" id="results">
            <div className="panel-heading">
              <div className="panel-title-icon">
                <Activity size={19} />
              </div>
              <div>
                <h2>Detection summary</h2>
                <p>Video-level classification result</p>
              </div>
            </div>

            {!results ? (
              <div className="empty-summary">
                <div className="empty-icon">
                  <CircleHelp size={27} />
                </div>

                <h3>Waiting for analysis</h3>
                <p>
                  Your video-level result and frame statistics will appear
                  here after a successful backend response.
                </p>

                <div className="summary-placeholder">
                  <span>Prediction</span>
                  <strong>—</strong>
                </div>

                <div className="summary-placeholder">
                  <span>Frames analyzed</span>
                  <strong>—</strong>
                </div>
              </div>
            ) : (
              <div className="result-summary">
                <div
                  className={`prediction-banner ${
                    isFake ? "fake" : "real"
                  }`}
                >
                  {isFake ? (
                    <AlertCircle size={25} />
                  ) : (
                    <CheckCircle2 size={25} />
                  )}

                  <div>
                    <span>VIDEO CLASSIFICATION</span>
                    <strong>{prediction}</strong>
                  </div>
                </div>

                <div className="confidence-heading">
                  <span>Model confidence</span>
                  <strong>{confidencePercent.toFixed(1)}%</strong>
                </div>

                <div className="confidence-track">
                  <div
                    className={`confidence-fill ${
                      isFake ? "fake" : "real"
                    }`}
                    style={{ width: `${confidencePercent}%` }}
                  />
                </div>

                <div className="summary-placeholder">
                  <span>Frames analyzed</span>
                  <strong>{frames.length}</strong>
                </div>

                <p className="disclaimer">
                  This is a model prediction, not definitive proof of
                  authenticity. Confidence is not a certified robustness
                  guarantee.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="panel frames-panel">
          <div className="frames-header">
            <div className="panel-heading">
              <div className="panel-title-icon">
                <ImageIcon size={19} />
              </div>
              <div>
                <h2>Extracted frames</h2>
                <p>Sampled frames with individual model predictions</p>
              </div>
            </div>

            <span className="frame-count">{frames.length} frames</span>
          </div>

          {frames.length === 0 ? (
            <div className="empty-frames">
              <ImageIcon size={27} />
              <strong>No frames to display</strong>
              <span>
                Upload and analyze a video to see the extracted frames.
              </span>
            </div>
          ) : (
            <div className="frames-grid">
              {frames.map((frame, index) => {
                const label = String(
                  frame.prediction || frame.label || "UNKNOWN"
                ).toUpperCase();

                const fake = label === "FAKE";
                const score = Number(frame.confidence);

                const frameNumber =
                  frame.frame_number ?? frame.frame_index ?? index + 1;

                return (
                  <article
                    className="frame-card"
                    key={`${frameNumber}-${index}`}
                  >
                    <div className="frame-image-wrap">
                      {frame.image ? (
                        <img
                          src={
                            frame.image.startsWith("data:") ||
                            frame.image.startsWith("http")
                              ? frame.image
                              : `data:image/jpeg;base64,${frame.image}`
                          }
                          alt={`Extracted frame ${frameNumber}`}
                        />
                      ) : (
                        <div className="frame-image-missing">
                          <ImageIcon size={28} />
                          <span>Frame preview unavailable</span>
                        </div>
                      )}

                      <span className="frame-number">
                        Frame {frameNumber}
                      </span>
                    </div>

                    <div className="frame-card-info">
                      <span
                        className={`label-pill ${fake ? "fake" : "real"}`}
                      >
                        {label}
                      </span>

                      <div className="frame-confidence">
                        <span>Confidence</span>
                        <strong>
                          {Number.isFinite(score)
                            ? `${
                                (score <= 1 ? score * 100 : score).toFixed(1)
                              }%`
                            : "N/A"}
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="page-footer">
          <span>CompressGuard</span>
          <span>Deepfake detection under video compression</span>
        </footer>
      </main>
    </div>
  );
}

export default App;