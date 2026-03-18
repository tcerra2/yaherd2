const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Disable caching for HTML files
app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }
    next();
});

app.use(express.static('./', { index: false }));

// Routes
app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(__dirname, 'app.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'YOLO Tracking App is running' });
});

// ============================================
// FACE DETECTION ENDPOINT (YOLOv8n-face)
// ============================================
// This endpoint runs in parallel with client-side object detection
// If it fails, it doesn't affect object tracking (graceful degradation)
app.post('/api/detect-faces', async (req, res) => {
    try {
        const { image } = req.body;
        
        if (!image) {
            return res.json({ faces: [], error: 'No image provided' });
        }
        
        // Convert base64 to temporary file
        const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
        const tempFile = path.join(os.tmpdir(), `face_detect_${Date.now()}.jpg`);
        const outputFile = path.join(os.tmpdir(), `face_results_${Date.now()}.json`);
        
        try {
            fs.writeFileSync(tempFile, Buffer.from(base64Data, 'base64'));
        } catch (err) {
            console.error('[Face Detection] Error writing temp file:', err.message);
            return res.json({ faces: [] });
        }
        
        // Run YOLO face detection via Python
        const pythonScript = path.join(__dirname, 'detect_faces.py');
        const pythonExe = process.env.PYTHON_EXE || 'python3';
        
        return new Promise((resolve) => {
            const python = spawn(pythonExe, [pythonScript, tempFile, outputFile], { timeout: 30000 });
            
            let stderrData = '';
            
            python.stderr.on('data', (data) => {
                stderrData += data.toString();
            });
            
            python.on('close', (code) => {
                try {
                    if (code === 0 && fs.existsSync(outputFile)) {
                        const detections = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
                        res.json({ faces: detections.faces || [] });
                        
                        // Cleanup temp files
                        try {
                            fs.unlinkSync(tempFile);
                            fs.unlinkSync(outputFile);
                        } catch (e) { }
                    } else {
                        console.warn('[Face Detection] No results or error. Code:', code);
                        res.json({ faces: [] });
                        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    }
                } catch (err) {
                    console.error('[Face Detection] Parse error:', err.message);
                    res.json({ faces: [] });
                }
                resolve();
            });
            
            python.on('error', (err) => {
                console.error('[Face Detection] Process error:', err.message);
                res.json({ faces: [] });
                resolve();
            });
        });
    } catch (err) {
        console.error('[Face Detection] Endpoint error:', err.message);
        res.json({ faces: [] });
    }
});

// Start server - listen on all interfaces for Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 YOLO Tracking app running on port ${PORT}`);
    console.log('✓ Object detection: Client-side (TensorFlow.js COCO-SSD)');
    console.log('✓ Face detection: Server-side (YOLOv8n-face) - parallel processing');
});
