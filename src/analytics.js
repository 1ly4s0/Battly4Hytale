const axios = require('axios');
const crypto = require('crypto');
const { JSONStorage } = require('node-localstorage');
const { app } = require('electron');
const os = require('os');
const { trackEvent } = require("@aptabase/electron/main");
const nodeStorage = new JSONStorage(app.getPath('userData'));

const userId = nodeStorage.getItem('userid') || crypto.randomUUID();
nodeStorage.setItem('userid', userId);

const sessionId = Date.now().toString();

let userProperties = {
    app_version: app.getVersion(),
    platform: os.platform(),
    os_release: os.release(),
    arch: os.arch()
};

async function _trackEvent(eventName, params = {}) {
    const safeEventName = eventName.replace(/[^a-zA-Z0-9_]/g, '_');

    let eventParams = { ...params };

    eventParams.engagement_time_msec = '100';
    eventParams.session_id = sessionId;

    Object.assign(eventParams, userProperties);

    if (process.env.NODE_ENV !== 'production') {
    }

    try {
        await trackEvent(safeEventName, eventParams);
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Analytics Error:', error.message);
        }
    }
}

function trackScreen(screenName) {
    _trackEvent('screen_view', {
        screen_name: screenName
    });
}

function updateUserProperties(props) {
    Object.assign(userProperties, props);
}

module.exports = { _trackEvent, trackScreen, updateUserProperties };

