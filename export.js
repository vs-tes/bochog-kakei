function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return `\uFEFF${lines.join("\n")}`;
}

export function toExcelXml(sheetName, headers, rows) {
  const cell = (value) => {
    const text = String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return `<Cell><Data ss:Type="String">${text}</Data></Cell>`;
  };
  const headerRow = `<Row>${headers.map(cell).join("")}</Row>`;
  const body = rows.map((row) => `<Row>${row.map(cell).join("")}</Row>`).join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${sheetName}">
<Table>${headerRow}${body}</Table>
</Worksheet>
</Workbook>`;
}

export function downloadFile(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function printReport(title, bodyHtml) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #152033; padding: 24px; }
      h1 { font-size: 20px; }
      p { color: #5b6b80; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; padding: 8px; border-bottom: 1px solid #d5e0ea; font-size: 13px; }
      th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #5b6b80; }
    </style>
  </head><body>${bodyHtml}</body></html>`);
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 1000);
}
