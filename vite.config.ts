import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { crx, ManifestV3Export } from '@crxjs/vite-plugin'

const corsPlugin = (): Plugin => ({
  name: 'cors-plugin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.headers.upgrade === 'websocket') {
        return next();
      }
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

export default defineConfig(({ command }) => {
  // 关键调试代码：在终端打印出当前的 command
  console.log(`[vite.config.ts] Executing with command: "${command}"`);

  const isDev = command === 'serve';

  const manifest: ManifestV3Export = {
    manifest_version: 3,
    name: "Vaultmind",
    version: "0.2.0",
    description: "A lightweight, privacy-focused data analysis assistant.",
    permissions: ["storage", "unlimitedStorage"],
    action: { "default_popup": "index.html" },
    icons: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    content_security_policy: {
      "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      "sandbox": "sandbox allow-scripts; script-src 'self' 'unsafe-eval';"
    },
    sandbox: { "pages": ["sandbox.html"] }
  };

  if (isDev) {
    (manifest as any).background = {
      service_worker: "service-worker-loader.js",
      type: "module"
    };
    manifest.host_permissions = [
      "ws://localhost:5173/*",
      "http://localhost:5173/*"
    ];
    manifest.content_security_policy.extension_pages = "script-src 'self' 'wasm-unsafe-eval' http://localhost:5173; object-src 'self'; connect-src 'self' http://localhost:5173 ws://localhost:5173;";
    manifest.web_accessible_resources = [{
      "matches": ["<all_urls>"],
      "resources": ["**/*", "*"],
      "use_dynamic_url": false
    }];
  }

  const config: any = {
    plugins: [
      react(),
      crx({ manifest }),
      corsPlugin(),
    ],
    base: isDev ? '/' : './',
    build: {
      outDir: 'dist',
      sourcemap: isDev,
      minify: !isDev,
    },
  };

  if (isDev) {
    config.server = {
      port: 5173,
      strictPort: true,
      hmr: { clientPort: 5173 },
    };
  }

  return config;
});
