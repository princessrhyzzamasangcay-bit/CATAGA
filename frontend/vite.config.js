import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend lives in /frontend. Build output goes to /frontend/dist,
// which the Express backend (/backend/server.cjs) serves in production.
export default defineConfig({
  plugins: [react()],
});
