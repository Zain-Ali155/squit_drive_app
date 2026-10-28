import type { DriveCsvPreview } from "../utils/drive.csv";
import { maxDriveCsvColumns, maxDriveCsvRows } from "../utils/drive.csv";

const columnLetter = (index: number): string => {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
};

export const DriveCsvTable = ({ preview }: Readonly<{ preview: DriveCsvPreview }>) =>
  <div
    aria-label="CSV spreadsheet preview"
    className="flex h-full min-h-56 min-w-0 flex-col overflow-hidden bg-white text-slate-800"
    role="region"
    tabIndex={0}
  >
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
      <span className="font-semibold text-slate-700">Spreadsheet preview</span>
      <span className="text-right text-slate-500">{preview.rows.length} rows · {preview.headers.length} columns</span>
    </header>
    <div className="min-h-0 flex-1 overflow-auto">
      {preview.headers.length === 0 ? (
        <p className="p-6 text-sm text-slate-600">This CSV file is empty or has no readable columns.</p>
      ) : (
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <caption className="sr-only">CSV data with column headings and row numbers</caption>
          <thead className="sticky top-0 z-10">
            <tr>
              <th aria-label="Row number" className="sticky left-0 z-20 w-12 min-w-12 border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-center text-xs font-medium text-slate-500" />
              {preview.headers.map((_, index) => (
                <th
                  className="w-44 min-w-36 border-b border-r border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-600"
                  key={index}
                  scope="col"
                >
                  {columnLetter(index)}
                </th>
              ))}
            </tr>
            <tr>
              <th aria-label="Row 1" className="sticky left-0 z-20 w-12 min-w-12 border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-center text-xs font-medium text-slate-500" scope="row">1</th>
              {preview.headers.map((header, index) => (
                <th
                  className="w-44 min-w-36 max-w-72 break-words border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-800"
                  key={`${index}-${header}`}
                  scope="col"
                  title={header}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr className="even:bg-slate-50 hover:bg-blue-50/70" key={rowIndex}>
                <th
                  className="sticky left-0 z-[5] w-12 min-w-12 border-b border-r border-slate-300 bg-inherit px-2 py-2 text-center text-xs font-normal text-slate-500"
                  scope="row"
                >
                  {rowIndex + 2}
                </th>
                {preview.headers.map((_, columnIndex) => (
                  <td
                    className="w-44 min-w-36 max-w-72 whitespace-pre-wrap break-words border-b border-r border-slate-200 px-3 py-2 align-top"
                    key={columnIndex}
                  >
                    {row[columnIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    {preview.truncated && <p className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
      Preview limited to {maxDriveCsvColumns} columns and {maxDriveCsvRows} rows. Download the file to view all data.
    </p>}
  </div>;
