console.log('[DB Worker] Script execution started.'); // <-- Added this log

import { DuckDBService } from '../services/DuckDBService';
import * as duckdb from '@duckdb/duckdb-wasm';

const duckDBService = DuckDBService.getInstance();
let createdCoreWorker: Worker | null = null; // track core worker created during init so we can terminate on shutdown

// resolveURL is no longer needed here as bundle URLs should now be absolute.

self.onmessage = async (event: MessageEvent) => {
  const { type, id, resources, sql, tableName, buffer, fileName, sheetName } = event.data; // Added sheetName

  try {
    let result: any;
    let transfer: Transferable[] = [];

    switch (type) {
      case 'DUCKDB_INIT': {
        console.log('[DB Worker] Received DUCKDB_INIT with resources (absolute URLs):', resources);
        if (!resources) throw new Error('Missing resources for DUCKDB_INIT');

        // Resources should now contain absolute URLs from sandbox.ts
        const DUCKDB_BUNDLES: any = {
          mvp: {
            mainModule: resources['duckdb-mvp.wasm'],
            mainWorker: resources['duckdb-browser-mvp.worker.js'],
          },
          eh: {
            mainModule: resources['duckdb-eh.wasm'],
            mainWorker: resources['duckdb-browser-eh.worker.js'],
          },
        };

        const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
        (bundle as any).pthreadWorker = resources['duckdb-browser-coi.pthread.worker.js'];

        // --- CRITICAL CHANGE: Manually create the Core DuckDB Worker ---
        let coreWorker: Worker | null = null;
        try {
            console.log('[DB Worker] Manually creating Core DuckDB worker from URL:', bundle.mainWorker);
            coreWorker = new Worker(bundle.mainWorker as string, { type: 'module' });
            createdCoreWorker = coreWorker; // track it so shutdown can terminate
            console.log('[DB Worker] Manually created Core DuckDB worker instance:', coreWorker);

            console.log('[DB Worker] Calling duckDBService.initialize with Core Worker...');
            // Pass the NEWLY CREATED coreWorker, not `self`
            await duckDBService.initialize(bundle, coreWorker);
            console.log('[DB Worker] duckDBService.initialize completed successfully.');
            result = true;
        } catch (initError) {
            console.error('[DB Worker] Error during duckDBService.initialize:', initError);
            console.error('[DB Worker] Full error details:', initError instanceof Error ? initError.stack : initError);
            throw initError;
        } finally {
            // Do not terminate the coreWorker here, it's needed by the service.
            // It will be terminated when the service is disposed.
        }
        break;
      }

      case 'DUCKDB_SHUTDOWN': {
        console.log('[DB Worker] Received DUCKDB_SHUTDOWN request.');
        try {
          // Attempt to shutdown the DuckDB service gracefully
          await duckDBService.shutdown();
          // Terminate the created core worker if we created one
          if (createdCoreWorker) {
            try {
              createdCoreWorker.terminate();
            } catch (e) {
              console.warn('[DB Worker] Error terminating core worker:', e);
            }
            createdCoreWorker = null;
          }

          // Inform parent (sandbox) that shutdown succeeded
          self.postMessage({ type: 'DUCKDB_SHUTDOWN_SUCCESS', id, result: true });
        } catch (e: any) {
          console.error('[DB Worker] Error during shutdown:', e);
          self.postMessage({ type: 'DUCKDB_SHUTDOWN_ERROR', id, error: e?.message || String(e) });
        }
        break;
      }

      case 'DUCKDB_REGISTER_FILE': {
        if (!fileName || !buffer) {
          throw new Error('Missing fileName or buffer for DUCKDB_REGISTER_FILE');
        }
        console.log(`[DB Worker] Received DUCKDB_REGISTER_FILE for '${fileName}'`);
        await duckDBService.registerFileBuffer(fileName, new Uint8Array(buffer));
        result = true;
        break;
      }

      case 'CREATE_TABLE_FROM_FILE': {
        if (!tableName || !fileName) {
          throw new Error('Missing tableName or fileName for CREATE_TABLE_FROM_FILE');
        }
        console.log(`[DB Worker] Received CREATE_TABLE_FROM_FILE for '${fileName}' into '${tableName}'`);
        await duckDBService.createTableFromFile(tableName, fileName, sheetName);
        result = true;
        break;
      }

      // --- NEW: Handle file loading ---
      case 'LOAD_FILE': {
        if (!fileName || !buffer || !tableName) {
          throw new Error('Missing fileName, buffer, or tableName for LOAD_FILE');
        }
        console.log(`[DB Worker] Received LOAD_FILE for '${fileName}'`);
        await duckDBService.registerFileBuffer(fileName, new Uint8Array(buffer));
        await duckDBService.createTableFromFile(tableName, fileName, sheetName);
        result = true;
        break;
      }

      case 'DUCKDB_LOAD_DATA': {
        // This case might become obsolete, but we'll keep it for now.
        if (!tableName || !buffer) throw new Error('Missing tableName or buffer');
        await duckDBService.loadData(tableName, new Uint8Array(buffer));
        result = true;
        break;
      }
      case 'DUCKDB_EXECUTE_QUERY': {
        if (!sql) throw new Error('Missing SQL query');
        result = await duckDBService.executeQuery(sql);
        break;
      }
      default:
        throw new Error(`[DB Worker] Unknown message type: ${type}`);
    }
    self.postMessage({ type: `${type}_SUCCESS`, id, result }, transfer as any);
  } catch (error: any) {
    console.error(`[DB Worker] Error processing ${type}:`, error);
    self.postMessage({ type: `${type}_ERROR`, id, error: error.message });
  }
};

console.log('[DB Worker] self.onmessage handler assigned.'); // <-- Added this log
console.log('[DB Worker] Worker script started and listening for messages.');

