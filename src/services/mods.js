const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
const { app, BrowserWindow } = require('electron');
const { downloadFile } = require('./utils');
const { _trackEvent } = require('../analytics');
const { logger } = require('../utils/logger');

const CF_API_KEY = '$2a$10$S7nVFhQKpxteK4Fwf9yoxejmI.NjJiE53Qh4IeaDbIu/./oTM/MKa';
const CF_API_URL = 'https://api.curseforge.com/v1';
const GAME_ID = 70216;

function registerModHandlers(ipcMain) {
    const modsDir = path.join(app.getPath('appData'), 'Hytale', 'UserData', 'Mods');

    ipcMain.handle('search-mods', async (event, query = '') => {
        try {
            const headers = {
                'x-api-key': CF_API_KEY,
                'Accept': 'application/json'
            };

            let response;
            if (query || GAME_ID === 70216) {
                response = await axios.get(`${CF_API_URL}/mods/search`, {
                    params: {
                        gameId: GAME_ID,
                        searchFilter: query,
                        sortField: 2,
                        sortOrder: 'desc'
                    },
                    headers
                });
            } else {
                response = await axios.post(`${CF_API_URL}/mods/featured`, {
                    gameId: GAME_ID,
                    excludedModIds: [],
                    gameVersionTypeId: 0
                }, { headers });
            }

            let modsRaw = [];
            if (query || GAME_ID === 70216) {
                modsRaw = response.data.data;
            } else {
                const featured = response.data.data.featured || [];
                const popular = response.data.data.popular || [];
                const map = new Map();
                [...featured, ...popular].forEach(m => map.set(m.id, m));
                modsRaw = Array.from(map.values());
            }

            const hytaleMods = modsRaw.map(mod => ({
                id: mod.id,
                name: mod.name,
                summary: mod.summary,
                description: null,
                logo: mod.logo,
                author: mod.authors && mod.authors.length > 0 ? mod.authors[0].name : 'Unknown',
                downloads: mod.downloadCount,
                lastUpdated: new Date(mod.dateModified).toLocaleDateString(),
                version: mod.latestFiles && mod.latestFiles.length > 0 ? mod.latestFiles[0].displayName : 'Unknown'
            }));

            return { success: true, data: hytaleMods };

        } catch (error) {
            logger.error("CF API Error:", error?.response?.data || error.message);
            return { success: false, error: "Error connecting to CurseForge: " + error.message };
        }
    });

    ipcMain.handle('get-mod-description', async (event, modId) => {
        try {
            const headers = { 'x-api-key': CF_API_KEY, 'Accept': 'application/json' };
            const response = await axios.get(`${CF_API_URL}/mods/${modId}/description`, { headers });
            return { success: true, data: response.data.data };
        } catch (error) {
            logger.error("CF Description Error:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('list-installed-mods', async () => {
        try {
            await fs.ensureDir(modsDir);
            const files = await fs.readdir(modsDir);

            const mods = files.map(file => {
                const isEnabled = !file.endsWith('.disabled');
                return {
                    name: file.replace('.disabled', ''),
                    fileName: file,
                    enabled: isEnabled,
                    path: path.join(modsDir, file)
                };
            });
            return { success: true, data: mods };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('install-mod', async (event, modData) => {
        try {
            await fs.ensureDir(modsDir);
            event.sender.send('launch-status', `Buscando Ãºltima versiÃ³n de ${modData.name}...`);

            const headers = { 'x-api-key': CF_API_KEY, 'Accept': 'application/json' };
            const filesResponse = await axios.get(`${CF_API_URL}/mods/${modData.id}/files`, {
                headers,
                params: { pageSize: 1 }
            });

            const files = filesResponse.data.data;
            if (!files || files.length === 0) {
                throw new Error("No se encontraron archivos descargables para este mod.");
            }

            const latestFile = files[0];
            const downloadUrl = latestFile.downloadUrl;
            const fileName = latestFile.fileName;
            const destPath = path.join(modsDir, fileName);

            if (!downloadUrl) {
                throw new Error("El archivo no tiene URL de descarga directa (probablemente externo).");
            }

            event.sender.send('launch-status', `Descargando ${fileName}...`);
            await downloadFile(downloadUrl, destPath, event);

            _trackEvent('mod_install', {
                mod_id: modData.id,
                mod_name: modData.name,
                file_name: fileName
            });

            return { success: true };
        } catch (error) {
            logger.error(error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('toggle-mod', async (event, fileName) => {
        try {
            const oldPath = path.join(modsDir, fileName);
            let newPath;

            if (fileName.endsWith('.disabled')) {
                newPath = path.join(modsDir, fileName.replace('.disabled', ''));
                _trackEvent('mod_enable', { mod_file: fileName });
            } else {
                newPath = path.join(modsDir, fileName + '.disabled');
                _trackEvent('mod_disable', { mod_file: fileName });
            }

            await fs.rename(oldPath, newPath);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-mod', async (event, fileName) => {
        try {
            _trackEvent('mod_delete', { mod_file: fileName });
            await fs.remove(path.join(modsDir, fileName));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerModHandlers };
