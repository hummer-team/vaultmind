import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json'

// A custom plugin to handle CORS preflight requests CORRECTLY
const corsPlugin = (): Plugin => ({
  name: 'cors-plugin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // Handle preflight requests (OPTIONS method)
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        // This is the critical change: allow ANY header
        res.setHeader('Access-Control-Allow-Headers', '*'); 
        res.writeHead(204); // 204 No Content
        res.end();
        return;
      }

      // Also add the header for regular requests
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
    // Add our custom CORS plugin
    corsPlugin(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
})
