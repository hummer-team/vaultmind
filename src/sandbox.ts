// import DuckDBWorker from './workers/duckdb.worker.ts?worker'; // <-- 移除此行

console.log('[Sandbox] Script started.');
console.log('[Sandbox.ts] window.origin:', window.origin); // <-- Added this log

// 声明 duckdbWorker 变量，但不在全局作用域创建实例
let duckdbWorker: Worker | null = null;

// Helper function to resolve URLs relative to the sandbox's origin
// This function is now only used for resources other than the main worker script
// const resolveURL = (path: string, extensionOrigin: string) => {
  // path from Vite is like '/assets/file.js'
  // extensionOrigin is like 'chrome-extension://<ID>/'
  // We combine them to get the absolute URL
  // FIX: The path from useDuckDB.ts is already absolute, so just return it.
  // The original resolveURL logic was for relative paths.
  // Now, resources passed to sandbox are already absolute chrome-extension:// URLs.
  // return path;
// };


// 监听来自父窗口的消息 (useDuckDB.ts)
window.addEventListener('message', async (event) => {
  console.log('[Sandbox] Received raw message from parent:', event.data);
  console.log('[Sandbox] Received raw message (JSON.stringify):', JSON.stringify(event.data)); // <-- Added this critical log
  console.log('[Sandbox] Received message from parent type (from event.data.type):', event.data.type);

  if (!event.source) return;

  const { type, resources, extensionOrigin, id } = event.data;

  console.log('[Sandbox] Destructured type:', type);
  console.log('[Sandbox] Destructured resources:', resources); // This should now be a valid object
  console.log('[Sandbox] Destructured extensionOrigin:', extensionOrigin);
  console.log('[Sandbox] Destructured id:', id);

  // Special handling for DUCKDB_INIT to create the Worker and resolve resource URLs
  if (type === 'DUCKDB_INIT') {
    if (!resources) throw new Error('Missing resources for DUCKDB_INIT');
    if (!extensionOrigin) throw new Error('Missing extensionOrigin for DUCKDB_INIT');

    // 1. Get the URL of our custom duckdb.worker.ts script
    const ourWorkerScriptURL = resources['our-duckdb-worker-script.js'];
    if (!ourWorkerScriptURL) throw new Error('Missing our-duckdb-worker-script.js URL');

    console.log('[Sandbox] Current window.origin before Worker creation:', window.origin); // <-- Added this log

    try {
      // REMOVED the fetch -> Blob workaround.
      // Now creating the worker directly from its chrome-extension:// URL.
      console.log('[Sandbox] Attempting to create worker directly from URL:', ourWorkerScriptURL);
      duckdbWorker = new Worker(ourWorkerScriptURL, { type: 'module' });
      console.log('[Sandbox] DuckDB Worker created directly from URL:', duckdbWorker);

    } catch (e) {
      console.error('[Sandbox] Error creating Worker directly:', e);
      console.error('[Sandbox] Worker URL:', ourWorkerScriptURL);
      throw e;
    }

    // 5. Set up the onmessage handler for the newly created worker
    duckdbWorker.onmessage = (workerEvent) => {
      console.log('[Sandbox] Received message from DuckDB Worker:', workerEvent.data.type);
      if (window.parent && window.parent !== window) {
        const transfer = workerEvent.data.data instanceof ArrayBuffer ? [workerEvent.data.data] : [];
        window.parent.postMessage(workerEvent.data, '*', transfer);
      }
    };

    duckdbWorker.onerror = (error) => {
      console.error('[Sandbox] Worker error details:', {
        message: error.message,
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
        error: error.error, // <-- Added this
      });
    };

    duckdbWorker.onmessageerror = (error) => {
      console.error('[Sandbox] DuckDB Worker MESSAGE ERROR:', error);
    };

    // 6. Resources are already absolute chrome-extension:// URLs from useDuckDB.ts
    // No need for further resolveURL calls here for the bundle resources.
    // Just ensure the 'resources' object passed to the worker is the one with absolute URLs.
    
    // 7. Forward the DUCKDB_INIT message with resolved resources to the DuckDB Worker
    // The worker will then use these absolute URLs for duckdb-wasm bundles
    console.log('[Sandbox] Forwarding DUCKDB_INIT message to worker with resources:', resources);
    duckdbWorker.postMessage({ ...event.data, resources: resources }); // resources are already absolute

  } else {
    // For other messages, if worker is not yet created, throw an error or queue
    if (!duckdbWorker) {
      console.error('[Sandbox] DuckDB Worker not initialized yet for message type:', type);
      // Optionally, send an error back to parent or queue the message
      return; 
    }
    // For other messages, just forward them directly
    duckdbWorker.postMessage(event.data, event.data.buffer instanceof ArrayBuffer ? [event.data.buffer] : []);
  }
});


// 通知父窗口 Sandbox 已经准备好
if (window.parent && window.parent !== window) {
  console.log('[Sandbox] Sending SANDBOX_READY to parent.');
  window.parent.postMessage({ type: 'SANDBOX_READY' }, '*'); // <-- Corrected event type
}
