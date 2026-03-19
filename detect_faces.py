#!/usr/bin/env python3
import json
import sys
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
        if not model_path.exists():
            raise FileNotFoundError(f'Model not found: {model_path}')

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
