import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import * as arrow from 'apache-arrow';

type ParsedData = Record<string, string | number | boolean | null>[];

/**
 * This script runs in the sandboxed environment and handles all "unsafe" operations.
 * It imports all necessary parsing and conversion libraries here.
 */
window.addEventListener('message', async (event) => {
  // IMPORTANT: In a sandbox, the origin is null, so we check event.source.
  // We can't check against window.parent because of cross-origin restrictions.
  // A robust solution would involve a secret handshake token, but for now, this is a basic check.
  if (!event.source) return;

  const { type, buffer, fileName, id } = event.data;

  // --- Handshake Handler ---
  if (type === 'PING') {
    // The parent window is the source of the PING message.
    (event.source as Window).postMessage({ type: 'PONG' }, '*');
    return;
  }

  // --- Data Processing Handler ---
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
});

// --- Parsing Functions (remain unchanged) ---
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
