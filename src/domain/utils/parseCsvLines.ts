/**
 * Minimal CSV parser scoped to Google Sheets `export?format=csv` output.
 *
 * - Quoted fields support `""` as an escaped quote.
 * - Newlines inside quoted fields are preserved.
 * - Returns the first non-empty row as headers and the rest as data rows.
 * - No external dependency.
 */

export interface ParsedCsv {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function parseCsvLines(csv: string): ParsedCsv {
  const records = parseCsvRecords(csv);
  if (records.length === 0) return { headers: [], rows: [] };

  let headerIdx = 0;
  while (headerIdx < records.length && isEmptyRow(records[headerIdx]!)) {
    headerIdx += 1;
  }
  if (headerIdx >= records.length) return { headers: [], rows: [] };

  const headers = records[headerIdx]!.map((cell) => cell.trim());
  const rows = records.slice(headerIdx + 1).filter((row) => !isEmptyRow(row));
  return { headers, rows };
}

function isEmptyRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim().length === 0);
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}
