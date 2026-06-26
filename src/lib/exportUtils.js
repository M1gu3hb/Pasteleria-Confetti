/**
 * Utilidades de exportación a CSV / XLSX.
 * Sin dependencias extra: XLSX se genera como SpreadsheetML (.xls) abrible en Excel/Sheets.
 * Para CSV usamos UTF-8 con BOM para preservar acentos.
 */

const escapeCSV = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};

const escapeXML = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

/**
 * Exporta un array de objetos a CSV.
 * @param {Array<object>} rows
 * @param {Array<{key:string, label:string, format?:(v:any,row:object)=>any}>} columns
 * @param {string} filename - sin extensión
 */
export function exportToCSV(rows, columns, filename) {
  const headers = columns.map(c => escapeCSV(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const raw = row[c.key];
      const v = c.format ? c.format(raw, row) : raw;
      return escapeCSV(v);
    }).join(',')
  ).join('\n');
  const csv = '\uFEFF' + headers + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename}.csv`);
}

/**
 * Exporta a SpreadsheetML 2003 (.xls) — abrible directo en Excel y Google Sheets.
 */
export function exportToXLSX(rows, columns, filename, sheetName = 'Datos') {
  const headerRow = columns.map(c =>
    `<Cell><Data ss:Type="String">${escapeXML(c.label)}</Data></Cell>`
  ).join('');

  const bodyRows = rows.map(row => {
    const cells = columns.map(c => {
      const raw = row[c.key];
      const v = c.format ? c.format(raw, row) : raw;
      const isNum = typeof v === 'number' && Number.isFinite(v);
      const type = isNum ? 'Number' : 'String';
      const value = v === null || v === undefined ? '' : v;
      return `<Cell><Data ss:Type="${type}">${escapeXML(value)}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="${escapeXML(sheetName)}">
    <Table>
      <Row>${headerRow}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  triggerDownload(blob, `${filename}.xls`);
}

/**
 * Exporta usando el formato preferido.
 */
export function exportData(rows, columns, filename, format = 'csv') {
  if (format === 'xlsx') return exportToXLSX(rows, columns, filename);
  return exportToCSV(rows, columns, filename);
}