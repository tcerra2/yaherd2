#!/usr/bin/env python3
"""Minimal YOLO face detection worker."""

import sys
import json
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

try:
    from ultralytics import YOLO
except ImportError:
    print("[]")
    print("ultralytics is not installed", file=sys.stderr)
    sys.exit(1)

MODEL = None


def log(message: str) -> None:
    print(f'[face-worker] {message}', file=sys.stderr, flush=True)


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def resolve_model_path() -> Path | None:
    candidates = [
        Path(__file__).resolve().parent / 'yolov8n-face.pt',
        Path(__file__).resolve().parent.parent / 'yolov8n-face.pt',
        Path(__file__).resolve().parent.parent.parent / 'yolov8n-face.pt',
    ]

    env_model_path = os.getenv('FACE_MODEL_PATH')
    env_path = Path(env_model_path).expanduser().resolve() if env_model_path else None
    if env_path is not None:
        candidates.insert(0, env_path)

    for candidate in candidates:
        if candidate.exists():
            log(f'Using face model at {candidate}')
            return candidate

    log(f'No face model found. Candidates checked: {", ".join(str(candidate) for candidate in candidates)}')
    return None


def get_model():
    global MODEL

    if MODEL is not None:
        return MODEL

    model_path = resolve_model_path()
    if model_path is None:
        if env_flag('FACE_MODEL_ALLOW_DOWNLOAD'):
            log('FACE_MODEL_ALLOW_DOWNLOAD enabled; loading yolov8n-face.pt via Ultralytics download path')
            MODEL = YOLO('yolov8n-face.pt', task='detect')
            return MODEL

        raise FileNotFoundError('yolov8n-face.pt was not found. Set FACE_MODEL_PATH, place the model in the repo, or enable FACE_MODEL_ALLOW_DOWNLOAD.')

    log(f'Loading YOLO face model from {model_path}')
    MODEL = YOLO(str(model_path), task='detect')
    log('YOLO face model loaded successfully')
    return MODEL


def detect_faces(image_path: Path):
    log(f'Running face detection for {image_path}')
    model = get_model()
    results = model(str(image_path), conf=0.25, imgsz=640, verbose=False)
    faces = []

    if not results:
        return faces

    result = results[0]
    if result.boxes is None:
        return faces

    for box in result.boxes:
        xyxy = box.xyxy[0].tolist()
        confidence = float(box.conf[0])
        faces.append({
            'x1': xyxy[0],
            'y1': xyxy[1],
            'x2': xyxy[2],
            'y2': xyxy[3],
            'confidence': confidence,
            'width': xyxy[2] - xyxy[0],
            'height': xyxy[3] - xyxy[1],
        })

    return faces


def run_worker() -> int:
    log(f'Worker booting with python={sys.executable}')
    log(f'FACE_MODEL_PATH={os.getenv("FACE_MODEL_PATH", "<unset>")} FACE_MODEL_ALLOW_DOWNLOAD={os.getenv("FACE_MODEL_ALLOW_DOWNLOAD", "<unset>")} FACE_MODEL_PRELOAD={os.getenv("FACE_MODEL_PRELOAD", "<unset>")}')
    if env_flag('FACE_MODEL_PRELOAD', True):
        try:
            log('Preloading face model on worker startup')
            get_model()
        except Exception as exc:
            log(f'Face worker preload error: {exc}')

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        job_id = None

        try:
            payload = json.loads(line)
            job_id = payload.get('id')
            image_path = Path(payload['imagePath']).expanduser().resolve()
            log(f'Received job {job_id} for image {image_path}')

            if not image_path.exists():
                raise FileNotFoundError(f'Image file not found: {image_path}')

            response = {'id': job_id, 'faces': detect_faces(image_path)}
        except Exception as exc:
            response = {'id': job_id, 'faces': [], 'error': str(exc)}
            log(f'Face worker error for job {job_id}: {exc}')

        print(json.dumps(response), flush=True)

    log('Worker stdin closed; exiting')

    return 0

if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == '--worker':
        sys.exit(run_worker())

    if len(sys.argv) < 2:
        print("[]")
        print("Usage: python detect_faces.py <image_path> [model_path]", file=sys.stderr)
        sys.exit(1)

    image_path = Path(sys.argv[1]).expanduser().resolve()

    if not image_path.exists():
        print("[]")
        print(f"Image file not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    try:
        print(json.dumps(detect_faces(image_path)))
        sys.exit(0)
    except Exception as exc:
        print("[]")
        print(f"Face detection error: {exc}", file=sys.stderr)
        sys.exit(1)
