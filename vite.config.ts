import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The app shell is cached by a service worker, so Recall opens with no connection;
// the learner's data comes from Firestore's own offline cache.
export default defineConfig({
  // The two public Firebase values may also be set without the VITE_ prefix: Vercel refuses
  // VITE_-prefixed variables unless they are marked as public, and both are public by design.
  envPrefix: ['VITE_', 'FIREBASE_CONFIG', 'RECAPTCHA_ENTERPRISE_KEY'],
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
      // sw-notify.js (in public/) adds what happens when a session reminder is clicked.
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg}', '**/roboto-latin-*.woff2'], importScripts: ['sw-notify.js'] },
    }),
  ],
});
