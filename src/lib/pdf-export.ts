import type { Content, ContentText, Style, TDocumentDefinitions } from 'pdfmake/interfaces';
import { columnOffset, initialHtml, safeFontSize, tableCellHtml, tableColumnWidths, tableDataFromBlock, textAlignment } from '@/components/block-editor/content';
import { entryTags } from '@/domain/workspace/normalizers';
import { walkTasks } from '@/domain/workspace/task-tree';
import type { PageEntry, WorkspacePage } from '@/domain/workspace/types';
import { getBlockImage } from './block-images';

const ink = '#24282e';
const muted = '#586370';

function inline(node: Node, inherited: Style & { link?: string } = {}): ContentText[] {
  if (!(node instanceof HTMLElement)) return node.textContent ? [{ ...inherited, text: node.textContent }] : [];
  if (node.tagName === 'BR') return [{ ...inherited, text: '\n' }];
  if (node.tagName === 'INPUT') return [{ ...inherited, text: (node as HTMLInputElement).checked ? '[x] ' : '[ ] ' }];
  if (node.classList.contains('knote-callout-icon')) return [];
  const style = { ...inherited };
  switch (node.tagName) {
    case 'STRONG': case 'B': style.bold = true; break;
    case 'EM': case 'I': style.italics = true; break;
    case 'U': style.decoration = 'underline'; break;
    case 'DEL': case 'S': style.decoration = 'lineThrough'; break;
    case 'MARK': style.background = node.dataset.knoteColor || '#fff0a6'; break;
    case 'CODE': style.background = '#eff1f3'; break;
    case 'A':
      if (/^(?:https?:|mailto:)/i.test(node.getAttribute('href') || '')) style.link = (node as HTMLAnchorElement).href;
      style.color = '#245379'; style.decoration = 'underline';
  }
  Object.assign(style, textStyle(node));
  return Array.from(node.childNodes).flatMap((child) => inline(child, style));
}

function textStyle(node: HTMLElement): Style {
  const fontSize = safeFontSize(node.style.fontSize);
  const weight = node.style.fontWeight;
  const fontStyle = node.style.fontStyle;
  return {
    ...(fontSize ? { fontSize } : {}),
    ...(weight ? { bold: weight === 'bold' } : {}),
    ...(fontStyle ? { italics: fontStyle !== 'normal' } : {}),
  };
}

function cellPdfContent(value: string, html?: string): Content {
  if (!html) return value;
  const template = document.createElement('template');
  template.innerHTML = tableCellHtml(value, html);
  return Array.from(template.content.childNodes).flatMap((child) => inline(child));
}

async function pdfImage(image: HTMLImageElement, width: number): Promise<Content> {
  let objectUrl: string | undefined;
  try {
    let src = image.getAttribute('src') || '';
    if (image.dataset.assetId || src.startsWith('knote-asset:')) {
      const blob = await getBlockImage(image.dataset.assetId || src.slice('knote-asset:'.length));
      if (!blob) throw new Error();
      objectUrl = URL.createObjectURL(blob);
      src = objectUrl;
    }
    const bitmap = new Image();
    bitmap.crossOrigin = 'anonymous';
    bitmap.referrerPolicy = 'no-referrer';
    bitmap.src = src;
    await bitmap.decode();
    const scale = Math.min(1, 1800 / Math.max(bitmap.naturalWidth, bitmap.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(bitmap.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error();
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { image: canvas.toDataURL('image/jpeg', 0.9), fit: [width, 650], margin: [0, 5, 0, 5] };
  } catch { throw new Error('No se pudo incluir una imagen en el PDF. Comprueba que se puede abrir desde el documento.'); }
  finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
}

export async function richPdfContent(value: string): Promise<Content[]> {
  const template = document.createElement('template');
  template.innerHTML = initialHtml(value);
  const outlines = Array.from(template.content.querySelectorAll('.knote-toc'));
  const outlineIds = outlines.map(() => crypto.randomUUID());
  async function children(node: ParentNode, width: number): Promise<Content[]> {
    const result: Content[] = [];
    let run: Content[] = [];
    function flush() {
      if (run.length) result.push({ text: run });
      run = [];
    }
    for (const child of node.childNodes) {
      if (child instanceof HTMLElement && child.matches('p,div,h1,h2,h3,h4,ul,ol,dl,dt,dd,blockquote,pre,hr,details,summary,figure,img,figcaption')) {
        flush(); result.push(await block(child, width));
      } else run.push(...inline(child));
    }
    flush();
    return result;
  }
  async function block(el: HTMLElement, width: number): Promise<Content> {
    if (el.classList.contains('knote-table-block')) {
      const { caption, headers, rows, headerless, columnWidths, headerHtml, rowHtml, widthPercent = 100, offsetPercent = 0 } = tableDataFromBlock(el);
      const tableWidth = width * widthPercent / 100;
      const offset = width * offsetPercent / 100;
      const total = columnWidths?.reduce((sum, item) => sum + item, 0) ?? 1;
      const usable = Math.max(headers.length, tableWidth - 9 * headers.length - 1);
      const widths = columnWidths
        ? columnWidths.map((item) => 1 + (usable - headers.length) * item / total)
        : headers.map(() => '*');
      return { stack: [
        ...(caption ? [{ text: caption, style: 'caption' }] : []),
        { table: { headerRows: headerless ? 0 : 1, widths, body: [
          ...(headerless ? [] : [headers.map((text, column) => ({ text: cellPdfContent(text, headerHtml?.[column]), bold: true, fillColor: '#eef1f3' }))]),
          ...rows.map((row, index) => row.map((text, column) => ({ text: cellPdfContent(text, rowHtml?.[index]?.[column]) }))),
        ] }, fontSize: 9, wordBreak: 'break-all' },
      ], margin: [offset, 5, Math.max(0, width - offset - tableWidth), 10] };
    }
    if (el.classList.contains('knote-toc')) return {
      toc: { id: outlineIds[outlines.indexOf(el)], title: { text: 'Índice de contenidos', bold: true, margin: [0, 0, 0, 4] } },
      margin: [0, 6, 0, 10],
    };
    if (el.classList.contains('knote-preview-columns')) {
      const cells = Array.from(el.children);
      const available = Math.max(1, width - 12 * (cells.length - 1));
      const weights = tableColumnWidths(el.dataset.columnWidths?.split(',').map(Number), cells.length);
      const total = weights?.reduce((sum, weight) => sum + weight, 0) ?? Math.max(1, cells.length);
      const columns = await Promise.all(cells.map(async (column, index) => {
        const columnWidth = available * (weights?.[index] ?? 1) / total;
        const top = column instanceof HTMLElement ? columnOffset(column.dataset.before) : 0;
        return { width: columnWidth, stack: await children(column, columnWidth), margin: [0, top, 0, 0] as [number, number, number, number] };
      }));
      return { columns, columnGap: 12 };
    }
    if (el.classList.contains('knote-pdf-reference') || (el.tagName === 'DETAILS' &&
      /^Original de la página \d+$/.test(el.querySelector('summary')?.textContent ?? '') &&
      el.querySelector('img[alt^="Página "][alt$=" del PDF"]'))) return { text: '' };
    if (el instanceof HTMLImageElement || el.tagName === 'IMG') return pdfImage(el as HTMLImageElement, width);
    if (el.tagName === 'FIGURE') {
      const figureWidth = width * Number(el.dataset.width || 100) / 100;
      const offset = width * Number(el.dataset.offset || 0) / 100;
      const elements = await children(el, figureWidth);
      return { stack: elements, margin: [offset, 0, Math.max(0, width - offset - figureWidth), 0] };
    }
    const alignment = textAlignment(el.style.textAlign);
    if (el.matches('h1,h2,h3,h4')) return { text: inline(el), ...(outlines.length ? { tocItem: outlineIds } : {}),
      fontSize: [21, 17, 14, 12][Number(el.tagName[1]) - 1], bold: true, ...textStyle(el), alignment, margin: [0, 10, 0, 4] };
    if (el.tagName === 'HR') {
      if (el.classList.contains('knote-page-break')) return { text: '', pageBreak: 'after' };
      return { canvas: [{ type: 'line', x1: 0, x2: width, y1: 0, y2: 0, lineWidth: 0.6, lineColor: '#bbc2c9' }], margin: [0, 8, 0, 8] };
    }
    if (el.matches('ul,ol')) {
      const items = await Promise.all(Array.from(el.children, async (item) => ({ stack: await children(item, Math.max(20, width - 16)) })));
      if (el.tagName === 'OL') return { ol: items, start: Number(el.getAttribute('start') || 1) };
      return { ul: items, type: el.querySelector(':scope > li[data-task]') ? 'none' : 'disc' };
    }
    if (el.tagName === 'PRE') return { text: el.textContent || ' ', fontSize: 9, preserveLeadingSpaces: true, background: '#eff1f3', margin: [8, 5, 0, 7], wordBreak: 'break-all' };
    if (el.tagName === 'P') return { text: inline(el), ...textStyle(el), alignment, margin: [0, 2, 0, 5] };
    if (el.tagName === 'FIGCAPTION') return { text: inline(el), style: 'caption', alignment: 'center' };
    if (el.matches('dt,summary')) return { text: inline(el), bold: true, margin: [0, 5, 0, 2] };
    if (el.matches('blockquote,.knote-callout,dd')) return { stack: await children(el, width - 16), margin: [16, 3, 0, 6], color: muted };
    return { stack: await children(el, width) };
  }
  return children(template.content, 495);
}

function databaseTables(page: WorkspacePage): Content[] {
  const entries = Array.from(walkTasks(page.entries));
  const children = new Set(entries.flatMap((entry) => (entry.subtasks || []).map((child) => child.id)));
  const columns: { name: string; value: (entry: PageEntry) => string }[] = [
    { name: 'Estado', value: (entry) => entry.status },
    { name: 'Prioridad', value: (entry) => entry.priority || '—' },
    { name: 'Fecha', value: (entry) => entry.due || '—' },
    { name: 'Etiquetas', value: (entry) => entryTags(entry).join(', ') || '—' },
    ...(page.fields || []).map((field) => ({
      name: field.name,
      value: (entry: PageEntry) => field.type === 'checkbox' ? (entry.fields?.[field.id] ? 'Sí' : 'No') : String(entry.fields?.[field.id] ?? '—'),
    })),
  ];
  const tables: Content[] = [];
  for (let offset = 0; offset < columns.length; offset += 4) {
    const group = columns.slice(offset, offset + 4);
    tables.push({
      table: { headerRows: 1, widths: [135, ...group.map(() => '*')], body: [
        ['Nombre', ...group.map((column) => column.name)].map((text) => ({ text, bold: true, fillColor: '#eef1f3' })),
        ...entries.map((entry) => [(children.has(entry.id) ? (entry.done ? '[x] ' : '[ ] ') : '') + (entry.title || 'Sin título'), ...group.map((column) => column.value(entry))]),
      ] },
      layout: 'lightHorizontalLines', fontSize: 9, wordBreak: 'break-all', margin: [0, 8, 0, 8],
    });
  }
  return tables;
}

async function entryContent(entry: PageEntry, page: WorkspacePage, includeChildren = true, depth = 0): Promise<Content[]> {
  const metadata = [
    page.type === 'tasks' && !depth ? (entry.done ? 'Hecho' : 'Pendiente') : entry.status, depth ? (entry.done ? 'Subtarea completada' : 'Subtarea pendiente') : undefined, entry.priority, entry.due, ...entryTags(entry)].filter(Boolean);
  const content: Content[] = [
    { text: entry.title || 'Sin título', fontSize: depth ? 12 : 15, bold: true, margin: [Math.min(depth, 4) * 8, 12, 0, 3] },
    { text: metadata.join('   ·   '), style: 'caption' },
    ...(page.fields || []).map((field) => ({ text: field.name + ' · ' + (field.type === 'checkbox' ? (entry.fields?.[field.id] ? 'Sí' : 'No') : String(entry.fields?.[field.id] ?? '—')), style: 'caption' })),
    ...await richPdfContent(entry.content || ''),
  ];
  if (includeChildren) {
    for (const child of entry.subtasks || []) content.push(...await entryContent(child, page, true, depth + 1));
  }
  return content;
}

export async function downloadPagePdf(page: WorkspacePage, entry?: PageEntry, childTitles: string[] = []): Promise<void> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(fonts);
  const title = (entry ? entry.title : page.title) || 'Sin título';
  const content: Content[] = [];
  if (entry) {
    content.push({ text: page.title, style: 'caption' }, ...await entryContent(entry, page));
  } else {
    content.push({ text: title, fontSize: 26, bold: true, margin: [0, 0, 0, 12] });
    if (page.banner) {
      const banner = document.createElement('img');
      banner.src = page.banner;
      content.push(await pdfImage(banner, 495));
    }
    if (page.type === 'code') content.push({ text: page.content, preserveLeadingSpaces: true, fontSize: 9, wordBreak: 'break-all' });
    else content.push(...await richPdfContent(page.content));
    if (childTitles.length) content.push({ text: 'Páginas', bold: true }, { ul: childTitles });
    const database = page.type === 'database' || page.type === 'board';
    if (database) content.push(...databaseTables(page));
    for (const item of database ? walkTasks(page.entries) : page.entries) {
      if (!database || item.content) content.push(...await entryContent(item, page, !database));
    }
  }
  const definition: TDocumentDefinitions = {
    info: { title, creator: 'KNote' }, pageSize: 'A4', pageMargins: [50, 48, 50, 56],
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.24, color: ink },
    styles: { caption: { fontSize: 9, color: muted, margin: [0, 2, 0, 6] } },
    footer: (current, total) => ({ text: `${current} / ${total}`, alignment: 'right', fontSize: 9, color: muted, margin: [50, 15, 50, 0] }),
    content,
  };
  const name = title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 120).trim() || 'Documento';
  await pdfMake.createPdf(definition).download(name + '.pdf');
}
