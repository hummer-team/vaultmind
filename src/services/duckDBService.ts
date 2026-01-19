import * as duckdb from '@duckdb/duckdb-wasm';

export class DuckDBService {
  private static instance: DuckDBService;
  private db: duckdb.AsyncDuckDB | null = null;
  private logger: duckdb.ConsoleLogger = new duckdb.ConsoleLogger();

  private constructor() { }

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
    // const config: duckdb.DuckDBConfig = {
    //   maximumThreads: 4,
    //   useDirectIO: true,
    //   allowUnsignedExtensions: true,
    //   arrowLosslessConversion: true,
    //   query: {
    //     castBigIntToDouble: true,
    //     castDecimalToDouble: true,
    //     queryPollingInterval: 10
    //   }
    // };
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
      throw e;
    }

    console.log('[DuckDBService] Attempting to connect for loading extensions...');
    const c = await this.db.connect();
    try {
      // --- CRITICAL CHANGE: Install excel and load arrow ---
      console.log('[DuckDBService] Executing INSTALL excel;');
      await c.query('INSTALL excel;');
      await c.query('LOAD excel;');
      console.log('[DuckDBService] Excel extension loaded successfully.');

      console.log('[DuckDBService] Executing LOAD arrow;');
      await c.query('INSTALL arrow from community;');
      await c.query('LOAD arrow;');
      console.log('[DuckDBService] LOAD arrow; executed successfully.');

      // Add explicit log to verify the exact config being applied
      //console.log("[DuckDBService] Setting system configs: memory_limit='1GB', checkpoint_threshold=0");
      // await Promise.all([
      //   c.query("SET memory_limit = '1024MiB';"),
      //   c.query("SET checkpoint_threshold = 0;"),
      // ]);

      const res = await c.query(
        "SELECT name, value FROM duckdb_settings() WHERE name like  '%threads%' or name like '%memory%';"
      );
      const setttings = this._extractData(res);
      console.log('[DuckDBService] sys settings: ', setttings);
    } catch (e) {
      console.error('[DuckDBService] Error loading extensions:', e);
      throw new Error('duckdb init fail.');
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
      let dtime = Date.now();
      await c.query(query);
      console.log(`[DuckDBService] Table ${safeTableName} created successfully from file '${fileName}',cost ${Date.now() - dtime} ms.`);
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

  public async executeQuery(sql: string): Promise<{ data: any[]; schema: any[] }> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    const conn: any = await this.db.connect();
    try {
      const rawResult = await this._queryRaw(conn, sql);
      const data = this._extractData(rawResult);
      const schema = this._extractSchema(rawResult, data);

      this._normalizeTimeFields(data, schema);

      console.log('[DuckDBService] Standardized query result:', { data, schema });
      return { data, schema };
    } finally {
      await conn.close();
    }
  }

  // Execute the raw query via connection and return the raw result object
  private async _queryRaw(conn: any, sql: string): Promise<any> {
    try {
      return await conn.query(sql);
    } catch (err) {
      // rethrow but keep stack
      console.error('[DuckDBService] Query failed:', err, 'SQL:', sql);
      throw err;
    }
  }

  // Extracts rows into a plain JS array from various possible result shapes
  private _extractData(result: any): any[] {
    if (!result) return [];

    if (typeof result.numRows === 'number' && typeof result.get === 'function') {
      const rowsCount = result.numRows;
      const out = Array.from({ length: rowsCount }, (_, i) => {
        try {
          const row = result.get(i);
          return typeof row?.toJSON === 'function' ? row.toJSON() : row;
        } catch (err) {
          return result[i] ?? null;
        }
      });
      return out;
    }

    if (Array.isArray(result)) return result;

    if (typeof result.toArray === 'function') {
      return result.toArray().map((r: any) => (typeof r?.toJSON === 'function' ? r.toJSON() : r));
    }

    if (typeof result === 'object') return [result];

    return [];
  }

  // Extracts schema either from result.schema.fields or by inferring from first row
  private _extractSchema(result: any, data: any[]): any[] {
    if (result && result.schema && Array.isArray(result.schema.fields)) {
      return (result.schema.fields as any[]).map((field: any) => ({
        name: field?.name ?? String(field),
        type: field && field.type ? String(field.type) : 'unknown',
      }));
    }

    if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
      return Object.keys(data[0]).map((k) => ({ name: k, type: typeof data[0][k] }));
    }

    return [];
  }

  // Normalize time-like fields in-place: convert to ISO strings when possible
  private _normalizeTimeFields(data: any[], schema: any[]): void {
    if (!schema || schema.length === 0 || !data || data.length === 0) return;

    const timeFields = schema
      .filter((f) => typeof f.type === 'string' && /(timestamp|date|time)/i.test(f.type))
      .map((f) => ({ name: f.name, type: String(f.type) }));

    if (timeFields.length === 0) return;

    for (const row of data) {
      for (const fld of timeFields) {
        const key = fld.name;
        const rawVal = row?.[key];
        if (rawVal == null) continue;

        if (rawVal instanceof Date) {
          row[key] = rawVal.toISOString();
          continue;
        }

        if (typeof rawVal === 'string') {
          const parsed = Date.parse(rawVal);
          if (!isNaN(parsed)) {
            row[key] = new Date(parsed).toISOString();
          }
          continue;
        }

        if (typeof rawVal === 'number') {
          const best = this._chooseBestDateFromNumber(rawVal, fld.type);
          if (best) row[key] = best.toISOString();
        }
      }
    }
  }

  // Choose best Date candidate from a numeric timestamp by trying multiple units
  private _chooseBestDateFromNumber(raw: number, typeHint?: string): Date | null {
    const now = Date.now();
    const isReasonableYear = (d: Date) => {
      const y = d.getUTCFullYear();
      return y >= 1970 && y <= 3000;
    };

    const candidates: { label: string; ms: number }[] = [];
    candidates.push({ label: 'ms', ms: raw });
    candidates.push({ label: 'micro', ms: Math.floor(raw / 1000) });
    candidates.push({ label: 's', ms: raw * 1000 });

    // Excel serial days (e.g., 44500) -> convert to ms: (days - 25569) * 86400000
    if (raw > 2000 && raw < 60000) {
      const excelMs = Math.round((raw - 25569) * 86400000);
      candidates.push({ label: 'excel_days', ms: excelMs });
    }

    // bias by hint
    if (typeHint) {
      const hint = typeHint.toLowerCase();
      if (hint.includes('micro')) candidates.sort((a, b) => (a.label === 'micro' ? -1 : (b.label === 'micro' ? 1 : 0)));
      else if (hint.includes('second')) candidates.sort((a, b) => (a.label === 's' ? -1 : (b.label === 's' ? 1 : 0)));
    }

    // Prefer year 2000-2035 first
    const preferred = candidates
      .map((c) => ({ ...c, date: new Date(c.ms) }))
      .filter((c) => !isNaN(c.date.getTime()) && c.date.getUTCFullYear() >= 2000 && c.date.getUTCFullYear() <= 2035);

    const selectBest = (list: { label: string; ms: number; date: Date }[]) => {
      if (list.length === 0) return null as Date | null;
      let best: Date | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const c of list) {
        const score = Math.abs(c.date.getTime() - now);
        if (score < bestScore) {
          bestScore = score;
          best = c.date;
        }
      }
      return best;
    };

    const pick = selectBest(preferred);
    if (pick) return pick;

    // fallback: reasonable year 1970-3000 and closest to now
    let best: Date | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const d = new Date(c.ms);
      if (isNaN(d.getTime())) continue;
      if (!isReasonableYear(d)) continue;
      const score = Math.abs(d.getTime() - now);
      if (score < bestScore) {
        bestScore = score;
        best = d;
      }
    }

    // If none reasonable, try raw as ms
    if (!best) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
      return null;
    }

    return best;
  }

  public async getTableSchema(tableName: string): Promise<{ data: any[]; schema: any[] }> {
    return this.executeQuery(`DESCRIBE "${tableName}";`);
  }

  // Graceful shutdown: attempt to terminate/cleanup any internal DB resources.
  // This method is defensive because the underlying AsyncDuckDB API may not provide a specific shutdown method.
  public async shutdown(): Promise<void> {
    try {
      if (this.db) {
        try {
          // If AsyncDuckDB exposes a terminate/close API, call it. Use any to avoid type errors.
          const asAny = this.db as any;
          if (typeof asAny.terminate === 'function') {
            await asAny.terminate();
          } else if (typeof asAny.close === 'function') {
            await asAny.close();
          }
        } catch (e) {
          // ignore errors from underlying runtime-specific shutdown
          console.warn('[DuckDBService] Error while calling underlying shutdown on AsyncDuckDB:', e);
        }
        // Remove reference so GC can collect
        this.db = null;
      }
    } catch (e) {
      console.error('[DuckDBService] Error during shutdown:', e);
    }
  }
}

