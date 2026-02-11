(function (global) {
  const ROTATION_INTERVAL_MS = 30000; // 30 seconds
  const BACKGROUND_SOURCES = [
    'assets/images/background1.webp',
    'assets/images/background2.jpg',
    'assets/images/background3.jpg',
    'assets/images/background4.jpg'
  ];

  function preloadImage(src) {
    const image = new Image();
    image.src = src;
  }

  function initBackgroundRotation() {
    const layerA = document.getElementById('bgLayerA');
    const layerB = document.getElementById('bgLayerB');
    if (!layerA || !layerB || BACKGROUND_SOURCES.length < 2) return;

    let currentIndex = 0;
    let activeLayer = layerA;
    let standbyLayer = layerB;

    activeLayer.src = BACKGROUND_SOURCES[currentIndex];
    activeLayer.classList.add('is-visible');

    standbyLayer.src = BACKGROUND_SOURCES[(currentIndex + 1) % BACKGROUND_SOURCES.length];
    standbyLayer.classList.remove('is-visible');

    BACKGROUND_SOURCES.forEach(preloadImage);

    global.setInterval(() => {
      currentIndex = (currentIndex + 1) % BACKGROUND_SOURCES.length;
      standbyLayer.src = BACKGROUND_SOURCES[currentIndex];

      global.requestAnimationFrame(() => {
        standbyLayer.classList.add('is-visible');
        activeLayer.classList.remove('is-visible');
        const tmp = activeLayer;
        activeLayer = standbyLayer;
        standbyLayer = tmp;
      });
    }, ROTATION_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBackgroundRotation);
  } else {
    initBackgroundRotation();
  }
})(window);

