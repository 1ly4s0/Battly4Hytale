const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');
const axios = require('axios');
const { getRemoteConfig } = require('./updater');
const { logger } = require('../utils/logger');

const VERSION_CONFIG_FILE = path.join(app.getPath('appData'), 'Hytale', 'version-config.json');
const VERSION_REMOTE_CACHE_FILE = path.join(app.getPath('appData'), 'Hytale', 'version-remote-cache.json');
const REMOTE_CONFIG_URL = 'https://api.battlylauncher.com/hytale/config';

const CHANNEL_RELEASE = 'release';
const CHANNEL_PRERELEASE = 'pre-release';
const DEFAULT_CHANNEL = CHANNEL_RELEASE;
const KNOWN_CHANNELS = [CHANNEL_RELEASE, CHANNEL_PRERELEASE];

const FALLBACK_PATCH_BY_CHANNEL = {
    [CHANNEL_RELEASE]: 'v8.pwr',
    [CHANNEL_PRERELEASE]: 'v19~20.pwr'
};

function getPlatformKey() {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'darwin';
    return 'linux';
}

function normalizeChannel(channel) {
    const raw = String(channel || '').trim().toLowerCase();
    if (raw === CHANNEL_PRERELEASE || raw === 'beta' || raw === 'prerelease') return CHANNEL_PRERELEASE;
    return CHANNEL_RELEASE;
}

function normalizePatchFile(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (/\.(pwr|xdelta)$/i.test(raw)) return raw;
    if (!/^v?\d+(~\d+)?$/i.test(raw)) return null;
    return `${raw}.pwr`;
}

function normalizePatchIdentity(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';

    const noExt = raw.replace(/\.pwr$/i, '');
    return noExt.startsWith('v') ? noExt.slice(1) : noExt;
}

function parsePatchRank(patchFile) {
    const value = String(patchFile || '').toLowerCase();

    const release = value.match(/^v(\d+)\.pwr$/);
    if (release) {
        const num = Number(release[1]);
        return { major: num, minor: num, raw: value };
    }

    const prerelease = value.match(/^v(\d+)~(\d+)\.pwr$/);
    if (prerelease) {
        return { major: Number(prerelease[2]), minor: Number(prerelease[1]), raw: value };
    }

    const numeric = value.match(/^(\d+)\.pwr$/);
    if (numeric) {
        const num = Number(numeric[1]);
        return { major: num, minor: num, raw: value };
    }

    return { major: -1, minor: -1, raw: value };
}

function compareByRankDesc(a, b) {
    if (a.rank.major !== b.rank.major) return b.rank.major - a.rank.major;
    if (a.rank.minor !== b.rank.minor) return b.rank.minor - a.rank.minor;
    return a.rank.raw.localeCompare(b.rank.raw);
}

function buildName(patchFile, isLatest, channel) {
    if (isLatest) return `Latest (${patchFile})`;

    const release = String(patchFile).match(/^v(\d+)\.pwr$/i);
    if (release) return `Build ${release[1]}`;

    if (channel === CHANNEL_PRERELEASE) return `Beta (${patchFile})`;
    return patchFile;
}

function buildDescription(patchFile, channel, isLatest) {
    if (isLatest) {
        return channel === CHANNEL_PRERELEASE
            ? 'Latest beta patch'
            : 'Latest official patch';
    }

    if (channel === CHANNEL_PRERELEASE) return `Beta patch ${patchFile}`;
    return `Official patch ${patchFile}`;
}

function hasVersionLists(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const platform = getPlatformKey();

    return KNOWN_CHANNELS.some(channel => {
        const section = payload[channel];
        return section && Array.isArray(section[platform]) && section[platform].length > 0;
    });
}

function extractVersionConfig(payload) {
    console.log('Extracting version config from payload:', payload);
    if (!payload || typeof payload !== 'object') return null;
    if (hasVersionLists(payload)) return payload;

    const nestedCandidates = [payload.hytale, payload.data, payload.config, payload.versions];
    for (const candidate of nestedCandidates) {
        if (hasVersionLists(candidate)) return candidate;
        if (candidate && typeof candidate === 'object' && hasVersionLists(candidate.hytale)) return candidate.hytale;
    }

    return null;
}

function getAvailableChannelsFromConfig(config) {
    if (!config || typeof config !== 'object') return [DEFAULT_CHANNEL];
    const platform = getPlatformKey();

    const channels = KNOWN_CHANNELS.filter(channel => {
        const section = config[channel];
        return section && Array.isArray(section[platform]) && section[platform].length > 0;
    });

    return channels.length > 0 ? channels : [DEFAULT_CHANNEL];
}

function buildVersionEntriesFromConfig(config, channel) {
    const platform = getPlatformKey();
    const normalizedChannel = normalizeChannel(channel);
    const entries = Array.isArray(config?.[normalizedChannel]?.[platform])
        ? config[normalizedChannel][platform]
        : [];

    const allEntries = [];
    for (const item of entries) {
        const patchFile = normalizePatchFile(item);
        if (!patchFile) continue;
        allEntries.push({ patchFile, channel: normalizedChannel, rank: parsePatchRank(patchFile) });
    }

    const unique = [];
    const seen = new Set();
    for (const entry of allEntries) {
        const key = entry.patchFile.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(entry);
    }

    unique.sort(compareByRankDesc);
    const latestPatch = unique.length > 0 ? unique[0].patchFile : null;

    return unique.map((entry) => {
        const idSafePatch = entry.patchFile.replace(/[^a-z0-9._~-]+/gi, '_');
        const isLatest = latestPatch === entry.patchFile;
        return {
            id: `${entry.channel}-${idSafePatch}`,
            name: buildName(entry.patchFile, isLatest, entry.channel),
            patchFile: entry.patchFile,
            description: buildDescription(entry.patchFile, entry.channel, isLatest),
            channel: entry.channel
        };
    });
}

async function fetchRemoteConfigFromApi() {
    const response = await axios.get(REMOTE_CONFIG_URL, {
        timeout: 15000,
        headers: {
            'User-Agent': 'Battly4Hytale',
            'Accept': 'application/json'
        }
    });

    const payload = response.data || {};
    await fs.ensureDir(path.dirname(VERSION_REMOTE_CACHE_FILE));
    await fs.writeJson(VERSION_REMOTE_CACHE_FILE, payload, { spaces: 2 });
    return payload;
}

async function readRemoteVersionConfig() {
    const updaterConfig = getRemoteConfig();
    const fromUpdater = extractVersionConfig(updaterConfig);
    if (fromUpdater) {
        return fromUpdater;
    }

    try {
        const payload = await fetchRemoteConfigFromApi();
        const fromApi = extractVersionConfig(payload);
        if (fromApi) return fromApi;
        throw new Error('Remote config does not include release/pre-release lists');
    } catch (error) {
        logger.warn(`Failed to fetch remote version config: ${error.message}`);

        if (await fs.pathExists(VERSION_REMOTE_CACHE_FILE)) {
            try {
                const cachePayload = await fs.readJson(VERSION_REMOTE_CACHE_FILE);
                const fromCache = extractVersionConfig(cachePayload);
                if (fromCache) {
                    logger.info('Using cached remote version config');
                    return fromCache;
                }
            } catch (cacheError) {
                logger.warn(`Failed to read cached remote version config: ${cacheError.message}`);
            }
        }

        throw error;
    }
}

function buildFallbackVersions(channel) {
    const normalizedChannel = normalizeChannel(channel);
    const patchFile = FALLBACK_PATCH_BY_CHANNEL[normalizedChannel] || FALLBACK_PATCH_BY_CHANNEL[DEFAULT_CHANNEL];

    return [
        {
            id: `${normalizedChannel}-${patchFile}`,
            name: `Latest (${patchFile})`,
            patchFile,
            description: normalizedChannel === CHANNEL_PRERELEASE ? 'Latest known beta patch' : 'Latest known official patch',
            channel: normalizedChannel
        }
    ];
}

async function getAvailableChannels() {
    try {
        const config = await readRemoteVersionConfig();
        return getAvailableChannelsFromConfig(config);
    } catch (error) {
        logger.warn(`Using fallback channel list: ${error.message}`);
        return [DEFAULT_CHANNEL, CHANNEL_PRERELEASE];
    }
}

async function getAvailableVersions(channel = DEFAULT_CHANNEL) {
    const requestedChannel = normalizeChannel(channel);

    try {
        const config = await readRemoteVersionConfig();
        const availableChannels = getAvailableChannelsFromConfig(config);
        const resolvedChannel = availableChannels.includes(requestedChannel)
            ? requestedChannel
            : availableChannels[0] || DEFAULT_CHANNEL;

        const versions = buildVersionEntriesFromConfig(config, resolvedChannel);
        if (versions.length === 0) {
            logger.warn(`Remote config returned no versions for ${resolvedChannel}, using fallback versions`);
            return buildFallbackVersions(resolvedChannel);
        }

        return versions;
    } catch (error) {
        logger.error(`Error fetching available versions for ${requestedChannel}: ${error.message}`);
        return buildFallbackVersions(requestedChannel);
    }
}

async function getSelectedVersion(channel = DEFAULT_CHANNEL) {
    const requestedChannel = normalizeChannel(channel);

    try {
        const availableVersions = await getAvailableVersions(requestedChannel);
        const latestVersion = availableVersions[0] || {
            id: `${requestedChannel}-${FALLBACK_PATCH_BY_CHANNEL[requestedChannel]}`,
            patchFile: FALLBACK_PATCH_BY_CHANNEL[requestedChannel],
            channel: requestedChannel
        };

        if (await fs.pathExists(VERSION_CONFIG_FILE)) {
            const config = await fs.readJson(VERSION_CONFIG_FILE);
            const selected = config.selectedVersion || {};
            const selectedChannel = normalizeChannel(selected.channel || requestedChannel);

            if (selectedChannel !== requestedChannel) {
                return {
                    id: latestVersion.id,
                    patchFile: latestVersion.patchFile,
                    channel: requestedChannel
                };
            }

            const matchById = availableVersions.find(v => v.id === selected.id);
            if (matchById) {
                return { id: matchById.id, patchFile: matchById.patchFile, channel: matchById.channel || requestedChannel };
            }

            const matchByPatch = availableVersions.find(v => v.patchFile === selected.patchFile);
            if (matchByPatch) {
                return { id: matchByPatch.id, patchFile: matchByPatch.patchFile, channel: matchByPatch.channel || requestedChannel };
            }

            const selectedIdentity = normalizePatchIdentity(selected.patchFile);
            if (selectedIdentity) {
                const matchByIdentity = availableVersions.find(v => normalizePatchIdentity(v.patchFile) === selectedIdentity);
                if (matchByIdentity) {
                    return { id: matchByIdentity.id, patchFile: matchByIdentity.patchFile, channel: matchByIdentity.channel || requestedChannel };
                }
            }

            return { id: latestVersion.id, patchFile: latestVersion.patchFile, channel: requestedChannel };
        }
    } catch (error) {
        logger.error('Error loading version config:', error);
    }

    const fallback = buildFallbackVersions(requestedChannel)[0];
    return { id: fallback.id, patchFile: fallback.patchFile, channel: requestedChannel };
}

async function setSelectedVersion(versionId, patchFile, channel = DEFAULT_CHANNEL) {
    try {
        const normalizedChannel = normalizeChannel(channel);
        await fs.ensureDir(path.dirname(VERSION_CONFIG_FILE));
        const config = {
            selectedVersion: {
                id: versionId,
                patchFile,
                channel: normalizedChannel,
                updatedAt: new Date().toISOString()
            }
        };
        await fs.writeJson(VERSION_CONFIG_FILE, config, { spaces: 2 });
        logger.info(`Version set to: ${versionId} (${patchFile}) [${normalizedChannel}]`);
        return true;
    } catch (error) {
        logger.error('Error saving version config:', error);
        return false;
    }
}

function getInstanceDirectory(versionId) {
    return path.join(
        app.getPath('appData'),
        'Hytale',
        'instances',
        versionId
    );
}

function getGameDirectory(versionId) {
    return path.join(
        getInstanceDirectory(versionId),
        'install',
        'release',
        'package',
        'game',
        'latest'
    );
}

module.exports = {
    getAvailableChannels,
    getAvailableVersions,
    getSelectedVersion,
    setSelectedVersion,
    getInstanceDirectory,
    getGameDirectory
};
