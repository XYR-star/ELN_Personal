window.EXCALIDRAW_ASSET_PATH = '/planner-assets/';

import('./experiment-diagram-main.jsx').catch((error) => {
  const errorBox = document.querySelector('[data-experiment-diagram-error]');
  if (errorBox) {
    errorBox.textContent = error?.message || 'Unable to load experiment diagram editor.';
    errorBox.hidden = false;
  }
  throw error;
});
