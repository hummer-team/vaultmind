import * as duckdb from '@duckdb/duckdb-wasm';

// 移除所有 Vite ?url 导入和 chrome.runtime.getURL 调用

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

  // 关键修改：initialize 方法现在接收一个包含完整 URL 的 bundle
  public async initialize(bundle: duckdb.DuckDBBundle): Promise<void> {
    if (this.db) return;
    
    const worker = new Worker(bundle.mainWorker!);
    this.db = new duckdb.AsyncDuckDB(this.logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    console.log('DuckDB initialized correctly in sandbox.');
  }

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
