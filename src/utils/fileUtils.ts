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