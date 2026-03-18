#!/usr/bin/env python3
"""
YOLOv8n-face detection script
Processes a single image and returns face detections as JSON
Used by server.js /api/detect-faces endpoint
Pattern from: https://medium.com/@yunusgurguz11/step-by-step-face-detection-and-recognition-with-yolov8-part-1-eb6f52972107
"""

import sys
import json
import cv2
from pathlib import Path
import warnings

# Suppress all warnings during imports
warnings.filterwarnings("ignore")

try:
    from ultralytics import YOLO
except ImportError:
    print("Error: ultralytics not installed. Install with: pip install ultralytics", file=sys.stderr)
    sys.exit(1)


def detect_faces(image_path, output_path, model_path='yolov8n-face.pt', conf=0.5):
    """
    Detect faces in an image using YOLOv8n-face
    
    Args:
        image_path: Path to input image
        output_path: Path to write JSON results
        model_path: Path to YOLOv8 face model
        conf: Confidence threshold (0-1)
    """
    
    try:
        # Load model
        model = YOLO(model_path)
        
        # Read image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        # Run inference
        results = model.predict(source=image, conf=conf, save=False, verbose=False)
        
        # Extract face boxes from results
        faces = []
        if results and len(results) > 0:
            result = results[0]
            if hasattr(result, 'boxes') and result.boxes is not None:
                for box in result.boxes:
                    try:
                        # Get coordinates [x1, y1, x2, y2]
                        xyxy = box.xyxy[0].cpu().numpy().tolist()
                        x1, y1, x2, y2 = xyxy
                        
                        # Get confidence
                        conf_score = float(box.conf[0].cpu().numpy())
                        
                        faces.append({
                            'x1': float(x1),
                            'y1': float(y1),
                            'x2': float(x2),
                            'y2': float(y2),
                            'width': float(x2 - x1),
                            'height': float(y2 - y1),
                            'confidence': conf_score
                        })
                    except Exception as e:
                        print(f"Error processing box: {e}", file=sys.stderr)
                        continue
        
        # Write results to output file
        output_data = {
            'faces': faces,
            'count': len(faces),
            'success': True
        }
        
        Path(output_path).write_text(json.dumps(output_data, indent=2))
        
    except Exception as e:
        print(f"Error in detect_faces: {e}", file=sys.stderr)
        # Write error result
        output_data = {
            'faces': [],
            'count': 0,
            'success': False,
            'error': str(e)
        }
        Path(output_path).write_text(json.dumps(output_data, indent=2))
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python detect_faces.py <image_path> <output_json_path> [model_path]", file=sys.stderr)
        sys.exit(1)
    
    image_path = sys.argv[1]
    output_path = sys.argv[2]
    model_path = sys.argv[3] if len(sys.argv) > 3 else 'yolov8n-face.pt'
    
    detect_faces(image_path, output_path, model_path, conf=0.5)
