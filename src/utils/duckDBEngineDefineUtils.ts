// This file centralizes the definitions for DuckDB engine resources.

// NOTE: avoid top-level imports of heavy duckdb-wasm files to reduce initial bundle size.
// They will be dynamically imported when DuckDB is actually initialized.

export const getDuckDBResources = async () => {
  // Dynamic import to split bundle and delay loading heavy assets
  const [
    //duckdb_wasm,
    //duckdb_worker_mvp,
    duckdb_wasm_eh,
    duckdb_worker_eh,
    duckdb_pthread_worker_from_url,
    duckdb_pthread_worker_content,
    duckdb_browser_coi_worker_from_url,
    duckdb_browser_coi_wasm
  ] = await Promise.all([
    //import('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url').then(m => m.default),
    //import('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url').then(m => m.default),
    import('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url').then(m => m.default),
    import('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url').then(m => m.default),
    import('@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?url').then(m => m.default),
    import('@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?raw').then(m => m.default),
    import('@duckdb/duckdb-wasm/dist/duckdb-browser-coi.worker.js?url').then(m => m.default),
    import('@duckdb/duckdb-wasm/dist/duckdb-coi.wasm?url').then(m => m.default),
  ]);

  const our_duckdb_worker_script_url = chrome.runtime.getURL('assets/duckdb.worker.js');

  return {
    //'duckdb-mvp.wasm': duckdb_wasm,
    //'duckdb-browser-mvp.worker.js': duckdb_worker_mvp,
    'duckdb-eh.wasm': duckdb_wasm_eh,
    'duckdb-browser-eh.worker.js': duckdb_worker_eh,
    'duckdb-browser-coi.pthread.worker.js': duckdb_pthread_worker_from_url,
    'duckdb-browser-coi.pthread.worker.js_content': duckdb_pthread_worker_content,
    'our-duckdb-worker-script.js': our_duckdb_worker_script_url,
    'duckdb-coi.wasm': duckdb_browser_coi_wasm,
    'duckdb-browser-coi.worker.js': duckdb_browser_coi_worker_from_url,
  };
};
