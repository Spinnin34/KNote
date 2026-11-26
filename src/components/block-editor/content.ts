import { Lightbulb, Info, Pin, AlertTriangle, CheckCircle, FileText, LockKeyhole, Target, Paperclip, Bell, BookOpen, Compass, Settings, FlaskConical, Heart, Tag, MessageCircle, Rocket, Link2, Archive } from '@lucide/vue';

import { Lightbulb as LightbulbNode, Info as InfoNode, Pin as PinNode, AlertTriangle as AlertTriangleNode, CheckCircle as CheckCircleNode, FileText as FileTextNode, LockKeyhole as LockKeyholeNode, Target as TargetNode, Paperclip as PaperclipNode, Bell as BellNode, BookOpen as BookOpenNode, Compass as CompassNode, Settings as SettingsNode, FlaskConical as FlaskConicalNode, Heart as HeartNode, Tag as TagNode, MessageCircle as MessageCircleNode, Rocket as RocketNode, Link2 as Link2Node, Archive as ArchiveNode, type IconNode } from 'lucide';



export const RICH_PREFIX = 'knote-rich-v1:';

export const LANGUAGES = [
  ['plaintext', 'Texto sin formato'], ['bash', 'Bash'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'],
  ['css', 'CSS'], ['diff', 'Diff'], ['go', 'Go'], ['html', 'HTML'], ['java', 'Java'], ['javascript', 'JavaScript'],
  ['json', 'JSON'], ['jsx', 'JSX'], ['kotlin', 'Kotlin'], ['lua', 'Lua'], ['markdown', 'Markdown'], ['php', 'PHP'],
  ['python', 'Python'], ['r', 'R'], ['ruby', 'Ruby'], ['rust', 'Rust'], ['scss', 'SCSS'], ['shell', 'Shell'],
  ['sql', 'SQL'], ['swift', 'Swift'], ['toml', 'TOML'], ['typescript', 'TypeScript'], ['xml', 'XML'], ['yaml', 'YAML'],
] as const;
export const LANGUAGE_IDS = new Set<string>(LANGUAGES.map(([id]) => id));

export const CALL_OUT_ICONS = [
  { id: 'idea', label: 'Idea', icon: Lightbulb, node: LightbulbNode },
  { id: 'info', label: 'Información', icon: Info, node: InfoNode },
  { id: 'pin', label: 'Nota fijada', icon: Pin, node: PinNode },
  { id: 'alert', label: 'Aviso', icon: AlertTriangle, node: AlertTriangleNode },
  { id: 'urgent', label: 'Urgente', icon: AlertTriangle, node: AlertTriangleNode },
  { id: 'check', label: 'Correcto', icon: CheckCircle, node: CheckCircleNode },
  { id: 'note', label: 'Apunte', icon: FileText, node: FileTextNode },
  { id: 'lock', label: 'Privado', icon: LockKeyhole, node: LockKeyholeNode },
  { id: 'target', label: 'Objetivo', icon: Target, node: TargetNode },
  { id: 'attachment', label: 'Adjunto', icon: Paperclip, node: PaperclipNode },
  { id: 'reminder', label: 'Recordatorio', icon: Bell, node: BellNode },
  { id: 'reading', label: 'Lectura', icon: BookOpen, node: BookOpenNode },
  { id: 'compass', label: 'Dirección', icon: Compass, node: CompassNode },
  { id: 'settings', label: 'Configuración', icon: Settings, node: SettingsNode },
  { id: 'experiment', label: 'Experimento', icon: FlaskConical, node: FlaskConicalNode },
  { id: 'favorite', label: 'Favorito', icon: Heart, node: HeartNode },
  { id: 'tag', label: 'Etiqueta', icon: Tag, node: TagNode },
  { id: 'chat', label: 'Conversación', icon: MessageCircle, node: MessageCircleNode },
  { id: 'launch', label: 'Lanzamiento', icon: Rocket, node: RocketNode },
  { id: 'link', label: 'Enlace', icon: Link2, node: Link2Node },
  { id: 'archive', label: 'Archivo', icon: Archive, node: ArchiveNode },
] as const;

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function inlineMarkdown(source: string): string {
  let text = escapeHtml(source);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  text = text.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');
  text = text.replace(/==(.+?)==/g, '<mark>$1</mark>');
  text = text.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|#page-)[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return text;
}

function legacyMarkdownToHtml(source: string): string {
  const lines = source.replace(/\r/g, '').split('\n');
  const output: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      index += 1;
      output.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
      continue;
    }
    const columnsMatch = /^:::columns\s+([2-5])$/.exec(line);
    if (columnsMatch) {
      const columns: string[] = [];
      let current: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== ':::') {
        if (lines[index] === ':::column') { if (current.length) columns.push(legacyMarkdownToHtml(current.join('\n'))); current = []; }
        else current.push(lines[index]);
        index += 1;
      }
      if (current.length) columns.push(legacyMarkdownToHtml(current.join('\n')));
      index += 1;
      const count = Number(columnsMatch[1]);
      while (columns.length < count) columns.push('<p><br></p>');
      output.push('<div class="knote-preview-columns" style="--knote-columns:' + count + '">' + columns.map((column) => '<div class="knote-preview-column">' + column + '</div>').join('') + '</div>');
      continue;
    }
    const toggle = /^:::toggle\s*(.*)$/.exec(line);
    if (toggle) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== ':::') body.push(lines[index++]);
      index += 1;
      output.push('<details><summary>' + escapeHtml(toggle[1] || 'Mostrar contenido') + '</summary><div>' + legacyMarkdownToHtml(body.join('\n')) + '</div></details>');
      continue;
    }
    if (line === '$$') {
      const equation: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== '$$') equation.push(lines[index++]);
      index += 1;
      output.push('<div class="knote-equation">' + escapeHtml(equation.join('\n')) + '</div>');
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) { output.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`); index += 1; continue; }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
      output.push('<blockquote>' + legacyMarkdownToHtml(quote.join('\n')) + '</blockquote>');
      continue;
    }
    if (/^(?:- \[[ xX]\]\s+|[-*+•]\s+|\d+\.\s+)/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const checklist = /^- \[[ xX]\]\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && /^(?:- \[[ xX]\]\s+|[-*+•]\s+|\d+\.\s+)/.test(lines[index])
        && /^\d+\.\s+/.test(lines[index]) === ordered && /^- \[[ xX]\]\s+/.test(lines[index]) === checklist) {
        const task = /^- \[([ xX])\]\s+(.*)$/.exec(lines[index]);
        const content = task ? task[2] : lines[index].replace(/^(?:[-*+•]\s+|\d+\.\s+)/, '');
        items.push(task
          ? `<li data-task="${task[1].toLowerCase() === 'x'}"><input type="checkbox" aria-label="Tarea completada" contenteditable="false"${task[1].toLowerCase() === 'x' ? ' checked' : ''}>${inlineMarkdown(content)}</li>`
          : `<li>${inlineMarkdown(content)}</li>`);
        index += 1;
      }
      const start = Number.parseInt(line, 10);
      output.push(ordered ? `<ol${Number.isSafeInteger(start) && start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,4}\s|```|:::columns\s+[2-5]$|:::toggle|\$\$|>\s?|(?:- \[[ xX]\]\s+|[-*+•]\s+|\d+\.\s+))/.test(lines[index])) paragraph.push(lines[index++]);
    output.push('<p>' + inlineMarkdown(paragraph.join('\n')).replaceAll('\n', '<br>') + '</p>');
  }
  return output.join('') || '<p><br></p>';
}

const allowedTags = new Set(['P', 'DIV', 'DL', 'DT', 'DD', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL', 'MARK', 'A', 'BR', 'HR', 'DETAILS', 'SUMMARY', 'INPUT', 'SPAN', 'FIGURE', 'FIGCAPTION', 'IMG']);
const omittedTags = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
function safeHref(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') return value;
  } catch { /* The value is not a navigable URL. */ }
  return null;
}
export function safeBlockColor(value: string | null | undefined): string | null {
  return value && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}
function safeImageSource(value: string): string | null {
  if (!value.trim()) return null;
  if (/^knote-asset:[\da-f-]{20,}$/i.test(value)) return value;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return value;
  } catch { /* Ignore unsupported image URLs. */ }
  return null;
}
export function safeLanguage(value: string | null): string {
  return value && LANGUAGE_IDS.has(value) ? value : 'plaintext';
}
export function codeBlockText(block: HTMLElement): string {
  const code = block.firstElementChild;
  const canonical = !block.childElementCount
    || (block.childNodes.length === 1 && code?.tagName === 'CODE' && code.childElementCount === 0);
  if (canonical) return block.textContent ?? '';
  if (!block.textContent && block.querySelectorAll('br').length === 1) return '';
  if (block.isConnected) return block.innerText;
  const copy = block.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('br').forEach((line) => line.replaceWith('\n'));
  return copy.textContent ?? '';
}
export const TABLE_LIMITS = { columns: 16, rows: 200, header: 300, cell: 2000 } as const;
export interface EditorTableData {
  caption: string;
  headers: string[];
  rows: string[][];
  headerless?: boolean;
  columnWidths?: number[];
  widthPercent?: number;
  offsetPercent?: number;
  headerHtml?: string[];
  rowHtml?: string[][];
}
export const EMPTY_TABLE: EditorTableData = {
  caption: 'Tabla',
  headers: ['Columna 1', 'Columna 2', 'Columna 3'],
  rows: [['', '', ''], ['', '', '']],
};
export function normalizeTableData(value: unknown): EditorTableData {
  if (!value || typeof value !== 'object') return { ...EMPTY_TABLE, headers: [...EMPTY_TABLE.headers], rows: EMPTY_TABLE.rows.map((row) => [...row]) };
  const candidate = value as Partial<EditorTableData>;
  const headers = Array.isArray(candidate.headers) ? candidate.headers.slice(0, TABLE_LIMITS.columns).map((item) => String(item ?? '').slice(0, TABLE_LIMITS.header)) : [...EMPTY_TABLE.headers];
  while (headers.length < 1) headers.push('Columna 1');
  const rows = Array.isArray(candidate.rows)
    ? candidate.rows.slice(0, TABLE_LIMITS.rows).map((row) => Array.from({ length: headers.length }, (_, index) => String(Array.isArray(row) ? row[index] ?? '' : '').slice(0, TABLE_LIMITS.cell)))
    : EMPTY_TABLE.rows.map(() => headers.map(() => ''));
  const headerHtml = Array.isArray(candidate.headerHtml) ? headers.map((text, column) => normalizedCellHtml(candidate.headerHtml?.[column], text)) : [];
  const rowHtml = Array.isArray(candidate.rowHtml) ? rows.map((row, index) => row.map((text, column) =>
    normalizedCellHtml(Array.isArray(candidate.rowHtml?.[index]) ? candidate.rowHtml[index][column] : undefined, text))) : [];
  const columnWidths = tableColumnWidths(candidate.columnWidths, headers.length);
  const widthPercent = typeof candidate.widthPercent === 'number' && Number.isFinite(candidate.widthPercent)
    ? Math.max(1, Math.min(100, candidate.widthPercent)) : 100;
  const offsetPercent = typeof candidate.offsetPercent === 'number' && Number.isFinite(candidate.offsetPercent)
    ? Math.max(0, Math.min(100 - widthPercent, candidate.offsetPercent)) : 0;
  return {
    caption: typeof candidate.caption === 'string' ? candidate.caption.slice(0, 200) : 'Tabla',
    headers,
    rows,
    ...(candidate.headerless === true && rows.length ? { headerless: true } : {}),
    ...(columnWidths ? { columnWidths } : {}),
    ...(widthPercent < 100 ? { widthPercent } : {}),
    ...(offsetPercent ? { offsetPercent } : {}),
    ...(headerHtml.some(Boolean) ? { headerHtml } : {}),
    ...(rowHtml.some((row) => row.some(Boolean)) ? { rowHtml } : {}),
  };
}

export function tableColumnWidths(value: unknown, count: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== count) return;
  if (!value.every((width: unknown) => typeof width === 'number' && Number.isFinite(width) && width > 0 && width <= 10_000)) return;
  return value;
}

const inlineCellTags = new Set(['BR', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL', 'MARK', 'A', 'CODE']);

export function readTableCell(element: ParentNode): { text: string; html: string } {
  function read(nodes: NodeListOf<ChildNode>): string {
    return Array.from(nodes, (node) => {
      if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
      if (!(node instanceof HTMLElement) || omittedTags.has(node.tagName)) return '';
      const children = read(node.childNodes);
      if (node.matches('p,div')) return children + (node.nextSibling ? '<br>' : '');
      return inlineCellTags.has(node.tagName) ? sanitizeElement(node, children) : children;
    }).join('');
  }
  const html = read(element.childNodes);
  if (html === '<br>') return { text: '', html: '' };
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return { text: template.content.textContent ?? '', html };
}

function normalizedCellHtml(value: unknown, text: string): string {
  if (typeof value !== 'string' || !value || value.length > 24_000) return '';
  const template = document.createElement('template');
  template.innerHTML = value;
  const cell = readTableCell(template.content);
  return cell.text === text && cell.html !== tableCellHtml(text) ? cell.html : '';
}

export function tableCellHtml(text: string, html?: string): string {
  return html || escapeHtml(text).replaceAll('\n', '<br>');
}

export function tableDataFromBlock(block: HTMLElement): EditorTableData {
  try { return normalizeTableData(JSON.parse(block.dataset.knoteTable || '')); }
  catch { return normalizeTableData(null); }
}
export function tableBlockHtml(data: EditorTableData): string {
  const placement = data.widthPercent ? ` style="--knote-table-width:${data.widthPercent}%;--knote-table-offset:${data.offsetPercent ?? 0}%"` : '';
  return `<div class="knote-table-block" contenteditable="false" data-knote-table="${escapeHtml(JSON.stringify(data))}"${placement}><br></div>`;
}
function tablePlaceholder(block: HTMLElement): string {
  const data = block instanceof HTMLTableElement ? importedTableData(block) : tableDataFromBlock(block);
  return tableBlockHtml(data);
}
function importedTableData(table: HTMLTableElement): EditorTableData {
  const headerRow = table.tHead?.rows[0] ?? (table.rows[0]?.cells[0]?.tagName === 'TH' ? table.rows[0] : null);
  const readRow = (row: HTMLTableRowElement) => Array.from(row.cells, readTableCell);
  const rows = Array.from(table.rows).filter((row) => row !== headerRow).slice(0, TABLE_LIMITS.rows).map(readRow);
  const headers = headerRow ? readRow(headerRow) : [];
  const width = Math.min(TABLE_LIMITS.columns, Math.max(headers.length, ...rows.map((row) => row.length), 1));
  return normalizeTableData({
    caption: table.caption?.textContent,
    headers: Array.from({ length: width }, (_, index) => headers[index]?.text ?? ''),
    rows: rows.map((row) => row.map((cell) => cell.text)),
    headerless: !headerRow,
    headerHtml: headers.map((cell) => cell.html),
    rowHtml: rows.map((row) => row.map((cell) => cell.html)),
  });
}

export function safeFontSize(value: string | null | undefined): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(pt|px)?$/i.exec(value?.trim() ?? '');
  if (!match) return;
  const size = Number(match[1]) * (match[2]?.toLowerCase() === 'px' ? 0.75 : 1);
  if (size >= 1 && size <= 180) return Math.round(size * 10) / 10;
}

export function textAlignment(value: string | null | undefined): 'left' | 'center' | 'right' | 'justify' | undefined {
  if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') return value;
}

export function columnLayout(count: number, widths?: number[]): string {
  const tracks = widths?.map((width) => `minmax(0, ${width}fr)`).join(' ');
  const sizes = widths ? ` data-column-widths="${widths.join(',')}"` : '';
  return `class="knote-preview-columns" data-columns="${count}"${sizes} style="--knote-columns:${count}${tracks ? `;--knote-column-tracks:${tracks}` : ''}"`;
}

export function columnOffset(value: string | null | undefined): number {
  const offset = Number(value);
  return Number.isFinite(offset) ? Math.round(Math.max(0, Math.min(595, offset)) * 10) / 10 : 0;
}

export function columnHtml(html: string, offset = 0): string {
  const before = offset ? ` data-before="${offset}" style="--knote-column-before:${offset}pt"` : '';
  return `<div class="knote-preview-column"${before}>${html}</div>`;
}

export function calloutGlyph(value: string | null | undefined): string {
  const nodes: IconNode = CALL_OUT_ICONS.find((icon) => icon.id === value)?.node || CALL_OUT_ICONS[0].node;
  const children = nodes.map(([tag, attributes]) => {
    const safeAttributes = Object.entries(attributes).map(([name, attribute]) => `${name}="${escapeHtml(String(attribute))}"`).join(' ');
    return `<${tag}${safeAttributes ? ` ${safeAttributes}` : ''}></${tag}>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${children}</svg>`;
}
export function sanitizeNodes(nodes: NodeListOf<ChildNode> | ChildNode[]): string {
  return Array.from(nodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '');
    if (!(node instanceof HTMLElement)) return '';
    const tag = node.nodeName.toUpperCase();
    if (omittedTags.has(tag)) return '';
    if (node instanceof HTMLTableElement) return tablePlaceholder(node);
    if (!allowedTags.has(tag)) return sanitizeNodes(Array.from(node.childNodes));
    if (tag === 'DIV' && node.classList.contains('knote-table-block')) return tablePlaceholder(node);
    return sanitizeElement(node, sanitizeNodes(node.childNodes));
  }).join('');
}

function sanitizeElement(node: HTMLElement, children: string): string {
  const tag = node.tagName;
  if (tag === 'BR') return '<br>';
  if (tag === 'HR') return node.classList.contains('knote-page-break') ? '<hr class="knote-page-break">' : '<hr>';
  if (tag === 'DIV' && node.classList.contains('knote-toc')) return '<div class="knote-toc" contenteditable="false"></div>';
  if (tag === 'IMG') {
    const assetId = node.getAttribute('data-asset-id') || '';
    const source = assetId && /^[\da-f-]{20,}$/i.test(assetId) ? `knote-asset:${assetId}` : safeImageSource(node.getAttribute('src') || '');
    if (!source) return '';
    const alt = escapeHtml(node.getAttribute('alt') || '');
    const assetAttr = source.startsWith('knote-asset:') ? ` data-asset-id="${escapeHtml(source.slice('knote-asset:'.length))}"` : '';
    return `<img src="${escapeHtml(source)}"${assetAttr} alt="${alt}" contenteditable="false">`;
  }
  if (tag === 'INPUT') {
    if (node.getAttribute('type') !== 'checkbox') return '';
    const checked = (node as HTMLInputElement).checked || node.hasAttribute('checked');
    return `<input type="checkbox" contenteditable="false"${checked ? ' checked' : ''}>`;
  }
  if (tag === 'DETAILS') return `<details${node.hasAttribute('open') ? ' open' : ''}${node.classList.contains('knote-pdf-reference') ? ' class="knote-pdf-reference"' : ''}>${children}</details>`;
  if (tag === 'PRE') {
    const code = codeBlockText(node as HTMLElement);
    return `<pre data-language="${safeLanguage(node.getAttribute('data-language'))}" data-empty="${!code.trim()}"><code>${escapeHtml(code) || '<br>'}</code></pre>`;
  }
  if (tag === 'OL') {
    const start = node.getAttribute('start');
    return `<ol${start && /^-?\d{1,9}$/.test(start) ? ` start="${start}"` : ''}>${children}</ol>`;
  }
  if (tag === 'FIGURE' && node.classList.contains('knote-image-block')) {
    const width = Math.min(100, Math.max(1, Number.parseFloat(node.getAttribute('data-width') || '100') || 100));
    const offset = Math.min(100 - width, Math.max(0, Number.parseFloat(node.getAttribute('data-offset') || '0') || 0));
    return `<figure class="knote-image-block" data-width="${width}" data-offset="${offset}" style="--knote-image-width:${width}%;--knote-image-offset:${offset}%">${children}</figure>`;
  }
  if (tag === 'FIGCAPTION') return `<figcaption data-placeholder="Añade un pie de foto…">${children}</figcaption>`;
  if (tag === 'MARK') {
    const color = safeBlockColor(node.getAttribute('data-knote-color'));
    return color
      ? `<mark data-knote-color="${color}" style="--knote-highlight-color:${color}">${children}</mark>`
      : `<mark>${children}</mark>`;
  }
  if (tag === 'DIV' && node.classList.contains('knote-callout')) {
    const type = node.dataset.knoteCallout === 'icon' ? 'icon' : 'plain';
    const icon = CALL_OUT_ICONS.some((candidate) => candidate.id === node.dataset.knoteIcon) ? node.dataset.knoteIcon! : 'archive';
    const color = safeBlockColor(node.dataset.knoteColor) || '#cbd5e1';
    const iconAttr = type === 'icon' ? ` data-knote-icon="${icon}"` : '';
    const body = node.querySelector(':scope > p');
    const empty = !body?.textContent?.trim();
    return `<div class="knote-callout knote-callout-${type}" data-knote-callout="${type}" data-empty="${empty}"${iconAttr} data-knote-color="${color}" style="--knote-callout-color:${color}">${children}</div>`;
  }
  if (tag === 'SPAN' && node.classList.contains('knote-callout-icon')) {
    const icon = CALL_OUT_ICONS.some((candidate) => candidate.id === node.dataset.knoteIcon) ? node.dataset.knoteIcon! : 'archive';
    return `<span class="knote-callout-icon" data-knote-icon="${icon}" contenteditable="false">${calloutGlyph(icon)}</span>`;
  }
  if (tag === 'A') {
    const href = safeHref(node.getAttribute('href') || '');
    return href ? `<a href="${escapeHtml(href)}">${children}</a>` : children;
  }
  if (tag === 'DIV' && node.classList.contains('knote-preview-columns')) {
    const rawCount = node.style.getPropertyValue('--knote-columns') || node.getAttribute('data-columns') || '2';
    const count = Math.min(5, Math.max(2, Number.parseInt(rawCount, 10) || 2));
    const widths = tableColumnWidths(node.dataset.columnWidths?.split(',').map(Number), count);
    return `<div ${columnLayout(count, widths)}>${children}</div>`;
  }
  if (tag === 'DIV' && node.classList.contains('knote-preview-column')) return columnHtml(children, columnOffset(node.dataset.before));
  if (tag === 'DIV' && node.classList.contains('knote-equation')) return `<div class="knote-equation" data-empty="${!node.textContent?.trim()}">${children}</div>`;
  if (tag === 'LI' && node.getAttribute('data-task') !== null) {
    const checkbox = node.querySelector<HTMLInputElement>(':scope > input[type="checkbox"]');
    const checked = checkbox?.checked ?? node.getAttribute('data-task') === 'true';
    const text = Array.from(node.childNodes).filter((child) => !(child instanceof HTMLInputElement)).map((child) => sanitizeNodes([child])).join('');
    return `<li data-task="${checked}"><input type="checkbox" aria-label="Tarea completada" contenteditable="false"${checked ? ' checked' : ''}>${text}</li>`;
  }
  const canonicalTag = ({ B: 'strong', I: 'em', STRIKE: 's' } as Record<string, string>)[tag] ?? tag.toLowerCase();
  const size = safeFontSize(node.style.fontSize);
  const weight = node.style.fontWeight;
  const fontWeight = weight === 'bold' || /^[6-9]00$/.test(weight) ? 'bold' : weight === 'normal' || /^[1-5]00$/.test(weight) ? 'normal' : '';
  const fontStyle = node.style.fontStyle;
  const alignment = node.matches('p,div,h1,h2,h3,h4,li,dt,dd') ? textAlignment(node.style.textAlign || node.getAttribute('align')) : undefined;
  const styles = [size && `font-size:${size}pt`, fontWeight && `font-weight:${fontWeight}`,
    /^(italic|oblique|normal)$/.test(fontStyle) && `font-style:${fontStyle}`, alignment && `text-align:${alignment}`].filter(Boolean);
  if (tag === 'SPAN' && !styles.length) return children;
  return `<${canonicalTag}${styles.length ? ` style="${styles.join(';')}"` : ''}>${children}</${canonicalTag}>`;
}

export function initialHtml(value: string): string {
  if (value.startsWith(RICH_PREFIX)) {
    const parsed = new DOMParser().parseFromString(value.slice(RICH_PREFIX.length), 'text/html');
    return sanitizeNodes(parsed.body.childNodes);
  }
  return legacyMarkdownToHtml(value);
}
