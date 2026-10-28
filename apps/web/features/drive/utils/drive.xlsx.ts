import { validateDocxArchive } from "./drive.docx";
import { maxDriveXlsxPreviewBytes } from "./drive-preview.logic";

export const maxDriveXlsxRows = 250;
export const maxDriveXlsxColumns = 40;
export const maxDriveXlsxSheets = 20;

export type DriveXlsxWorksheet = Readonly<{
  name: string;
  rows: readonly (readonly string[])[];
  truncated: boolean;
}>;

export type DriveXlsxPreview = Readonly<{
  sheets: readonly DriveXlsxWorksheet[];
  truncated: boolean;
}>;

const cellText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toLocaleDateString();
  return "";
};

export const parseDriveXlsxBlob = async (blob: Blob): Promise<DriveXlsxPreview> => {
  try {
    if (blob.size === 0 || blob.size > maxDriveXlsxPreviewBytes) throw new Error("invalid file size");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    const isLegacyExcel = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte);
    if (isZip) validateDocxArchive(bytes);
    else if (!isLegacyExcel) throw new Error("unsupported spreadsheet package");

    const XLSX = await import("xlsx");
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
      sheetRows: maxDriveXlsxRows + 1
    });
    if (workbook.SheetNames.length === 0) throw new Error("empty workbook");

    const visibleSheetNames = workbook.SheetNames.slice(0, maxDriveXlsxSheets);
    const sheets = visibleSheetNames.map((name): DriveXlsxWorksheet => {
      const worksheet = workbook.Sheets[name];
      if (!worksheet) return Object.freeze({ name, rows: Object.freeze([]), truncated: false });
      const fullReference = worksheet["!fullref"];
      const reference = typeof fullReference === "string" ? fullReference : worksheet["!ref"];
      const dimensions = typeof reference === "string" ? XLSX.utils.decode_range(reference) : undefined;
      const sourceRows = dimensions ? dimensions.e.r - dimensions.s.r + 1 : 0;
      const sourceColumns = dimensions ? dimensions.e.c - dimensions.s.c + 1 : 0;
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false
      });
      const rows = rawRows.slice(0, maxDriveXlsxRows).map((row) =>
        Object.freeze(row.slice(0, maxDriveXlsxColumns).map(cellText))
      );
      return Object.freeze({
        name,
        rows: Object.freeze(rows),
        truncated: sourceRows > maxDriveXlsxRows || sourceColumns > maxDriveXlsxColumns
      });
    });

    return Object.freeze({
      sheets: Object.freeze(sheets),
      truncated: workbook.SheetNames.length > maxDriveXlsxSheets || sheets.some((sheet) => sheet.truncated)
    });
  } catch {
    throw new Error("This Excel file can’t be previewed. It may be malformed, encrypted, or too large. Download it to open in Excel.");
  }
};
