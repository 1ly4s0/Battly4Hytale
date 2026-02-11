let isProd = false;
try {
    const { app } = require('electron');
    isProd = app ? app.isPackaged : false;
} catch (e) {
    isProd = false;
}

const logger = {
    info: (message, ...args) => {
        if (!isProd) console.log(`[INFO] ${message}`, ...args);
    },
    error: (message, ...args) => {
        console.error(`[ERROR] ${message}`, ...args);
    },
    warn: (message, ...args) => {
        console.warn(`[WARN] ${message}`, ...args);
    },
    debug: (message, ...args) => {
        if (!isProd) console.debug(`[DEBUG] ${message}`, ...args);
    }
};

module.exports = { logger };

