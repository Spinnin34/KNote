import { describe, expect, it } from 'vitest';
import { tableDataFromBlock } from '@/components/block-editor/content';
import { editablePdfPage, type PdfRule, type PdfRun } from './pdf-layout';

function run(text: string, left: number, baseline: number, size = 11, bold = false): PdfRun {
  return { text, left, right: left + text.length * size * 0.45, top: baseline - size * 0.8, bottom: baseline + size * 0.2, baseline, size, bold, italic: false, rtl: false };
}

function fragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

describe('editable PDF reconstruction', () => {
  it('preserves neighboring weights, page typography and an editable figure with a side column', () => {
    const runs = [
      run('Título', 264, 45, 26, true), run('Normal ', 50, 81), run('destacado', 85, 81, 14, true),
      run('Texto junto a la imagen', 50, 128), run('Línea siguiente', 50, 143),
    ];
    const asset = '5c6579bb-01c9-4613-99a8-252717055c50';
    const html = fragment(editablePdfPage(runs, [{ asset, left: 400, right: 550, top: 105, bottom: 204 }], [], 600));
    expect(html.querySelector('h1 strong')?.textContent).toBe('Título');
    expect(html.querySelector('p span')?.getAttribute('style')).toContain('font-weight:normal');
    expect(html.querySelector('p strong')?.parentElement?.style.fontSize).toBe('14pt');
    const columns = html.querySelector('.knote-preview-columns')!;
    expect(columns.children[0].textContent).toContain('Texto junto a la imagen');
    expect(columns.children[1].querySelector('img')?.dataset.assetId).toBe(asset);
    expect(Number(columns.children[0].getAttribute('data-before'))).toBeGreaterThan(0);
  });

  it('reconstructs ruled tables with blank cells and preserves the formatting inside them', () => {
    const lines: PdfRule[] = [
      ...[100, 125, 150, 175].map((axis) => ({ horizontal: true, axis, from: 50, to: 350 })),
      ...[50, 150, 350].map((axis) => ({ horizontal: false, axis, from: 100, to: 175 })),
    ];
    const runs = [run('Nombre', 55, 118, 11, true), run('Estado', 155, 118, 11, true),
      run('Caja', 55, 143), run('Carpeta', 55, 167), run('Listo', 155, 167, 13, true),
      run('Fuera de la tabla', 55, 200)];
    const html = fragment(editablePdfPage(runs, [], lines, 400));
    const table = tableDataFromBlock(html.querySelector('.knote-table-block')!);
    expect(table.headers).toEqual(['Nombre', 'Estado']);
    expect(table.rows).toEqual([['Caja', ''], ['Carpeta', 'Listo']]);
    expect(table.columnWidths).toEqual([100, 200]);
    expect(table.rowHtml?.[1][1]).toContain('<strong>Listo</strong>');
    expect(html.querySelector('p')?.textContent).toBe('Fuera de la tabla');
  });
});
