import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function localizeExcalidrawFallback() {
  return {
    name: 'localize-excalidraw-fallback',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        chunk.code = chunk.code.replace(
          /`https:\/\/esm\.sh\/\$\{[\s\S]*?\}\/dist\/prod\/`/g,
          '`${window.location.origin}/planner-assets/dist/prod/`'
        );
        chunk.code = chunk.code.replace(
          /https:\/\/esm\.sh\/@excalidraw\/excalidraw(?:@\$\{[^}]+\})?\/dist\/prod\//g,
          '/planner-assets/dist/prod/'
        );
        chunk.code = chunk.code.replace(
          /https:\/\/esm\.sh\/@excalidraw\/excalidraw@0\.18\.1\/dist\/prod\//g,
          '/planner-assets/dist/prod/'
        );
        const disabledHttpEndpoint = '/planner-assets/offline-disabled/';
        const disabledWsEndpoint = 'ws://127.0.0.1/offline-disabled';
        chunk.code = chunk.code
          .replace(/https:\/\/json\.excalidraw\.com\/api\/v2\/post\//g, disabledHttpEndpoint)
          .replace(/https:\/\/json\.excalidraw\.com\/api\/v2\//g, disabledHttpEndpoint)
          .replace(/https:\/\/libraries\.excalidraw\.com/g, disabledHttpEndpoint)
          .replace(/https:\/\/us-central1-excalidraw-room-persistence\.cloudfunctions\.net\/libraries/g, disabledHttpEndpoint)
          .replace(/https:\/\/plus\.excalidraw\.com/g, disabledHttpEndpoint)
          .replace(/https:\/\/app\.excalidraw\.com/g, disabledHttpEndpoint)
          .replace(/https:\/\/oss-ai\.excalidraw\.com/g, disabledHttpEndpoint)
          .replace(/https:\/\/oss-collab\.excalidraw\.com/g, disabledWsEndpoint)
          .replace(/https:\/\/excalidraw-room-persistence\.firebaseio\.com/g, disabledHttpEndpoint)
          .replace(/https:\/\/excalidraw\.com/g, disabledHttpEndpoint);
      }
    }
  };
}

export default defineConfig({
  base: '/planner-assets/',
  plugins: [react(), localizeExcalidrawFallback()],
  build: {
    emptyOutDir: false,
    outDir: 'public',
    rollupOptions: {
      input: 'src/experiment-diagram.jsx',
      output: {
        entryFileNames: 'experiment-diagram.js',
        chunkFileNames: 'experiment-diagram-[name].js',
        assetFileNames: 'experiment-diagram-vendor.[ext]'
      }
    }
  }
});
