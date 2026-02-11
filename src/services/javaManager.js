const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');
const StreamZip = require('node-stream-zip');
const { execFile } = require('child_process');
const { downloadFile } = require('./utils');
const os = require('os');
const { logger } = require('../utils/logger');

const JRE_DIR = path.join(app.getPath('appData'), 'Hytale', 'install', 'release', 'package', 'jre', 'latest');
const JAVA_EXECUTABLE = process.platform === 'win32' ? 'java.exe' : 'java';

function sendStatus(event, status) {
    if (event && typeof event.reply === 'function') {
        event.reply('launch-status', status);
    }
}

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        execFile(command, args, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${command} ${args.join(' ')} failed: ${stderr || error.message}`));
                return;
            }
            resolve(stdout);
        });
    });
}

function resolveArchiveFileName(downloadUrl) {
    try {
        const parsed = new URL(downloadUrl);
        return decodeURIComponent(path.basename(parsed.pathname));
    } catch {
        const raw = String(downloadUrl || '').split('?')[0];
        return decodeURIComponent(path.basename(raw));
    }
}

async function extractArchive(archivePath, targetDir, fileName) {
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.zip')) {
        const zip = new StreamZip.async({ file: archivePath });
        await zip.extract(null, targetDir);
        await zip.close();
        return;
    }

    if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) {
        await runCommand('tar', ['-xzf', archivePath, '-C', targetDir]);
        return;
    }

    if (lowerName.endsWith('.tar.xz')) {
        await runCommand('tar', ['-xJf', archivePath, '-C', targetDir]);
        return;
    }

    if (lowerName.endsWith('.tar')) {
        await runCommand('tar', ['-xf', archivePath, '-C', targetDir]);
        return;
    }

    throw new Error(`Formato de archivo JRE no soportado: ${fileName}`);
}

async function flattenNestedDirectory(baseDir) {
    const items = await fs.readdir(baseDir);
    if (items.length !== 1) {
        return;
    }

    const nestedDir = path.join(baseDir, items[0]);
    const nestedStat = await fs.stat(nestedDir);
    if (!nestedStat.isDirectory()) {
        return;
    }

    const nestedItems = await fs.readdir(nestedDir);
    for (const item of nestedItems) {
        await fs.move(path.join(nestedDir, item), path.join(baseDir, item), { overwrite: true });
    }
    await fs.remove(nestedDir);
}

async function getJavaExec() {
    const bundledJava = path.join(JRE_DIR, 'bin', JAVA_EXECUTABLE);
    if (await fs.pathExists(bundledJava)) {
        return bundledJava;
    }

    return 'java';
}

async function ensureJavaInstalled(event) {
    const bundledJava = path.join(JRE_DIR, 'bin', JAVA_EXECUTABLE);
    if (await fs.pathExists(bundledJava)) {
        return bundledJava;
    }

    sendStatus(event, 'Comprobando Java...');

    let jreConfigPath = path.resolve(__dirname, '../../jre.json');
    if (!fs.existsSync(jreConfigPath)) {
        jreConfigPath = path.resolve(process.cwd(), 'jre.json');
    }

    if (!fs.existsSync(jreConfigPath)) {
        throw new Error('jre.json configuration not found');
    }

    const jreConfig = await fs.readJson(jreConfigPath);
    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
    const arch = os.arch() === 'x64' ? 'x64' : 'arm64';

    if (!jreConfig.download_url[platform] || !jreConfig.download_url[platform][arch]) {
        throw new Error(`Java runtime not defined for ${platform} ${arch}`);
    }

    const targetInfo = jreConfig.download_url[platform][arch];
    const downloadUrl = targetInfo.url;
    const tempDir = app.getPath('temp');
    const fileName = resolveArchiveFileName(downloadUrl);
    const downloadPath = path.join(tempDir, fileName);

    sendStatus(event, 'Descargando Java Runtime...');
    await downloadFile(downloadUrl, downloadPath, event);

    sendStatus(event, 'Extrayendo Java...');
    await fs.ensureDir(JRE_DIR);
    await fs.emptyDir(JRE_DIR);

    try {
        await extractArchive(downloadPath, JRE_DIR, fileName);
        await flattenNestedDirectory(JRE_DIR);
    } finally {
        await fs.remove(downloadPath);
    }

    const resolvedJavaPath = path.join(JRE_DIR, 'bin', JAVA_EXECUTABLE);
    if (!await fs.pathExists(resolvedJavaPath)) {
        throw new Error(`Java executable not found after extraction: ${resolvedJavaPath}`);
    }

    if (process.platform !== 'win32') {
        try {
            await fs.chmod(resolvedJavaPath, 0o755);
        } catch (error) {
            logger.warn(`No se pudo aplicar chmod al ejecutable de Java: ${error.message}`);
        }
    }

    return resolvedJavaPath;
}

module.exports = {
    ensureJavaInstalled,
    getJavaExec
};
