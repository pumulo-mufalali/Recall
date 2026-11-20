import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The app shell is cached by a service worker, so Recall opens with no connection;
// the learner's data comes from Firestore's own offline cache.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Recall',
        short_name: 'Recall',
        description: 'Know what you know: active recall with on-device AI marking.',
        theme_color: '#2f5fb8',
        background_color: '#f4f6f8',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
});
