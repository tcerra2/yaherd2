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
    res.sendFile(path.join(__dirname, 'app.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'YOLO Tracking App is running' });
});

// Face detection endpoint
app.post('/api/detect-faces', async (req, res) => {
    try {
        const { image } = req.body;
        
        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }
        
        // Convert base64 to temporary file
        const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
        const tempFile = path.join(os.tmpdir(), `face_detect_${Date.now()}.jpg`);
        const outputFile = path.join(os.tmpdir(), `face_detect_${Date.now()}_results.json`);
        
        fs.writeFileSync(tempFile, Buffer.from(base64Data, 'base64'));
        
        // Run YOLO face detection via Python
        const pythonScript = path.join(__dirname, 'detect_faces.py');
        
        return new Promise((resolve) => {
            const python = spawn('python', [pythonScript, tempFile, outputFile]);
            
            python.on('close', (code) => {
                try {
                    if (code === 0 && fs.existsSync(outputFile)) {
                        const detections = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
                        res.json({ faces: detections });
                        
                        // Cleanup
                        fs.unlinkSync(tempFile);
                        fs.unlinkSync(outputFile);
                    } else {
                        res.json({ faces: [] });
                        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    }
                    resolve();
                } catch (err) {
                    res.json({ faces: [] });
                    resolve();
                }
            });
            
            python.stderr.on('data', (data) => {
                console.error(`Face detection error: ${data}`);
            });
        });
    } catch (err) {
        console.error('Face detection endpoint error:', err);
        res.status(500).json({ error: err.message, faces: [] });
    }
});

// Start server - listen on all interfaces for Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 YOLO Tracking app running on port ${PORT}`);
    console.log('All processing happens on the client-side!');
});
