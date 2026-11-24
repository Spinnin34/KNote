import { describe, expect, it } from 'vitest';
import { replaceTaskDescription, taskDescription } from './task-description';
import { refreshDocumentOutline } from './outline';
import { initialHtml, normalizeTableData, RICH_PREFIX, sanitizeNodes, tableDataFromBlock } from './content';

function parse(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

describe('document content', () => {
  it('round-trips blank lines, checked nested tasks, disclosure state and list numbering', () => {
    const original = '<p>Primera<br><br>Segunda</p><p><br></p>'
      + '<details open><summary>Notas</summary><div><ol start="4"><li>Cuatro</li></ol></div></details>'
      + '<ul><li data-task="false"><input type="checkbox">Padre<ul><li data-task="true"><input type="checkbox" checked>Hijo</li></ul></li></ul>';
    const html = initialHtml(RICH_PREFIX + original);
    const restored = parse(html);
    expect(restored.querySelectorAll('p br')).toHaveLength(3);
    expect(restored.querySelector('details')?.open).toBe(true);
    expect(restored.querySelector('ol')?.start).toBe(4);
    expect(Array.from(restored.querySelectorAll('input'), (input) => input.checked)).toEqual([false, true]);
    expect(initialHtml(RICH_PREFIX + html)).toBe(html);
  });

  it('rebuilds an outline from edited headings and preserves glossary and page breaks on reload', () => {
    const html = '<div class="knote-toc"></div><h2>Primero</h2><hr class="knote-page-break"><dl><dt>Clave</dt><dd>Valor</dd></dl>';
    const root = parse(initialHtml(RICH_PREFIX + html));
    refreshDocumentOutline(root, 'qa');
    const link = root.querySelector('a')!;
    expect(link.textContent).toBe('Primero');
    expect(link.hash).toBe('#' + root.querySelector('h2')!.id);
    root.querySelector('h2')!.textContent = 'Revisado';
    refreshDocumentOutline(root, 'qa');
    expect(root.querySelector('a')!.textContent).toBe('Revisado');
    const restored = parse(initialHtml(RICH_PREFIX + sanitizeNodes(root.childNodes)));
    expect(restored.querySelector('.knote-toc')!.textContent).toBe('');
    expect(restored.querySelector('hr.knote-page-break')).toBeTruthy();
    expect(restored.querySelector('dd')!.textContent).toBe('Valor');
  });

  it('edits a task summary without replacing formatted content or a newer edit', () => {
    const existing = RICH_PREFIX + '<h2>Plan</h2><p><strong>Detalle</strong></p>';
    const updated = replaceTaskDescription(existing, '', 'Resumen\nSegunda línea');
    expect(updated).toContain('<h2>Plan</h2><p><strong>Detalle</strong></p>');
    expect(taskDescription(updated!)).toBe('Resumen\nSegunda línea');
    expect(replaceTaskDescription(updated!, '', 'Obsoleto')).toBeNull();
    expect(replaceTaskDescription(updated!, 'Resumen\nSegunda línea', '')).toBe(existing);
  });

  it('does not carry pasted script text or generate links and images with empty destinations', () => {
    expect(sanitizeNodes(parse('<script>script text</script><style>style text</style><p><a>Nota</a><img alt="Imagen"></p>').childNodes))
      .toBe('<p>Nota</p>');
  });

  it('keeps table data as the source of truth independently of rendered cells', () => {
    const model = { caption: 'Inventario', headers: ['Estado'], rows: [['  Pendiente  ']] };
    const block = document.createElement('div');
    block.className = 'knote-table-block';
    block.dataset.knoteTable = JSON.stringify(model);
    block.innerHTML = '<table><thead><tr><th>stale</th></tr></thead></table>';
    const restored = parse(sanitizeNodes([block])).firstElementChild as HTMLElement;
    expect(tableDataFromBlock(restored)).toEqual(model);
    expect(normalizeTableData({ headers: ['A', 'B', 'C', 'D'] }).rows).toEqual([
      ['', '', '', ''],
      ['', '', '', ''],
    ]);
  });

  it('preserves whitespace and language inside stored code', () => {
    const code = '\n    if x < y:\n        print(x)\n\n';
    const html = initialHtml(RICH_PREFIX + '<pre data-language="python"><code>' + code.replace('<', '&lt;') + '</code></pre>');
    const restored = parse(html);
    expect(restored.querySelector('code')?.textContent).toBe(code);
    expect(restored.querySelector('pre')?.dataset.language).toBe('python');
  });

  it('imports the cells of an HTML table as an editable block', () => {
    const html = '<table><caption>Inventario</caption><tr><th>Artículo</th><th>Unidades</th></tr><tr><td>Caja</td><td>3</td></tr></table>';
    const restored = parse(sanitizeNodes(parse(html).childNodes)).firstElementChild as HTMLElement;
    expect(restored.className).toBe('knote-table-block');
    expect(tableDataFromBlock(restored)).toEqual({
      caption: 'Inventario', headers: ['Artículo', 'Unidades'], rows: [['Caja', '3']],
    });
  });
});
