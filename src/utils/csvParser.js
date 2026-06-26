/**
 * CSV PARSER — sin dependencias externas.
 *
 * Soporta:
 *  - Separador por coma o por punto y coma (autodetectado por la primera línea).
 *  - Campos entrecomillados con escape doble ("" dentro de comillas).
 *  - BOM UTF-8 al inicio.
 *  - Saltos de línea \n, \r\n y \r.
 *  - Filas vacías ignoradas.
 *
 * Devuelve:
 *   { headers: string[], rows: Array<Record<string, string>> }
 *
 * No interpreta tipos: todos los valores son string. La capa de validación
 * superior decide cómo castearlos.
 *
 * IMPORTANTE: este parser es defensivo. Si una fila tiene más/menos campos que
 * la cabecera, se rellena con cadenas vacías o se truncan, pero NUNCA tira
 * la app.
 */

function detectSeparator(line) {
  if (typeof line !== 'string') return ',';
  const semis = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  // Si hay más punto-y-comas que comas y al menos uno, asumimos separador ;
  if (semis > commas && semis > 0) return ';';
  return ',';
}

function parseLine(line, sep) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === sep) {
        out.push(cur);
        cur = '';
        i++;
        continue;
      }
      cur += ch;
      i++;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Lee texto CSV y devuelve { headers, rows }.
 * - rows: array de objetos con claves normalizadas (trim + lowercase + sin acentos).
 * - Cada objeto también incluye __raw con la fila original como array,
 *   y __line con el número de línea (1-indexed, sin contar header).
 */
export function parseCSV(text) {
  if (typeof text !== 'string') return { headers: [], rows: [] };
  // Quitar BOM
  let clean = text.replace(/^\uFEFF/, '');
  // Normalizar saltos de línea
  clean = clean.replace(/\r\n?/g, '\n');
  const lines = clean.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const sep = detectSeparator(lines[0]);
  const rawHeaders = parseLine(lines[0], sep);
  const headers = rawHeaders.map((h) => String(h || '').trim());
  const headersNorm = headers.map(normalizeKey);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i], sep);
    const obj = { __raw: cells, __line: i + 1 };
    for (let c = 0; c < headersNorm.length; c++) {
      obj[headersNorm[c]] = (cells[c] !== undefined ? String(cells[c]) : '').trim();
    }
    rows.push(obj);
  }
  return { headers, rows };
}

/**
 * Normaliza una clave de cabecera para acceso tolerante:
 *  - trim, lowercase, sin acentos, espacios → '_'.
 */
export function normalizeKey(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Helpers de casteo seguros.
 */
export function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const s = String(v).replace(/,/g, '.').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

export function toBool(v, fallback = true) {
  if (v === null || v === undefined || v === '') return fallback;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes', 'y', 'verdadero', 'activo'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'falso', 'inactivo'].includes(s)) return false;
  return fallback;
}