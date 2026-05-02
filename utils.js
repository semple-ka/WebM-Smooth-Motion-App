const fs = require('fs');
const path = require('path');

const ensureDirExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const cleanupFiles = (filePaths) => {
    filePaths.forEach(fp => {
        if (fs.existsSync(fp)) {
            try {
                fs.unlinkSync(fp);
            } catch (err) {
                console.error(`Failed to delete ${fp}:`, err);
            }
        }
    });
};

module.exports = {
    ensureDirExists,
    cleanupFiles
};
