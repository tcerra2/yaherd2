const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

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

// Face detection endpoint.
// This is intentionally isolated from the client-side object tracker so it can
// fail without affecting the existing app.
app.post('/api/detect-faces', async (req, res) => {
    let tempFile = null;
    let outputFile = null;
    let timeoutId = null;
    let responseSent = false;

    const sendEmpty = () => {
        if (!responseSent) {
            responseSent = true;
            res.json({ faces: [] });
        }
    };

    const cleanup = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        try {
            if (tempFile && fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            if (outputFile && fs.existsSync(outputFile)) {
                fs.unlinkSync(outputFile);
            }
        } catch (error) {
            console.warn('[Face Detection] Cleanup error:', error.message);
        }
    };

    try {
        const { image, faceConfidence } = req.body || {};
        if (!image || typeof image !== 'string') {
            return res.status(400).json({ faces: [], error: 'No image provided' });
        }

        const base64Data = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
        const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        tempFile = path.join(os.tmpdir(), `face_input_${uniqueId}.jpg`);
        outputFile = path.join(os.tmpdir(), `face_output_${uniqueId}.json`);

        fs.writeFileSync(tempFile, Buffer.from(base64Data, 'base64'));

        const pythonExe = process.env.PYTHON_EXE || (process.platform === 'win32' ? 'python' : 'python3');
        const pythonScript = path.join(__dirname, 'detect_faces.py');
        const modelPath = path.join(__dirname, 'yolov8n-face.pt');
        const normalizedFaceConfidence = typeof faceConfidence === 'number'
            ? Math.max(0.05, Math.min(0.95, faceConfidence))
            : 0.35;

        console.log(`[Face Detection] Executing: ${pythonExe} ${pythonScript}`);
        console.log(`[Face Detection] Model path: ${modelPath}`);
        console.log(`[Face Detection] Confidence: ${normalizedFaceConfidence}`);

        const python = spawn(pythonExe, [pythonScript, tempFile, outputFile, modelPath, String(normalizedFaceConfidence)]);
        let stdoutData = '';
        let stderrData = '';

        timeoutId = setTimeout(() => {
            console.warn('[Face Detection] Timeout - terminating process');
            python.kill('SIGTERM');
            setTimeout(() => python.kill('SIGKILL'), 2000);
        }, 30000);

        python.stdout.on('data', (chunk) => {
            stdoutData += chunk.toString();
        });

        python.stderr.on('data', (chunk) => {
            stderrData += chunk.toString();
        });

        python.on('error', (error) => {
            console.error('[Face Detection] Spawn error:', error.message);
            sendEmpty();
            cleanup();
        });

        python.on('close', (code) => {
            try {
                if (code === 0 && outputFile && fs.existsSync(outputFile)) {
                    const raw = fs.readFileSync(outputFile, 'utf8');
                    const parsed = JSON.parse(raw);
                    console.log(`[Face Detection] Returned ${parsed.faces?.length || 0} faces`);
                    if (stderrData) {
                        console.log('[Face Detection] Python info:', stderrData.trim());
                    }
                    if (stdoutData) {
                        console.log('[Face Detection] Python stdout:', stdoutData.trim());
                    }
                    responseSent = true;
                    res.json({ faces: parsed.faces || [] });
                } else {
                    console.error('[Face Detection] Process exited with code:', code);
                    if (stderrData) {
                        console.error('[Face Detection] Python stderr:', stderrData.trim());
                    }
                    if (stdoutData) {
                        console.log('[Face Detection] Python stdout:', stdoutData.trim());
                    }
                    if (!responseSent) {
                        responseSent = true;
                        res.json({ faces: [], error: stderrData.trim() || `Face process exited with code ${code}` });
                    }
                }
            } catch (error) {
                console.error('[Face Detection] Response error:', error.message);
                sendEmpty();
            } finally {
                cleanup();
            }
        });
    } catch (error) {
        console.error('[Face Detection] Endpoint error:', error.message);
        sendEmpty();
        cleanup();
    }
});

// Start server - listen on all interfaces for Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 YOLO Tracking app running on port ${PORT}`);
    console.log('✓ Object tracking: client-side (COCO-SSD)');
    console.log('✓ Face endpoint: server-side and isolated until wired in the UI');
});
