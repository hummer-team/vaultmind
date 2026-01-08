console.log('[DB Worker] Script execution started.'); // <-- Added this log

import { DuckDBService } from '../services/DuckDBService';
import * as duckdb from '@duckdb/duckdb-wasm';

const duckDBService = DuckDBService.getInstance();

// resolveURL is no longer needed here as bundle URLs should now be absolute.

self.onmessage = async (event: MessageEvent) => {
  const { type, id, resources, sql, tableName, buffer } = event.data;

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
      
      // REMOVED 'PARSE_BUFFER_TO_ARROW' case from here

      case 'DUCKDB_LOAD_DATA': {
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