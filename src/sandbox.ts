// import type * as Arrow from 'apache-arrow'; // <-- Added type import
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

    // --- NEW LOGGING ---
    if (event.data && event.data.buffer instanceof ArrayBuffer) {
        console.log('[Sandbox] Received buffer with byteLength:', event.data.buffer.byteLength);
    }
    // --- END NEW LOGGING ---

    console.log('[Sandbox] Received raw message (JSON.stringify):', JSON.stringify(event.data));
    console.log('[Sandbox] Received message from parent type (from event.data.type):', event.data.type);
    console.log('[Sandbox] Message origin:', event.origin); // <-- Added this log

    if (!event.source) return;
    // It's possible for event.data to be null or not an object
    if (!event.data) {
        console.warn('[Sandbox] Received message with null or undefined data, ignoring.');
        return;
    }

    const {type, resources, extensionOrigin, id} = event.data;

    console.log('[Sandbox] Destructured type:', type);
    console.log('[Sandbox] Destructured resources:', resources);
    console.log('[Sandbox] Destructured extensionOrigin:', extensionOrigin);
    console.log('[Sandbox] Destructured id:', id);

    // Special handling for DUCKDB_INIT to create the Worker and resolve resource URLs
    if (type === 'DUCKDB_INIT') {
        if (!resources)
          throw new Error('Missing resources for DUCKDB_INIT');
        if (!extensionOrigin)
          throw new Error('Missing extensionOrigin for DUCKDB_INIT');

        // 1. Get the URL of our custom duckdb.worker.ts script
        const ourWorkerScriptURL = resources['our-duckdb-worker-script.js'];
        if (!ourWorkerScriptURL)
          throw new Error('Missing our-duckdb-worker-script.js URL');

        console.log('[Sandbox] Current window.origin before Worker creation:', window.origin); // <-- Added this log

        try {
            // REMOVED the fetch -> Blob workaround.
            // Now creating the worker directly from its chrome-extension:// URL.
            console.log('[Sandbox] Attempting to create worker directly from URL:', ourWorkerScriptURL);
            duckdbWorker = new Worker(ourWorkerScriptURL, {type: 'module'});
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
        duckdbWorker.postMessage({...event.data, resources: resources}); // resources are already absolute

    } else if (type === 'PARSE_BUFFER_TO_ARROW') {
        // --- NEW: Handle file parsing in the sandbox main thread ---
        const {fileName, buffer, id} = event.data;
        try {
            const {default: Papa} = await import('papaparse');
            const {default: ExcelJS} = await import('exceljs');
            // --- CRITICAL CHANGE: Import vectorFromArray ---
            const { Table, Utf8, vectorFromArray, tableToIPC } = await import('apache-arrow');
            console.log('[Sandbox] Imported specific components from apache-arrow.');

            const fileExtension = fileName.split('.').pop()?.toLowerCase();
            let jsonData;

            if (fileExtension === 'csv') {
                const csvString = new TextDecoder().decode(buffer);
                jsonData = await new Promise((resolve, reject) => {
                    Papa.parse(csvString, {
                        header: true,
                        skipEmptyLines: true,
                        dynamicTyping: true,
                        complete: (results) => results.errors.length ? reject(results.errors[0]) : resolve(results.data),
                        error: (error: Error) => reject(error),
                    });
                });
            } else if (fileExtension === 'xls' || fileExtension === 'xlsx') {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer);
                const worksheet = workbook.worksheets[0];
                if (!worksheet) throw new Error('Excel file contains no sheets.');
                const rows: any[] = [];
                worksheet.eachRow({includeEmpty: false}, (row) => {
                    rows.push(row.values);
                });
                console.log('[Sandbox] Excel worksheet rows length', rows.length);
                if (rows.length === 0) {
                    jsonData = [];
                } else {
                    const headers = rows[0].slice(1);
                    jsonData = rows.slice(1).map(rowArray => {
                        const row = rowArray.slice(1);
                        const rowObject: Record<string, any> = {};
                        headers.forEach((header: string, index: number) => {
                            rowObject[header] = row[index] ?? null;
                        });
                        console.log('[Sandbox] Parsed row:', JSON.stringify(rowObject));
                        return rowObject;
                    });
                }
            } else {
                throw new Error('Unsupported file type');
            }

            if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
              throw new Error('File is empty or could not be parsed into an array of objects');
            }

            console.log('[Sandbox] Manually building Arrow table from JSON...');

            // 1. Get column names from the first data row
            const columnNames = Object.keys(jsonData[0]);

            // 2. Create a Vector for each column using vectorFromArray
            const columns = columnNames.map(name => {
                // Extract all values for the current column and ensure they are strings
                const values = jsonData.map((row: any) => {
                    const value = row[name];
                    return value === null || value === undefined ? null : String(value);
                });
                // --- CRITICAL CHANGE: Use vectorFromArray to explicitly create a string Vector ---
                return vectorFromArray(values, new Utf8());
            });

            // 3. Create the table from the named columns
            const arrowTable = new Table(Object.fromEntries(columnNames.map((name, i) => [name, columns[i]])));
            // --- END CRITICAL CHANGE ---

            console.log('[Sandbox] Arrow table created. Rows:', arrowTable.numRows);

            console.log('[Sandbox] Serializing Arrow table to IPC format...');
            const result = tableToIPC(arrowTable, 'file');
            console.log('[Sandbox] IPC serialization complete. Result buffer byteLength:', result.byteLength); // <-- Added log

            // Forward the result to the parent window
            if (window.parent && window.parent !== window) {
                console.log('[Sandbox] Posting PARSE_BUFFER_TO_ARROW_SUCCESS message to parent...'); // <-- Added log
                window.parent.postMessage({type: 'PARSE_BUFFER_TO_ARROW_SUCCESS', id, result}, '*', [result.buffer]);
                console.log('[Sandbox] Message posted to parent.'); // <-- Added log
            }
        } catch (error: any) {
            console.error('[Sandbox] Error during PARSE_BUFFER_TO_ARROW:', error); // <-- More detailed error log
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({type: 'PARSE_BUFFER_TO_ARROW_ERROR', id, error: error.message}, '*');
            }
        }
    } else {
        // --- CRITICAL CHANGE: Only forward messages with a valid type ---
        if (typeof type === 'undefined' || type === null || type === '') {
            console.warn('[Sandbox] Received message with undefined or empty type, ignoring:', event.data);
            return; // Ignore messages with no valid type
        }

        if (!duckdbWorker) {
            console.error('[Sandbox] DuckDB Worker not initialized yet for message type:', type);
            return;
        }
        console.log('[Sandbox] Forwarding unknown message type to duckdbWorker:', type, event.data); // <-- Added log
        duckdbWorker.postMessage(event.data, event.data.buffer instanceof ArrayBuffer ? [event.data.buffer] : []);
    }
});


// 通知父窗口 Sandbox 已经准备好
if (window.parent && window.parent !== window) {
    console.log('[Sandbox] Sending SANDBOX_READY to parent.');
    window.parent.postMessage({type: 'SANDBOX_READY'}, '*'); // <-- Corrected event type
}
