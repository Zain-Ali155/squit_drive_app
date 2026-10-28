"use client";

import { useState } from "react";
import type { DriveXlsxPreview } from "../utils/drive.xlsx";
import { maxDriveXlsxColumns, maxDriveXlsxRows, maxDriveXlsxSheets } from "../utils/drive.xlsx";

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

export const DriveXlsxTable = ({ preview }: Readonly<{ preview: DriveXlsxPreview }>) => {
  const [sheetIndex, setSheetIndex] = useState(0);
  const sheet = preview.sheets[sheetIndex];
  const columnCount = sheet?.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0) ?? 0;

  return (
    <section aria-label="Excel spreadsheet preview" className="flex h-full min-h-56 min-w-0 flex-col overflow-hidden bg-white text-slate-800">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700" htmlFor="drive-xlsx-sheet">
          Sheet
          <select
            className="max-w-56 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="drive-xlsx-sheet"
            value={sheetIndex}
            onChange={(event) => setSheetIndex(Number(event.currentTarget.value))}
          >
            {preview.sheets.map((item, index) => <option key={`${index}-${item.name}`} value={index}>{item.name}</option>)}
          </select>
        </label>
        <span className="text-right text-xs text-slate-500">
          {sheet?.rows.length ?? 0} rows · {columnCount} columns
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} aria-label={sheet ? `Cells in ${sheet.name}` : "Excel cells"}>
        {!sheet || sheet.rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">This worksheet is empty.</p>
        ) : (
          <table className="w-max min-w-full border-collapse text-left text-sm">
            <caption className="sr-only">Excel worksheet cells with column letters and row numbers</caption>
            <thead className="sticky top-0 z-10">
              <tr>
                <th aria-label="Row number" className="sticky left-0 z-20 w-12 min-w-12 border-b border-r border-slate-300 bg-slate-100 px-2 py-2" />
                {Array.from({ length: columnCount }, (_, index) => (
                  <th className="w-44 min-w-36 border-b border-r border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-600" key={index} scope="col">
                    {columnLetter(index)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, rowIndex) => (
                <tr className="even:bg-slate-50 hover:bg-blue-50/70" key={rowIndex}>
                  <th className="sticky left-0 z-[5] w-12 min-w-12 border-b border-r border-slate-300 bg-inherit px-2 py-2 text-center text-xs font-normal text-slate-500" scope="row">{rowIndex + 1}</th>
                  {Array.from({ length: columnCount }, (_, columnIndex) => (
                    <td className="w-44 min-w-36 max-w-72 whitespace-pre-wrap break-words border-b border-r border-slate-200 px-3 py-2 align-top" key={columnIndex}>
                      {row[columnIndex] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(preview.truncated || sheet?.truncated) && <p className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        Preview is limited to {maxDriveXlsxRows} rows, {maxDriveXlsxColumns} columns, and {maxDriveXlsxSheets} sheets. Download the file to view all data.
      </p>}
    </section>
  );
};
