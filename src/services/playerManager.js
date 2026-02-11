const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { logger } = require('../utils/logger');

const PLAYER_DATA_DIR = path.join(app.getPath('appData'), 'Hytale');
const PLAYER_ID_FILE = path.join(PLAYER_DATA_DIR, 'player-id.json');


async function getOrCreatePlayerUUID(username) {
    try {
        await fs.ensureDir(PLAYER_DATA_DIR);

        let playerData = {};
        if (await fs.pathExists(PLAYER_ID_FILE)) {
            playerData = await fs.readJson(PLAYER_ID_FILE);
        }

        if (playerData[username] && playerData[username].uuid) {
            logger.info(`Using existing UUID for player: ${username}`);
            return playerData[username].uuid;
        }

        const newUUID = crypto.randomUUID();
        playerData[username] = {
            uuid: newUUID,
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };

        await fs.writeJson(PLAYER_ID_FILE, playerData, { spaces: 2 });
        logger.info(`Created new UUID for player: ${username}`);
        return newUUID;
    } catch (error) {
        logger.error('Error managing player UUID:', error);
        return crypto.randomUUID();
    }
}


async function updatePlayerLastUsed(username) {
    try {
        if (await fs.pathExists(PLAYER_ID_FILE)) {
            const playerData = await fs.readJson(PLAYER_ID_FILE);
            if (playerData[username]) {
                playerData[username].lastUsed = new Date().toISOString();
                await fs.writeJson(PLAYER_ID_FILE, playerData, { spaces: 2 });
            }
        }
    } catch (error) {
        logger.error('Error updating player last used:', error);
    }
}

module.exports = {
    getOrCreatePlayerUUID,
    updatePlayerLastUsed
};
