import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

const root = document.querySelector('[data-experiment-diagram-root]');
const preview = document.querySelector('[data-experiment-diagram-preview]');
const statusLine = document.querySelector('[data-experiment-diagram-status]');
const dialog = document.querySelector('[data-experiment-diagram-dialog]');
const canvas = document.querySelector('[data-experiment-diagram-canvas]');
const openButton = document.querySelector('[data-experiment-diagram-open]');
const saveButton = document.querySelector('[data-experiment-diagram-save]');
const closeButton = document.querySelector('[data-experiment-diagram-close]');
const errorBox = document.querySelector('[data-experiment-diagram-error]');

const apiBase = root?.dataset.apiBase || '/experiment-diagram-api.php';
const experimentId = root?.dataset.experimentId || '';

let excalidrawAPI = null;
let sceneData = null;
let reactRoot = null;

function csrfHeaders(hasBody = false) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...(hasBody ? { 'Content-Type': 'application/json' } : {})
  };
}

async function request(options = {}) {
  const response = await fetch(`${apiBase}?id=${encodeURIComponent(experimentId)}`, {
    headers: csrfHeaders(Boolean(options.body)),
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function showError(message = '') {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function renderPreview(svg = '') {
  if (!preview) return;
  if (!svg) {
    preview.innerHTML = '<div class="experiment-diagram-empty text-muted">No diagram yet. Add a sketch for workflow, setup, or key observations.</div>';
    return;
  }
  preview.innerHTML = svg;
}

function setStatus(modifiedAt = null) {
  if (!statusLine) return;
  statusLine.textContent = modifiedAt ? `Diagram saved ${modifiedAt}` : '';
}

function normalizeScene(scene) {
  return {
    elements: Array.isArray(scene?.elements) ? scene.elements : [],
    appState: {
      viewBackgroundColor: '#ffffff',
      ...(scene?.appState || {}),
      collaborators: undefined
    },
    files: scene?.files || {}
  };
}

function DiagramApp({ initialScene }) {
  const initialData = useMemo(() => normalizeScene(initialScene), [initialScene]);
  const [ready, setReady] = useState(false);
  const mounted = useRef(false);

  return (
    <div className="experiment-diagram-react" data-ready={ready ? 'true' : 'false'}>
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(api) => {
          excalidrawAPI = api;
          if (!mounted.current) {
            mounted.current = true;
            setReady(true);
          }
        }}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: true,
            clearCanvas: true,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            saveAsImage: true,
            theme: false,
            toggleTheme: false
          }
        }}
      />
    </div>
  );
}

async function loadDiagram() {
  if (!root) return;
  try {
    const data = await request();
    sceneData = data.scene || null;
    renderPreview(data.preview_svg || '');
    setStatus(data.modified_at || null);
  } catch (error) {
    renderPreview('');
    setStatus('');
    showError(error.message);
  }
}

function mountEditor() {
  if (!canvas) return;
  if (reactRoot) {
    reactRoot.unmount();
  }
  excalidrawAPI = null;
  reactRoot = createRoot(canvas);
  reactRoot.render(<DiagramApp initialScene={sceneData} />);
}

async function saveDiagram() {
  if (!excalidrawAPI) {
    showError('Diagram editor is still loading.');
    return;
  }
  showError('');
  saveButton.disabled = true;
  try {
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();
    const svgElement = await exportToSvg({
      elements,
      appState: {
        ...appState,
        exportBackground: true,
        viewBackgroundColor: appState.viewBackgroundColor || '#ffffff'
      },
      files,
      exportPadding: 16
    });
    const previewSvg = new XMLSerializer().serializeToString(svgElement);
    const scene = { elements, appState, files };
    const data = await request({
      method: 'PATCH',
      body: JSON.stringify({ scene, preview_svg: previewSvg })
    });
    sceneData = data.scene || scene;
    renderPreview(data.preview_svg || previewSvg);
    setStatus(data.modified_at || null);
    dialog?.close();
  } catch (error) {
    showError(error.message);
  } finally {
    saveButton.disabled = false;
  }
}

if (root && dialog && canvas) {
  loadDiagram();
  openButton?.addEventListener('click', () => {
    showError('');
    mountEditor();
    dialog.showModal();
  });
  closeButton?.addEventListener('click', () => dialog.close());
  saveButton?.addEventListener('click', saveDiagram);
  dialog.addEventListener('close', () => {
    if (reactRoot) {
      reactRoot.unmount();
      reactRoot = null;
      excalidrawAPI = null;
    }
  });
}
