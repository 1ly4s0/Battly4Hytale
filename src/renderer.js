

function sanitizeHTML(dirty) {
    if (typeof dirty !== 'string') return '';

    if (window.DOMPurify) {
        return window.DOMPurify.sanitize(dirty, {
            ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'img'],
            ALLOWED_ATTR: ['href', 'title', 'class', 'src', 'alt'],
            ALLOW_DATA_ATTR: false,
            ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i
        });
    }

    const div = document.createElement('div');
    div.textContent = dirty;
    return div.innerHTML;
}

const ipcRenderer = {
    invoke: (channel, ...args) => {
        if (!window.electronAPI) {
            console.error('electronAPI no estÃ¡ disponible aÃºn');
            return Promise.reject(new Error('electronAPI no disponible'));
        }
        return window.electronAPI.invoke(channel, ...args);
    },
    send: (channel, ...args) => {
        if (!window.electronAPI) {
            console.error('electronAPI no estÃ¡ disponible aÃºn');
            return;
        }
        window.electronAPI.send(channel, ...args);
    },
    on: (channel, callback) => {
        if (!window.electronAPI) {
            console.error('electronAPI no estÃ¡ disponible aÃºn');
            return;
        }
        window.electronAPI.on(channel, callback);
    },
    removeListener: (channel, callback) => {
        if (!window.electronAPI) {
            console.error('electronAPI no estÃ¡ disponible aÃºn');
            return;
        }
        window.electronAPI.removeListener(channel, callback);
    }
};

const electron = {
    shell: {
        openExternal: (url) => {
            if (!window.electronAPI) {
                console.error('electronAPI no estÃ¡ disponible aÃºn');
                return;
            }
            if (typeof window.electronAPI.openExternal === 'function') {
                window.electronAPI.openExternal(url);
                return;
            }
            if (typeof window.electronAPI.send === 'function') {
                window.electronAPI.send('open-external', url);
                return;
            }
            console.error('openExternal no esta disponible');
        }
    }
};

function require(module) {
    if (module === 'electron') {
        return { ipcRenderer, shell: electron.shell };
    }
    console.warn(`require('${module}') no estÃ¡ disponible en modo seguro`);
    return {};
}

const path = {
    join: (...args) => args.join('/').replace(/\/+/g, '/')
};

const fs = {
    existsSync: () => false,
    readFileSync: () => '{}'
};

const i18nService = window.LauncherI18n || null;
let currentTranslations = {};
const languageSelect = document.getElementById('languageSelect');
const defaultLang = localStorage.getItem('battly_lang') || 'es';
let latestNewsItems = [];
let activeNewsIndex = 0;
const FALLBACK_NEWS_ITEMS = [
    {
        id: 'fallback-1',
        title: 'Hotfixes: January',
        summary: 'Small stability and launcher compatibility updates.',
        category: 'UPDATE',
        image: 'assets/images/launch.png',
        link: 'https://hytale.com/news',
        date: new Date().toISOString()
    },
    {
        id: 'fallback-2',
        title: 'Patch Notes - Update 2',
        summary: 'Gameplay balance and interface improvements.',
        category: 'UPDATE',
        image: 'assets/images/update2.png',
        link: 'https://hytale.com/news',
        date: new Date(Date.now() - (1000 * 60 * 60 * 24 * 3)).toISOString()
    },
    {
        id: 'fallback-3',
        title: 'Hytale is finally here!',
        summary: 'Official announcement and first wave details.',
        category: 'ANNOUNCEMENT',
        image: 'assets/images/background.png',
        link: 'https://hytale.com/news',
        date: new Date(Date.now() - (1000 * 60 * 60 * 24 * 8)).toISOString()
    }
];

function formatNewsDate(dateValue) {
    if (!dateValue) return 'RECENT';

    const newsDate = new Date(dateValue);
    if (Number.isNaN(newsDate.getTime())) return 'RECENT';

    const now = new Date();
    const diffDays = Math.floor((now - newsDate) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'TODAY';
    if (diffDays === 1) return '1 DAY AGO';
    if (diffDays < 7) return `${diffDays} DAYS AGO`;
    return newsDate.toLocaleDateString();
}

function getActiveNewsItem() {
    if (latestNewsItems.length === 0) return null;
    if (activeNewsIndex < 0 || activeNewsIndex >= latestNewsItems.length) {
        activeNewsIndex = 0;
    }
    return latestNewsItems[activeNewsIndex] || latestNewsItems[0] || null;
}

function updateNewsRailState() {
    const stripTitle = document.querySelector('.news-strip-title');
    const cards = Array.from(document.querySelectorAll('#newsContainer .news-card'));
    const dots = Array.from(document.querySelectorAll('#newsDots .news-dot'));
    const activeItem = getActiveNewsItem();

    cards.forEach((card, index) => {
        card.classList.toggle('is-active', index === activeNewsIndex);
    });

    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === activeNewsIndex);
    });

    if (stripTitle) {
        const mainTitle = (activeItem?.title || t('news_default_title')).toString().trim();
        stripTitle.textContent = mainTitle.length > 32 ? `${mainTitle.slice(0, 32)}...` : mainTitle;
    }

    if (openNewsBtn) {
        openNewsBtn.disabled = !(activeItem && typeof activeItem.link === 'string' && activeItem.link.trim().length > 0);
    }
}

function renderNewsDots(total) {
    const dotsContainer = document.getElementById('newsDots');
    if (!dotsContainer) return;

    dotsContainer.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'news-dot';
        dot.setAttribute('aria-label', `${t('news_item_aria')} ${i + 1}`);
        dot.addEventListener('click', () => {
            activeNewsIndex = i;
            updateNewsRailState();
        });
        dotsContainer.appendChild(dot);
    }
}

function renderNewsCards(items) {
    const container = document.getElementById('newsContainer');
    if (!container) return;

    container.innerHTML = '';
    latestNewsItems = items.filter(Boolean).slice(0, 3);
    activeNewsIndex = 0;

    latestNewsItems.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'news-card fade-in-up';
        card.style.animationDelay = `${index * 0.08}s`;
        card.tabIndex = 0;

        card.addEventListener('click', () => {
            activeNewsIndex = index;
            updateNewsRailState();
        });

        card.addEventListener('dblclick', () => {
            const articleLink = typeof item.link === 'string' ? item.link.trim() : '';
            if (articleLink) electron.shell.openExternal(articleLink);
        });

        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activeNewsIndex = index;
                updateNewsRailState();
            }
            if (event.key === 'Enter' && item.link) {
                electron.shell.openExternal(item.link);
            }
        });

        const bgImage = item.image || 'assets/images/background.png';
        const isPrimary = index === 0;
        const tag = (item.category || item.type || (isPrimary ? 'UPDATE' : 'ANNOUNCEMENT')).toString().toUpperCase();
        const formattedDate = formatNewsDate(item.date);
        const safeTitle = sanitizeHTML(item.title || '');
        const safeSummary = sanitizeHTML(item.summary || '');
        const safeTag = sanitizeHTML(tag);
        const safeDate = sanitizeHTML(formattedDate);

        card.innerHTML = `
            <img class="news-card-image" src="${bgImage}" alt="News">
            <div class="news-card-overlay"></div>
            <div class="news-card-content">
                <span class="news-chip">${safeTag}</span>
                <h3 class="news-card-title">${safeTitle}</h3>
                <p class="news-card-description">${safeSummary}</p>
                <div class="news-card-footer">${safeDate}</div>
            </div>
        `;
        container.appendChild(card);
    });

    renderNewsDots(latestNewsItems.length);
    updateNewsRailState();
}

async function loadNews() {
    try {
        const remoteNews = await window.electronAPI.invoke('get-news');
        if (Array.isArray(remoteNews) && remoteNews.length > 0) {
            renderNewsCards(remoteNews);
            return;
        }

        renderNewsCards(FALLBACK_NEWS_ITEMS);

    } catch (e) {
        console.error("News Load Error:", e);
        renderNewsCards(FALLBACK_NEWS_ITEMS);
    }
}

async function loadLocale(lang) {
    if (i18nService) {
        currentTranslations = await i18nService.loadLocale(lang);
        applyTranslations();
        return;
    }

    try {
        const translations = await window.fileSystem.readLocale(lang);
        if (translations) {
            currentTranslations = translations;
            localStorage.setItem('battly_lang', lang);
            applyTranslations();
        } else {
            console.error(`Locale ${lang} not found`);
        }
    } catch (e) {
        console.error('Error loading locale:', e);
    }
}

function t(key) {
    if (i18nService) {
        return i18nService.t(key, currentTranslations[key] || key);
    }
    return currentTranslations[key] || key;
}

function tf(key, fallback) {
    const value = t(key);
    return value === key ? fallback : value;
}

function applyTranslations() {
    if (i18nService) {
        i18nService.applyTranslations(document);
        if (playBtn && !playBtn.disabled) playBtn.textContent = t('play_btn');
        return;
    }

    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (currentTranslations[key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = currentTranslations[key];
            } else {
                el.textContent = currentTranslations[key];
            }
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (currentTranslations[key]) el.placeholder = currentTranslations[key];
    });

    if (playBtn && !playBtn.disabled) playBtn.textContent = t('play_btn');
}

document.getElementById('minBtn').addEventListener('click', () => {
    window.electronAPI.send('minimize-window');
});

document.getElementById('closeBtn').addEventListener('click', () => {
    window.electronAPI.send('close-window');
});


const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const hideLauncherCheck = document.getElementById('hideLauncherCheck');

if (hideLauncherCheck) {
    hideLauncherCheck.addEventListener('change', async (e) => {
        await window.electronAPI.invoke('save-settings', { hideLauncher: e.target.checked });
    });
}


if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
        }
    });
}

const discordBtn = document.getElementById('discordBtn');
if (discordBtn) {
    discordBtn.addEventListener('click', () => {
        electron.shell.openExternal('https://discord.com/invite/tecno-bros-885235460178342009');
    });
}

const playBtn = document.getElementById('playBtn');
const usernameInput = document.getElementById('username');
const statusMsg = document.getElementById('status');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const modsBtn = document.getElementById('modsBtn');
const homeShortcutBtn = document.getElementById('homeShortcutBtn');
const modsShortcutBtn = document.getElementById('modsShortcutBtn');
const openNewsBtn = document.getElementById('openNewsBtn');
const accountPicker = document.getElementById('accountPicker');
const accountPickerBtn = document.getElementById('accountPickerBtn');
const accountDisplayName = document.getElementById('accountDisplayName');
const accountDropdown = document.getElementById('accountDropdown');
const accountOptions = document.getElementById('accountOptions');
const addAccountBtn = document.getElementById('addAccountBtn');
const accountNameModal = document.getElementById('accountNameModal');
const accountNameInput = document.getElementById('accountNameInput');
const accountNameConfirm = document.getElementById('accountNameConfirm');
const accountNameCancel = document.getElementById('accountNameCancel');

const homeView = document.getElementById('homeView');
const modsView = document.getElementById('modsView');

const tabDiscover = document.getElementById('tabDiscover');
const tabInstalled = document.getElementById('tabInstalled');
const discoverSection = document.getElementById('discoverSection');
const installedSection = document.getElementById('installedSection');

const modsList = document.getElementById('modsList');
const installedList = document.getElementById('installedList');
const modSearchInput = document.getElementById('modSearchInput');
const searchModsBtn = document.getElementById('searchModsBtn');
const ACCOUNT_STORAGE_KEY = 'battly_accounts';
let launcherAccounts = [];

function normalizeAccountName(name) {
    if (typeof name !== 'string') return '';
    return name.trim().replace(/\s+/g, ' ').slice(0, 20);
}

function loadAccountsFromStorage() {
    try {
        const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeAccountName).filter(Boolean);
    } catch {
        return [];
    }
}

function saveAccountsToStorage() {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(launcherAccounts));
}

function renderAccountOptions() {
    if (!accountOptions) return;

    accountOptions.innerHTML = '';
    launcherAccounts.forEach((accountName) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = `account-option${usernameInput.value === accountName ? ' active' : ''}`;
        option.textContent = accountName;
        option.addEventListener('click', () => {
            setActiveAccount(accountName, { persist: true, addToList: true });
            closeAccountDropdown();
        });
        accountOptions.appendChild(option);
    });
}

function setActiveAccount(name, { persist = true, addToList = true } = {}) {
    const normalized = normalizeAccountName(name);
    if (!normalized || !usernameInput) return;

    usernameInput.value = normalized;
    if (accountDisplayName) {
        accountDisplayName.textContent = normalized;
    }

    if (addToList) {
        launcherAccounts = launcherAccounts.filter(item => item !== normalized);
        launcherAccounts.unshift(normalized);
        launcherAccounts = launcherAccounts.slice(0, 10);
        saveAccountsToStorage();
        renderAccountOptions();
    }

    if (persist) {
        localStorage.setItem('hytale_username', normalized);
    }
}

function closeAccountDropdown() {
    if (accountPicker) {
        accountPicker.classList.remove('open');
    }
    if (accountPickerBtn) {
        accountPickerBtn.setAttribute('aria-expanded', 'false');
    }
}

function toggleAccountDropdown() {
    if (!accountPicker) return;
    const isOpen = accountPicker.classList.toggle('open');
    if (accountPickerBtn) {
        accountPickerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
}

function openAccountNameModal() {
    if (!accountNameModal || !accountNameInput) {
        const customName = typeof window.prompt === 'function' ? window.prompt(t('prompt_account_name')) : '';
        const normalized = normalizeAccountName(customName || '');
        if (!normalized) return;
        setActiveAccount(normalized, { persist: true, addToList: true });
        closeAccountDropdown();
        return;
    }

    closeAccountDropdown();
    accountNameInput.value = '';
    accountNameModal.classList.add('active');

    window.setTimeout(() => {
        accountNameInput.focus();
        accountNameInput.select();
    }, 40);
}

function closeAccountNameModal() {
    if (!accountNameModal) return;
    accountNameModal.classList.remove('active');
}

function confirmAccountNameModal() {
    if (!accountNameInput) return;
    const normalized = normalizeAccountName(accountNameInput.value || '');
    if (!normalized) {
        shakeElement(accountNameInput);
        accountNameInput.focus();
        return;
    }

    setActiveAccount(normalized, { persist: true, addToList: true });
    closeAccountNameModal();
}

function bootstrapAccounts() {
    launcherAccounts = loadAccountsFromStorage();
    const savedUser = normalizeAccountName(localStorage.getItem('hytale_username') || '');
    if (savedUser && !launcherAccounts.includes(savedUser)) {
        launcherAccounts.unshift(savedUser);
    }

    if (launcherAccounts.length === 0) {
        launcherAccounts.push('Player');
    }

    saveAccountsToStorage();
    renderAccountOptions();
    setActiveAccount(savedUser || launcherAccounts[0], { persist: false, addToList: false });
}

if (languageSelect) {
    languageSelect.value = defaultLang;
}

if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
        const newLang = e.target.value;
        loadLocale(newLang);
        ipcRenderer.send('track-event', 'settings', 'language_changed', newLang, 1);
    });
}

if (openNewsBtn) {
    openNewsBtn.addEventListener('click', () => {
        const activeNews = getActiveNewsItem();
        if (activeNews && activeNews.link) {
            electron.shell.openExternal(activeNews.link);
        }
    });
}

bootstrapAccounts();

(async () => {
    try {
        const settingsSnapshot = await ipcRenderer.invoke('get-settings');
        const settingsName = normalizeAccountName(settingsSnapshot?.playerName || '');
        const currentSaved = normalizeAccountName(localStorage.getItem('hytale_username') || '');
        if (settingsName && !currentSaved) {
            setActiveAccount(settingsName, { persist: true, addToList: true });
        } else if (settingsName && !launcherAccounts.includes(settingsName)) {
            launcherAccounts.push(settingsName);
            saveAccountsToStorage();
            renderAccountOptions();
        }
    } catch (error) {
        console.error('Failed to sync account from settings:', error);
    }
})();

if (accountPickerBtn) {
    accountPickerBtn.addEventListener('click', toggleAccountDropdown);
}

if (addAccountBtn) {
    addAccountBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openAccountNameModal();
    });
}

if (accountNameConfirm) {
    accountNameConfirm.addEventListener('click', confirmAccountNameModal);
}

if (accountNameCancel) {
    accountNameCancel.addEventListener('click', closeAccountNameModal);
}

if (accountNameModal) {
    accountNameModal.addEventListener('click', (event) => {
        if (event.target === accountNameModal) {
            closeAccountNameModal();
        }
    });
}

if (accountNameInput) {
    accountNameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            confirmAccountNameModal();
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            closeAccountNameModal();
        }
    });
}

document.addEventListener('click', (event) => {
    if (accountPicker && !accountPicker.contains(event.target)) {
        closeAccountDropdown();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && gameLogsModal && gameLogsModal.classList.contains('active')) {
        closeGameLogsModal();
    }
});

const settingsPlayerName = document.getElementById('settingsPlayerName');
const openLocationBtn = document.getElementById('openLocationBtn');
const repairGameBtn = document.getElementById('repairGameBtn');
const openGameLogsBtn = document.getElementById('openGameLogsBtn');
const gpuDetectedText = document.getElementById('gpuDetectedText');
const useCustomJavaCheck = document.getElementById('useCustomJavaCheck');
const javaPathInput = document.getElementById('javaPathInput');
const browseJavaBtn = document.getElementById('browseJavaBtn');
const customJavaArea = document.getElementById('customJavaArea');
const gameLogsModal = document.getElementById('gameLogsModal');
const closeGameLogsBtn = document.getElementById('closeGameLogsBtn');
const gameLogsMode = document.getElementById('gameLogsMode');
const refreshGameLogsBtn = document.getElementById('refreshGameLogsBtn');
const gameLogsWarning = document.getElementById('gameLogsWarning');
const gameLogsMeta = document.getElementById('gameLogsMeta');
const gameLogsOutput = document.getElementById('gameLogsOutput');
const gpuButtons = document.querySelectorAll('.gpu-btn');
const versionSelect = document.getElementById('versionSelect');
const versionInfo = document.getElementById('versionInfo');
const versionTooltip = document.getElementById('versionTooltip');
const versionSection = document.querySelector('.version-section');
const versionChannelReleaseBtn = document.getElementById('versionChannelRelease');
const versionChannelPreReleaseBtn = document.getElementById('versionChannelPreRelease');
const versionChannelButtons = [versionChannelReleaseBtn, versionChannelPreReleaseBtn].filter(Boolean);

let currentSettingsData = {};
let gameLogsRealtimeInterval = null;
let lastGameLogsPayload = null;
let lastGameLogsRequest = null;
let currentVersionChannel = (localStorage.getItem('hytale_version_channel') || 'release').toLowerCase() === 'pre-release'
    ? 'pre-release'
    : 'release';

loadLocale(defaultLang);
loadNews();
setVersionChannel(currentVersionChannel, { reload: false, persist: false });
loadVersions(currentVersionChannel);

const setProgressVisibility = (show, indeterminate = false) => {
    if (!progressContainer || !progressBar) return;
    progressContainer.style.display = show ? 'flex' : 'none';
    progressContainer.classList.toggle('indeterminate', indeterminate);
    if (!show) {
        document.body.classList.remove('progress-active');
        progressBar.style.width = '0%';
        setProgressText('');
    } else {
        document.body.classList.add('progress-active');
        if (indeterminate) {
            progressBar.style.width = '';
        } else if (!progressBar.style.width) {
            progressBar.style.width = '0%';
        }
    }
};

const setProgressText = (text) => {
    if (progressText) {
        progressText.textContent = text || '';
    }
};

function getGameLogsRequest(modeValue) {
    switch (modeValue) {
        case 'tail-200':
            return { mode: 'tail', limit: 200, realtime: false };
        case 'tail-500':
            return { mode: 'tail', limit: 500, realtime: false };
        case 'all':
            return { mode: 'all', limit: 0, realtime: false };
        case 'realtime':
            return { mode: 'tail', limit: 200, realtime: true };
        case 'tail-100':
        default:
            return { mode: 'tail', limit: 100, realtime: false };
    }
}

function stopGameLogsRealtime() {
    if (gameLogsRealtimeInterval) {
        clearInterval(gameLogsRealtimeInterval);
        gameLogsRealtimeInterval = null;
    }
}

function renderGameLogs(payload, request) {
    if (!gameLogsOutput || !gameLogsMeta || !gameLogsWarning) return;

    const lines = Array.isArray(payload?.lines) ? payload.lines : [];
    const outputText = lines.length > 0 ? lines.join('\n') : tf('game_logs_empty', 'No logs available yet.');
    gameLogsOutput.textContent = outputText;

    const source = payload?.source === 'file'
        ? tf('game_logs_source_file', 'file')
        : tf('game_logs_source_buffer', 'buffer');
    const sessionState = payload?.sessionActive
        ? tf('game_logs_session_active', 'active')
        : tf('game_logs_session_inactive', 'inactive');
    const logFile = payload?.logFilePath || '-';
    const count = Number(payload?.count || lines.length);
    const modeText = request.realtime ? tf('game_logs_mode_realtime', 'Realtime') : (gameLogsMode?.selectedOptions?.[0]?.textContent || request.mode);

    gameLogsMeta.textContent = `${tf('game_logs_lines', 'Lines')}: ${count} | ${tf('game_logs_source', 'Source')}: ${source} | ${tf('game_logs_session', 'Session')}: ${sessionState} | ${tf('game_logs_mode_label', 'Mode')}: ${modeText} | ${tf('game_logs_file', 'File')}: ${logFile}`;

    if (request.mode === 'all') {
        gameLogsWarning.style.display = 'block';
        gameLogsWarning.textContent = tf('game_logs_warning_all', 'Loading all logs may take a while.');
    } else {
        gameLogsWarning.style.display = 'none';
    }

    if (request.realtime) {
        gameLogsOutput.scrollTop = gameLogsOutput.scrollHeight;
    }
}

async function loadGameLogs() {
    if (!gameLogsOutput || !gameLogsMode) return;

    const request = getGameLogsRequest(gameLogsMode.value);
    gameLogsOutput.textContent = tf('game_logs_loading', 'Loading logs...');

    try {
        const payload = await ipcRenderer.invoke('get-game-logs', { mode: request.mode, limit: request.limit });
        if (!payload?.success) {
            throw new Error(payload?.error || tf('status_error', 'Error'));
        }

        lastGameLogsPayload = payload;
        lastGameLogsRequest = request;
        renderGameLogs(payload, request);
    } catch (error) {
        const errorLabel = tf('game_logs_fetch_error', 'Failed to load logs');
        gameLogsOutput.textContent = `${errorLabel}: ${error.message}`;
        if (gameLogsMeta) gameLogsMeta.textContent = '';
        if (gameLogsWarning) gameLogsWarning.style.display = 'none';
    }
}

function closeGameLogsModal() {
    if (!gameLogsModal) return;
    stopGameLogsRealtime();
    gameLogsModal.classList.remove('active');
}

function openGameLogsModal() {
    if (!gameLogsModal || !gameLogsMode) return;
    gameLogsModal.classList.add('active');
    void loadGameLogs();

    if (getGameLogsRequest(gameLogsMode.value).realtime) {
        stopGameLogsRealtime();
        gameLogsRealtimeInterval = setInterval(() => {
            void loadGameLogs();
        }, 1200);
    }
}

function handleGameLogsModeChange() {
    if (!gameLogsMode) return;
    const request = getGameLogsRequest(gameLogsMode.value);

    if (request.realtime) {
        stopGameLogsRealtime();
        void loadGameLogs();
        gameLogsRealtimeInterval = setInterval(() => {
            void loadGameLogs();
        }, 1200);
        return;
    }

    stopGameLogsRealtime();
    void loadGameLogs();
}

const settingsTabs = document.querySelectorAll('.settings-tab');
settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        settingsTabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-page').forEach(p => p.style.display = 'none');

        tab.classList.add('active');
        const target = tab.getAttribute('data-tab');
        const page = document.getElementById(`settings-${target}`);
        if (page) page.style.display = 'block';
    });
});

function normalizeVersionChannel(channel) {
    return String(channel || '').toLowerCase() === 'pre-release' ? 'pre-release' : 'release';
}

function applyVersionChannelUI(channel) {
    const normalized = normalizeVersionChannel(channel);
    versionChannelButtons.forEach(btn => {
        const btnChannel = normalizeVersionChannel(btn.dataset.channel);
        btn.classList.toggle('is-active', btnChannel === normalized);
    });
}

function setVersionChannel(channel, options = {}) {
    const normalized = normalizeVersionChannel(channel);
    const reload = options.reload !== false;
    const persist = options.persist !== false;

    currentVersionChannel = normalized;
    applyVersionChannelUI(normalized);
    if (persist) {
        localStorage.setItem('hytale_version_channel', normalized);
    }
    if (reload) {
        void loadVersions(normalized);
    }
}

async function refreshVersionChannelButtons() {
    try {
        const channels = await ipcRenderer.invoke('get-version-channels');
        const available = Array.isArray(channels) && channels.length > 0
            ? channels.map(normalizeVersionChannel)
            : ['release', 'pre-release'];

        versionChannelButtons.forEach(btn => {
            const btnChannel = normalizeVersionChannel(btn.dataset.channel);
            const isAvailable = available.includes(btnChannel);
            btn.disabled = !isAvailable;
            btn.classList.toggle('is-disabled', !isAvailable);
        });

        if (!available.includes(currentVersionChannel)) {
            currentVersionChannel = available[0];
            applyVersionChannelUI(currentVersionChannel);
            localStorage.setItem('hytale_version_channel', currentVersionChannel);
        }
    } catch (error) {
        console.error('Error loading version channels:', error);
    }
}

async function loadVersions(channel = currentVersionChannel) {
    try {
        await refreshVersionChannelButtons();
        currentVersionChannel = normalizeVersionChannel(channel);
        applyVersionChannelUI(currentVersionChannel);

        const versions = await ipcRenderer.invoke('get-available-versions', currentVersionChannel);
        const selectedVersion = await ipcRenderer.invoke('get-selected-version', currentVersionChannel);
        if (selectedVersion && selectedVersion.channel) {
            const selectedChannel = normalizeVersionChannel(selectedVersion.channel);
            if (selectedChannel !== currentVersionChannel) {
                currentVersionChannel = selectedChannel;
                applyVersionChannelUI(currentVersionChannel);
                localStorage.setItem('hytale_version_channel', currentVersionChannel);
            }
        }

        if (versionSelect) {
            versionSelect.innerHTML = '';
            versions.forEach(version => {
                const option = document.createElement('option');
                option.value = version.id;
                option.textContent = version.name;
                option.dataset.patchFile = version.patchFile;
                option.dataset.description = version.description;
                option.dataset.channel = version.channel || currentVersionChannel;

                if (version.id === selectedVersion.id || (selectedVersion.patchFile && version.patchFile === selectedVersion.patchFile)) {
                    option.selected = true;
                }

                versionSelect.appendChild(option);
            });

            if (versionSelect.options.length > 0 && versionSelect.selectedIndex < 0) {
                versionSelect.selectedIndex = 0;
            }
            updateVersionInfo();
        }
    } catch (error) {
        console.error('Error loading versions:', error);
    }
}

function updateVersionInfo() {
    if (!versionSelect || !versionInfo) return;
    const selectedOption = versionSelect.options[versionSelect.selectedIndex];
    if (selectedOption) {
        const description = selectedOption.dataset.description || t('version_desc_unavailable');
        const patchFile = selectedOption.dataset.patchFile || t('version_patch_unknown');
        versionInfo.textContent = description;
        if (versionTooltip) {
            versionTooltip.textContent = `${t('version_patch_prefix')}: ${patchFile}\n${description}`;
        }
        if (versionSection) {
            versionSection.dataset.version = selectedOption.textContent || '';
        }
    }
}

if (versionSelect) {
    versionSelect.addEventListener('change', async () => {
        updateVersionInfo();
        const selectedOption = versionSelect.options[versionSelect.selectedIndex];
        if (selectedOption) {
            const versionId = selectedOption.value;
            const patchFile = selectedOption.dataset.patchFile;
            await ipcRenderer.invoke('set-selected-version', versionId, patchFile, currentVersionChannel);
        }
    });
}

versionChannelButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        setVersionChannel(btn.dataset.channel, { reload: true, persist: true });
    });
});

let detectedGpus = { integrated: null, dedicated: null };

const updateGpuText = (pref) => {
    const textEl = document.getElementById('gpuDetectedText');
    if (!textEl) return;

    if (pref === 'integrated') {
        textEl.textContent = detectedGpus.integrated || t('gpu_no_integrated');
        textEl.style.color = detectedGpus.integrated ? '#aaa' : '#ff4444';
    } else if (pref === 'dedicated') {
        textEl.textContent = detectedGpus.dedicated || t('gpu_no_dedicated');
        textEl.style.color = detectedGpus.dedicated ? '#8cb9dc' : '#ff4444';
    } else {
        textEl.textContent = `${t('gpu_auto_prefix')}: ` + (detectedGpus.dedicated || detectedGpus.integrated || t('gpu_system_default'));
        textEl.style.color = '#00d9ff';
    }
};

const refreshGpuButtons = () => {
    const btns = document.querySelectorAll('.gpu-btn');
    btns.forEach(btn => {
        btn.onclick = function () {
            btns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            updateGpuText(this.getAttribute('data-val'));
        }
    });
};
refreshGpuButtons();

if (openLocationBtn) {
    openLocationBtn.addEventListener('click', () => {
        ipcRenderer.send('open-game-location');
    });
}

if (openGameLogsBtn) {
    openGameLogsBtn.addEventListener('click', () => {
        openGameLogsModal();
    });
}

if (browseJavaBtn) {
    browseJavaBtn.addEventListener('click', async () => {
        const path = await ipcRenderer.invoke('select-java-path');
        if (path) {
            javaPathInput.value = path;
        }
    });
}

if (useCustomJavaCheck) {
    useCustomJavaCheck.addEventListener('change', () => {
        updateJavaAreaState();
    });
}

function updateJavaAreaState() {
    if (useCustomJavaCheck && customJavaArea) {
        if (useCustomJavaCheck.checked) {
            customJavaArea.style.opacity = '1';
            customJavaArea.style.pointerEvents = 'auto';
        } else {
            customJavaArea.style.opacity = '0.5';
            customJavaArea.style.pointerEvents = 'none';
        }
    }
}

if (repairGameBtn) {
    repairGameBtn.onclick = async () => {
        const confirmed = await showCustomDialog(t('repair_confirm_title'), t('repair_confirm_msg'), true);
        if (confirmed) {
            ipcRenderer.send('repair-game');
            statusMsg.textContent = t('repair_started');
            setProgressText(t('repair_started'));
            setProgressVisibility(true, true);
            settingsModal.classList.remove('active');
        }
    };
}

if (closeGameLogsBtn) {
    closeGameLogsBtn.addEventListener('click', () => {
        closeGameLogsModal();
    });
}

if (refreshGameLogsBtn) {
    refreshGameLogsBtn.addEventListener('click', () => {
        void loadGameLogs();
    });
}

if (gameLogsMode) {
    gameLogsMode.addEventListener('change', handleGameLogsModeChange);
}

if (gameLogsModal) {
    gameLogsModal.addEventListener('click', (event) => {
        if (event.target === gameLogsModal) {
            closeGameLogsModal();
        }
    });
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', async () => {
        currentSettingsData = await ipcRenderer.invoke('get-settings');

        if (settingsPlayerName) settingsPlayerName.value = usernameInput.value || currentSettingsData.playerName || '';
        if (hideLauncherCheck) hideLauncherCheck.checked = currentSettingsData.hideLauncher || false;

        const gpuPref = currentSettingsData.gpuPreference || 'auto';
        document.querySelectorAll('.gpu-btn').forEach(btn => {
            if (btn.getAttribute('data-val') === gpuPref) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        try {
            const gpuData = await ipcRenderer.invoke('get-gpu-info');
            if (typeof gpuData === 'object') {
                detectedGpus = gpuData;
            } else {
                detectedGpus = { integrated: gpuData, dedicated: gpuData };
            }
            updateGpuText(gpuPref);
        } catch (e) {
            console.error('Failed to load GPU info:', e);
            document.getElementById('gpuDetectedText').textContent = t('gpu_info_error');
        }

        if (useCustomJavaCheck) useCustomJavaCheck.checked = currentSettingsData.useCustomJava || false;
        if (javaPathInput) javaPathInput.value = currentSettingsData.customJavaPath || '';
        updateJavaAreaState();

        await loadVersions(currentVersionChannel);

        settingsModal.classList.add('active');
    });
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', async () => {
        settingsModal.classList.remove('active');

        const selectedGpuBtn = document.querySelector('.gpu-btn.active');
        const gpuVal = selectedGpuBtn ? selectedGpuBtn.getAttribute('data-val') : 'auto';

        const newSettings = {
            ...currentSettingsData,
            playerName: settingsPlayerName.value,
            hideLauncher: hideLauncherCheck.checked,
            gpuPreference: gpuVal,
            useCustomJava: useCustomJavaCheck.checked,
            customJavaPath: javaPathInput.value
        };

        if (settingsPlayerName.value) {
            setActiveAccount(settingsPlayerName.value, { persist: true, addToList: true });
        }

        if (versionSelect) {
            const selectedOption = versionSelect.options[versionSelect.selectedIndex];
            const versionId = selectedOption.value;
            const patchFile = selectedOption.dataset.patchFile;
            await ipcRenderer.invoke('set-selected-version', versionId, patchFile, currentVersionChannel);
        }

        await ipcRenderer.invoke('save-settings', newSettings);
    });
}

ipcRenderer.on('repair-complete', (event, result) => {
    if (result.success) {
        showCustomDialog(t('success'), t('repair_success_msg'), false);
    } else {
        showCustomDialog(t('error'), result.error, false);
    }
    setProgressVisibility(false);
});

if (playBtn) {
playBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();

    if (!username) {
        shakeElement(accountPickerBtn || usernameInput);
        statusMsg.textContent = `${t('status_error')}${t('error_username_required')}`;
        statusMsg.style.color = "#ff4444";
        return;
    }

    setActiveAccount(username, { persist: true, addToList: true });

    statusMsg.textContent = t('status_init');
    statusMsg.style.color = "#00d9ff";
    playBtn.disabled = true;
    playBtn.style.opacity = "0.7";
    playBtn.innerHTML = t('status_launching');

    ipcRenderer.send('launch-game', username);
});
}

let isModsViewOpen = false;

const viewNavigator = window.LauncherNavigation?.createViewNavigator({
    homeView,
    modsView,
    modsBtn,
    modsShortcutBtn,
    homeShortcutBtn,
    onOpenMods: () => {
        isModsViewOpen = true;
        let currentState = t('discord_mods_catalog');
        if (tabInstalled?.classList.contains('active')) currentState = t('discord_mods_manage');
        ipcRenderer.send('discord-activity', t('discord_mods_explore'), currentState);
        if (modsList && modsList.children.length <= 1) loadPopularMods();
    },
    onCloseMods: () => {
        isModsViewOpen = false;
        ipcRenderer.send('discord-activity', t('discord_launcher'));
    }
});

function setModsView(isOpen) {
    if (viewNavigator) {
        isModsViewOpen = viewNavigator.setModsView(Boolean(isOpen));
        if (homeView && modsView) {
            homeView.classList.toggle('active', !isModsViewOpen);
            modsView.classList.toggle('active', isModsViewOpen);
        }
        return;
    }

    isModsViewOpen = Boolean(isOpen);
    if (!homeView || !modsView) return;
    homeView.classList.toggle('active', !isModsViewOpen);
    modsView.classList.toggle('active', isModsViewOpen);
    homeView.style.display = isModsViewOpen ? 'none' : 'flex';
    modsView.style.display = isModsViewOpen ? 'flex' : 'none';
}

if (modsBtn) {
    modsBtn.addEventListener('click', () => setModsView(true));
}

if (modsShortcutBtn) {
    modsShortcutBtn.addEventListener('click', () => setModsView(true));
}

if (homeShortcutBtn) {
    homeShortcutBtn.classList.add('is-active');
    homeShortcutBtn.addEventListener('click', () => setModsView(false));
}

setModsView(false);

if (tabDiscover) {
    tabDiscover.addEventListener('click', () => {
        switchTab('discover');
    });
}

if (tabInstalled) {
    tabInstalled.addEventListener('click', () => {
        switchTab('installed');
        loadInstalledMods();
    });
}

function switchTab(tab) {
    if (!tabDiscover || !tabInstalled || !discoverSection || !installedSection) return;

    if (tab === 'discover') {
        tabDiscover.classList.add('active');
        tabInstalled.classList.remove('active');
        discoverSection.style.display = 'flex';
        installedSection.style.display = 'none';
        ipcRenderer.send('discord-activity', t('discord_mods_explore'), t('discord_mods_catalog'));
    } else {
        tabDiscover.classList.remove('active');
        tabInstalled.classList.add('active');
        discoverSection.style.display = 'none';
        installedSection.style.display = 'block';
        ipcRenderer.send('discord-activity', t('discord_mods_manage'), t('discord_mods_installed'));
    }
}

if (searchModsBtn && modSearchInput) {
    searchModsBtn.addEventListener('click', () => {
        const query = modSearchInput.value.trim();
        loadPopularMods(query);
    });

    modSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadPopularMods(modSearchInput.value.trim());
        }
    });
}

async function loadPopularMods(query = '') {
    modsList.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> ${t('status_init')}</div>`;

    try {
        const result = await ipcRenderer.invoke('search-mods', query);

        if (result.success) {
            renderMods(result.data);
        } else {
            modsList.innerHTML = `<p style="color: #ff4444;">${t('status_error')} ${result.error}</p>`;
        }
    } catch (err) {
        modsList.innerHTML = `<p style="color: #ff4444;">${t('status_error')} ${err.message}</p>`;
    }
}

function renderMods(mods) {
    modsList.innerHTML = '';

    if (mods.length === 0) {
        modsList.innerHTML = `<p>${t('no_mods_found')}</p>`;
        return;
    }

    mods.forEach(mod => {
        const card = document.createElement('div');
        card.className = 'mod-card';

        const logoUrl = mod.logo && mod.logo.thumbnailUrl ? mod.logo.thumbnailUrl : `https://ui-avatars.com/api/?name=${encodeURIComponent(mod.name)}&background=random&color=fff&size=128`;
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(mod.name)}&background=333&color=fff&size=128&font-size=0.5`;

        const safeName = sanitizeHTML(mod.name || '').replace(/'/g, "\\'");
        const safeSummary = sanitizeHTML(mod.summary || '');
        const safeTitle = sanitizeHTML(mod.name || '');

        card.innerHTML = `
            <div class="mod-card-header">
                <div class="mod-icon-wrapper"></div>
                <div class="mod-card-info">
                    <div class="mod-card-title" title="${safeTitle}">${safeTitle}</div>
                    <div class="mod-card-author">${t('mod_author_default')}</div>
                </div>
            </div>
            <div class="mod-card-description">${safeSummary}</div>
            <div class="mod-card-footer">
                <button class="primary-btn" data-id="${mod.id}" data-name="${safeName}">
                    <i class="fas fa-download"></i> ${t('modal_install')}
                </button>
            </div>
        `;

        const iconWrapper = card.querySelector('.mod-icon-wrapper');

        const createFallback = () => {
            iconWrapper.innerHTML = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'mod-icon-placeholder';

            let hash = 0;
            for (let i = 0; i < mod.name.length; i++) hash = mod.name.charCodeAt(i) + ((hash << 5) - hash);
            const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
            const color = "00000".substring(0, 6 - c.length) + c;

            Object.assign(placeholder.style, {
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                background: `#${color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '18px'
            });
            placeholder.innerText = mod.name.substring(0, 2).toUpperCase();
            iconWrapper.appendChild(placeholder);
        };

        const img = new Image();
        img.className = 'mod-icon';
        img.style.width = '48px';
        img.style.height = '48px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '8px';
        img.alt = mod.name;

        img.onload = () => {
            iconWrapper.innerHTML = '';
            iconWrapper.appendChild(img);
        };

        img.onerror = () => {
            createFallback();
        };

        img.src = logoUrl;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.primary-btn')) {
                return;
            }
            openModModal(mod);
        });

        const btn = card.querySelector('.primary-btn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            installMod(mod.id, mod.name, btn);
        });

        modsList.appendChild(card);
    });
}

window.installMod = async (modId, modName, btnElement) => {
    if (!btnElement) return;

    const originalText = btnElement.textContent;
    btnElement.textContent = '...';
    btnElement.disabled = true;

    const installingText = `${t('status_installing')} ${modName}...`;
    statusMsg.textContent = installingText;
    setProgressText(installingText);
    setProgressVisibility(true, true);

    try {
        const result = await ipcRenderer.invoke('install-mod', { id: modId, name: modName });
        if (result.success) {
            btnElement.textContent = t('modal_installed');
            btnElement.style.background = '#4caf50';
            statusMsg.textContent = `${modName} ${t('modal_installed')}`;
            setProgressText(statusMsg.textContent);
            setTimeout(() => statusMsg.textContent = '', 3000);
            setTimeout(() => setProgressVisibility(false), 1500);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        btnElement.textContent = 'ERROR';
        btnElement.style.background = '#ff4444';
        statusMsg.textContent = `${t('status_error')} ${err.message}`;
        setProgressText(statusMsg.textContent);
        setTimeout(() => {
            btnElement.textContent = originalText;
            btnElement.disabled = false;
            btnElement.style.background = '';
        }, 3000);
        setTimeout(() => setProgressVisibility(false), 3000);
    }
};

const modModal = document.getElementById('modModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalInstallBtn = document.getElementById('modalInstallBtn');

const modalElements = {
    image: document.getElementById('modalModImage'),
    name: document.getElementById('modalModName'),
    author: document.getElementById('modalModAuthor'),
    version: document.getElementById('modalModVersion'),
    date: document.getElementById('modalModDate'),
    downloads: document.getElementById('modalModDownloads'),
    description: document.getElementById('modalModDescription')
};

let currentModalMod = null;

function openModModal(mod) {
    currentModalMod = mod;

    const logoUrl = mod.logo && mod.logo.thumbnailUrl ? mod.logo.thumbnailUrl : `https://ui-avatars.com/api/?name=${encodeURIComponent(mod.name)}&background=random&color=fff&size=128`;

    modalElements.image.style.display = 'block';
    const prevFallback = modalElements.image.parentElement.querySelector('.modal-fallback');
    if (prevFallback) prevFallback.remove();

    modalElements.image.src = logoUrl;
    modalElements.image.onerror = function () {
        this.style.display = 'none';

        let hash = 0;
        for (let i = 0; i < mod.name.length; i++) hash = mod.name.charCodeAt(i) + ((hash << 5) - hash);
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        const color = "00000".substring(0, 6 - c.length) + c;

        const placeholder = document.createElement('div');
        placeholder.className = 'modal-mod-logo modal-fallback';
        placeholder.style.background = `#${color}`;
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.color = '#fff';
        placeholder.style.fontWeight = 'bold';
        placeholder.style.fontSize = '32px';
        placeholder.innerText = mod.name.substring(0, 2).toUpperCase();

        this.parentElement.insertBefore(placeholder, this);
    };
    modalElements.name.textContent = mod.name;
    modalElements.author.textContent = `${t('modal_author')} ${mod.author || t('unknown_label')}`;
    modalElements.version.textContent = mod.version || 'v1.0';
    modalElements.date.textContent = mod.lastUpdated ? `${t('modal_updated')}: ${mod.lastUpdated}` : t('label_recent');
    modalElements.downloads.textContent = `${t('modal_downloads')}: ${mod.downloads ? mod.downloads.toLocaleString() : '0'}`;

    modalElements.description.innerHTML = '<p style="color: #888;">...</p>';

    ipcRenderer.invoke('get-mod-description', mod.id).then(result => {
        if (currentModalMod && currentModalMod.id === mod.id) {
            if (result.success && result.data) {
                modalElements.description.innerHTML = sanitizeHTML(result.data);
            } else {
                modalElements.description.textContent = mod.summary || t('modal_about');
            }
        }
    });

    modalInstallBtn.textContent = t('modal_install');
    modalInstallBtn.disabled = false;
    modalInstallBtn.style.background = '';

    modModal.classList.add('active');
}

function closeModModal() {
    modModal.classList.remove('active');
    currentModalMod = null;
}

closeModalBtn.addEventListener('click', closeModModal);

modModal.addEventListener('click', (e) => {
    if (e.target === modModal) closeModModal();
});

modalInstallBtn.addEventListener('click', () => {
    if (currentModalMod) {
        installMod(currentModalMod.id, currentModalMod.name, modalInstallBtn);
    }
});

async function loadInstalledMods() {
    installedList.innerHTML = '<div class="loading-spinner">...</div>';

    const result = await ipcRenderer.invoke('list-installed-mods');

    if (result.success) {
        renderInstalledMods(result.data);
    } else {
        installedList.innerHTML = `<p>${t('status_error')} ${result.error}</p>`;
    }
}

function renderInstalledMods(mods) {
    installedList.innerHTML = '';

    if (mods.length === 0) {
        installedList.innerHTML = `<p style="text-align:center;color:#888;">${t('no_installed_mods')}</p>`;
        return;
    }

    mods.forEach(mod => {
        const item = document.createElement('div');
        item.className = 'installed-mod-item';

        item.innerHTML = `
            <div class="installed-mod-info">
                <div class="mod-status-indicator ${mod.enabled ? 'status-enabled' : 'status-disabled'}"></div>
                <span class="mod-name" style="${!mod.enabled ? 'text-decoration: line-through; color: #888;' : ''}">${mod.name}</span>
            </div>
            <div class="installed-mod-actions">
                <button class="icon-button" title="${mod.enabled ? t('btn_disable') : t('btn_enable')}" onclick="toggleMod('${mod.fileName}')">
                    <i class="fas fa-power-off"></i>
                </button>
                <button class="icon-button delete-button" title="${t('btn_delete')}" onclick="deleteMod('${mod.fileName}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        installedList.appendChild(item);
    });
}

window.toggleMod = async (fileName) => {
    await ipcRenderer.invoke('toggle-mod', fileName);
    loadInstalledMods();
};

window.deleteMod = async (fileName) => {
    if (await customAsk(t('delete_mod_title'), t('delete_mod_confirm'))) {
        await ipcRenderer.invoke('delete-mod', fileName);
        loadInstalledMods();
    }
};

ipcRenderer.on('launch-error', (event, message) => {
    statusMsg.textContent = `${t('status_error')} ${message}`;
    statusMsg.style.color = "#ff4444";
    setProgressText(statusMsg.textContent);
    setProgressVisibility(false);
    resetPlayBtn();
});

ipcRenderer.on('launch-status', (event, message) => {
    if (!message) {
        statusMsg.textContent = "";
        setProgressText("");
        setProgressVisibility(false);
        return;
    }
    const resolvedMessage = t(message);
    statusMsg.textContent = resolvedMessage;
    statusMsg.style.color = "#00d9ff";
    setProgressText(resolvedMessage);
    setProgressVisibility(true, true);
});

ipcRenderer.on('download-progress', (event, data) => {
    setProgressVisibility(true, false);

    let percent = 0;
    let speed = '';
    let text = '';

    if (typeof data === 'object') {
        percent = data.percent || 0;
        speed = data.speed || '';
        text = data.text || '';
    } else {
        percent = data || 0;
    }

    progressBar.style.width = percent + '%';

    let progressMessage = '';
    if (text) {
        progressMessage = text;
    } else if (speed) {
        progressMessage = `${t('status_downloading')} ${percent}% (${speed})`;
    } else {
        progressMessage = `${t('status_downloading')} ${percent}%`;
    }

    statusMsg.textContent = progressMessage;
    setProgressText(progressMessage);
    statusMsg.style.display = 'none';
    statusMsg.offsetHeight;
    statusMsg.style.display = 'block';
});

ipcRenderer.on('launch-success', (event, message) => {
    statusMsg.textContent = t('status_running');
    statusMsg.style.color = "#4caf50";
    setProgressText(statusMsg.textContent);
    setProgressVisibility(false);

    setTimeout(() => {
        resetPlayBtn();
        statusMsg.textContent = "";
    }, 5000);
});

ipcRenderer.on('update-available', async (event, remoteConfig) => {
    const title = t('update_available_title') || "Update Available";
    const msg = (t('update_available_msg') || "A new version {v} is available. Update now?").replace('{v}', remoteConfig.version);

    if (await customAsk(title, msg)) {
        ipcRenderer.invoke('perform-update', remoteConfig.downloadUrl);
    }
});

function resetPlayBtn() {
    playBtn.disabled = false;
    playBtn.style.opacity = "1";
    playBtn.innerHTML = `${t('play_btn')}`;
}

function shakeElement(element) {
    element.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-10px)' },
        { transform: 'translateX(10px)' },
        { transform: 'translateX(-10px)' },
        { transform: 'translateX(0)' }
    ], {
        duration: 400
    });
}

const onboardingView = document.getElementById('onboardingView');
const startBtn = document.getElementById('startBtn');
const termsCheck = document.getElementById('termsCheck');
const onboardingUser = document.getElementById('onboardingUser');
const langCards = document.querySelectorAll('.onb-lang-card');
const btnToStep3 = document.getElementById('btnToStep3');

function showStep(stepId) {
    document.querySelectorAll('.onboarding-slide').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    const step = document.getElementById(stepId);
    if (step) {
        step.style.display = 'block';
        setTimeout(() => step.classList.add('active'), 10);
    }
}

function initOnboarding() {
    const isSetupComplete = localStorage.getItem('battly_setup_complete');

    if (!isSetupComplete) {
        onboardingView.style.display = 'flex';
        showStep('onboardingStep1');

        const currentLang = localStorage.getItem('battly_lang') || 'es';
        document.querySelector(`.onb-lang-card[data-lang="${currentLang}"]`)?.classList.add('selected');

        const savedUser = localStorage.getItem('hytale_username');
        if (savedUser) {
            onboardingUser.value = savedUser;
            checkStep2Validity();
        }
    }
}

function checkStep2Validity() {
    if (!btnToStep3) return;
    const isUserValid = onboardingUser.value.trim().length > 0;
    btnToStep3.disabled = !isUserValid;
}

function checkStep3Validity() {
    if (!startBtn) return;
    const isTermsAccepted = termsCheck.checked;
    startBtn.disabled = !isTermsAccepted;
}

if (onboardingView) {
    document.querySelectorAll('.next-step-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const nextId = btn.getAttribute('data-next');
            if (nextId) showStep(nextId);
        });
    });

    document.querySelectorAll('.back-step-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const prevId = btn.getAttribute('data-prev');
            if (prevId) showStep(prevId);
            else if (btn.closest('#onboardingStep2')) showStep('onboardingStep1');
            else if (btn.closest('#onboardingStep3')) showStep('onboardingStep2');
        });
    });

    langCards.forEach(card => {
        card.addEventListener('click', () => {
            const lang = card.dataset.lang;
            loadLocale(lang);
            languageSelect.value = lang;
            langCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });
    });

    if (onboardingUser) {
        onboardingUser.addEventListener('input', (e) => {
            checkStep2Validity();
            setActiveAccount(e.target.value, { persist: false, addToList: false });
        });
    }

    if (termsCheck) {
        termsCheck.addEventListener('change', checkStep3Validity);
    }

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const user = onboardingUser.value.trim();
            if (!user || !termsCheck.checked) return;

            setActiveAccount(user, { persist: true, addToList: true });
            localStorage.setItem('battly_setup_complete', 'true');

            onboardingView.style.transition = 'opacity 0.5s ease';
            onboardingView.style.opacity = '0';

            setTimeout(() => {
                onboardingView.style.display = 'none';
            }, 500);
        });
    }

    document.querySelectorAll('.legal-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const url = link.getAttribute('data-url');
            if (url) {
                electron.shell.openExternal(url);
            }
        });
    });
}

initOnboarding();

const customDialog = document.getElementById('customDialog');
const dialogTitle = document.getElementById('dialogTitle');
const dialogMessage = document.getElementById('dialogMessage');
const dialogConfirmBtn = document.getElementById('dialogConfirmBtn');
const dialogCancelBtn = document.getElementById('dialogCancelBtn');

function showCustomDialog(title, message, isQuestion = false) {
    return new Promise((resolve) => {
        dialogTitle.textContent = title;
        dialogMessage.textContent = message;

        dialogConfirmBtn.textContent = 'Confirm';
        dialogCancelBtn.textContent = 'Cancel';

        if (typeof t === 'function') {
            dialogConfirmBtn.textContent = isQuestion ? t('btn_confirm') || 'Yes' : t('btn_ok') || 'OK';
            dialogCancelBtn.textContent = t('btn_cancel') || 'Cancel';
        }

        customDialog.style.display = 'flex';
        void customDialog.offsetWidth;
        customDialog.classList.add('active');

        if (isQuestion) {
            dialogCancelBtn.style.display = 'block';
        } else {
            dialogCancelBtn.style.display = 'none';
        }

        const close = (result) => {
            customDialog.classList.remove('active');
            setTimeout(() => {
                customDialog.style.display = 'none';
            }, 300);

            dialogConfirmBtn.onclick = null;
            dialogCancelBtn.onclick = null;
            resolve(result);
        };

        dialogConfirmBtn.onclick = () => close(true);
        dialogCancelBtn.onclick = () => close(false);
    });
}

window.customAlert = (title, message) => showCustomDialog(title, message, false);
window.customAsk = (title, message) => showCustomDialog(title, message, true);

window.addEventListener('beforeunload', () => {
    stopGameLogsRealtime();
});



