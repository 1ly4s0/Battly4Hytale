(function (global) {
  function safeElement(el) {
    return el && typeof el === 'object';
  }

  function createViewNavigator(options) {
    const homeView = options.homeView;
    const modsView = options.modsView;
    const modsBtn = options.modsBtn;
    const modsShortcutBtn = options.modsShortcutBtn;
    const homeShortcutBtn = options.homeShortcutBtn;
    const onOpenMods = typeof options.onOpenMods === 'function' ? options.onOpenMods : null;
    const onCloseMods = typeof options.onCloseMods === 'function' ? options.onCloseMods : null;

    let isModsOpen = false;

    function syncButtonState() {
      if (safeElement(modsBtn)) {
        modsBtn.classList.toggle('is-active', isModsOpen);
      }
      if (safeElement(modsShortcutBtn)) {
        modsShortcutBtn.classList.toggle('is-active', isModsOpen);
      }
      if (safeElement(homeShortcutBtn)) {
        homeShortcutBtn.classList.toggle('is-active', !isModsOpen);
      }
    }

    function setModsView(open) {
      isModsOpen = Boolean(open);

      if (safeElement(homeView)) {
        homeView.style.display = isModsOpen ? 'none' : 'flex';
      }
      if (safeElement(modsView)) {
        modsView.style.display = isModsOpen ? 'flex' : 'none';
      }

      syncButtonState();

      if (isModsOpen && onOpenMods) {
        onOpenMods();
      }
      if (!isModsOpen && onCloseMods) {
        onCloseMods();
      }

      return isModsOpen;
    }

    function openMods() {
      return setModsView(true);
    }

    function closeMods() {
      return setModsView(false);
    }

    function toggleMods() {
      return setModsView(!isModsOpen);
    }

    function getState() {
      return isModsOpen;
    }

    return {
      setModsView,
      openMods,
      closeMods,
      toggleMods,
      getState
    };
  }

  global.LauncherNavigation = {
    createViewNavigator
  };
})(window);

