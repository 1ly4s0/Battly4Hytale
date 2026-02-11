const axios = require('axios');
const { _trackEvent } = require('../analytics');

const GITHUB_USER = "1ly4s0";
const GITHUB_REPO = "Battly4Hytale";
const GITHUB_BRANCH = "main";
const UPDATE_CONFIG_URL = `https://api.battlylauncher.com/hytale/config`;

let globalRemoteConfig = null;

async function checkForUpdates(win) {
    try {
        logger.info("Checking for updates from:", UPDATE_CONFIG_URL);
        const response = await axios.get(UPDATE_CONFIG_URL);
        globalRemoteConfig = response.data;
        const currentVersion = require('../../package.json').version;
        const { logger } = require('../utils/logger');

        const launcherConfig = globalRemoteConfig.launcher || globalRemoteConfig;
        const remoteVersion = launcherConfig.version;

        logger.info(`Current: ${currentVersion}, Remote: ${remoteVersion}`);

        if (compareVersions(remoteVersion, currentVersion) > 0) {
            _trackEvent('update_available', {
                current_version: currentVersion,
                remote_version: remoteVersion
            });
            win.webContents.send('update-available', launcherConfig);
        }
    } catch (e) {
        _trackEvent('update_check_failed', { error: e.message });
        logger.error('Failed to check for updates:', e.message);
    }
}

function compareVersions(v1, v2) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n2 > n1) return -1;
    }
    return 0;
}

function getRemoteConfig() {
    return globalRemoteConfig;
}

module.exports = { checkForUpdates, getRemoteConfig };
