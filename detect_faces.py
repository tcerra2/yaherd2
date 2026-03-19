#!/usr/bin/env python3
import json
import os
import sys
import tempfile
import urllib.request
import warnings
from pathlib import Path

import numpy as np
from PIL import Image

warnings.filterwarnings('ignore')

try:
    from ultralytics import YOLO
except ImportError as error:
    print(f'Error importing ultralytics: {error}', file=sys.stderr)
    sys.exit(1)


def write_output(output_path, faces, success=True, error_message=None):
    payload = {
        'faces': faces,
        'count': len(faces),
        'success': success,
    }
    if error_message:
        payload['error'] = error_message
    Path(output_path).write_text(json.dumps(payload), encoding='utf-8')


def parse_confidence(argv):
    if len(argv) > 4:
        try:
            return float(argv[4])
        except ValueError as error:
            raise ValueError(f'Invalid confidence value: {argv[4]}') from error
    return 0.35


def ensure_model_exists(model_path):
    if model_path.exists():
        return model_path

    model_path.parent.mkdir(parents=True, exist_ok=True)

    configured_url = os.environ.get('FACE_MODEL_URL')
    default_url = 'https://raw.githubusercontent.com/tcerra2/yaherd2/main/yolov8n-face.pt'
    candidate_urls = [url for url in [configured_url, default_url] if url]

    last_error = None
    for url in candidate_urls:
        try:
            print(f'Downloading face model from: {url}', file=sys.stderr)
            with urllib.request.urlopen(url, timeout=120) as response:
                if response.status != 200:
                    raise RuntimeError(f'Unexpected HTTP status {response.status}')

                with tempfile.NamedTemporaryFile(delete=False, suffix='.pt', dir=str(model_path.parent)) as temp_file:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        temp_file.write(chunk)
                    temp_name = temp_file.name

            Path(temp_name).replace(model_path)
            print(f'Face model downloaded to: {model_path}', file=sys.stderr)
            return model_path
        except Exception as error:
            last_error = error
            print(f'Failed to download model from {url}: {error}', file=sys.stderr)

    raise FileNotFoundError(
        f'Model not found: {model_path}. Attempted download URLs: {candidate_urls}. '
        f'Last error: {last_error}'
    )


def main():
    if len(sys.argv) < 3:
        print('Usage: python detect_faces.py <image_path> <output_json_path> [model_path] [confidence]', file=sys.stderr)
        return 1

    image_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    model_path = Path(sys.argv[3]) if len(sys.argv) > 3 else Path('yolov8n-face.pt')
    confidence_threshold = parse_confidence(sys.argv)

    try:
        if not image_path.exists():
            raise FileNotFoundError(f'Image not found: {image_path}')

        model_path = ensure_model_exists(model_path)

        with Image.open(image_path) as source_image:
            image = np.array(source_image.convert('RGB'))

        if image.size == 0:
            raise ValueError(f'Could not read image: {image_path}')

        model = YOLO(str(model_path))
        results = model.predict(source=image, conf=confidence_threshold, save=False, verbose=False)

        faces = []
        if results:
            result = results[0]
            if getattr(result, 'boxes', None) is not None:
                for box in result.boxes:
                    coords = box.xyxy[0].tolist()
                    confidence = float(box.conf[0].item())
                    x1, y1, x2, y2 = [float(value) for value in coords]
                    faces.append({
                        'x1': x1,
                        'y1': y1,
                        'x2': x2,
                        'y2': y2,
                        'width': x2 - x1,
                        'height': y2 - y1,
                        'confidence': confidence,
                    })

        print(f'Face detections: {len(faces)}', file=sys.stderr)
        write_output(output_path, faces)
        return 0
    except Exception as error:
        print(f'Error in detect_faces: {error}', file=sys.stderr)
        write_output(output_path, [], success=False, error_message=str(error))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
