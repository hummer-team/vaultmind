import * as duckdb from '@duckdb/duckdb-wasm';

export class DuckDBService {
  private static instance: DuckDBService;
  private db: duckdb.AsyncDuckDB | null = null;
  private logger: duckdb.ConsoleLogger = new duckdb.ConsoleLogger();

  private constructor() {}

  public static getInstance(): DuckDBService {
    if (!DuckDBService.instance) {
      DuckDBService.instance = new DuckDBService();
    }
    return DuckDBService.instance;
  }

  // Modified: Accepts the worker instance (which will be the pre-created CoreWorker)
  public async initialize(bundle: duckdb.DuckDBBundle, workerInstance: Worker): Promise<void> {
    if (this.db) {
      console.log('[DuckDBService] DB already initialized, skipping.');
      return;
    }

    console.log('[DuckDBService] Initializing DuckDB...');
    
    // The workerInstance is now the CoreWorker, which is correct for AsyncDuckDB
    this.db = new duckdb.AsyncDuckDB(this.logger, workerInstance);
    console.log('[DuckDBService] AsyncDuckDB instance created with CoreWorker instance.');

    // Add a check for SharedArrayBuffer before instantiation
    if (typeof SharedArrayBuffer === 'undefined') {
      const errorMessage = 'SharedArrayBuffer is not available. Cross-origin isolation (COOP/COEP headers) is likely not configured correctly for the environment.';
      console.error(`[DuckDBService] ${errorMessage}`);
      throw new Error(errorMessage);
    } else {
      console.log('[DuckDBService] SharedArrayBuffer is available. Proceeding with instantiation.');
    }

    // Pre-flight check is no longer needed
    
    console.log('[DuckDBService] Attempting to instantiate DuckDB with bundle...');
    try {
      console.log('[DuckDBService] Calling this.db.instantiate with mainModule and pthreadWorker URL...');
      
      // Pass the pthreadWorker URL as a string, as required by the API
      const instantiationPromise = this.db.instantiate(bundle.mainModule, (bundle as any).pthreadWorker);
      
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('DuckDB instantiation timed out after 120 seconds.')), 120000)
      );
      
      await Promise.race([instantiationPromise, timeoutPromise]);

      console.log('[DuckDBService] this.db.instantiate completed successfully.');
    } catch (e) {
      console.error('[DuckDBService] Error during DuckDB instantiation:', e);
      console.error('[DuckDBService] Full error details:', e instanceof Error ? e.stack : e);
      throw e;
    }
    
    // Try to load arrow extension, assuming it's built-in or automatically available
    console.log('[DuckDBService] Attempting to connect for LOAD arrow...');
    const c = await this.db.connect();
    try {
      console.log('[DuckDBService] Executing LOAD arrow;');
      await c.query('INSTALL arrow from community;');
      await c.query('LOAD arrow;'); // Keep LOAD
      console.log('[DuckDBService] LOAD arrow; executed successfully.');
    } catch (e) {
      console.error('[DuckDBService] Error executing LOAD arrow;:', e);
      throw e; // Re-throw to propagate the error
    } finally {
      await c.close();
      console.log('[DuckDBService] Connection closed after LOAD arrow.');
    }
    
    console.log('DuckDB initialized and Arrow extension loaded (if available).');
  }

  public async loadData(tableName: string, buffer: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    
    const c = await this.db.connect();
    try {
      const prepared = await c.prepare(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM duckdb_arrow_ipc_scan(?);`);
      await prepared.query(buffer);
      await prepared.close();
    } finally {
      await c.close();
    }
    
    console.log(`Data loaded into table '${tableName}' from Arrow buffer.`);
  }

  public async executeQuery(sql: string): Promise<any> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    const c = await this.db.connect();
    try {
      const result = await c.query(sql);
      return result.toArray().map(row => row.toJSON());
    } finally {
      await c.close();
    }
  }

  public async getTableSchema(tableName: string): Promise<any> {
    return this.executeQuery(`DESCRIBE "${tableName}";`);
  }
}
