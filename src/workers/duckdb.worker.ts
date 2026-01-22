console.log('[DB Worker] Script execution started.'); // <-- Added this log

import { DuckDBService } from '../services/duckDBService.ts';
// xlsx-wasm-parser@0.1.2 does not export init(); parsing functions handle wasm internally.
import * as duckdb from '@duckdb/duckdb-wasm';

const duckDBService = DuckDBService.getInstance();
let createdCoreWorker: Worker | null = null; // track core worker created during init so we can terminate on shutdown


// resolveURL is no longer needed here as bundle URLs should now be absolute.

self.onmessage = async (event: MessageEvent) => {
  const { type, id, resources, sql, tableName, buffer, file, fileName, sheetName } = event.data; // Added file and adjusted

  try {
    let result: any;
    let transfer: Transferable[] = [];

    switch (type) {
      case 'DUCKDB_INIT': {
        console.log('[DB Worker] Received DUCKDB_INIT with resources (absolute URLs):', resources);
        if (!resources) throw new Error('Missing resources for DUCKDB_INIT');
        const DUCKDB_BUNDLES: any = {
          eh: {
            mainModule: resources['duckdb-eh.wasm'],
            mainWorker: resources['duckdb-browser-eh.worker.js'],
          },
          // coi: {
          //   mainModule: resources['duckdb-coi.wasm'],
          //   mainWorker: resources['duckdb-browser-coi.worker.js']
          // }
        };
        const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
        (bundle as any).pthreadWorker = resources['duckdb-browser-coi.pthread.worker.js'];

        let coreWorker: Worker | null = null;
        try {
          console.log('[DB Worker] Manually creating Core DuckDB worker from URL:', bundle.mainWorker);
          coreWorker = new Worker(bundle.mainWorker as string, { type: 'module' });
          createdCoreWorker = coreWorker; // track it so shutdown can terminate
          console.log('[DB Worker] Manually created Core DuckDB worker instance:', coreWorker);
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
          await duckDBService.shutdown();
          if (createdCoreWorker) {
            try {
              createdCoreWorker.terminate();
            } catch (e) {
              console.warn('[DB Worker] Error terminating core worker:', e);
            }
            createdCoreWorker = null;
          }
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

      case 'LOAD_FILE': {
        if (!tableName) {
          throw new Error('Missing tableName for LOAD_FILE');
        }

        // Preferred path: receive raw bytes directly
        if (buffer && fileName) {
          const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
          console.log(`[DB Worker] Received LOAD_FILE for '${fileName}' into table '${tableName}', bytes=${u8.byteLength}`);
          await duckDBService.createTableFromFile(tableName, fileName, u8, sheetName);
          result = true;
          break;
        }

        // Backward compatible path: receive File object
        if (!file) {
          throw new Error('Missing file buffer or file object for LOAD_FILE');
        }
        const fileBuffer = await (file as File).arrayBuffer();
        const fileUint8Array = new Uint8Array(fileBuffer);

        console.log(`[DB Worker] Received LOAD_FILE for '${(file as File).name}' into table '${tableName}', bytes=${fileUint8Array.byteLength}`);
        await duckDBService.createTableFromFile(tableName, (file as File).name, fileUint8Array, sheetName);
        result = true;
        break;
      }

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
