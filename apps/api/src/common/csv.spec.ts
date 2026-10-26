import { csvCell, toCsv } from './csv';

const BOM = String.fromCharCode(0xfeff);

describe('csvCell', () => {
  it('deja intactos los textos simples y los números', () => {
    expect(csvCell('Ana López')).toBe('Ana López');
    expect(csvCell(42)).toBe('42');
    expect(csvCell('2026-10-25')).toBe('2026-10-25');
    expect(csvCell('06:30')).toBe('06:30');
  });

  it('convierte null y undefined en celdas vacías', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('entrecomilla y duplica las comillas cuando hace falta', () => {
    expect(csvCell('Los Olivos, Lima')).toBe('"Los Olivos, Lima"');
    expect(csvCell('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(csvCell('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"');
    expect(csvCell('a;b')).toBe('"a;b"');
  });

  it.each([
    '=SUMA(A1:A2)',
    '+51999999999',
    '-1+1',
    '@usuario',
    '\tTabulado',
    '=HYPERLINK("http://x","clic")',
  ])('neutraliza la inyección de fórmulas en %j', (value) => {
    const cell = csvCell(value);
    expect(cell.replace(/^"/, '').startsWith("'")).toBe(true);
  });
});

describe('toCsv', () => {
  it('añade el BOM, usa CRLF y escapa cada celda', () => {
    const csv = toCsv(
      ['Nombre', 'Ruta'],
      [
        ['Ana', 'A, B'],
        ['=1+1', null],
      ],
    );
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1)).toBe('Nombre,Ruta\r\nAna,"A, B"\r\n\'=1+1,\r\n');
  });
});
