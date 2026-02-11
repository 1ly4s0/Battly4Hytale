const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');
const { _trackEvent } = require('../analytics');
const { logger } = require('../utils/logger');

const configPath = path.join(app.getPath('appData'), 'Battly4Hytale', 'user-settings.json');

const defaultSettings = {
    hideLauncher: true,
    gpuPreference: 'auto',
    useCustomJava: false,
    customJavaPath: '',
    profiles: []
};

let currentSettings = { ...defaultSettings };

async function loadSettings() {
    try {
        if (await fs.pathExists(configPath)) {
            const data = await fs.readJson(configPath);
            currentSettings = { ...defaultSettings, ...data };
        } else {
            await saveSettings();
        }
    } catch (e) {
        logger.error("Error loading settings:", e);
    }
    return currentSettings;
}

async function saveSettings(settings) {
    if (settings) {
        currentSettings = { ...currentSettings, ...settings };
        _trackEvent('settings_updated', settings);
    }
    try {
        await fs.ensureDir(path.dirname(configPath));
        await fs.writeJson(configPath, currentSettings);
    } catch (e) {
        logger.error("Error saving settings:", e);
    }
}

function getSettings() {
    return currentSettings;
}

module.exports = { loadSettings, saveSettings, getSettings };
