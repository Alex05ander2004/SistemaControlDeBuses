/** Una celda que empieza así sería interpretada como fórmula por Excel y similares. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Marca de orden de bytes UTF-8: hace que Excel respete las tildes. */
const BOM = String.fromCharCode(0xfeff);

export type CsvValue = string | number | null | undefined;

/**
 * Escapa una celda CSV. Neutraliza la inyección de fórmulas (un nombre como `=HYPERLINK(...)`
 * se exporta como texto) y entrecomilla lo que contenga separadores, comillas o saltos de línea.
 */
export function csvCell(value: CsvValue): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV en UTF-8 con BOM (para que Excel respete las tildes) y saltos de línea CRLF. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
