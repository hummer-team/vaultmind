// Export table data to CSV file and trigger browser download
export interface CsvSchemaColumn {
    name: string;
    type?: string;
}

export interface ExportTableToCsvOptions {
    data: any[];
    schema: CsvSchemaColumn[];
}

/**
 * Escape a single CSV field according to RFC4180 rules.
 */
const escapeCsvField = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    let str = String(value);
    const needsQuote = /[",\r\n]/.test(str);
    if (needsQuote) {
        str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
};

/**
 * Format current time as YYYYMMDDHHmmsss.csv
 * Example: 202201010101010.csv
 * Milliseconds are padded to 3 digits.
 */
const buildTimestampFileName = (): string => {
    const d = new Date();
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    const millis = pad(d.getMilliseconds(), 3);
    return `${year}${month}${day}${hours}${minutes}${seconds}${millis}.csv`;
};

export const exportTableToCsv = (options: ExportTableToCsvOptions): void => {
    const { data, schema } = options;
    if (!Array.isArray(data) || data.length === 0 || !Array.isArray(schema) || schema.length === 0) {
        // No data to export
        return;
    }

    const headers = schema.map(col => col.name);
    const headerLine = headers.map(escapeCsvField).join(',');

    const lines: string[] = [headerLine];

    for (const row of data) {
        const line = headers
            .map(colName => {
                const value = (row as any)[colName];
                return escapeCsvField(value);
            })
            .join(',');
        lines.push(line);
    }

    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileName = buildTimestampFileName();

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    try {
        link.click();
    } finally {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

/**
 * Interface for parsed Excel sheet data.
 * This is kept here as it's part of the public API of the function.
 */
export interface ExcelSheetData {
    [key: string]: any;
}

/**
 * Parses an Excel file (ArrayBuffer) using a Web Worker to prevent UI blocking.
 *
 * @param buffer The ArrayBuffer of the Excel file.
 * @returns A Promise that resolves to an array of objects, where each object is a row.
 */
export const parseExcelFile = (buffer: ArrayBuffer): Promise<ExcelSheetData[]> => {
    return new Promise((resolve, reject) => {
        // Create a new worker. The path is relative to the current module.
        // Vite requires this `new URL(...)` syntax for worker instantiation.
        const worker = new Worker(new URL('./excelWorker.ts', import.meta.url), {
            type: 'module',
        });

        // Listen for messages from the worker.
        worker.onmessage = (event: MessageEvent<{ status: 'success' | 'error'; data?: ExcelSheetData[]; error?: string }>) => {
            if (event.data.status === 'success') {
                resolve(event.data.data!);
            } else {
                reject(new Error(event.data.error));
            }
            // Clean up the worker once the job is done.
            worker.terminate();
        };

        // Listen for errors from the worker.
        worker.onerror = (error) => {
            reject(new Error(`Worker error: ${error.message}`));
            // Clean up the worker on error.
            worker.terminate();
        };

        // Send the buffer to the worker.
        // The second argument is an array of "Transferable Objects".
        // This transfers ownership of the buffer's memory to the worker,
        // avoiding a costly copy operation.
        worker.postMessage({ buffer }, [buffer]);
    });
};
