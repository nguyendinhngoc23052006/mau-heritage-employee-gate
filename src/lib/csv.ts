// CSV export with UTF-8 BOM so Excel-VN opens Vietnamese characters correctly.
// Numbers are formatted with dot decimal separator; the boss can re-format in Excel if needed.

const BOM = "﻿";

export function toCsv(rows: Array<Record<string, string | number | null | undefined>>, headers?: string[]): string {
  if (rows.length === 0) return BOM;
  const cols = headers ?? Object.keys(rows[0]);
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.join(",")].concat(rows.map((r) => cols.map((c) => escape(r[c])).join(",")));
  return BOM + lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
