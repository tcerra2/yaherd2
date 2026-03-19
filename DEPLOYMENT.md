# 🎯 YOLO Object Tracking - Client-Side Web App

Real-time object tracking using your device's camera. All processing happens **100% on the client-side** - no data is sent to the server!

## ✨ Features

- ✅ **Real-time object detection** using TensorFlow.js
- ✅ **Client-side tracking** - all processing happens on your device
- ✅ **No data uploads** - your camera feed never leaves your computer
- ✅ **Fast performance** - runs efficiently in the browser
- ✅ **Simple UI** - Just hit Start/Stop buttons
- ✅ **Live statistics** - FPS, detections, tracked objects

## 🚀 Deploy to Railway

This app now has two runtime pieces:
- Node.js for the web server and browser app
- Python for the optional YOLO face-detection sidecar

Railway therefore needs to install both `package.json` dependencies and `requirements.txt`. The repository includes `nixpacks.toml` so Railway can build both runtimes and still start the app with `node server.js`.

Railway is a modern platform for deploying web applications. This project can be deployed there in just a few clicks!

### Prerequisites
- GitHub account
- Railway account (free tier available at https://railway.app)

### Deployment Steps

#### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "YOLO tracking app"
git remote add origin https://github.com/YOUR_USERNAME/yolo-tracking.git
git branch -M main
git push -u origin main
```

#### Step 2: Deploy on Railway

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub"**
4. Connect your GitHub account and select the repository
5. Railway will detect `nixpacks.toml`, install Node.js + Python dependencies, and then start `node server.js`

#### Step 3: Access Your App

Once deployed, Railway will give you a URL like: `https://yolo-tracking-production.up.railway.app`

Visit that URL and you're done! 🎉

### Local Testing

Before deploying, test locally:

```bash
npm install
pip install -r requirements.txt
npm start
```

Then open http://localhost:3000 in your browser.

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         User's Browser                  │
│  ┌─────────────────────────────────┐   │
│  │  HTML/CSS/JavaScript            │   │
│  │  • TensorFlow.js                │   │
│  │  • COCO-SSD Model               │   │
│  │  • Tracking Algorithm           │   │
│  │  • Canvas Rendering             │   │
│  └─────────────────────────────────┘   │
│             ⬆️  ⬇️                       │
│         User's Camera                   │
└─────────────────────────────────────────┘
            ⬆️ ONLY HTML/CSS/JS ⬇️
         (Model loaded from CDN)
┌─────────────────────────────────────────┐
│      Railway Server                     │
│  ┌─────────────────────────────────┐   │
│  │  Express.js + Python Worker     │   │
│  │  • Serves app.html              │   │
│  │  • Static file serving          │   │
│  │  • Health check endpoint        │   │
│  │  • Face detection sidecar       │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Key Point**: Object detection and tracking stay in the browser. The server is only needed for static hosting, health checks, and the optional face-detection sidecar.

## 📊 How It Works

1. **User opens the web app** → Browser downloads HTML + TensorFlow.js library
2. **User clicks "Start Tracking"** → YOLO model is downloaded to device (one-time)
3. **Camera access requested** → User grants permission
4. **Real-time processing** → 
   - Captures frames from webcam
   - Runs object detection (TensorFlow.js)
   - Performs centroid-based tracking
   - Renders results on canvas
5. **User clicks "Stop Tracking"** → Stops camera and clears canvas

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **ML Framework**: TensorFlow.js
- **Object Detection**: COCO-SSD pre-trained model
- **Tracking**: Custom centroid-based tracking algorithm
- **Backend**: Express.js (Node.js)
- **Hosting**: Railway

## 📱 Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ⚠️ Mobile browsers (may be slower depending on device)

## ⚙️ Customization

### Change Detection Model

The app currently uses COCO-SSD. To use a faster version:

Edit `app.html` and replace:
```javascript
model = await cocoSsd.load();
```

With other TensorFlow.js models from: https://github.com/tensorflow/tfjs-models

### Adjust Tracking Parameters

In `app.html`, modify the `ObjectTracker` class:
```javascript
this.maxDistance = 50; // Increase for more lenient matching
```

## 🔐 Privacy & Security

✅ **Privacy-First Design**
- No data stored on server
- Camera feed never uploaded
- Model runs entirely locally
- No analytics or tracking

## 📝 File Structure

```
.
├── app.html           # Main web interface (client-side)
├── server.js          # Express.js server
├── package.json       # Node.js dependencies
├── Procfile           # Railway deployment config
└── README.md          # This file
```

## 🚧 Environment Variables (Optional)

If using Railway secrets:
- `PORT` - Server port (default: 3000)
- `ENABLE_FACE_DETECTION` - Set to `false` to disable the face sidecar
- `FACE_DETECTION_TIMEOUT_MS` - Max server time for one face request
- `FACE_POLL_INTERVAL_MS` - Browser polling interval for face requests
- `FACE_MODEL_PATH` - Absolute path to `yolov8n-face.pt` in production
- `FACE_MODEL_ALLOW_DOWNLOAD` - Set to `true` only if the deployed instance should download the model at runtime
- `PYTHON_EXE` - Override the Python executable if your platform uses a different name

### Face Detection Troubleshooting

- If deploy logs show `ultralytics is not installed`, Railway did not install `requirements.txt`
- If `/health` reports `workerStarted: false`, check the deploy logs for Python import or model-path errors
- If logs show `yolov8n-face.pt was not found`, add the model to the deployed app or set `FACE_MODEL_PATH`
- If requests still time out after the worker starts, raise `FACE_DETECTION_TIMEOUT_MS` to `10000` or `15000`

## 📊 Performance Tips

For best performance:
- Use a modern laptop/desktop (mobile devices may be slower)
- Use Chrome for best TensorFlow.js performance
- Ensure good lighting for better detection
- Close other browser tabs to free up resources

## 🐛 Troubleshooting

### "Model failed to load"
- Check internet connection (model downloaded from CDN)
- Clear browser cache and reload
- Try a different browser

### "Camera access denied"
- Check browser permissions for camera
- Ensure HTTPS (or localhost for testing)

### "Low FPS"
- Close other applications
- Use a faster computer
- Reduce video resolution in browser dev tools

## 📚 Resources

- [TensorFlow.js Documentation](https://www.tensorflow.org/js)
- [COCO-SSD Model](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd)
- [Railway Documentation](https://docs.railway.app)
- [Object Tracking Algorithms](https://en.wikipedia.org/wiki/Video_tracking)

## 📄 License

AGPL-3.0 (same as original BoxMOT project)

---

Made with ❤️ for real-time object tracking on any device!
