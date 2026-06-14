import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api calls to the Express server on :4000 so the frontend and
// backend can run side by side. In production the Express server serves the
// built files directly, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
