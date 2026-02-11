const { contextBridge, ipcRenderer } = require('electron');



const ALLOWED_EVENTS = [
    'minimize-window',
    'close-window',
    'open-game-location',
    'open-external',
    'repair-game',
    'launch-game',
    'discord-activity',
    'track-event'
];

const ALLOWED_INVOKES = [
    'perform-update',
    'get-settings',
    'save-settings',
    'get-news',
    'get-game-logs',
    'get-gpu-info',
    'select-java-path',
    'install-mod',
    'uninstall-mod',
    'delete-mod',
    'get-installed-mods',
    'list-installed-mods',
    'search-mods',
    'get-mod-description',
    'toggle-mod',
    'read-locale',  // Mover lectura de locales a main process
    'get-available-versions',  // Sistema de versiones
    'get-version-channels',    // Canales de versiones
    'get-selected-version',    // Sistema de versiones
    'set-selected-version'     // Sistema de versiones
];

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, ...args) => {
        if (ALLOWED_EVENTS.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        } else {
            console.error(`Evento no permitido: ${channel}`);
        }
    },

    invoke: async (channel, ...args) => {
        if (ALLOWED_INVOKES.includes(channel)) {
            return await ipcRenderer.invoke(channel, ...args);
        } else {
            console.error(`InvocaciÃ³n no permitida: ${channel}`);
            throw new Error('OperaciÃ³n no permitida');
        }
    },

    on: (channel, callback) => {
        const validChannels = [
            'repair-complete',
            'update-available',
            'game-launch-status',
            'download-progress',
            'launch-error',
            'launch-status',
            'launch-success'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(event, ...args));
        } else {
            console.error(`Canal de escucha no permitido: ${channel}`);
        }
    },

    removeListener: (channel, callback) => {
        const validChannels = [
            'repair-complete',
            'update-available',
            'game-launch-status',
            'download-progress',
            'launch-error',
            'launch-status',
            'launch-success'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.removeListener(channel, callback);
        }
    },

    openExternal: (url) => {
        try {
            const urlObj = new URL(url);
            const allowedProtocols = ['http:', 'https:'];
            if (!allowedProtocols.includes(urlObj.protocol)) {
                console.error(`Protocolo no permitido: ${urlObj.protocol}`);
                return;
            }
            ipcRenderer.send('open-external', urlObj.toString());
        } catch (e) {
            console.error('URL invalida:', e);
        }
    },

    version: '1.1.0-secure'
});

contextBridge.exposeInMainWorld('fileSystem', {
    readLocale: async (lang) => {
        try {
            return await ipcRenderer.invoke('read-locale', lang);
        } catch (e) {
            console.error('Error leyendo locale:', e);
            return null;
        }
    }
});



