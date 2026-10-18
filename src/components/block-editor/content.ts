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

function escapeHtml(value: string): string {
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
      output.push('<div class="knote-preview-columns" style="--knote-columns:' + Number(columnsMatch[1]) + '">' + columns.map((column) => '<div class="knote-preview-column">' + column + '</div>').join('') + '</div>');
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
      const items: string[] = [];
      while (index < lines.length && /^(?:- \[[ xX]\]\s+|[-*+•]\s+|\d+\.\s+)/.test(lines[index])) {
        const task = /^- \[([ xX])\]\s+(.*)$/.exec(lines[index]);
        const content = task ? task[2] : lines[index].replace(/^(?:[-*+•]\s+|\d+\.\s+)/, '');
        items.push(task
          ? `<li data-task="${task[1].toLowerCase() === 'x'}"><input type="checkbox" contenteditable="false"${task[1].toLowerCase() === 'x' ? ' checked' : ''}>${inlineMarkdown(content)}</li>`
          : `<li>${inlineMarkdown(content)}</li>`);
        index += 1;
      }
      output.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,4}\s|```|:::columns\s+[2-5]$|:::toggle|\$\$|>\s?|(?:- \[[ xX]\]\s+|[-*+•]\s+|\d+\.\s+))/.test(lines[index])) paragraph.push(lines[index++]);
    output.push('<p>' + inlineMarkdown(paragraph.join('\n')).replaceAll('\n', '<br>') + '</p>');
  }
  return output.join('') || '<p><br></p>';
}

const allowedTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'MARK', 'A', 'BR', 'HR', 'DETAILS', 'SUMMARY', 'INPUT', 'SPAN', 'FIGURE', 'FIGCAPTION', 'IMG']);
function safeHref(value: string): string | null {
  if (value.startsWith('#page-')) return value;
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
export interface EditorTableData { caption: string; headers: string[]; rows: string[][] }
export const EMPTY_TABLE: EditorTableData = {
  caption: 'Tabla',
  headers: ['Columna 1', 'Columna 2', 'Columna 3'],
  rows: [['', '', ''], ['', '', '']],
};
export function normalizeTableData(value: unknown): EditorTableData {
  if (!value || typeof value !== 'object') return { ...EMPTY_TABLE, headers: [...EMPTY_TABLE.headers], rows: EMPTY_TABLE.rows.map((row) => [...row]) };
  const candidate = value as Partial<EditorTableData>;
  const headers = Array.isArray(candidate.headers) ? candidate.headers.slice(0, 8).map((item) => String(item ?? '').slice(0, 300)) : [...EMPTY_TABLE.headers];
  while (headers.length < 1) headers.push('Columna 1');
  const rows = Array.isArray(candidate.rows)
    ? candidate.rows.slice(0, 100).map((row) => Array.from({ length: headers.length }, (_, index) => String(Array.isArray(row) ? row[index] ?? '' : '').slice(0, 2000)))
    : EMPTY_TABLE.rows.map((row) => row.slice(0, headers.length));
  return {
    caption: typeof candidate.caption === 'string' && candidate.caption.trim() ? candidate.caption.slice(0, 200) : 'Tabla',
    headers,
    rows,
  };
}

export function tableDataFromBlock(block: HTMLElement): EditorTableData {
  const table = block.querySelector<HTMLTableElement>('table');
  if (table) {
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th')).map((cell) => cell.innerText.replaceAll('\u00a0', ' ').trim());
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll<HTMLTableCellElement>('th, td')).map((cell) => cell.innerText.replaceAll('\u00a0', ' ').trim()),
    );
    if (headers.length) return normalizeTableData({ caption: block.dataset.caption || 'Tabla', headers, rows });
  }
  try { return normalizeTableData(JSON.parse(block.dataset.knoteTable || '')); }
  catch { return normalizeTableData(null); }
}
function tablePlaceholder(block: HTMLElement): string {
  const data = tableDataFromBlock(block);
  return `<div class="knote-table-block" data-knote-table="${escapeHtml(JSON.stringify(data))}"></div>`;
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
  const sanitized = Array.from(nodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '');
    if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) return '';
    const tag = node.nodeName.toUpperCase();
    if (!allowedTags.has(tag)) return sanitizeNodes(Array.from(node.childNodes));
    if (tag === 'BR') return '<br>';
    if (tag === 'HR') return '<hr>';
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
    if (tag === 'DIV' && node.classList.contains('knote-table-block')) return tablePlaceholder(node);
    const children = tag === 'BR' || tag === 'HR' ? '' : sanitizeNodes(Array.from(node.childNodes));
    if (tag === 'PRE') return `<pre data-language="${safeLanguage(node.getAttribute('data-language'))}" data-empty="${!node.textContent?.trim()}">${children}</pre>`;
    if (tag === 'FIGURE' && node.classList.contains('knote-image-block')) {
      const width = Math.min(100, Math.max(20, Number.parseFloat(node.getAttribute('data-width') || '100') || 100));
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
      return `<div class="knote-preview-columns" data-columns="${count}" style="--knote-columns:${count}">${children}</div>`;
    }
    if (tag === 'DIV' && node.classList.contains('knote-preview-column')) return `<div class="knote-preview-column">${children}</div>`;
    if (tag === 'DIV' && node.classList.contains('knote-equation')) return `<div class="knote-equation" data-empty="${!node.textContent?.trim()}">${children}</div>`;
    if (tag === 'LI' && node.getAttribute('data-task') !== null) {
      const checkbox = node.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const text = Array.from(node.childNodes).filter((child) => !(child instanceof HTMLInputElement)).map((child) => sanitizeNodes([child])).join('');
      return `<li data-task="${Boolean(checkbox?.checked)}"><input type="checkbox" contenteditable="false"${checkbox?.checked ? ' checked' : ''}>${text}</li>`;
    }
    if (tag === 'B') return `<strong>${children}</strong>`;
    if (tag === 'I') return `<em>${children}</em>`;
    return `<${tag.toLowerCase()}>${children}</${tag.toLowerCase()}>`;
  }).join('');
  // Contenteditable can emit long runs of <br> when blank lines are pasted or repeated.
  // Keep one intentional break so those runs cannot create hundreds of pixels of dead space.
  return sanitized.replace(/(?:<br>){2,}/g, '<br>');
}

export function initialHtml(value: string): string {
  if (value.startsWith(RICH_PREFIX)) {
    const parsed = new DOMParser().parseFromString(value.slice(RICH_PREFIX.length), 'text/html');
    return sanitizeNodes(Array.from(parsed.body.childNodes));
  }
  return legacyMarkdownToHtml(value);
}
