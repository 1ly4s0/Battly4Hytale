const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const { logger } = require('../utils/logger');

const ORIGINAL_DOMAIN = 'hytale.com';
const TARGET_DOMAIN = 'battly.org';

class ServerPatcher {
    constructor() {
        this.patchedFlag = 'patched_server.json';
    }

    stringToUtf8(str) {
        return Buffer.from(str, 'utf8');
    }

    findAllOccurrences(buffer, pattern) {
        const positions = [];
        let pos = 0;
        while (pos < buffer.length) {
            const index = buffer.indexOf(pattern, pos);
            if (index === -1) break;
            positions.push(index);
            pos = index + 1;
        }
        return positions;
    }

    findAndReplaceDomainUtf8(data, oldDomain, newDomain) {
        let count = 0;
        const result = Buffer.from(data);
        const oldUtf8 = this.stringToUtf8(oldDomain);
        const newUtf8 = this.stringToUtf8(newDomain);

        const positions = this.findAllOccurrences(result, oldUtf8);

        for (const pos of positions) {
            newUtf8.copy(result, pos);
            count++;
        }

        return { buffer: result, count };
    }

    async patchServer(serverPath, javaExec, event) {
        const serverDir = path.dirname(serverPath);
        const flagFile = path.join(serverDir, this.patchedFlag);

        logger.info("=== Server Patcher (Fast) ===");
        logger.info(`Target: ${serverPath}`);

        if (await fs.pathExists(flagFile)) {
            try {
                const flagData = await fs.readJson(flagFile);
                if (flagData.targetDomain === TARGET_DOMAIN && await fs.pathExists(serverPath)) {
                    logger.info("Server already patched.");
                    return;
                }
            } catch (e) { }
            logger.warn("Repatching needed (invalid flag or missing server).");
        }

        if (event) event.reply('launch-status', 'Parcheando servidor (RÃ¡pido)...');

        const backupPath = serverPath + '.bak';
        if (await fs.pathExists(backupPath)) {
            logger.info("Restoring from backup to ensure clean state...");
            await fs.copy(backupPath, serverPath);
        } else {
            logger.info("Creating backup...");
            await fs.copy(serverPath, backupPath);
        }

        logger.info("Loading JAR into memory...");
        let zip;
        try {
            zip = new AdmZip(serverPath);
        } catch (e) {
            logger.error("Failed to load JAR:", e);
            throw e;
        }

        const entries = zip.getEntries();
        logger.info(`JAR contains ${entries.length} entries.`);

        let totalCount = 0;
        const oldUtf8 = this.stringToUtf8(ORIGINAL_DOMAIN);

        for (const entry of entries) {
            const name = entry.entryName;

            if (name.endsWith('.class') || name.endsWith('.properties') ||
                name.endsWith('.json') || name.endsWith('.xml') || name.endsWith('.yml')) {

                let data;
                try {
                    data = entry.getData();
                } catch (e) {
                    logger.warn(`Skipping unreadable entry: ${name} (${e.message})`);
                    continue;
                }

                if (data.includes(oldUtf8)) {
                    const { buffer: patchedData, count } = this.findAndReplaceDomainUtf8(data, ORIGINAL_DOMAIN, TARGET_DOMAIN);
                    if (count > 0) {
                        zip.updateFile(entry, patchedData);
                        totalCount += count;
                    }
                }
            }
        }

        logger.info(`Total replaced: ${totalCount}`);

        if (totalCount > 0) {
            logger.info("Writing patched JAR...");
            zip.writeZip(serverPath);

            await fs.writeJson(flagFile, {
                patchedAt: new Date().toISOString(),
                targetDomain: TARGET_DOMAIN,
                patcherVersion: '2.0.0'
            });
            logger.info("Patching complete.");
        } else {
            logger.info("No occurrences found.");
            await fs.writeJson(flagFile, {
                patchedAt: new Date().toISOString(),
                targetDomain: TARGET_DOMAIN,
                status: 'no-changes'
            });
        }
    }
}

const serverPatcher = new ServerPatcher();
module.exports = serverPatcher;
