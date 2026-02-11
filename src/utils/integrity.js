const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('./logger');



const TRUSTED_DOMAINS = [
    'launcher.hytale.com',
    'hytale.com',
    'battly.org', // Authentication server
    'sessions.battly.org', // Authentication server
    'battlylauncher.com',
    'api.battlylauncher.com',
    'analytics-hytale.battlylauncher.com',
    'broth.itch.zone', // Butler downloads
    'github.com',
    'raw.githubusercontent.com',
    'api.curseforge.com', // CurseForge API
    'edge.forgecdn.net', // CurseForge CDN
    'media.forgecdn.net', // CurseForge Media CDN
    'ui-avatars.com', // Avatar placeholder service
    'i.imgur.com', // Imgur images
    'cdn.jsdelivr.net', // DOMPurify CDN
    'cdnjs.cloudflare.com', // Font Awesome CDN
    'fonts.googleapis.com', // Google Fonts
    'fonts.gstatic.com', // Google Fonts static
    'discord.com', // Discord links
    'bootstrapcdn.com', // Bootstrap CDN
    'fontawesome.github.io' // Font Awesome CDN alternativo
];


function isTrustedDomain(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
            logger.warn(`Protocolo no seguro: ${urlObj.protocol}`);
            return false;
        }

        return TRUSTED_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        );
    } catch (e) {
        logger.error('URL invÃ¡lida:', e);
        return false;
    }
}


async function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}


async function verifyFileIntegrity(filePath, expectedHash = null) {
    try {
        if (!await fs.pathExists(filePath)) {
            throw new Error('Archivo no existe');
        }

        const actualHash = await calculateFileHash(filePath);

        if (!expectedHash) {
            logger.warn(`No se proporcionÃ³ hash para verificaciÃ³n: ${path.basename(filePath)}`);
            return {
                valid: true, // Asumimos vÃ¡lido si no hay hash para comparar
                actualHash,
                expectedHash: null,
                warning: 'No se pudo verificar integridad (hash no proporcionado)'
            };
        }

        const valid = actualHash.toLowerCase() === expectedHash.toLowerCase();

        if (!valid) {
            logger.error(`Hash mismatch para ${filePath}:`);
            logger.error(`  Esperado: ${expectedHash}`);
            logger.error(`  Actual:   ${actualHash}`);
        }

        return {
            valid,
            actualHash,
            expectedHash
        };
    } catch (error) {
        logger.error('Error verificando integridad del archivo:', error);
        throw error;
    }
}


async function verifyMultipleFiles(files) {
    const results = [];
    let allValid = true;

    for (const file of files) {
        try {
            const result = await verifyFileIntegrity(file.path, file.hash);
            results.push({
                file: file.path,
                ...result
            });

            if (!result.valid) {
                allValid = false;
            }
        } catch (error) {
            results.push({
                file: file.path,
                valid: false,
                error: error.message
            });
            allValid = false;
        }
    }

    return {
        valid: allValid,
        results
    };
}


async function createIntegrityManifest(downloadDir, files) {
    const manifest = {
        timestamp: new Date().toISOString(),
        files: files.map(f => ({
            name: path.basename(f.file),
            path: f.file,
            hash: f.hash,
            verified: f.valid
        }))
    };

    const manifestPath = path.join(downloadDir, '.integrity-manifest.json');
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });

    return manifestPath;
}


async function secureDownload(url, destPath, expectedHash, downloadFunction) {
    if (!isTrustedDomain(url)) {
        throw new Error(`Dominio no confiable: ${url}`);
    }

    logger.info(`Iniciando descarga segura desde: ${url}`);

    await downloadFunction(url, destPath);

    const verification = await verifyFileIntegrity(destPath, expectedHash);

    if (expectedHash && !verification.valid) {
        await fs.remove(destPath);
        throw new Error('VerificaciÃ³n de integridad fallÃ³ - archivo eliminado');
    }

    logger.info(`Descarga verificada exitosamente: ${path.basename(destPath)}`);
    logger.info(`  Hash: ${verification.actualHash}`);

    return {
        success: true,
        hash: verification.actualHash,
        verified: verification.valid
    };
}


function addTrustedDomain(domain) {
    if (!TRUSTED_DOMAINS.includes(domain)) {
        logger.warn(`Agregando dominio a lista de confianza: ${domain}`);
        TRUSTED_DOMAINS.push(domain);
    }
}

module.exports = {
    isTrustedDomain,
    calculateFileHash,
    verifyFileIntegrity,
    verifyMultipleFiles,
    createIntegrityManifest,
    secureDownload,
    addTrustedDomain,
    TRUSTED_DOMAINS
};
