import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import * as arrow from 'apache-arrow';
import { DuckDBService } from './services/DuckDBService';

type ParsedData = Record<string, string | number | boolean | null>[];

const duckDBService = DuckDBService.getInstance();

window.addEventListener('message', async (event) => {
  if (!event.source) return;

  // 扩展 event.data 类型以包含 DuckDB 操作所需的参数
  const { type, buffer, fileName, id, tableName, sql, bundle } = event.data; // 新增 bundle

  if (type === 'PING') {
    (event.source as Window).postMessage({ type: 'PONG' }, '*');
    return;
  }

  if (type === 'PARSE_BUFFER_TO_ARROW') {
    try {
      const fileExtension = fileName.split('.').pop()?.toLowerCase();
      let jsonData: ParsedData;

      if (fileExtension === 'csv') {
        const csvString = new TextDecoder().decode(buffer);
        jsonData = await parseCsv(csvString);
      } else if (fileExtension === 'xls' || fileExtension === 'xlsx') {
        jsonData = await parseXlsx(buffer);
      } else {
        throw new Error('Unsupported file type');
      }

      if (jsonData.length === 0) {
        throw new Error('File is empty or could not be parsed');
      }

      const arrowTable = arrow.tableFromJSON(jsonData);
      const arrowBuffer = arrow.tableToIPC(arrowTable, 'file');

      (event.source as Window).postMessage({ type: 'PARSE_SUCCESS', id, data: arrowBuffer }, '*', [arrowBuffer.buffer]);

    } catch (error: any) {
      (event.source as Window).postMessage({ type: 'PARSE_ERROR', id, error: error.message }, '*');
    }
  }

  // --- DuckDB 相关的消息处理 ---
  if (type === 'DUCKDB_INIT') {
    try {
      if (!bundle) throw new Error('Missing bundle for DUCKDB_INIT');
      // 关键修改：使用主页面传递过来的 bundle 进行初始化
      await duckDBService.initialize(bundle);
      (event.source as Window).postMessage({ type: 'DUCKDB_INIT_SUCCESS', id }, '*');
    } catch (error: any) {
      console.error("DuckDB initialization failed in sandbox:", error);
      (event.source as Window).postMessage({ type: 'DUCKDB_INIT_ERROR', id, error: error.message }, '*');
    }
  }

  if (type === 'DUCKDB_LOAD_DATA') {
    try {
      if (!tableName || !buffer) throw new Error('Missing tableName or buffer for DUCKDB_LOAD_DATA');
      await duckDBService.loadData(tableName, new Uint8Array(buffer));
      (event.source as Window).postMessage({ type: 'DUCKDB_LOAD_DATA_SUCCESS', id }, '*');
    } catch (error: any) {
      console.error("DuckDB load data failed in sandbox:", error);
      (event.source as Window).postMessage({ type: 'DUCKDB_LOAD_DATA_ERROR', id, error: error.message }, '*');
    }
  }

  if (type === 'DUCKDB_EXECUTE_QUERY') {
    try {
      if (!sql) throw new Error('Missing SQL query for DUCKDB_EXECUTE_QUERY');
      const result = await duckDBService.executeQuery(sql);
      (event.source as Window).postMessage({ type: 'DUCKDB_EXECUTE_QUERY_SUCCESS', id, result }, '*');
    } catch (error: any) {
      console.error("DuckDB execute query failed in sandbox:", error);
      (event.source as Window).postMessage({ type: 'DUCKDB_EXECUTE_QUERY_ERROR', id, error: error.message }, '*');
    }
  }

  if (type === 'DUCKDB_GET_SCHEMA') {
    try {
      if (!tableName) throw new Error('Missing tableName for DUCKDB_GET_SCHEMA');
      const schema = await duckDBService.getTableSchema(tableName);
      (event.source as Window).postMessage({ type: 'DUCKDB_GET_SCHEMA_SUCCESS', id, schema }, '*');
    } catch (error: any) {
      console.error("DuckDB get schema failed in sandbox:", error);
      (event.source as Window).postMessage({ type: 'DUCKDB_GET_SCHEMA_ERROR', id, error: error.message }, '*');
    }
  }
});

function parseCsv(csvString: string): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.errors.length) {
          reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
        } else {
          resolve(results.data as ParsedData);
        }
      },
      error: (error: Error) => reject(error),
    });
  });
}

async function parseXlsx(arrayBuffer: ArrayBuffer): Promise<ParsedData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Excel file contains no sheets.');
  const jsonData: ParsedData = [];
  let headers: (string | null)[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      headers = Array.from(row.values as (string | null)[]);
      return;
    }
    const rowObject: Record<string, any> = {};
    const rowValues = row.values as any[];
    headers.forEach((header, index) => {
      if (header) {
        rowObject[header] = rowValues[index + 1] ?? null;
      }
    });
    jsonData.push(rowObject);
  });
  return jsonData;
}
