const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { _trackEvent, updateUserProperties } = require('./analytics');
const { exec } = require('child_process');
const { initialize } = require("@aptabase/electron/main");
initialize("A-SH-6163498396", {
    host: "https://analytics-hytale.battlylauncher.com"
});
const DEV = process.env.NODE_ENV === 'development';

const { checkForUpdates } = require('./services/updater');
const { launchGame } = require('./services/game');
const { loadSettings, saveSettings, getSettings } = require('./services/config');
const { registerModHandlers } = require('./services/mods');
const { initDiscord, setActivity } = require('./services/discord');
const { fetchHytaleNews } = require('./services/news');
const { getGameLogs } = require('./services/gameLogs');
const { getAvailableChannels, getAvailableVersions, getSelectedVersion, setSelectedVersion } = require('./services/versionManager');
const { logger } = require('./utils/logger');

let cachedGpuInfo = null;
let gpuInfoPromise = null;
let mainWindow = null;
let splashWindow = null;

async function loadGpuInfo() {
    if (cachedGpuInfo) return cachedGpuInfo;
    if (gpuInfoPromise) return gpuInfoPromise;

    gpuInfoPromise = new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec('wmic path win32_VideoController get name', (error, stdout, stderr) => {
                if (error) {
                    logger.error('WMIC Error:', error);
                    resolve('GPU Detection Failed');
                    return;
                }
                const lines = stdout.split('\n').map(l => l.trim()).filter(l => l && l !== 'Name');

                const gpus = {
                    all: lines,
                    integrated: lines.find(l => l.match(/Intel|Display/i)) || null,
                    dedicated: lines.find(l => l.match(/NVIDIA|AMD|Radeon RX/i)) || null
                };

                if (!gpus.integrated && lines.length > 0) gpus.integrated = lines[0];
                if (!gpus.dedicated && lines.length > 1) gpus.dedicated = lines[lines.length - 1];

                cachedGpuInfo = gpus;
                logger.info('GPU Info Cached (Fast):', JSON.stringify(cachedGpuInfo));
                updateUserProperties({ gpu_model: gpus.dedicated || gpus.integrated || 'Unknown' });
                resolve(cachedGpuInfo);
            });
        } else {
            resolve('Unsupported Platform');
        }
    });
    return gpuInfoPromise;
}

ipcMain.handle('perform-update', async (event, downloadUrl) => {
    _trackEvent('perform_update', { category: 'update', label: 'manual_trigger' });
    require('electron').shell.openExternal(downloadUrl);
    app.quit();
});

ipcMain.on('track-event', (event, category, action, label, value) => {
    _trackEvent(action || 'renderer_event', { category, label, value });
});


ipcMain.handle('get-settings', async () => {
    return getSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
    await saveSettings(settings);
    return true;
});

ipcMain.handle('get-news', async () => {
    return await fetchHytaleNews();
});

ipcMain.handle('get-game-logs', async (event, options = {}) => {
    return await getGameLogs(options);
});

ipcMain.handle('get-gpu-info', async () => {
    return await loadGpuInfo();
});

ipcMain.handle('select-java-path', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Java Executable', extensions: ['exe', 'bin'] }]
    });
    return result.filePaths[0];
});

ipcMain.handle('get-available-versions', async (event, channel) => {
    return await getAvailableVersions(channel);
});

ipcMain.handle('get-version-channels', async () => {
    return await getAvailableChannels();
});

ipcMain.handle('get-selected-version', async (event, channel) => {
    return await getSelectedVersion(channel);
});

ipcMain.handle('set-selected-version', async (event, versionId, patchFile, channel) => {
    return await setSelectedVersion(versionId, patchFile, channel);
});

ipcMain.handle('read-locale', async (event, lang) => {
    const fs = require('fs-extra');
    try {
        const sanitizedLang = lang.replace(/[^a-z]/gi, '');
        const localePath = path.join(__dirname, 'locales', `${sanitizedLang}.json`);

        const localesDir = path.join(__dirname, 'locales');
        if (!localePath.startsWith(localesDir)) {
            throw new Error('Acceso denegado');
        }

        if (await fs.pathExists(localePath)) {
            const data = await fs.readFile(localePath, 'utf8');
            return JSON.parse(data);
        }
        return null;
    } catch (e) {
        logger.error('Error leyendo locale:', e);
        return null;
    }
});

ipcMain.on('open-game-location', () => {
    const hytaleRoot = path.join(app.getPath('appData'), 'Hytale');
    shell.openPath(hytaleRoot);
});

ipcMain.on('open-external', (event, url) => {
    try {
        const urlObj = new URL(url);
        const allowedProtocols = ['http:', 'https:'];
        const allowedDomains = [
            'hytale.com',
            'launcher.hytale.com',
            'battly.org',
            'battlylauncher.com',
            'curseforge.com',
            'modrinth.com'
        ];

        if (allowedProtocols.includes(urlObj.protocol)) {
            const hostname = urlObj.hostname.toLowerCase();
            const isAllowed = allowedDomains.some(domain =>
                hostname === domain || hostname.endsWith('.' + domain)
            );

            if (isAllowed) {
                shell.openExternal(url);
            } else {
                logger.warn(`Dominio no permitido: ${hostname}`);
            }
        }
    } catch (e) {
        logger.error('URL invÃ¡lida:', e);
    }
});

ipcMain.on('repair-game', async (event) => {
    const fs = require('fs-extra');
    const hytaleRoot = path.join(app.getPath('appData'), 'Hytale');
    const gameDir = path.join(hytaleRoot, 'install', 'release', 'package', 'game', 'latest');

    try {
        logger.info("Repairing game: Deleting game directory...");
        if (await fs.pathExists(gameDir)) {
            await fs.remove(gameDir);
        }
        event.sender.send('repair-complete', { success: true });
        _trackEvent('game_repair', { status: 'success' });
    } catch (error) {
        logger.error("Repair failed:", error);
        event.sender.send('repair-complete', { success: false, error: error.message });
        _trackEvent('game_repair', { status: 'failed', error: error.message });
    }
});

function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 340,
        height: 380,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        center: true,
        icon: path.join(__dirname, 'assets/images/logo.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function createMainWindow() {

    loadSettings();
    _trackEvent('app_start');

    mainWindow = new BrowserWindow({
        width: 1152,
        height: 648,
        minWidth: 960,
        minHeight: 540,
        icon: path.join(__dirname, 'assets/images/logo.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js')
        },
        resizable: true,
        title: "Battly Launcher 4 Hytale",
        frame: false,
        autoHideMenuBar: true,
        backgroundColor: '#1e1e2f',
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self';",
                    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline';",
                    "style-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com 'unsafe-inline';",
                    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:;",
                    "img-src 'self' https://hytale.com https://launcher.hytale.com https://i.imgur.com https://ui-avatars.com https://media.forgecdn.net https://edge.forgecdn.net data: blob:;",
                    "connect-src 'self' https://api.battlylauncher.com https://cdn.battlylauncher.com https://launcher.hytale.com https://analytics-hytale.battlylauncher.com https://api.curseforge.com https://sessions.battly.org https://battly.org;",
                    "media-src 'self' https://hytale.com;",
                    "object-src 'none';",
                    "base-uri 'self';"
                ].join(' ')
            }
        });
    });

    mainWindow.webContents.once('did-finish-load', () => {
        if (splashWindow) {
            splashWindow.close();
            splashWindow = null;
        }
        mainWindow.show();

        if (DEV) {
            mainWindow.webContents.openDevTools();
        }

        _trackEvent('app_start', { source: 'main_process' });
        checkForUpdates(mainWindow);
    });

    ipcMain.on('minimize-window', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('close-window', () => {
        if (mainWindow) mainWindow.close();
    });
}

app.whenReady().then(async () => {
    createSplashWindow();

    loadGpuInfo();

    setTimeout(() => {
        createMainWindow();
    }, 1500);

    registerModHandlers(ipcMain);
    initDiscord();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('launch-game', (event, username) => {
    launchGame(event, username);
});

ipcMain.on('discord-activity', (event, details, state) => {
    setActivity(details, state);
});
