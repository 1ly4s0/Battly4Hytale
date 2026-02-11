const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');
const { execFile } = require('child_process');
const axios = require('axios');
const { downloadFile } = require('./utils');
const { _trackEvent } = require('../analytics');
const StreamZip = require('node-stream-zip');
const os = require('os');
const serverPatcher = require('./serverPatcher');
const { getRemoteConfig } = require('./updater');
const { logger } = require('../utils/logger');

const CONFIG = {
    toolsDir: path.join(app.getPath('appData'), 'Hytale', 'tools'),
    butlerBin: process.platform === 'win32' ? 'butler.exe' : 'butler',
    originalDomain: 'hytale.com',
    targetMainDomain: 'battly.org',
    targetAuthHost: 'sessions.battly.org',
    targetSubdomainPrefix: 'sessions.',
    patchFlagFile: '.patched_custom',
    patchStrategy: 'hytalef2p-domain-replacer',
    patcherVersion: '3.0.0',
    primaryPatch: '7.pwr',
    fallbackPatch: '5.pwr',
    remoteConfigUrl: 'https://api.battlylauncher.com/hytale/config',
    primaryPatchBaseUrl: 'https://cdn.battlylauncher.com/hytale/patches',
    fallbackPatchBaseUrl: 'https://cdn.battlylauncher.com/hytale/patches',
    oldDiscord: '.gg/hytale',
    newDiscord: '.gg/98SsAX7Ks9',
    oldSentry: 'https://ca900df42fcf57d4dd8401a86ddd7da2@sentry.hytale.com/2'
};

function stringToUtf16LE(str) {
    const buffer = Buffer.alloc(str.length * 2);
    for (let i = 0; i < str.length; i++) {
        buffer.writeUInt16LE(str.charCodeAt(i), i * 2);
    }
    return buffer;
}

function stringToLengthPrefixed(str) {
    const length = str.length;
    const result = Buffer.alloc(4 + length + Math.max(0, length - 1));
    result[0] = length;
    result[1] = 0x00;
    result[2] = 0x00;
    result[3] = 0x00;

    let pos = 4;
    for (let i = 0; i < length; i++) {
        result[pos++] = str.charCodeAt(i);
        if (i < length - 1) {
            result[pos++] = 0x00;
        }
    }
    return result;
}

function findAllOccurrences(buffer, pattern) {
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

function replaceBytes(buffer, oldBytes, newBytes) {
    const result = Buffer.from(buffer);

    if (newBytes.length > oldBytes.length) {
        return { buffer: result, count: 0, skippedTooLong: true };
    }

    const positions = findAllOccurrences(result, oldBytes);
    for (const pos of positions) {
        newBytes.copy(result, pos);
    }

    return { buffer: result, count: positions.length, skippedTooLong: false };
}

function replaceLengthPrefixedString(buffer, oldStr, newStr, label) {
    const result = replaceBytes(
        buffer,
        stringToLengthPrefixed(oldStr),
        stringToLengthPrefixed(newStr)
    );

    if (result.skippedTooLong) {
        logger.warn(`Skipping ${label}: replacement is longer than source.`);
    } else if (result.count > 0) {
        logger.info(`${label}: replaced ${result.count} occurrence(s).`);
    }

    return result;
}

function findAndReplaceDomainSmart(data, oldDomain, newDomain) {
    let count = 0;
    const result = Buffer.from(data);

    const oldUtf16NoLast = stringToUtf16LE(oldDomain.slice(0, -1));
    const newUtf16NoLast = stringToUtf16LE(newDomain.slice(0, -1));

    const oldLastCharByte = oldDomain.charCodeAt(oldDomain.length - 1);
    const newLastCharByte = newDomain.charCodeAt(newDomain.length - 1);

    const positions = findAllOccurrences(result, oldUtf16NoLast);

    for (const pos of positions) {
        const lastCharPos = pos + oldUtf16NoLast.length;
        if (lastCharPos + 1 > result.length) continue;

        if (result[lastCharPos] === oldLastCharByte) {
            newUtf16NoLast.copy(result, pos);
            result[lastCharPos] = newLastCharByte;
            count++;
        }
    }

    return { buffer: result, count };
}

function patchDiscordUrl(data) {
    const lpResult = replaceLengthPrefixedString(
        data,
        CONFIG.oldDiscord,
        CONFIG.newDiscord,
        'Discord URL patch'
    );

    if (lpResult.count > 0 || lpResult.skippedTooLong) {
        return lpResult;
    }

    let count = 0;
    const result = Buffer.from(data);
    const oldUtf16 = stringToUtf16LE(CONFIG.oldDiscord);
    const newUtf16 = stringToUtf16LE(CONFIG.newDiscord);
    const positions = findAllOccurrences(result, oldUtf16);

    for (const pos of positions) {
        newUtf16.copy(result, pos);
        count++;
    }

    if (count > 0) {
        logger.info(`Discord URL UTF-16 fallback: replaced ${count} occurrence(s).`);
    }

    return { buffer: result, count, skippedTooLong: false };
}

function applyDomainPatches(data) {
    let result = Buffer.from(data);
    let totalCount = 0;

    const sentryTarget = `https://t@${CONFIG.targetAuthHost}/2`;
    const sentryResult = replaceLengthPrefixedString(
        result,
        CONFIG.oldSentry,
        sentryTarget,
        'Sentry URL patch'
    );
    result = sentryResult.buffer;
    totalCount += sentryResult.count;

    const domainResult = replaceLengthPrefixedString(
        result,
        CONFIG.originalDomain,
        CONFIG.targetMainDomain,
        'Main domain patch'
    );
    result = domainResult.buffer;
    totalCount += domainResult.count;

    const targetSubdomain = `https://${CONFIG.targetSubdomainPrefix}`;
    const subdomainMappings = [
        { oldValue: 'https://sessions.', newValue: targetSubdomain, label: 'sessions subdomain patch' },
        { oldValue: 'https://account-data.', newValue: targetSubdomain, label: 'account-data subdomain patch' },
        { oldValue: 'https://telemetry.', newValue: targetSubdomain, label: 'telemetry subdomain patch' }
    ];

    for (const mapping of subdomainMappings) {
        const subResult = replaceLengthPrefixedString(result, mapping.oldValue, mapping.newValue, mapping.label);
        result = subResult.buffer;
        totalCount += subResult.count;
    }

    const toolsResult = replaceLengthPrefixedString(
        result,
        'https://tools.',
        targetSubdomain,
        'tools subdomain patch'
    );

    if (!toolsResult.skippedTooLong) {
        result = toolsResult.buffer;
        totalCount += toolsResult.count;
    }

    return { buffer: result, count: totalCount };
}

function isPatchMetadataCurrent(meta) {
    return (
        meta &&
        meta.strategy === CONFIG.patchStrategy &&
        meta.patcherVersion === CONFIG.patcherVersion &&
        meta.targetDomain === CONFIG.targetMainDomain &&
        meta.targetAuthHost === CONFIG.targetAuthHost
    );
}

function binaryHasPatchedDomainMarkers(data) {
    const targetLengthPrefixed = stringToLengthPrefixed(CONFIG.targetMainDomain);
    const targetUtf16Stub = stringToUtf16LE(CONFIG.targetMainDomain.slice(0, -1));
    return data.includes(targetLengthPrefixed) || data.includes(targetUtf16Stub);
}

async function restoreFromBackupIfAvailable(clientPath) {
    const backupPath = clientPath + '.bak';
    if (await fs.pathExists(backupPath)) {
        await fs.copy(backupPath, clientPath);
        return true;
    }
    return false;
}

async function ensureClientBackup(clientPath) {
    const backupPath = clientPath + '.bak';
    if (!await fs.pathExists(backupPath)) {
        await fs.copy(clientPath, backupPath);
    }
}


async function ensureTools(event) {
    const butlerPath = path.join(CONFIG.toolsDir, CONFIG.butlerBin);
    if (await fs.pathExists(butlerPath)) {
        return butlerPath;
    }

    await fs.ensureDir(CONFIG.toolsDir);
    const zipPath = path.join(CONFIG.toolsDir, 'butler.zip');

    let downloadUrl = '';
    const platform = process.platform;
    const arch = os.arch();

    if (platform === 'win32') {
        downloadUrl = 'https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default';
    } else if (platform === 'darwin') {
        downloadUrl = (arch === 'arm64')
            ? 'https://broth.itch.zone/butler/darwin-arm64/LATEST/archive/default'
            : 'https://broth.itch.zone/butler/darwin-amd64/LATEST/archive/default';
    } else if (platform === 'linux') {
        downloadUrl = 'https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default';
    } else {
        throw new Error('OS not supported for Butler');
    }

    if (event) event.reply('launch-status', 'status_downloading_tools');
    logger.info('Fetching dependencies from', downloadUrl);
    await downloadFile(downloadUrl, zipPath, event);

    if (event) event.reply('launch-status', 'status_configuring_tools');
    const zip = new StreamZip.async({ file: zipPath });
    await zip.extract(null, CONFIG.toolsDir);
    await zip.close();

    await fs.remove(zipPath);

    if (platform !== 'win32') {
        await fs.chmod(butlerPath, 0o755);
    }
    return butlerPath;
}

function compactOutput(text, maxLength = 3000) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
}

function quoteArg(arg) {
    const value = String(arg);
    if (!/\s/.test(value)) return value;
    return `"${value.replace(/"/g, '\\"')}"`;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getFileSizeSafe(filePath) {
    try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) return 0;
        return stat.size || 0;
    } catch {
        return 0;
    }
}

async function isUsablePatchFile(filePath) {
    const size = await getFileSizeSafe(filePath);
    return size > 0;
}

function addUniquePatchFile(list, value) {
    const patchFile = String(value || '').trim();
    if (!patchFile) return;
    if (!list.includes(patchFile)) {
        list.push(patchFile);
    }
}

function derivePatchAliasCandidates(patchFileName) {
    const candidates = [];
    const normalized = String(patchFileName || '').trim();
    if (!normalized) return candidates;

    addUniquePatchFile(candidates, normalized);

    const numericMatch = normalized.match(/^(\d+)(?:\.pwr)?$/i);
    if (numericMatch) {
        addUniquePatchFile(candidates, `${numericMatch[1]}.pwr`);
        addUniquePatchFile(candidates, `v${numericMatch[1]}.pwr`);
    }

    const prefixedMatch = normalized.match(/^v(\d+)(?:\.pwr)?$/i);
    if (prefixedMatch) {
        addUniquePatchFile(candidates, `v${prefixedMatch[1]}.pwr`);
        addUniquePatchFile(candidates, `${prefixedMatch[1]}.pwr`);
    }

    return candidates;
}

function toConfigPatchFileCandidates(entry) {
    const raw = String(entry || '').trim();
    const candidates = [];
    if (!raw) return candidates;

    if (/\.(pwr|xdelta)$/i.test(raw)) {
        addUniquePatchFile(candidates, raw);
        return candidates;
    }

    if (/^v\d+(~\d+)?$/i.test(raw)) {
        addUniquePatchFile(candidates, `${raw}.pwr`);
        return candidates;
    }

    if (/^\d+(~\d+)?$/.test(raw)) {
        addUniquePatchFile(candidates, `${raw}.pwr`);
        addUniquePatchFile(candidates, `v${raw}.pwr`);
        return candidates;
    }

    addUniquePatchFile(candidates, raw);
    if (!raw.includes('.')) {
        addUniquePatchFile(candidates, `${raw}.pwr`);
    }
    return candidates;
}

function getPatchChannelFromFileName(patchFileName) {
    return String(patchFileName || '').includes('~') ? 'pre-release' : 'release';
}

async function readPatchFallbackConfig() {
    const cachedConfig = getRemoteConfig();
    if (cachedConfig && typeof cachedConfig === 'object') {
        return cachedConfig;
    }

    try {
        const response = await axios.get(CONFIG.remoteConfigUrl, {
            timeout: 12000,
            headers: {
                'User-Agent': 'Battly4Hytale',
                'Accept': 'application/json'
            }
        });
        return response.data || null;
    } catch (error) {
        logger.warn(`Failed to load patch fallback config: ${error.message}`);
        return null;
    }
}

function buildFallbackPatchList(requestedPatchFile, fallbackConfig, sysOs, channel) {
    const candidates = [];

    for (const candidate of derivePatchAliasCandidates(requestedPatchFile)) {
        addUniquePatchFile(candidates, candidate);
    }

    const channelConfig = fallbackConfig && typeof fallbackConfig[channel] === 'object'
        ? fallbackConfig[channel]
        : null;
    const platformEntries = channelConfig && Array.isArray(channelConfig[sysOs])
        ? channelConfig[sysOs]
        : [];

    for (const entry of platformEntries) {
        for (const candidate of toConfigPatchFileCandidates(entry)) {
            addUniquePatchFile(candidates, candidate);
        }
    }

    for (const candidate of derivePatchAliasCandidates(CONFIG.fallbackPatch)) {
        addUniquePatchFile(candidates, candidate);
    }

    return candidates;
}

function sanitizePatchFileName(fileName) {
    return String(fileName || '').replace(/[^a-z0-9._~-]+/gi, '_');
}

async function downloadPatchWithRetry(patchUrlBase, patchFileName, targetPath, event, attempts = 3) {
    console.log(`Starting download for ${patchFileName} with up to ${attempts} attempts.`);
    console.log(`Patch URL base: ${patchUrlBase}`);
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const cacheBust = `cb=${Date.now()}_${attempt}`;
        const patchUrl = attempt === 1
            ? `${patchUrlBase}${patchFileName}`
            : `${patchUrlBase}${patchFileName}?${cacheBust}`;

        try {
            logger.info(`Downloading patch ${patchFileName} (attempt ${attempt}/${attempts})`);
            await downloadFile(patchUrl, targetPath, event);

            if (!await isUsablePatchFile(targetPath)) {
                throw new Error(`Downloaded patch is empty: ${targetPath}`);
            }

            return { url: patchUrl, attempt };
        } catch (error) {
            lastError = error;
            logger.warn(`Patch download failed (${patchFileName}, attempt ${attempt}): ${error.message}`);
            await fs.remove(targetPath).catch(() => { });
            if (attempt < attempts) {
                await wait(600 * attempt);
            }
        }
    }

    throw lastError || new Error(`Failed downloading patch ${patchFileName}`);
}

async function runButlerApply(patcherBin, patchArgs, stagingDir) {
    return new Promise((resolve, reject) => {
        execFile(patcherBin, patchArgs, { maxBuffer: 30 * 1024 * 1024 }, async (error, stdout, stderr) => {
            if (stagingDir && await fs.pathExists(stagingDir)) {
                await fs.remove(stagingDir).catch(() => { });
            }

            if (error) {
                const commandPreview = `${quoteArg(patcherBin)} ${patchArgs.map(quoteArg).join(' ')}`;
                const stderrText = compactOutput(stderr);
                const stdoutText = compactOutput(stdout);
                reject(new Error(
                    `Update failed: ${error.message}; cmd=${commandPreview}; stderr=${stderrText || 'n/a'}; stdout=${stdoutText || 'n/a'}`
                ));
                return;
            }

            resolve({ stdout, stderr });
        });
    });
}

async function applyBinaryMods(clientPath, event) {
    const trackingFile = clientPath + CONFIG.patchFlagFile;

    if (await fs.pathExists(trackingFile)) {
        try {
            const meta = await fs.readJson(trackingFile);
            if (isPatchMetadataCurrent(meta)) {
                const currentData = await fs.readFile(clientPath);
                if (binaryHasPatchedDomainMarkers(currentData)) {
                    logger.info("Binary already modified with current strategy.");
                    return;
                }
                logger.info("Patch metadata exists but binary markers are missing, reapplying.");
            } else {
                logger.info("Patch metadata changed, reapplying binary modifications.");
            }

            const restored = await restoreFromBackupIfAvailable(clientPath);
            if (!restored) {
                logger.warn("Backup not found, reapplying patch over current binary.");
            }
        } catch (e) {
            logger.warn("Patch metadata invalid, reapplying binary modifications.");
        }
    }

    if (event) event.reply('launch-status', 'status_patching_client');
    logger.info("Processing binary:", clientPath);

    await ensureClientBackup(clientPath);

    const rawData = await fs.readFile(clientPath);
    logger.info(`Binary size: ${(rawData.length / 1024 / 1024).toFixed(2)} MB`);

    let { buffer: patchedData, count } = applyDomainPatches(rawData);
    const discordResult = patchDiscordUrl(patchedData);
    patchedData = discordResult.buffer;
    count += discordResult.count;

    if (count === 0) {
        logger.info("No length-prefixed matches found, trying UTF-16 fallback.");
        const legacyDomainResult = findAndReplaceDomainSmart(rawData, CONFIG.originalDomain, CONFIG.targetMainDomain);
        patchedData = legacyDomainResult.buffer;
        count += legacyDomainResult.count;

        const legacyDiscordResult = patchDiscordUrl(patchedData);
        patchedData = legacyDiscordResult.buffer;
        count += legacyDiscordResult.count;
    }

    if (count === 0) {
        logger.warn("No binary replacements were applied; executable format may have changed.");
        return;
    }

    logger.info(`Applied ${count} binary replacements.`);

    await fs.writeFile(clientPath, patchedData);

    await fs.writeJson(trackingFile, {
        date: new Date().toISOString(),
        strategy: CONFIG.patchStrategy,
        patcherVersion: CONFIG.patcherVersion,
        originalDomain: CONFIG.originalDomain,
        targetDomain: CONFIG.targetMainDomain,
        targetAuthHost: CONFIG.targetAuthHost,
        patchCount: count
    });
    logger.info("Client modifications finished.");
}


async function updateGameFiles(gameDir, event, patchFile = CONFIG.primaryPatch) {
    const patcherBin = await ensureTools(event);

    const sysOs = process.platform === 'win32' ? 'windows' :
        process.platform === 'darwin' ? 'darwin' : 'linux';
    const sysArch = 'amd64';
    const patchChannel = getPatchChannelFromFileName(patchFile);

    const patchUrlBase = `${CONFIG.primaryPatchBaseUrl}/${sysOs}/${sysArch}/${patchChannel}/0/`;
    const fallbackPatchUrlBase = `${CONFIG.fallbackPatchBaseUrl}/${sysOs}/${sysArch}/${patchChannel}/0/`;
    const cachePath = path.join(app.getPath('appData'), 'Hytale', 'cache');
    await fs.ensureDir(cachePath);

    const targetPatchFile = path.join(cachePath, patchFile);
    const patchMetaFile = targetPatchFile + '.meta';

    let needsDownload = !await fs.pathExists(targetPatchFile);

    if (!needsDownload && !await isUsablePatchFile(targetPatchFile)) {
        logger.warn(`Cached patch is empty or invalid, forcing re-download: ${targetPatchFile}`);
        needsDownload = true;
        await fs.remove(targetPatchFile).catch(() => { });
        await fs.remove(patchMetaFile).catch(() => { });
    }

    if (!needsDownload && await fs.pathExists(patchMetaFile)) {
        try {
            const meta = await fs.readJson(patchMetaFile);
            const metaMatchesRequest = meta.patchFile === patchFile || meta.requestedPatch === patchFile;
            if (!metaMatchesRequest) {
                logger.info(`Patch file changed from ${meta.patchFile} to ${patchFile}, re-downloading...`);
                needsDownload = true;
            }
        } catch (e) {
            needsDownload = true;
        }
    }

    if (needsDownload) {
        if (event) event.reply('launch-status', 'status_fetching_patch');

        try {
            const primaryResult = await downloadPatchWithRetry(patchUrlBase, patchFile, targetPatchFile, event, 3);

            await fs.writeJson(patchMetaFile, {
                patchFile: patchFile,
                downloadedAt: new Date().toISOString(),
                url: primaryResult.url,
                attempt: primaryResult.attempt
            });

            _trackEvent('hytale_patch_download', { patch: patchFile });
        } catch (err) {
            logger.error(`Download failed for ${patchFile}, attempting fallback...`, err.message);

            if (event) event.reply('launch-status', 'status_fallback_attempt');
            const fallbackConfig = await readPatchFallbackConfig();
            const fallbackCandidates = buildFallbackPatchList(patchFile, fallbackConfig, sysOs, patchChannel);
            logger.info(`Fallback candidates for ${patchFile} (${patchChannel}/${sysOs}): ${fallbackCandidates.join(', ')}`);

            let fallbackApplied = false;
            let lastFallbackError = null;

            for (const fallbackPatchFile of fallbackCandidates) {
                const fallbackCacheFile = path.join(cachePath, `fallback_${sanitizePatchFileName(fallbackPatchFile)}`);
                try {
                    const fallbackResult = await downloadPatchWithRetry(
                        fallbackPatchUrlBase,
                        fallbackPatchFile,
                        fallbackCacheFile,
                        event,
                        2
                    );

                    await fs.copy(fallbackCacheFile, targetPatchFile);
                    if (!await isUsablePatchFile(targetPatchFile)) {
                        throw new Error(`Fallback patch is empty after copy: ${targetPatchFile}`);
                    }

                    await fs.writeJson(patchMetaFile, {
                        patchFile: fallbackPatchFile,
                        downloadedAt: new Date().toISOString(),
                        url: fallbackResult.url,
                        attempt: fallbackResult.attempt,
                        fallback: true,
                        requestedPatch: patchFile,
                        channel: patchChannel,
                        source: 'cdn.battlylauncher.com'
                    });

                    _trackEvent('hytale_patch_download_fallback', {
                        requestedPatch: patchFile,
                        resolvedPatch: fallbackPatchFile,
                        channel: patchChannel
                    });

                    fallbackApplied = true;
                    break;
                } catch (fallbackErr) {
                    lastFallbackError = fallbackErr;
                    logger.warn(`Fallback candidate failed (${fallbackPatchFile}): ${fallbackErr.message}`);
                    await fs.remove(fallbackCacheFile).catch(() => { });
                }
            }

            if (!fallbackApplied) {
                logger.error("All download attempts failed.", lastFallbackError || err);
                throw err;
            }
        }
    } else {
        logger.info(`Using cached patch file: ${patchFile}`);
    }

    await fs.ensureDir(gameDir);

    const patchStats = await fs.stat(targetPatchFile);
    if (!patchStats.isFile() || patchStats.size === 0) {
        throw new Error(`Patch file is invalid or empty: ${targetPatchFile}`);
    }

    let stagingArea = path.join(gameDir, 'staging_temp');
    if (await fs.pathExists(stagingArea)) {
        logger.info('Cleaning existing staging area...');
        try {
            await fs.remove(stagingArea);
        } catch (cleanError) {
            logger.warn('Failed to clean staging area:', cleanError);
            stagingArea = path.join(gameDir, `staging_temp_${Date.now()}`);
            logger.info(`Using unique staging area: ${stagingArea}`);
        }
    }

    if (event) event.reply('launch-status', 'status_updating_files');

    const makePatchArgs = (stagingDir) => ['apply', '--staging-dir', stagingDir, targetPatchFile, gameDir];

    try {
        await runButlerApply(patcherBin, makePatchArgs(stagingArea), stagingArea);
        logger.info("Game files updated successfully.");
        _trackEvent('hytale_install_success', { patch: patchFile, attempt: 1 });
        return;
    } catch (firstError) {
        logger.error("Butler apply failed (attempt 1):", firstError.message);
        _trackEvent('hytale_install_retry', { patch: patchFile, error: firstError.message });
    }

    try {
        if (event) event.reply('launch-status', 'Reintentando actualizacion...');
        await fs.emptyDir(gameDir);
        const retryStaging = path.join(gameDir, `staging_retry_${Date.now()}`);
        await runButlerApply(patcherBin, makePatchArgs(retryStaging), retryStaging);
        logger.info("Game files updated successfully on retry.");
        _trackEvent('hytale_install_success', { patch: patchFile, attempt: 2 });
    } catch (retryError) {
        _trackEvent('hytale_install_error', { error: retryError.message, patch: patchFile });
        throw retryError;
    }
}

module.exports = {
    patchGame: updateGameFiles,
    patchClient: applyBinaryMods,
    patchServer: serverPatcher.patchServer.bind(serverPatcher)
};
