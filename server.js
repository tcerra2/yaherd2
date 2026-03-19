const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const FACE_DETECTION_ENABLED = process.env.ENABLE_FACE_DETECTION !== 'false';
const FACE_DETECTION_TIMEOUT_MS = Number.parseInt(process.env.FACE_DETECTION_TIMEOUT_MS || '6000', 10);
const FACE_POLL_INTERVAL_MS = Number.parseInt(process.env.FACE_POLL_INTERVAL_MS || '750', 10);
const PYTHON_EXE = process.env.PYTHON_EXE || (process.platform === 'win32' ? 'python' : 'python3');
const FACE_WORKER_SCRIPT = path.join(__dirname, 'detect_faces.py');
let faceWorkerProcess = null;
let faceWorkerBuffer = '';
let faceWorkerBusy = false;
const pendingFaceJobs = new Map();

function logInfo(message, extra) {
    if (extra === undefined) {
        console.log(`[boot] ${message}`);
        return;
    }

    console.log(`[boot] ${message}`, extra);
}

function logFace(message, extra) {
    if (extra === undefined) {
        console.log(`[face] ${message}`);
        return;
    }

    console.log(`[face] ${message}`, extra);
}

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
    res.json({
        status: 'ok',
        message: 'YOLO Tracking App is running',
        faceDetection: {
            enabled: FACE_DETECTION_ENABLED,
            workerStarted: Boolean(faceWorkerProcess),
            workerBusy: faceWorkerBusy,
            timeoutMs: FACE_DETECTION_TIMEOUT_MS,
            pollIntervalMs: FACE_POLL_INTERVAL_MS
        }
    });
});

app.get('/api/config', (req, res) => {
    res.json({
        faceDetection: {
            enabled: FACE_DETECTION_ENABLED,
            timeoutMs: FACE_DETECTION_TIMEOUT_MS,
            pollIntervalMs: FACE_POLL_INTERVAL_MS
        }
    });
});

function buildTempImagePath() {
    const uniqueId = `${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return path.join(os.tmpdir(), `face_detect_${uniqueId}.jpg`);
}

function cleanupFile(filePath) {
    if (!filePath) {
        return;
    }

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error(`Failed to remove temp file ${filePath}:`, error.message);
    }
}

function decodeBase64Image(image) {
    if (typeof image !== 'string' || image.trim().length === 0) {
        return null;
    }

    const base64Payload = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

    try {
        const buffer = Buffer.from(base64Payload, 'base64');
        return buffer.length > 0 ? buffer : null;
    } catch {
        return null;
    }
}

function resetFaceWorkerState() {
    faceWorkerProcess = null;
    faceWorkerBuffer = '';
    faceWorkerBusy = false;
}

function failPendingFaceJobs(errorMessage) {
    for (const [jobId, job] of pendingFaceJobs) {
        clearTimeout(job.timeoutId);
        job.resolve({ faces: [], error: errorMessage });
        pendingFaceJobs.delete(jobId);
    }
}

function terminateFaceWorker() {
    if (!faceWorkerProcess) {
        return;
    }

    const worker = faceWorkerProcess;
    logFace('Terminating face worker process', { pid: worker.pid });
    resetFaceWorkerState();

    worker.kill('SIGTERM');
    setTimeout(() => {
        if (!worker.killed) {
            worker.kill('SIGKILL');
        }
    }, 250);
}

function handleFaceWorkerOutput(data) {
    faceWorkerBuffer += data.toString();
    const lines = faceWorkerBuffer.split(/\r?\n/);
    faceWorkerBuffer = lines.pop() || '';

    for (const line of lines) {
        if (!line.trim()) {
            continue;
        }

        try {
            const message = JSON.parse(line);
            logFace('Received face worker response', { jobId: message.id, faceCount: Array.isArray(message.faces) ? message.faces.length : 0, hasError: Boolean(message.error) });
            const job = pendingFaceJobs.get(message.id);
            if (!job) {
                logFace('Dropped face worker response for unknown job', { jobId: message.id });
                continue;
            }

            pendingFaceJobs.delete(message.id);
            clearTimeout(job.timeoutId);
            faceWorkerBusy = false;
            job.resolve({
                faces: Array.isArray(message.faces) ? message.faces : [],
                error: typeof message.error === 'string' ? message.error : null
            });
        } catch (error) {
            console.error('Invalid face worker message:', error.message);
        }
    }
}

function ensureFaceWorker() {
    if (faceWorkerProcess) {
        logFace('Reusing existing face worker', { pid: faceWorkerProcess.pid, busy: faceWorkerBusy });
        return faceWorkerProcess;
    }

    logFace('Starting face worker', {
        python: PYTHON_EXE,
        script: FACE_WORKER_SCRIPT,
        cwd: __dirname,
        timeoutMs: FACE_DETECTION_TIMEOUT_MS
    });

    const worker = spawn(PYTHON_EXE, [FACE_WORKER_SCRIPT, '--worker'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    faceWorkerProcess = worker;
    faceWorkerBuffer = '';

    logFace('Face worker process spawned', { pid: worker.pid });

    worker.stdout.on('data', handleFaceWorkerOutput);
    worker.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
            console.error('Face worker stderr:', message);
        }
    });
    worker.on('error', (error) => {
        console.error('Face worker process error:', error.message);
        failPendingFaceJobs(error.message);
        resetFaceWorkerState();
    });
    worker.on('close', (code, signal) => {
        const reason = `Face worker exited with code ${code}${signal ? ` signal ${signal}` : ''}`;
        logFace('Face worker closed', { code, signal, pendingJobs: pendingFaceJobs.size });
        if (pendingFaceJobs.size > 0) {
            failPendingFaceJobs(reason);
        }
        resetFaceWorkerState();
    });

    return worker;
}

function submitFaceJob(imagePath) {
    if (faceWorkerBusy) {
        logFace('Rejecting face job because worker is already busy');
        return Promise.resolve({ faces: [], error: 'Face worker busy' });
    }

    return new Promise((resolve) => {
        const worker = ensureFaceWorker();
        const jobId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        logFace('Submitting face job', { jobId, imagePath });
        const timeoutId = setTimeout(() => {
            pendingFaceJobs.delete(jobId);
            faceWorkerBusy = false;
            terminateFaceWorker();
            logFace('Face job timed out', { jobId, timeoutMs: FACE_DETECTION_TIMEOUT_MS });
            resolve({ faces: [], error: 'Face detection timed out' });
        }, FACE_DETECTION_TIMEOUT_MS);

        pendingFaceJobs.set(jobId, { resolve, timeoutId });
        faceWorkerBusy = true;

        try {
            worker.stdin.write(`${JSON.stringify({ id: jobId, imagePath })}\n`);
        } catch (error) {
            pendingFaceJobs.delete(jobId);
            clearTimeout(timeoutId);
            faceWorkerBusy = false;
            logFace('Failed to write face job to worker stdin', { jobId, error: error.message });
            resolve({ faces: [], error: error.message });
        }
    });
}

// Face detection endpoint
app.post('/api/detect-faces', async (req, res) => {
    let tempFile = null;
    const startedAt = Date.now();

    try {
        if (!FACE_DETECTION_ENABLED) {
            return res.json({ faces: [], disabled: true });
        }

        const { image } = req.body;

        const imageBuffer = decodeBase64Image(image);
        if (!imageBuffer) {
            return res.status(400).json({ error: 'No image provided', faces: [] });
        }

        tempFile = buildTempImagePath();
        fs.writeFileSync(tempFile, imageBuffer);
        logFace('Accepted face detection request', { tempFile, bytes: imageBuffer.length });

        const result = await submitFaceJob(tempFile);
        if (result.error) {
            console.error('Face detection request failed:', result.error);
        }

        logFace('Completed face detection request', { tempFile, durationMs: Date.now() - startedAt, faceCount: result.faces.length, hadError: Boolean(result.error) });
        return res.json({ faces: result.faces });
    } catch (err) {
        console.error('Face detection endpoint error:', err);
        return res.json({ faces: [] });
    } finally {
        cleanupFile(tempFile);
    }
});

process.on('uncaughtException', (error) => {
    console.error('[boot] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('[boot] Unhandled rejection:', reason);
});

logInfo('Initializing server', {
    nodeVersion: process.version,
    platform: process.platform,
    port: PORT,
    cwd: process.cwd(),
    faceDetectionEnabled: FACE_DETECTION_ENABLED,
    faceDetectionTimeoutMs: FACE_DETECTION_TIMEOUT_MS,
    facePollIntervalMs: FACE_POLL_INTERVAL_MS,
    pythonExecutable: PYTHON_EXE,
    faceWorkerScript: FACE_WORKER_SCRIPT
});

if (FACE_DETECTION_ENABLED) {
    logInfo('Prestarting face worker because face detection is enabled');
    ensureFaceWorker();
} else {
    logInfo('Face detection is disabled; skipping worker prestart');
}

process.on('SIGINT', terminateFaceWorker);
process.on('SIGTERM', terminateFaceWorker);

// Start server - listen on all interfaces for Railway
app.listen(PORT, '0.0.0.0', () => {
    logInfo('Server is listening', { host: '0.0.0.0', port: PORT });
    console.log(`🎯 YOLO Tracking app running on port ${PORT}`);
    console.log('All processing happens on the client-side!');
});
