const invoke = window.__TAURI__.invoke;
const { listen } = window.__TAURI__.event;

// Translations
const translations = {
    es: {
        step_welcome: "Bienvenido",
        step_install: "Instalación",
        step_finish: "Finalizar",
        title_welcome: "Instalar Battly Launcher",
        desc_welcome: "Bienvenido al asistente de instalación de Battly Launcher para Hytale. Este programa instalará la última versión en tu sistema.",
        check_opera: "Instalar Opera GX",
        check_opera_sub: "Navegador recomendado para gamers (Opcional)",
        btn_install: "Instalar",
        title_installing: "Instalando...",
        status_init: "Preparando...",
        title_finished: "¡Instalación Completada!",
        desc_finished: "Battly Launcher se ha instalado correctamente en tu ordenador.",
        btn_launch: "Jugar Ahora",
        // Status keys
        status_cleaning: "Limpiando instalación anterior...",
        status_downloading_start: "Descargando Battly Launcher...",
        status_downloading_percent: "Descargando... {0}%",
        status_extracting: "Extrayendo archivos...",
        status_installing: "Instalando...",
        status_shortcuts: "Creando accesos directos...",
        status_opera: "Instalando Opera GX...",
    },
    en: {
        step_welcome: "Welcome",
        step_install: "Installation",
        step_finish: "Finish",
        title_welcome: "Install Battly Launcher",
        desc_welcome: "Welcome to the Battly Launcher setup wizard for Hytale. This program will install the latest version on your system.",
        check_opera: "Install Opera GX",
        check_opera_sub: "Recommended browser for gamers (Optional)",
        btn_install: "Install",
        title_installing: "Installing...",
        status_init: "Preparing...",
        title_finished: "Installation Complete!",
        desc_finished: "Battly Launcher has been successfully installed on your computer.",
        btn_launch: "Play Now",
        // Status keys
        status_cleaning: "Cleaning previous installation...",
        status_downloading_start: "Downloading Battly Launcher...",
        status_downloading_percent: "Downloading... {0}%",
        status_extracting: "Extracting files...",
        status_installing: "Installing...",
        status_shortcuts: "Creating shortcuts...",
        status_opera: "Installing Opera GX...",
    },
    de: {
        step_welcome: "Willkommen",
        step_install: "Installation",
        step_finish: "Fertigstellen",
        title_welcome: "Battly Launcher installieren",
        desc_welcome: "Willkommen beim Installationsassistenten für den Battly Launcher. Dieses Programm installiert die neueste Version auf Ihrem System.",
        check_opera: "Opera GX installieren",
        check_opera_sub: "Empfohlener Browser für Gamer (Optional)",
        btn_install: "Installieren",
        title_installing: "Installiere...",
        status_init: "Vorbereitung...",
        title_finished: "Installation abgeschlossen!",
        desc_finished: "Battly Launcher wurde erfolgreich auf Ihrem Computer installiert.",
        btn_launch: "Jetzt spielen",
        status_cleaning: "Bereinige vorherige Installation...",
        status_downloading_start: "Lade Battly Launcher herunter...",
        status_downloading_percent: "Herunterladen... {0}%",
        status_extracting: "Entpacke Dateien...",
        status_installing: "Installiere...",
        status_shortcuts: "Erstelle Verknüpfungen...",
        status_opera: "Installiere Opera GX...",
    },
    fr: {
        step_welcome: "Bienvenue",
        step_install: "Installation",
        step_finish: "Terminer",
        title_welcome: "Installer Battly Launcher",
        desc_welcome: "Bienvenue dans l'assistant d'installation de Battly Launcher. Ce programme installera la dernière version sur votre système.",
        check_opera: "Installer Opera GX",
        check_opera_sub: "Navigateur recommandé pour les gamers (Optionnel)",
        btn_install: "Installer",
        title_installing: "Installation...",
        status_init: "Préparation...",
        title_finished: "Installation terminée !",
        desc_finished: "Battly Launcher a été installé avec succès sur votre ordinateur.",
        btn_launch: "Jouer maintenant",
        status_cleaning: "Nettoyage de l'installation précédente...",
        status_downloading_start: "Téléchargement de Battly Launcher...",
        status_downloading_percent: "Téléchargement... {0}%",
        status_extracting: "Extraction des fichiers...",
        status_installing: "Installation...",
        status_shortcuts: "Création des raccourcis...",
        status_opera: "Installation de Opera GX...",
    },
    pt: {
        step_welcome: "Bem-vindo",
        step_install: "Instalação",
        step_finish: "Concluir",
        title_welcome: "Instalar Battly Launcher",
        desc_welcome: "Bem-vindo ao assistente de instalação do Battly Launcher. Este programa instalará a versão mais recente no seu sistema.",
        check_opera: "Instalar Opera GX",
        check_opera_sub: "Navegador recomendado para gamers (Opcional)",
        btn_install: "Instalar",
        title_installing: "Instalando...",
        status_init: "Preparando...",
        title_finished: "Instalação Concluída!",
        desc_finished: "Battly Launcher foi instalado com sucesso no seu computador.",
        btn_launch: "Jogar Agora",
        status_cleaning: "Limpando instalação anterior...",
        status_downloading_start: "Baixando Battly Launcher...",
        status_downloading_percent: "Baixando... {0}%",
        status_extracting: "Extraindo arquivos...",
        status_installing: "Instalando...",
        status_shortcuts: "Criando atalhos...",
        status_opera: "Instalando Opera GX...",
    },
    ru: {
        step_welcome: "Добро пожаловать",
        step_install: "Установка",
        step_finish: "Завершение",
        title_welcome: "Установить Battly Launcher",
        desc_welcome: "Добро пожаловать в мастер установки Battly Launcher. Эта программа установит последнюю версию на ваш компьютер.",
        check_opera: "Установить Opera GX",
        check_opera_sub: "Рекомендуемый браузер для геймеров (Необязательно)",
        btn_install: "Установить",
        title_installing: "Установка...",
        status_init: "Подготовка...",
        title_finished: "Установка завершена!",
        desc_finished: "Battly Launcher успешно установлен на ваш компьютер.",
        btn_launch: "Играть сейчас",
        status_cleaning: "Очистка предыдущей установки...",
        status_downloading_start: "Загрузка Battly Launcher...",
        status_downloading_percent: "Загрузка... {0}%",
        status_extracting: "Извлечение файлов...",
        status_installing: "Установка...",
        status_shortcuts: "Создание ярлыков...",
        status_opera: "Установка Opera GX...",
    },
    zh: {
        step_welcome: "欢迎",
        step_install: "安装",
        step_finish: "完成",
        title_welcome: "安装 Battly Launcher",
        desc_welcome: "欢迎使用 Battly Launcher 安装向导。该程序将在您的系统上安装最新版本。",
        check_opera: "安装 Opera GX",
        check_opera_sub: "玩家推荐浏览器（可选）",
        btn_install: "安装",
        title_installing: "正在安装...",
        status_init: "准备中...",
        title_finished: "安装完成！",
        desc_finished: "Battly Launcher 已成功安装在您的电脑上。",
        btn_launch: "立即开始",
        status_cleaning: "正在清理旧版本...",
        status_downloading_start: "正在下载 Battly Launcher...",
        status_downloading_percent: "下载中... {0}%",
        status_extracting: "正在解压文件...",
        status_installing: "正在安装...",
        status_shortcuts: "正在创建快捷方式...",
        status_opera: "正在安装 Opera GX...",
    },
    ja: {
        step_welcome: "ようこそ",
        step_install: "インストール",
        step_finish: "完了",
        title_welcome: "Battly Launcher のインストール",
        desc_welcome: "Battly Launcher インストールウィザードへようこそ。このプログラムはシステムに最新バージョンをインストールします。",
        check_opera: "Opera GX をインストール",
        check_opera_sub: "ゲーマー推奨ブラウザ（オプション）",
        btn_install: "インストール",
        title_installing: "インストール中...",
        status_init: "準備中...",
        title_finished: "インストール完了！",
        desc_finished: "Battly Launcher が正常にインストールされました。",
        btn_launch: "今すぐプレイ",
        status_cleaning: "以前のインストールを削除中...",
        status_downloading_start: "Battly Launcher をダウンロード中...",
        status_downloading_percent: "ダウンロード中... {0}%",
        status_extracting: "ファイルを展開中...",
        status_installing: "インストール中...",
        status_shortcuts: "ショートカットを作成中...",
        status_opera: "Opera GX をインストール中...",
    }
};

let currentLang = 'en';

function detectLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    const shortLang = lang.split('-')[0]; // es-MX -> es, en-US -> en

    if (translations[shortLang]) {
        return shortLang;
    }
    return 'en';
}

function t(key, ...args) {
    const dict = translations[currentLang] || translations['en'];
    let text = dict[key] || translations['en'][key] || key;

    args.forEach((arg, i) => {
        text = text.replace(`{${i}}`, arg);
    });

    return text;
}

function initLocales() {
    currentLang = detectLanguage();
    console.log("Detected language:", currentLang);

    // Static Elements Map
    const map = {
        'step-welcome-text': 'step_welcome',
        'step-install-text': 'step_install',
        'step-finish-text': 'step_finish',
        'title-welcome': 'title_welcome',
        'desc-welcome': 'desc_welcome',
        'text-opera-main': 'check_opera',
        'text-opera-sub': 'check_opera_sub',
        'btn-install': 'btn_install',
        'title-installing': 'title_installing',
        'status-text': 'status_init',
        'title-finished': 'title_finished',
        'desc-finished': 'desc_finished',
        'btn-launch': 'btn_launch'
    };

    for (const [id, key] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) {
            // Special handling for buttons/inputs if needed, but here mostly textContent works
            el.textContent = t(key);
        }
    }
}

// Elements
const stepWelcome = document.getElementById('step-welcome');
const stepInstall = document.getElementById('step-install');
const stepFinish = document.getElementById('step-finish');

const screenWelcome = document.getElementById('screen-welcome');
const screenProgress = document.getElementById('screen-progress');
const screenFinish = document.getElementById('screen-finish');

const btnInstall = document.getElementById('btn-install');
const btnLaunch = document.getElementById('btn-launch');
const btnClose = document.getElementById('close-btn');

const checkOpera = document.getElementById('check-opera');
const optionsContainer = document.querySelector('.options');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
let progressUnlisten = null;
let installInProgress = false;

// Init Translations immediately
initLocales();

// Navigation
function goToStep(stepIndex) {
    if (stepIndex === 2) {
        stepWelcome.classList.remove('active');
        stepInstall.classList.add('active');
        screenWelcome.classList.remove('active');
        screenProgress.classList.add('active');
    } else if (stepIndex === 3) {
        stepInstall.classList.remove('active');
        stepFinish.classList.add('active');
        screenProgress.classList.remove('active');
        screenFinish.classList.add('active');
    }
}

// Event Listeners
btnClose.addEventListener('click', () => {
    invoke('close_installer');
});

async function ensureProgressListener() {
    if (progressUnlisten) {
        return;
    }
    progressUnlisten = await listen('install-progress', (event) => {
        const payload = event.payload;
        progressBar.style.width = `${payload.progress * 100}%`;

        // Translate dynamic status
        let statusMsg = t(payload.status_key);
        if (payload.status_data) {
            statusMsg = t(payload.status_key, payload.status_data);
        }
        statusText.innerText = statusMsg;
    });
}

async function startInstallerFlow(installOpera) {
    if (installInProgress) {
        return;
    }
    installInProgress = true;
    btnInstall.disabled = true;
    goToStep(2);

    await ensureProgressListener();

    try {
        await invoke('start_install', { installOpera });
        goToStep(3);
    } catch (e) {
        statusText.innerText = 'Error: ' + e;
        statusText.style.color = '#ed4245';
        installInProgress = false;
        btnInstall.disabled = false;
    }
}

btnInstall.addEventListener('click', async () => {
    await startInstallerFlow(checkOpera.checked);
});

btnLaunch.addEventListener('click', () => {
    invoke('launch_app');
});

async function bootstrapAutoUpdate() {
    try {
        const alreadyInstalled = await invoke('is_launcher_installed');
        if (!alreadyInstalled) {
            return;
        }

        if (optionsContainer) {
            optionsContainer.style.display = 'none';
        }

        await startInstallerFlow(false);
    } catch (_) {
        // If detection fails, keep normal install flow.
    }
}

bootstrapAutoUpdate();
