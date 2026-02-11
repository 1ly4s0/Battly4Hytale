const DiscordRPC = require('discord-rpc');
const { logger } = require('../utils/logger');

const CLIENT_ID = '917866962523152404';
DiscordRPC.register(CLIENT_ID);

let rpc;
let startTimestamp = new Date();

function initDiscord() {
    rpc = new DiscordRPC.Client({ transport: 'ipc' });

    rpc.on('ready', () => {
        logger.info('Discord RPC connected');
        setActivity('En el Launcher');
    });

    rpc.login({ clientId: CLIENT_ID }).catch(console.error);
}

function setActivity(details, state = null, smallImageKey = null, smallImageText = null) {
    if (!rpc) return;

    const activity = {
        details: details,
        startTimestamp: startTimestamp,
        largeImageKey: 'battly_hytale_512',
        largeImageText: 'Battly Launcher 4 Hytale',
        instance: false,
    };


    if (state && typeof state === 'string') {
        activity.state = state;
    }

    if (smallImageKey) {
        activity.smallImageKey = smallImageKey;
        activity.smallImageText = smallImageText;
    }

    rpc.setActivity(activity).catch(console.error);
}

function clearActivity() {
    if (rpc) {
        rpc.clearActivity();
    }
}

module.exports = { initDiscord, setActivity, clearActivity };
