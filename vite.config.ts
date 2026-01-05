import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json'

// The custom CORS plugin is still necessary for preflight requests.
const corsPlugin = (): Plugin => ({
  name: 'cors-plugin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.writeHead(204);
        res.end();
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    corsPlugin(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    // CORRECTED AND FINAL: Provide an explicit and robust HMR configuration.
    // This ensures the HMR client inside the extension knows exactly how to connect.
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
  },
})
