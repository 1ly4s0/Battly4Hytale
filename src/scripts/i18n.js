(function (global) {
  const state = {
    translations: {}
  };

  function getTranslation(key, fallback) {
    if (!key) return fallback || '';
    const value = state.translations[key];
    if (typeof value === 'string' && value.length > 0) return value;
    return fallback || key;
  }

  function applyTranslations(root) {
    const scope = root || document;

    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const text = getTranslation(key, '');
      if (!text) return;

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    });

    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = getTranslation(key, '');
      if (text) el.placeholder = text;
    });

    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      const text = getTranslation(key, '');
      if (text) el.title = text;
    });

    scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      const text = getTranslation(key, '');
      if (text) el.setAttribute('aria-label', text);
    });
  }

  async function loadLocale(lang) {
    try {
      const fsApi = global.fileSystem;
      if (!fsApi || typeof fsApi.readLocale !== 'function') {
        throw new Error('fileSystem.readLocale unavailable');
      }

      const translations = await fsApi.readLocale(lang);
      if (!translations || typeof translations !== 'object') {
        throw new Error('invalid locale payload');
      }

      state.translations = translations;
      localStorage.setItem('battly_lang', lang);
      applyTranslations(document);
      return translations;
    } catch (error) {
      console.error('LauncherI18n loadLocale error:', error);
      return state.translations;
    }
  }

  function setTranslations(translations) {
    state.translations = translations || {};
    applyTranslations(document);
  }

  function getTranslations() {
    return state.translations;
  }

  global.LauncherI18n = {
    loadLocale,
    applyTranslations,
    setTranslations,
    getTranslations,
    t: getTranslation
  };
})(window);

