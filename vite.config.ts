import {defineConfig, Plugin, UserConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {crx} from '@crxjs/vite-plugin'
import './src/types/crx-manifest.d.ts';

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

export default defineConfig(({command}) => {
    const isDev = command === 'serve';

    const manifest: any = {
        manifest_version: 3,
        name: "Vaultmind",
        version: "0.2.0",
        description: "A lightweight, privacy-focused data analysis assistant.",
        permissions: [
            "storage",
            "unlimitedStorage"
        ],
        cross_origin_embedder_policy: {
            "value": "require-corp"
        },
        cross_origin_opener_policy: {
            "value": "same-origin"
        },
        action: {
            "default_popup": "index.html"
        },
        icons: {
            "16": "icons/icon-16.png",
            "48": "icons/icon-48.png",
            "128": "icons/icon-128.png"
        },
        content_security_policy: {
            "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';",
            // The 'sandbox' CSP directive is not needed here if sandbox.html is not declared as a sandboxed page
        },
        // THIS FIELD MUST BE REMOVED
        // sandbox: {
        //     "pages": [
        //         "sandbox.html"
        //     ]
        // },
        web_accessible_resources: [
            {
                "resources": ["sandbox.html", "assets/*", "extensions/*"],
                "matches": ["<all_urls>"]
            }
        ]
    };

    if (isDev) {
        manifest.background = {
            service_worker: "service-worker-loader.js",
            type: "module"
        };
        manifest.host_permissions = [
            "ws://localhost:5173/*",
            "http://localhost:5173/*"
        ];
        manifest.content_security_policy.extension_pages = "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' http://localhost:5173; object-src 'self'; connect-src 'self' http://localhost:5173 ws://localhost:5173;";
        manifest.web_accessible_resources[0].resources.push("**/*", "*");
    }

    const config: UserConfig = {
        plugins: [
            react(),
            crx({manifest}),
            corsPlugin(),
        ],
        base: isDev ? '/' : './',
        build: {
            outDir: 'dist',
            sourcemap: isDev,
            minify: !isDev,
            rollupOptions: {
                input: {
                    main: 'index.html',
                    sandbox: 'sandbox.html',
                    duckdbWorker: 'src/workers/duckdb.worker.ts', // <-- Add worker as an entry
                },
                output: {
                    entryFileNames: (chunkInfo) => {
                        if (chunkInfo.name === 'duckdbWorker') {
                            return `assets/duckdb.worker.js`; // <-- Force predictable name
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
