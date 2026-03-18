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
    let responseSent = false;
    let tempFile = null;
    let outputFile = null;
    let processTimeout = null;

    try {
        const { image } = req.body;
        
        if (!image) {
            return res.json({ faces: [], error: 'No image provided' });
        }
        
        // Convert base64 to temporary file with unique ID to prevent collisions
        const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
        const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        tempFile = path.join(os.tmpdir(), `face_detect_${uniqueId}.jpg`);
        outputFile = path.join(os.tmpdir(), `face_results_${uniqueId}.json`);
        
        try {
            fs.writeFileSync(tempFile, Buffer.from(base64Data, 'base64'));
        } catch (err) {
            console.error('[Face Detection] Error writing temp file:', err.message);
            return res.json({ faces: [] });
        }
        
        // Get Python executable (Railway uses 'python', not 'python3')
        let pythonExe = process.env.PYTHON_EXE;
        if (!pythonExe) {
            pythonExe = process.platform === 'win32' ? 'python' : 'python3';
        }
        
        const pythonScript = path.join(__dirname, 'detect_faces.py');
        console.log(`[Face Detection] Executing: ${pythonExe} ${pythonScript}`);
        
        return new Promise((resolve) => {
            const python = spawn(pythonExe, [pythonScript, tempFile, outputFile]);
            let stderrData = '';
            let stdoutData = '';
            
            // Set timeout to kill process if it hangs
            processTimeout = setTimeout(() => {
                console.warn('[Face Detection] Process timeout - killing');
                python.kill('SIGTERM');
                setTimeout(() => python.kill('SIGKILL'), 2000);
            }, 30000);
            
            // Capture stderr to see actual errors
            python.stderr.on('data', (data) => {
                const msg = data.toString();
                stderrData += msg;
                if (msg.includes('Error') || msg.includes('ERROR') || msg.includes('error')) {
                    console.error('[Face Detection] Python error:', msg.trim());
                }
            });
            
            // Capture stdout for debugging
            python.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });
            
            python.on('close', (code) => {
                // Clear timeout
                if (processTimeout) clearTimeout(processTimeout);
                
                // Prevent sending response multiple times
                if (responseSent) {
                    cleanupFiles();
                    resolve();
                    return;
                }
                
                try {
                    if (code === 0 && fs.existsSync(outputFile)) {
                        // Success case
                        const detections = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
                        responseSent = true;
                        res.json({ faces: detections.faces || [] });
                        console.log(`[Face Detection] ✓ Found ${detections.faces?.length || 0} faces`);
                    } else {
                        // Error case - log what went wrong
                        console.error(`[Face Detection] Process exited with code: ${code}`);
                        if (stderrData) {
                            console.error('[Face Detection] Python stderr:', stderrData);
                        }
                        if (stdoutData) {
                            console.log('[Face Detection] Python stdout:', stdoutData);
                        }
                        responseSent = true;
                        res.json({ faces: [] });
                    }
                } catch (err) {
                    console.error('[Face Detection] Parse error:', err.message);
                    if (!responseSent) {
                        responseSent = true;
                        res.json({ faces: [] });
                    }
                } finally {
                    cleanupFiles();
                    resolve();
                }
            });
            
            python.on('error', (err) => {
                // Clear timeout
                if (processTimeout) clearTimeout(processTimeout);
                
                console.error('[Face Detection] Process spawn error:', err.message);
                console.error('[Face Detection] Tried to execute:', pythonExe);
                console.error('[Face Detection] Check if Python is installed: Run "python --version"');
                
                if (!responseSent) {
                    responseSent = true;
                    res.json({ faces: [] });
                }
                cleanupFiles();
                resolve();
            });
            
            // Helper to cleanup temp files
            function cleanupFiles() {
                try {
                    if (tempFile && fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                    if (outputFile && fs.existsSync(outputFile)) {
                        fs.unlinkSync(outputFile);
                    }
                } catch (e) {
                    console.warn('[Face Detection] Cleanup error:', e.message);
                }
            }
        });
    } catch (err) {
        console.error('[Face Detection] Endpoint error:', err.message);
        if (!responseSent) {
            responseSent = true;
            res.json({ faces: [] });
        }
    }
});

// Start server - listen on all interfaces for Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 YOLO Tracking app running on port ${PORT}`);
    console.log('✓ Object detection: Client-side (TensorFlow.js COCO-SSD)');
    console.log('✓ Face detection: Server-side (YOLOv8n-face) - parallel processing');
});
