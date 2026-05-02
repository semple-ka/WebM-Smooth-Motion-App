const socket = io();

// UI Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const processBtn = document.getElementById('processBtn');
const targetFps = document.getElementById('targetFps');
const quality = document.getElementById('quality');
const outputFormat = document.getElementById('outputFormat');
const mode = document.getElementById('mode');

const statusSection = document.getElementById('statusSection');
const statusText = document.getElementById('statusText');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');

const resultsSection = document.getElementById('resultsSection');
const outputsList = document.getElementById('outputsList');
const btnText = document.querySelector('.btn-text');
const loader = document.querySelector('.loader');

let selectedFile = null;
let currentJobId = null;

// Drag and Drop Handlers
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    if (file.type !== 'video/webm' && file.type !== 'video/mp4') {
        alert('Please select a valid WebM or MP4 video file.');
        return;
    }
    
    selectedFile = file;
    uploadZone.classList.add('has-file');
    uploadZone.querySelector('h2').textContent = file.name;
    uploadZone.querySelector('p').textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    
    processBtn.disabled = false;
}

// Process Button Handler
processBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    // UI to loading state
    processBtn.disabled = true;
    btnText.textContent = 'Uploading...';
    loader.classList.remove('hidden');
    statusSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    outputsList.innerHTML = '';
    updateProgress(0, 'Uploading file...');

    const formData = new FormData();
    formData.append('video', selectedFile);
    formData.append('targetFps', targetFps.value);
    formData.append('quality', quality.value);
    formData.append('outputFormat', outputFormat.value);
    formData.append('mode', mode.value);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            currentJobId = data.jobId;
            updateProgress(0, 'Queued for processing...');
            btnText.textContent = 'Processing';
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (err) {
        alert(`Error: ${err.message}`);
        resetUI();
    }
});

// Socket.io Event Listeners
socket.on('jobStatus', (data) => {
    if (data.id !== currentJobId) return;

    if (data.status === 'processing') {
        updateProgress(0, 'Interpolating frames (This may take a while)...');
    } else if (data.status === 'completed') {
        updateProgress(100, 'Processing complete!');
        showResults(data.outputs);
        resetUI();
    } else if (data.status === 'error') {
        alert(`Processing Error: ${data.error}`);
        updateProgress(0, 'Failed');
        resetUI();
    }
});

socket.on('jobProgress', (data) => {
    if (data.id !== currentJobId) return;
    updateProgress(data.progress, `Interpolating frames... ${data.progress}%`);
});

// Helpers
function updateProgress(percent, text) {
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
    if (text) statusText.textContent = text;
}

function resetUI() {
    processBtn.disabled = false;
    btnText.textContent = 'Process Video';
    loader.classList.add('hidden');
}

function showResults(outputs) {
    resultsSection.classList.remove('hidden');
    
    outputs.forEach(out => {
        const item = document.createElement('div');
        item.className = 'output-item';
        
        item.innerHTML = `
            <div class="output-info">
                <span class="output-name">${out.name}</span>
                <span class="output-meta">${out.filename}</span>
            </div>
            <a href="${out.url}" class="download-btn" download>Download</a>
        `;
        
        outputsList.appendChild(item);
    });
}
