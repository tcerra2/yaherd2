#!/usr/bin/env python3
"""Test the face detection API endpoint"""

import requests
import base64
import json
from PIL import Image
import io

# Create a simple test image (100x100 white)
img = Image.new('RGB', (100, 100), color='white')
img_bytes = io.BytesIO()
img.save(img_bytes, format='JPEG', quality=70)
img_bytes.seek(0)
base64_str = base64.b64encode(img_bytes.read()).decode()

# Call the API
print("Testing face detection API...")
data = {'image': f'data:image/jpeg;base64,{base64_str}'}
try:
    response = requests.post('http://localhost:3000/api/detect-faces', json=data, timeout=30)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
