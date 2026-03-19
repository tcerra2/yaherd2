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
    const appHtmlPath = path.join(__dirname, 'app.html');
    const appHtml = fs.readFileSync(appHtmlPath, 'utf8');
    const deployMarker = [
        '<div style="display:flex;justify-content:center;margin:0 auto 24px;">',
        '<div style="padding:10px 16px;border-radius:999px;background:linear-gradient(135deg,#fff1dd 0%,#ffe3b8 100%);border:1px solid #ffd08a;color:#8a4b00;font-size:0.9em;font-weight:700;box-shadow:0 10px 20px rgba(138,75,0,0.12);">',
        'March 19 deploy marker: live controls and class colors',
        '</div>',
        '</div>'
    ].join('');
    let markedHtml = appHtml.replace(
        '<p class="subtitle">Real-time tracking • 100% Client-Side Processing</p>',
        `<p class="subtitle">Real-time tracking • 100% Client-Side Processing</p>${deployMarker}`
    );

    const extraControls = [
        '<div class="confidence-control">',
        '    <label for="exposureSlider">Exposure:</label>',
        '    <input type="range" id="exposureSlider" min="-50" max="50" value="0" onchange="updateExposure(this.value)">',
        '    <span class="confidence-value" id="exposureValue">0</span>',
        '</div>',
        '<div class="confidence-control">',
        '    <label for="contrastSlider">Contrast:</label>',
        '    <input type="range" id="contrastSlider" min="50" max="200" value="100" onchange="updateContrast(this.value)">',
        '    <span class="confidence-value" id="contrastValue">100%</span>',
        '</div>'
    ].join('');

    markedHtml = markedHtml.replace(
        '<div class="confidence-control">\n            <label for="confidenceSlider">Confidence:</label>\n            <input type="range" id="confidenceSlider" min="0" max="100" value="50" onchange="updateConfidence(this.value)">\n            <span class="confidence-value" id="confidenceValue">0.50</span>\n        </div>',
        '<div class="confidence-control">\n            <label for="confidenceSlider">Confidence:</label>\n            <input type="range" id="confidenceSlider" min="0" max="100" value="50" onchange="updateConfidence(this.value)">\n            <span class="confidence-value" id="confidenceValue">0.50</span>\n        </div>\n        ' + extraControls
    );

    markedHtml = markedHtml.replace(
        "let confidenceThreshold = 0.5; // Default confidence threshold",
        "let confidenceThreshold = 0.5; // Default confidence threshold\n        let exposureValue = 0; // -50 to 50\n        let contrastValue = 100; // 50 to 200"
    );

    markedHtml = markedHtml.replace(
        "            return newTracks;\n        }",
        "            return newTracks;\n        }\n\n        function getClassColor(className) {\n            const palette = ['#00C2FF', '#FF6B6B', '#FFD93D', '#6BCB77', '#B983FF', '#FF9F1C', '#2EC4B6', '#F15BB5', '#43AA8B', '#577590'];\n            const label = String(className || 'object');\n            let hash = 0;\n\n            for (let index = 0; index < label.length; index += 1) {\n                hash = ((hash << 5) - hash) + label.charCodeAt(index);\n                hash |= 0;\n            }\n\n            return palette[Math.abs(hash) % palette.length];\n        }"
    );

    markedHtml = markedHtml.replace(
        "                ctx.clearRect(0, 0, canvas.width, canvas.height);\n                ctx.drawImage(video, 0, 0);",
        "                ctx.clearRect(0, 0, canvas.width, canvas.height);\n                if (exposureValue !== 0 || contrastValue !== 100) {\n                    const brightness = 100 + exposureValue;\n                    ctx.filter = `brightness(${brightness}%) contrast(${contrastValue}%)`;\n                }\n                ctx.drawImage(video, 0, 0);\n                ctx.filter = 'none';"
    );

    markedHtml = markedHtml.replace(
        "                tracked.forEach(t => {\n                    const [x, y, w, h] = t.det.bbox;\n                    \n                    ctx.strokeStyle = '#00FF00';",
        "                tracked.forEach(t => {\n                    const [x, y, w, h] = t.det.bbox;\n                    const boxColor = getClassColor(t.det.class);\n                    \n                    ctx.strokeStyle = boxColor;"
    );

    markedHtml = markedHtml.replace(
        "                    ctx.fillStyle = '#00FF00';",
        "                    ctx.fillStyle = boxColor;"
    );

    markedHtml = markedHtml.replace(
        "        function updateConfidence(value) {\n            confidenceThreshold = value / 100;\n            document.getElementById('confidenceValue').textContent = confidenceThreshold.toFixed(2);\n            log('Confidence threshold set to: ' + confidenceThreshold.toFixed(2), 'info');\n        }",
        "        function updateConfidence(value) {\n            confidenceThreshold = value / 100;\n            document.getElementById('confidenceValue').textContent = confidenceThreshold.toFixed(2);\n            log('Confidence threshold set to: ' + confidenceThreshold.toFixed(2), 'info');\n        }\n\n        function updateExposure(value) {\n            exposureValue = parseInt(value, 10);\n            document.getElementById('exposureValue').textContent = (exposureValue >= 0 ? '+' : '') + exposureValue;\n            log('Exposure adjusted: ' + exposureValue, 'info');\n        }\n\n        function updateContrast(value) {\n            contrastValue = parseInt(value, 10);\n            document.getElementById('contrastValue').textContent = contrastValue + '%';\n            log('Contrast adjusted: ' + contrastValue + '%', 'info');\n        }"
    );

    res.send(markedHtml);
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
