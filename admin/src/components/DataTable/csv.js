const cell = (value) => {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(columns, rows) {
  const head = columns.map((column) => cell(column.header)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => cell(column.csv ? column.csv(row) : column.accessor ? column.accessor(row) : "")).join(","),
  );
  return [head, ...body].join("\r\n");
}

export function downloadCsv(name, text) {
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
