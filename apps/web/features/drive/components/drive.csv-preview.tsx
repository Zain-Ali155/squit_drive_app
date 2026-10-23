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
    className="h-full min-h-56 min-w-0 overflow-auto bg-white"
    role="region"
    tabIndex={0}
  >
    <table className="w-max min-w-full border-collapse text-left text-sm text-slate-800">
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
              className="w-44 min-w-36 max-w-72 break-words border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold"
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
          <tr key={rowIndex}>
            <th
              className="sticky left-0 z-[5] w-12 min-w-12 border-b border-r border-slate-300 bg-slate-50 px-2 py-2 text-center text-xs font-normal text-slate-500"
              scope="row"
            >
              {rowIndex + 2}
            </th>
            {preview.headers.map((_, columnIndex) => (
              <td
                className="w-44 min-w-36 max-w-72 break-words border-b border-r border-slate-200 px-3 py-2 align-top"
                key={columnIndex}
              >
                {row[columnIndex] ?? ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    {preview.headers.length === 0 && <p className="p-6 text-sm text-slate-600">This CSV file is empty.</p>}
    {preview.truncated && <p className="border-t border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      Preview limited to {maxDriveCsvColumns} columns and {maxDriveCsvRows} rows. Download the file to view all data.
    </p>}
  </div>;
