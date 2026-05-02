const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const { ensureDirExists } = require('../utils');
const processor = require('../processor');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// Setup paths - Use /tmp for Vercel environment compatibility
const isVercel = process.env.VERCEL === '1';
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const outputsDir = isVercel ? '/tmp/outputs' : path.join(__dirname, 'outputs');
ensureDirExists(uploadsDir);
ensureDirExists(outputsDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'video/webm' || file.mimetype === 'video/mp4') {
            cb(null, true);
        } else {
            cb(new Error('Only WebM or MP4 videos are allowed.'));
        }
    }
});

app.use(cors());
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.json());

// Pass io to processor
processor.setIo(io);

// API: Upload video and queue job
app.post('/api/upload', upload.single('video'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video uploaded' });
        }

        const jobId = uuidv4();
        const { targetFps = 60, quality = 'high', outputFormat = 'mp4', mode = 'basic' } = req.body;

        const job = {
            id: jobId,
            inputPath: req.file.path,
            originalName: req.file.originalname,
            targetFps: parseInt(targetFps),
            quality,
            outputFormat,
            mode
        };

        processor.addJob(job);

        res.json({ message: 'Job queued successfully', jobId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Get job status
app.get('/api/jobs/:id', (req, res) => {
    const job = processor.getJob(req.params.id);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
});

// API: Download output
app.get('/api/download/:id/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(outputsDir, filename);
    
    res.download(filePath, (err) => {
        if (err) {
            console.error('Download error:', err);
            if (!res.headersSent) {
                res.status(404).json({ error: 'File not found' });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;

// Export for Vercel
module.exports = app;

// Only listen if not running as a Vercel function
if (process.env.VERCEL !== '1') {
    server.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}
