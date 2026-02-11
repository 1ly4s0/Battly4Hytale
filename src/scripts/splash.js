(() => {
  const statusElement = document.getElementById("status-text");
  if (!statusElement) return;

  const messages = [
    "Loading resources...",
    "Initializing launcher...",
    "Checking updates...",
    "Preparing game services..."
  ];

  let index = 0;
  const rotateMessage = () => {
    statusElement.style.opacity = "0";
    window.setTimeout(() => {
      index = (index + 1) % messages.length;
      statusElement.textContent = messages[index];
      statusElement.style.opacity = "1";
    }, 160);
  };

  window.setInterval(rotateMessage, 950);
})();

