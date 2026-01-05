import * as duckdb from '@duckdb/duckdb-wasm';

import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_worker_mvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_worker_eh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm, mainWorker: duckdb_worker_mvp },
  eh: { mainModule: duckdb_wasm_eh, mainWorker: duckdb_worker_eh },
};

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

  public async initialize(): Promise<void> {
    if (this.db) return;
    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    this.db = new duckdb.AsyncDuckDB(this.logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    console.log('DuckDB initialized correctly.');
  }

  /**
   * Registers a file buffer (in Apache Arrow format) as a virtual table in DuckDB.
   * This is now the single method for loading data.
   */
  public async loadData(tableName: string, buffer: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    await this.db.registerFileBuffer(`${tableName}.arrow`, buffer);
    const c = await this.db.connect();
    await c.query(`CREATE OR REPLACE TABLE '${tableName}' AS SELECT * FROM '${tableName}.arrow';`);
    await c.close();
    console.log(`Data loaded into table '${tableName}'.`);
  }

  public async executeQuery(sql: string): Promise<any> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    const c = await this.db.connect();
    const result = await c.query(sql);
    await c.close();
    return result.toArray().map(row => row.toJSON());
  }

  public async getTableSchema(tableName: string): Promise<any> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    return this.executeQuery(`DESCRIBE '${tableName}';`);
  }
}
