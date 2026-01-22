import {defineConfig, Plugin, UserConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {crx} from '@crxjs/vite-plugin' // <-- defineManifest is no longer needed here
import './src/types/crx-manifest.d.ts';
import wasm from 'vite-plugin-wasm';

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

// --- CRITICAL CORRECTION: Define manifest as 'any' to bypass strict type checking ---
const manifest: any = { // <-- Changed from defineManifest to 'any'
    manifest_version: 3,
    name: "Vaultmind",
    version: "0.2.0",
    description: "A lightweight, privacy-focused data analysis assistant.",
    permissions: [
        "storage",
        "unlimitedStorage",
        "activeTab",
        "scripting",
        "sidePanel", // Added sidePanel permission
        "tabs"
    ],
    // --- Ensure host_permissions are here ---
    host_permissions: [
        "ws://localhost:5173/*",
        "http://localhost:5173/*",
        "https://dashscope.aliyuncs.com/*"
    ],
    // --- CRITICAL CORRECTION: Correct structure for cross_origin policies ---
    cross_origin_embedder_policy: { "value": "require-corp" }, // Corrected back to object
    cross_origin_opener_policy: { "value": "same-origin" },   // Corrected back to object
    // --- END CRITICAL CORRECTION ---
    action: {
        "default_title": "Open Vaultmind"
    },
    background: {
        "service_worker": "src/background.ts",
        "type": "module"
    },
    // content_scripts is removed as per the programmatic injection plan
    icons: {
        "16": "icons/icon-16.png",
        "48": "icons/icon-48.png",
        "64": "icons/icon-64.png",
        "128": "icons/icon-128.png"
    },
    content_security_policy: {
        "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';",
    },
    web_accessible_resources: [
        {
            "resources": ["index.html", "sandbox.html", "empty.html", "assets/*", "extensions/*", "assets/content-script.js"], // Added empty.html
            "matches": ["<all_urls>"]
        }
    ],
    side_panel: { // Added side_panel configuration
        "default_path": "index.html"
    }
};
// --- END CRITICAL CORRECTION ---

export default defineConfig(({command}) => {
    const isDev = command === 'serve';

    const config: UserConfig = {
        plugins: [
            react(),
            // Enables WASM imports used by xlsx-wasm-browser (via xlsx-wasm-parser)
            wasm(),
            crx({manifest}), // <-- Pass the 'any' typed manifest
            corsPlugin(),
        ],
        resolve: {
            alias: {
                'apache-arrow': 'node_modules/apache-arrow/Arrow.esnext.min.js',
            },
        },
        base: isDev ? '/' : './',
        build: {
            outDir: 'dist',
            sourcemap: isDev,
            minify: !isDev,
            rollupOptions: {
                input: {
                    main: 'index.html',
                    sandbox: 'sandbox.html',
                    duckdbWorker: 'src/workers/duckdb.worker.ts',
                    contentScript: 'src/content-script.ts', // Add contentScript as an input
                },
                output: {
                    entryFileNames: (chunkInfo) => {
                        if (chunkInfo.name === 'duckdbWorker') {
                            return `assets/duckdb.worker.js`;
                        }
                        if (chunkInfo.name === 'contentScript') { // Define fixed name for contentScript
                            return `assets/content-script.js`;
                        }
                        return `assets/[name]-[hash].js`;
                    },
                    chunkFileNames: `assets/[name]-[hash].js`,
                    assetFileNames: `assets/[name]-[hash].[ext]`
                }
            },
        },
        worker: {
            format: 'es',
        },
    };

    if (isDev) {
        config.server = {
            port: 5173,
            strictPort: true,
            hmr: {clientPort: 5173},
        };
    }

    return config;
});
