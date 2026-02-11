const fs = require('fs-extra');
const axios = require('axios');
const { BrowserWindow } = require('electron');
const { isTrustedDomain } = require('../utils/integrity');
const { logger } = require('../utils/logger');

async function downloadFile(url, dest, event, expectedHash = null) {
    if (!isTrustedDomain(url)) {
        throw new Error(`Descarga bloqueada: dominio no confiable - ${url}`);
    }

    logger.info(`Descargando desde dominio confiable: ${url}`);

    const writer = fs.createWriteStream(dest);

    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://hytale.com/',
            'Origin': 'https://hytale.com'
        }
    });

    const totalLength = response.headers['content-length'];

    logger.info('Iniciando descarga...');

    let downloadedLength = 0;
    let lastTime = Date.now();
    let lastLoaded = 0;
    let speed = "0.00 MB/s";
    let lastUpdate = 0;

    response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;

        const now = Date.now();

        if (now - lastUpdate > 500 && totalLength) {
            const timeDiff = (now - lastTime) / 1000;
            const loadedDiff = downloadedLength - lastLoaded;

            if (timeDiff > 0) {
                const mbps = (loadedDiff / timeDiff) / (1024 * 1024);
                speed = `${mbps.toFixed(2)} MB/s`;
            }

            lastTime = now;
            lastLoaded = downloadedLength;
            lastUpdate = now;

            const progress = Math.round((downloadedLength / totalLength) * 100);
            const win = BrowserWindow.getAllWindows()[0];
            if (win) win.webContents.send('download-progress', { percent: progress, speed: speed });
        }
    });

    response.data.pipe(writer);

    return new Promise(async (resolve, reject) => {
        writer.on('finish', async () => {
            if (expectedHash) {
                try {
                    const { verifyFileIntegrity } = require('../utils/integrity');
                    const verification = await verifyFileIntegrity(dest, expectedHash);

                    if (!verification.valid) {
                        logger.error(`VerificaciÃ³n de integridad fallÃ³ para: ${dest}`);
                        await fs.remove(dest);
                        reject(new Error('VerificaciÃ³n de integridad fallÃ³'));
                        return;
                    }
                    logger.info(`Archivo verificado exitosamente: ${dest}`);
                } catch (error) {
                    logger.error('Error verificando integridad:', error);
                    await fs.remove(dest);
                    reject(error);
                    return;
                }
            }
            resolve();
        });
        writer.on('error', reject);
    });
}

module.exports = { downloadFile };
