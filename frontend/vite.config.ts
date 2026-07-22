import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

const hasCerts = fs.existsSync('../certs/key.pem') && fs.existsSync('../certs/cert.pem');

const httpsConfig = hasCerts ? {
  key: fs.readFileSync('../certs/key.pem'),
  cert: fs.readFileSync('../certs/cert.pem'),
} : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    https: httpsConfig,
  },
  preview: {
    host: true,
    port: 5173,
    https: httpsConfig,
  },
});
