import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  optimizeDeps: {
    force: true // Force dependency pre-bundling to clear react-leaflet caching issues
  }
});
