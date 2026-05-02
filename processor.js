const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

const path = require('path');
const { ensureDirExists, cleanupFiles } = require('./utils');

// In-memory job store & simple queue
const jobs = new Map();
const queue = [];
let isProcessing = false;

// We need a reference to the socket io instance to emit progress
let ioInstance = null;

const setIo = (io) => {
    ioInstance = io;
};

const getJob = (id) => jobs.get(id);

const addJob = (job) => {
    jobs.set(job.id, {
        ...job,
        status: 'queued',
        progress: 0,
        outputs: [],
        error: null
    });
    queue.push(job.id);
    processNext();
};

const processNext = async () => {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    const jobId = queue.shift();
    const job = jobs.get(jobId);
    
    job.status = 'processing';
    if (ioInstance) ioInstance.emit('jobStatus', { id: jobId, status: job.status });

    try {
        if (job.mode === 'basic') {
            await processBasic(job);
        } else {
            // Advanced mode placeholder - you would spawn a child process for rife-ncnn-vulkan here
            job.status = 'error';
            job.error = 'Advanced mode requires manual setup of rife-ncnn-vulkan.';
        }
    } catch (err) {
        console.error(`Job ${jobId} failed:`, err);
        job.status = 'error';
        job.error = err.message;
    } finally {
        if (job.status !== 'error') {
            job.status = 'completed';
        }
        if (ioInstance) ioInstance.emit('jobStatus', { id: jobId, status: job.status, progress: job.progress, error: job.error, outputs: job.outputs });
        isProcessing = false;
        processNext();
    }
};

const processBasic = async (job) => {
    const { id, inputPath, targetFps, quality, outputFormat } = job;
    const isVercel = process.env.VERCEL === '1';
    const outDir = isVercel ? '/tmp/outputs' : path.join(__dirname, 'outputs');
    ensureDirExists(outDir);

    // If we want multiple outputs, let's define the configs here.
    // E.g. one based on user settings, and one "lightweight" or "ultra-smooth" alternative.
    const configs = [
        { fps: targetFps, qual: quality, name: `${targetFps} FPS (${quality})` }
    ];

    if (targetFps === 60) {
        configs.push({ fps: 120, qual: 'medium', name: `120 FPS (Medium)` });
    } else {
        configs.push({ fps: 60, qual: 'high', name: `60 FPS (High)` });
    }

    job.progress = 0;
    const progressPerConfig = 100 / configs.length;

    for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        const outFilename = `${id}_${config.fps}fps_${config.qual}.${outputFormat}`;
        const outputPath = path.join(outDir, outFilename);

        await new Promise((resolve, reject) => {
            const vfParams = `minterpolate='mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=${config.fps}'`;

            let command = ffmpeg(inputPath).outputOptions([`-filter:v ${vfParams}`]);

            if (outputFormat === 'mp4') {
                command = command.videoCodec('libx264');
                if (config.qual === 'high') {
                    command = command.outputOptions(['-preset slow', '-crf 18']);
                } else if (config.qual === 'medium') {
                    command = command.outputOptions(['-preset medium', '-crf 23']);
                } else {
                    command = command.outputOptions(['-preset fast', '-crf 28']);
                }
            } else {
                command = command.videoCodec('libvpx-vp9');
                if (config.qual === 'high') {
                    command = command.outputOptions(['-b:v 5M']);
                } else if (config.qual === 'medium') {
                    command = command.outputOptions(['-b:v 2.5M']);
                } else {
                    command = command.outputOptions(['-b:v 1M']);
                }
            }

            command
                .save(outputPath)
                .on('progress', (progress) => {
                    if (progress.percent) {
                        const currentPhaseProgress = Math.min(Math.round(progress.percent), 100);
                        const totalProgress = Math.round((i * progressPerConfig) + (currentPhaseProgress / configs.length));
                        job.progress = totalProgress;
                        if (ioInstance) ioInstance.emit('jobProgress', { id, progress: totalProgress, phase: `Processing ${config.name}` });
                    }
                })
                .on('end', () => {
                    job.outputs.push({
                        name: config.name,
                        filename: outFilename,
                        url: `/api/download/${id}/${outFilename}`
                    });
                    resolve();
                })
                .on('error', (err) => {
                    reject(err);
                });
        });
    }
    
    job.progress = 100;
};

module.exports = {
    setIo,
    addJob,
    getJob
};
