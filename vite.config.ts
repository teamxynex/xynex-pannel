import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: true,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: { usePolling: true },
    },
    build: {
      rollupOptions: {
        output: {
          // Split heavy vendor libs into their own chunks so a small UI
          // change doesn't force users to re-download the entire bundle.
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion', 'motion'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  };
});
