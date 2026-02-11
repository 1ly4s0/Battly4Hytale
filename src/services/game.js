const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const crypto = require('crypto');
const StreamZip = require('node-stream-zip');
const { downloadFile } = require('./utils');
const { getRemoteConfig } = require('./updater');
const { getSettings } = require('./config');
const { setActivity } = require('./discord');
const { ensureJavaInstalled } = require('./javaManager');
const { patchGame, patchClient, patchServer } = require('./patcher');
const { startGameLogSession, appendGameLog, endGameLogSession } = require('./gameLogs');
const { _trackEvent } = require('../analytics');
const { getOrCreatePlayerUUID, updatePlayerLastUsed } = require('./playerManager');
const { getSelectedVersion, getGameDirectory, getInstanceDirectory } = require('./versionManager');
const { logger } = require('../utils/logger');

const USER_AGENT = "Battly (https://github.com/1ly4s0/Battly4Hytale, 1.1.0)";

const EXECUTABLE_BASENAME_SET = new Set([
    'hytaleclient.exe',
    'hytaleclient',
    'hytale.exe',
    'hytale'
]);
const LINUX_SYSTEM_LIBZSTD_PATHS = [
    '/usr/lib64/libzstd.so.1',
    '/usr/lib/libzstd.so.1',
    '/usr/lib/x86_64-linux-gnu/libzstd.so.1'
];

async function listDirectoryEntriesSafe(dirPath) {
    try {
        return await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
        return [];
    }
}

async function findExecutableInDir(dirPath) {
    const entries = await listDirectoryEntriesSafe(dirPath);
    const files = entries
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .filter(name => EXECUTABLE_BASENAME_SET.has(name.toLowerCase()));

    if (files.length === 0) return null;

    const priority = process.platform === 'win32'
        ? ['hytaleclient.exe', 'hytale.exe', 'hytaleclient', 'hytale']
        : ['hytaleclient', 'hytale', 'hytaleclient.exe', 'hytale.exe'];

    files.sort((a, b) => priority.indexOf(a.toLowerCase()) - priority.indexOf(b.toLowerCase()));
    return path.join(dirPath, files[0]);
}

async function findGameExecutable(gameDir) {
    const preferredDirs = [
        path.join(gameDir, 'Client'),
        path.join(gameDir, 'client'),
        gameDir
    ];

    for (const dirPath of preferredDirs) {
        const match = await findExecutableInDir(dirPath);
        if (match) return match;
    }

    const queue = [{ dir: gameDir, depth: 0 }];
    const maxDepth = 3;

    while (queue.length > 0) {
        const { dir, depth } = queue.shift();
        const entries = await listDirectoryEntriesSafe(dir);

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && EXECUTABLE_BASENAME_SET.has(entry.name.toLowerCase())) {
                return fullPath;
            }
            if (entry.isDirectory() && depth < maxDepth) {
                queue.push({ dir: fullPath, depth: depth + 1 });
            }
        }
    }

    return null;
}

async function findServerJar(gameDir) {
    const candidates = [
        path.join(gameDir, 'Server', 'HytaleServer.jar'),
        path.join(gameDir, 'server', 'HytaleServer.jar'),
        path.join(gameDir, 'Server', 'hytaleserver.jar'),
        path.join(gameDir, 'server', 'hytaleserver.jar')
    ];

    for (const candidate of candidates) {
        if (await fs.pathExists(candidate)) return candidate;
    }

    return null;
}

function getRuntimeGlibcVersion() {
    try {
        return process.report?.getReport?.()?.header?.glibcVersionRuntime || null;
    } catch {
        return null;
    }
}

function extractHighestGlibcVersion(text) {
    const input = String(text || '');
    const matches = [...input.matchAll(/GLIBC_(\d+)\.(\d+)/g)];
    if (matches.length === 0) return null;

    const versions = matches.map(m => ({
        major: Number(m[1]),
        minor: Number(m[2]),
        raw: `${m[1]}.${m[2]}`
    }));
    versions.sort((a, b) => (a.major - b.major) || (a.minor - b.minor));
    return versions[versions.length - 1].raw;
}

async function applyLinuxLibzstdCompatibility(executablePath) {
    if (process.platform !== 'linux' || process.env.HYTALE_NO_LIBZSTD_FIX === '1') {
        return;
    }

    const clientDir = path.dirname(executablePath);
    const bundledLibzstd = path.join(clientDir, 'libzstd.so');
    const backupLibzstd = path.join(clientDir, 'libzstd.so.bundled');

    if (!await fs.pathExists(bundledLibzstd)) {
        return;
    }

    let systemLibzstd = null;
    for (const candidate of LINUX_SYSTEM_LIBZSTD_PATHS) {
        if (await fs.pathExists(candidate)) {
            systemLibzstd = candidate;
            break;
        }
    }

    if (!systemLibzstd) {
        logger.warn('Linux libzstd workaround skipped: no system libzstd.so.1 found.');
        return;
    }

    try {
        const stats = await fs.lstat(bundledLibzstd);
        if (stats.isSymbolicLink()) {
            return;
        }

        if (!await fs.pathExists(backupLibzstd)) {
            await fs.move(bundledLibzstd, backupLibzstd, { overwrite: true });
        } else {
            await fs.remove(bundledLibzstd);
        }

        await fs.symlink(systemLibzstd, bundledLibzstd);
        logger.info(`Linux libzstd workaround applied: ${bundledLibzstd} -> ${systemLibzstd}`);
    } catch (error) {
        logger.warn(`Linux libzstd workaround failed: ${error.message}`);
    }
}


async function fetchAuthTokens(uuid, name) {
    const authServerUrl = "https://sessions.battly.org";
    try {
        logger.info(`Solicitando tokens de autenticaciÃ³n reales a ${authServerUrl}`);

        const response = await fetch(`${authServerUrl}/game-session/child`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT
            },
            body: JSON.stringify({
                uuid: uuid,
                name: name,
                scopes: ['hytale:server', 'hytale:client']
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Server returned ${response.status}: ${text}`);
        }

        const data = await response.json();
        logger.info("Tokens obtenidos correctamente del servidor.");
        return {
            identityToken: data.IdentityToken || data.identityToken,
            sessionToken: data.SessionToken || data.sessionToken
        };
    } catch (e) {
        logger.error("Error obteniendo tokens reales, usando fallback local:", e);
        return generateLocalTokens(uuid, name);
    }
}

async function launchGame(event, username) {
    logger.info(`Solicitud de inicio para: ${username}`);
    _trackEvent('game_launch_attempt', { username: username });
    const win = BrowserWindow.fromWebContents(event.sender);

    const selectedVersion = await getSelectedVersion();
    logger.info(`Launching version: ${selectedVersion.id} (${selectedVersion.patchFile})`);

    const hytaleRoot = path.join(app.getPath('appData'), 'Hytale');
    const gameDir = getGameDirectory(selectedVersion.id);
    const userDir = path.join(hytaleRoot, 'UserData');


    await fs.ensureDir(userDir);


    let javaExec;
    try {
        javaExec = await ensureJavaInstalled(event);
    } catch (e) {
        logger.error("Java Error:", e);
        event.reply('launch-error', `Error Java: ${e.message}`);
        return;
    }


    let executablePath = await findGameExecutable(gameDir);
    if (!executablePath) {
        try {
            await patchGame(gameDir, event, selectedVersion.patchFile);
        } catch (e) {
            logger.error("Game Patch Error:", e);
            event.reply('launch-error', `Error instalando juego: ${e.message}`);
            return;
        }
        executablePath = await findGameExecutable(gameDir);
    }


    try {
        if (executablePath && await fs.pathExists(executablePath)) {
            await patchClient(executablePath, event);

            const serverPath = await findServerJar(gameDir);
            if (serverPath) {
                await patchServer(serverPath, javaExec, event);
            } else {
                logger.warn(`Server JAR not found in ${gameDir}`);
            }

        } else {
            const gameDirExists = await fs.pathExists(gameDir);
            let topLevelEntries = [];
            if (gameDirExists) {
                const entries = await listDirectoryEntriesSafe(gameDir);
                topLevelEntries = entries.map(entry => entry.name).slice(0, 20);
            }
            throw new Error(`Game executable not found after patching. gameDir=${gameDir}; entries=${topLevelEntries.join(', ')}`);
        }
    } catch (e) {
        logger.error("Client Patch Error:", e);
        event.reply('launch-error', `Error parcheando cliente: ${e.message}`);
        return;
    }

    event.reply('launch-status', 'status_launching');

    const uuid = await getOrCreatePlayerUUID(username);
    await updatePlayerLastUsed(username);

    const tokens = await fetchAuthTokens(uuid, username);

    const settings = getSettings();
    const args = [
        '--app-dir', gameDir,
        '--user-dir', userDir,
        '--java-exec', settings.useCustomJava && settings.customJavaPath ? settings.customJavaPath : javaExec,
        '--auth-mode', 'authenticated',
        '--uuid', uuid,
        '--name', username,
        '--identity-token', tokens.identityToken,
        '--session-token', tokens.sessionToken
    ];

    logger.info("Ejecutando:", executablePath, args);
    await startGameLogSession({
        username,
        versionId: selectedVersion.id,
        patchFile: selectedVersion.patchFile
    });
    await appendGameLog('system', `Launching executable: ${executablePath}`);
    await appendGameLog('system', `Args: ${args.join(' ')}`);
    await applyLinuxLibzstdCompatibility(executablePath);

    setActivity('Jugando a Hytale', `Jugador: ${username}`, 'logo', 'Hytale');

    if (settings.hideLauncher && win) {
        win.hide();
    }

    const child = spawn(executablePath, args, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let glibcMismatch = null;

    child.stdout.on('data', (data) => {
        const chunk = data.toString();
        logger.info(`[Game]: ${chunk.trim()}`);
        void appendGameLog('stdout', chunk);
    });

    child.stderr.on('data', (data) => {
        const chunk = data.toString();
        logger.error(`[Game Error]: ${chunk.trim()}`);
        void appendGameLog('stderr', chunk);

        const requiredGlibc = extractHighestGlibcVersion(chunk);
        if (requiredGlibc) {
            glibcMismatch = {
                required: requiredGlibc,
                runtime: getRuntimeGlibcVersion()
            };
        }
    });

    child.on('error', (err) => {
        logger.error("Failed to start game process:", err);
        void appendGameLog('error', `Process error: ${err.message}`);
        void endGameLogSession(`process-error-${err.message}`);
        event.reply('launch-error', `Error al iniciar proceso: ${err.message}`);
        if (win) {
            win.show();
            win.focus();
        }
    });

    child.on('close', (code) => {
        logger.info(`Game process exited with code ${code}`);
        void endGameLogSession(`process-exit-${code}`);
        if (win) {
            setActivity('En el Launcher');
            win.show();
            win.focus();
            event.reply('launch-status', '');
        }

        if (code !== 0) {
            if (glibcMismatch) {
                const runtimeText = glibcMismatch.runtime ? `GLIBC_${glibcMismatch.runtime}` : 'GLIBC_desconocida';
                event.reply(
                    'launch-error',
                    `Incompatibilidad GLIBC detectada (runtime ${runtimeText}, requerido GLIBC_${glibcMismatch.required}). Tu sistema Linux es demasiado antiguo para este build. Usa una distro mas reciente (ej. Ubuntu 24.04+) o un entorno con GLIBC compatible.`
                );
            } else {
                event.reply('launch-error', `El juego se cerro con codigo: ${code}`);
            }
        } else {
            event.reply('launch-success', 'Juego terminado');
        }
    });
    child.unref();
    event.reply('launch-success', 'Juego iniciado');
}

function generateLocalTokens(uuid, name) {

    const authServerUrl = "https://sessions.battly.org";
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 36000;

    const header = Buffer.from(JSON.stringify({
        alg: 'EdDSA',
        kid: '2025-10-01',
        typ: 'JWT'
    })).toString('base64url');

    const identityPayload = Buffer.from(JSON.stringify({
        sub: uuid,
        name: name,
        username: name,
        entitlements: ['game.base'],
        scope: 'hytale:server hytale:client',
        iat: now,
        exp: exp,
        iss: authServerUrl,
        jti: crypto.randomUUID()
    })).toString('base64url');

    const sessionPayload = Buffer.from(JSON.stringify({
        sub: uuid,
        scope: 'hytale:server',
        iat: now,
        exp: exp,
        iss: authServerUrl,
        jti: crypto.randomUUID()
    })).toString('base64url');

    const signature = crypto.randomBytes(64).toString('base64url');

    return {
        identityToken: `${header}.${identityPayload}.${signature}`,
        sessionToken: `${header}.${sessionPayload}.${signature}`
    };
}

module.exports = { launchGame };
