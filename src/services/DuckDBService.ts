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
    
    console.log('[DuckDBService] Attempting to connect for loading extensions...');
    const c = await this.db.connect();
    try {
        // --- CRITICAL CHANGE: Install excel and load arrow ---
        console.log('[DuckDBService] Executing INSTALL excel;');
        await c.query('INSTALL excel;'); // Let it fetch from the web
        await c.query('LOAD excel;');
        console.log('[DuckDBService] Excel extension loaded successfully.');

        console.log('[DuckDBService] Executing LOAD arrow;');
        await c.query('INSTALL arrow from community;');
        await c.query('LOAD arrow;');
        console.log('[DuckDBService] LOAD arrow; executed successfully.');

    } catch (e) {
        console.error('[DuckDBService] Error loading extensions:', e);
        throw e;
    } finally {
        await c.close();
        console.log('[DuckDBService] Connection closed after loading extensions.');
    }
    
    console.log('DuckDB initialized and extensions loaded.');
  }

  public async registerFileBuffer(fileName: string, buffer: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    console.log(`[DuckDBService] Registering file '${fileName}' with buffer size: ${buffer.byteLength}`);
    await this.db.registerFileBuffer(fileName, buffer);
    console.log(`[DuckDBService] File '${fileName}' registered successfully.`);
  }

  public async createTableFromFile(tableName: string, fileName: string, sheetName?: string): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    let query: string;

    // Escape identifiers to be safe
    const safeTableName = `"${tableName.replace(/"/g, '""')}"`;
    const safeFileName = `'${fileName.replace(/'/g, "''")}'`;

    if (fileExtension === 'csv') {
      query = `CREATE OR REPLACE TABLE ${safeTableName} AS SELECT * FROM read_csv_auto(${safeFileName});`;
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      if (sheetName) {
        const safeSheetName = `'${sheetName.replace(/'/g, "''")}'`;
        query = `CREATE OR REPLACE TABLE ${safeTableName} AS SELECT * FROM read_xlsx(${safeFileName}, sheet=${safeSheetName});`;
      } else {
        // Default to reading the first sheet if no name is provided
        query = `CREATE OR REPLACE TABLE ${safeTableName} AS SELECT * FROM read_xlsx(${safeFileName});`;
      }
    } else if (fileExtension === 'parquet') {
        query = `CREATE OR REPLACE TABLE ${safeTableName} AS SELECT * FROM read_parquet(${safeFileName});`;
    }
    else {
      throw new Error(`Unsupported file type for table creation: ${fileExtension}`);
    }

    console.log(`[DuckDBService] Creating table ${safeTableName} with query: ${query}`);
    const c = await this.db.connect();
    try {
      await c.query(query);
      console.log(`[DuckDBService] Table ${safeTableName} created successfully from file '${fileName}'.`);
    } finally {
      await c.close();
    }
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

  public async executeQuery(sql: string): Promise<{ columns: string[], rows: any[][] }> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    const c = await this.db.connect();
    try {
      const result = await c.query(sql);

      // --- CRITICAL CHANGE: Convert Arrow Table to our standard format ---
      const columns = result.schema.fields.map(field => field.name);
      const rows = result.toArray().map(row => Object.values(row.toJSON()));

      console.log('[DuckDBService] Standardized query result:', { columns, rows });
      return { columns, rows };
      // --- END CRITICAL CHANGE ---

    } finally {
      await c.close();
    }
  }

  public async getTableSchema(tableName: string): Promise<any> {
    return this.executeQuery(`DESCRIBE "${tableName}";`);
  }
}
