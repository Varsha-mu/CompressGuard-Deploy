
import os
import base64
import tempfile
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import hf_hub_download

# --------------------------------------------------
# Configuration
# --------------------------------------------------

REPO_ID = "Varshaa007/compressguard-xceptionnet"
MODEL_FILENAME = "compressguard_xception_inference.keras"
MODEL_PATH = Path(__file__).parent / MODEL_FILENAME

IMG_SIZE = 224
MAX_VIDEO_SIZE = 500 * 1024 * 1024
FRAMES_TO_SAMPLE = 4

# Your exported model should accept one RGB frame
# with pixel values in the range [0, 255].
# Xception preprocessing is expected to be included
# in the saved inference model.

app = FastAPI(title="CompressGuard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://compressguard.vercel.app",
        "https://compressguard-mzbjqwy2t-varsha-f384.vercel.app",
        "https://compressguard-git-main-varsha-f384.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None


@app.on_event("startup")
def load_model():
    global model

    token = os.getenv("HF_TOKEN")

    if not MODEL_PATH.exists():
        downloaded_path = hf_hub_download(
            repo_id=REPO_ID,
            filename=MODEL_FILENAME,
            token=token,
        )
        MODEL_PATH.write_bytes(Path(downloaded_path).read_bytes())

    model = tf.keras.models.load_model(
        str(MODEL_PATH),
        compile=False,
    )

    if len(model.inputs) != 1:
        raise RuntimeError(
            "Expected a single-frame inference model, "
            "but the loaded model has multiple inputs."
        )

    print("CompressGuard model loaded:", MODEL_PATH)
    print("Input shape:", model.input_shape)


@app.get("/api/health")
def health():
    return {
        "status": "online",
        "model_loaded": model is not None,
        "model_name": "XceptionNet",
    }


def encode_frame(frame):
    ok, buffer = cv2.imencode(".jpg", frame)
    if not ok:
        return None

    return base64.b64encode(buffer).decode("utf-8")


@app.post("/api/analyze")
async def analyze_video(video: UploadFile = File(...)):
    if model is None:
        raise HTTPException(503, "Model is not loaded.")

    filename = video.filename or "uploaded_video.mp4"
    suffix = Path(filename).suffix.lower()

    if suffix not in {".mp4", ".avi", ".mov", ".mkv", ".webm"}:
        raise HTTPException(400, "Upload a supported video file.")

    content = await video.read(MAX_VIDEO_SIZE + 1)

    if not content:
        raise HTTPException(400, "The uploaded video is empty.")

    if len(content) > MAX_VIDEO_SIZE:
        raise HTTPException(413, "Maximum video size is 500 MB.")

    temp_path = None
    capture = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=suffix, delete=False
        ) as temp:
            temp.write(content)
            temp_path = temp.name

        capture = cv2.VideoCapture(temp_path)

        if not capture.isOpened():
            raise HTTPException(
                400,
                "Could not read this video. Try another file."
            )

        total_frames = int(
            capture.get(cv2.CAP_PROP_FRAME_COUNT)
        )

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)

        if total_frames <= 0:
            raise HTTPException(400, "Video contains no readable frames.")

        sample_count = min(FRAMES_TO_SAMPLE, total_frames)
        frame_positions = np.linspace(
            0, total_frames - 1, sample_count, dtype=int
        )

        frames = []
        batch = []

        for position in frame_positions:
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(position))
            ok, bgr = capture.read()

            if not ok:
                continue

            # Match the training pipeline:
            # BGR -> RGB -> resize to 224 x 224.
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            resized = cv2.resize(rgb, (IMG_SIZE, IMG_SIZE))

            batch.append(resized.astype(np.float32))
            frames.append({
                "frame_number": int(position),
                "image": encode_frame(bgr),
            })

        if not batch:
            raise HTTPException(400, "No frames could be extracted.")

        predictions = []

        for frame in batch:
            frame_input = np.expand_dims(frame, axis=0)
            prediction = model.predict(frame_input, verbose=0).reshape(-1)
            predictions.append(float(prediction[0]))

        predictions = np.array(predictions, dtype=np.float32)

        results = []

        for frame, probability in zip(frames, predictions):
            probability = float(np.clip(probability, 0, 1))

            results.append({
                "frame_number": frame["frame_number"],
                "image": frame["image"],
                "prediction": "fake" if probability >= 0.5 else "real",
                "fake_probability": round(probability, 4),
                "confidence": round(
                    max(probability, 1 - probability), 4
                ),
            })

        mean_fake_probability = float(
            np.mean(predictions)
        )

        overall = (
            "fake" if mean_fake_probability >= 0.5 else "real"
        )

        return {
            "filename": filename,
            "total_video_frames": total_frames,
            "fps": round(fps, 2),
            "sampled_frames": len(results),
            "overall_prediction": overall,
            "fake_probability": round(mean_fake_probability, 4),
            "confidence": round(
                max(mean_fake_probability, 1 - mean_fake_probability),
                4,
            ),
            "results": results,
            "note": (
                "Predictions are model estimates, not a mathematical "
                "certification of robustness or authenticity."
            ),
        }

    finally:
        if capture is not None:
            capture.release()

        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

        await video.close()
