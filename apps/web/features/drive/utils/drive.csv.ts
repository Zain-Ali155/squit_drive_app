export const maxDriveCsvBytes = 2_000_000;
export const maxDriveCsvRows = 250;
export const maxDriveCsvColumns = 40;

export type DriveCsvPreview = Readonly<{
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  truncated: boolean;
}>;

export const parseDriveCsv = (
  source: string,
  limits: Readonly<{ maxBytes?: number; maxRows?: number; maxColumns?: number }> = {}
): DriveCsvPreview => {
  const maxBytes = limits.maxBytes ?? maxDriveCsvBytes;
  const maxRows = limits.maxRows ?? maxDriveCsvRows;
  const maxColumns = limits.maxColumns ?? maxDriveCsvColumns;
  if (new TextEncoder().encode(source).byteLength > maxBytes) {
    throw new Error("This CSV file is too large to preview. Download it to open it in a compatible application.");
  }

  const input = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  let pendingRecord = false;
  let truncated = false;

  const finishField = (): void => {
    if (record.length < maxColumns) record.push(field);
    else truncated = true;
    field = "";
    closedQuote = false;
  };

  const finishRecord = (): boolean => {
    finishField();
    if (records.length >= maxRows + 1) {
      truncated = true;
      return false;
    }
    records.push(record);
    record = [];
    pendingRecord = false;
    return true;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? "";
    if (quoted) {
      if (character === "\"") {
        if (input[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("This CSV contains invalid characters after a quoted field.");
    }
    if (character === "\"") {
      if (field.length > 0 || closedQuote) throw new Error("This CSV contains an unexpected quote.");
      quoted = true;
      pendingRecord = true;
    } else if (character === ",") {
      finishField();
      pendingRecord = true;
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      if (!finishRecord()) break;
    } else {
      field += character;
      pendingRecord = true;
    }
  }

  if (quoted) throw new Error("This CSV contains an unterminated quoted field.");
  if (pendingRecord || record.length > 0 || field.length > 0 || closedQuote) finishRecord();

  const [rawHeaders = [], ...dataRows] = records;
  const headers = rawHeaders.map((header, index) => header || `Column ${index + 1}`);
  return Object.freeze({
    headers: Object.freeze(headers),
    rows: Object.freeze(dataRows.map((row) => Object.freeze(row))),
    truncated
  });
};
