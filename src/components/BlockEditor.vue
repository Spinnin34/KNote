<script setup lang="ts">
import { createApp, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle, Archive, Bell, Bold, BookOpen, CheckCircle, ChevronDown, Code2, Columns3, Compass, Copy,
  FileText, FlaskConical, GripVertical, Heart, Highlighter, Image as ImageIcon, Info, Italic, Lightbulb,
  Link2, List, ListOrdered, ListTodo, LockKeyhole, MessageCircle, Minus, Paperclip, Pin, Plus, Quote, Rocket,
  Settings, Sigma, Strikethrough, Table as TableIcon, Tag, Target, Trash2, Type, Underline, X,
} from '@lucide/vue';
import {
  AlertTriangle as AlertTriangleNode, Archive as ArchiveNode, Bell as BellNode, BookOpen as BookOpenNode,
  CheckCircle as CheckCircleNode, Compass as CompassNode, FileText as FileTextNode, FlaskConical as FlaskConicalNode,
  Heart as HeartNode, Info as InfoNode, Lightbulb as LightbulbNode, Link2 as Link2Node,
  LockKeyhole as LockKeyholeNode, MessageCircle as MessageCircleNode, Paperclip as PaperclipNode, Pin as PinNode,
  Rocket as RocketNode, Settings as SettingsNode, Tag as TagNode, Target as TargetNode,
  type IconNode,
} from 'lucide';
import Button from '@/components/ui/Button.vue';
import CommandMenu from '@/components/ui/CommandMenu.vue';
import ContextMenu from '@/components/ui/ContextMenu.vue';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import Icon from '@/components/ui/Icon.vue';
import ColorPicker from '@/components/ui/ColorPicker.vue';
import Attachment from '@/components/ui/Attachment.vue';
import TableBlockEditor from '@/components/BlockTableEditor.vue';
import type { CommandGroup, CommandItem } from '@/components/ui/command';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import { getBlockImage, saveBlockImage } from '@/lib/block-images';

const props = defineProps<{ modelValue: string; pageId: string; placeholder?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const RICH_PREFIX = 'knote-rich-v1:';
const editor = ref<HTMLElement | null>(null);
const toolbar = ref<HTMLElement | null>(null);
const shell = ref<HTMLElement | null>(null);
const linkDraft = ref('https://');
const linkEditorOpen = ref(false);
const selectionOpen = ref(false);
const formatBlocksOpen = ref(false);
const toolbarPosition = ref({ left: '8px', top: '8px' });
const slashMenuOpen = ref(false);
const slashQuery = ref('');
const slashMenuPosition = ref({ left: '0px', top: '0px' });
const blockMenuOpen = ref(false);
const blockMenuQuery = ref('');
const blockMenuPosition = ref({ left: '0px', top: '0px' });
const hoveredBlock = ref<HTMLElement | null>(null);
const blockActionsPosition = ref({ left: '0px', top: '0px' });
const draggedBlock = ref<HTMLElement | null>(null);
const blockContextMenuOpen = ref(false);
const contextTargetBlock = ref<HTMLElement | null>(null);
const blockContextMenuId = `block-context-${props.pageId}-${Math.random().toString(36).slice(2, 8)}`;
const blockContextMenuItems: readonly MenuItem[] = [
  { id: 'delete-block', label: 'Eliminar bloque', icon: Trash2, destructive: true },
];
const insertionAnchor = ref<HTMLElement | null>(null);
const imagePickerOpen = ref(false);
const imagePickerPosition = ref({ left: '0px', top: '0px' });
const selectedImageFiles = ref<readonly File[]>([]);
const imageError = ref('');
const activeCodeBlock = ref<HTMLElement | null>(null);
const codeToolbarPosition = ref({ left: '0px', top: '0px' });
const codeLanguageMenuOpen = ref(false);
const codeLanguageQuery = ref('');
const copiedCode = ref(false);
const copyCodeUnavailable = ref(false);
const activeCallout = ref<HTMLElement | null>(null);
const calloutToolsPinned = ref(false);
const calloutColorDraft = ref('#cbd5e1');
const calloutIconMenuOpen = ref(false);
const activeImage = ref<HTMLElement | null>(null);
const imageToolsPinned = ref(false);
const imageToolbarPosition = ref({ left: '0px', top: '0px' });
const imageResizePosition = ref({ left: '0px', top: '0px', width: '0px', height: '0px' });
const imageResizeDirections = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const imageResizeLabels: Record<(typeof imageResizeDirections)[number], string> = {
  nw: 'Cambiar tamaño desde arriba a la izquierda', n: 'Cambiar tamaño desde arriba', ne: 'Cambiar tamaño desde arriba a la derecha',
  e: 'Cambiar tamaño desde la derecha', se: 'Cambiar tamaño desde abajo a la derecha', s: 'Cambiar tamaño desde abajo',
  sw: 'Cambiar tamaño desde abajo a la izquierda', w: 'Cambiar tamaño desde la izquierda',
};
const tableApps = new Map<HTMLElement, ReturnType<typeof createApp>>();
let savedRange: Range | null = null;
let savedSelectionText = '';
let savedSelectedBlocks: HTMLElement[] = [];
let lastModelValue = props.modelValue;
let selectionFrame = 0;
const imageObjectUrls = new Set<string>();
interface BlockPointerDragState { pointerId: number; block: HTMLElement; startX: number; startY: number }
let blockPointerDrag: BlockPointerDragState | null = null;
let dropPlaceholder: HTMLElement | null = null;
let blockDragPreview: HTMLElement | null = null;
let dropAnchorTarget: HTMLElement | null = null;
let dropAnchorRect: { top: number; height: number } | null = null;
let dropBlockRects = new Map<HTMLElement, { documentTop: number; height: number }>();
interface ImageResizeState { pointerId: number; figure: HTMLElement; direction: (typeof imageResizeDirections)[number]; startX: number; startY: number; startWidth: number; startOffset: number; parentWidth: number; ratio: number }
let imageResizeState: ImageResizeState | null = null;

const LANGUAGES = [
  ['plaintext', 'Texto sin formato'], ['bash', 'Bash'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'],
  ['css', 'CSS'], ['diff', 'Diff'], ['go', 'Go'], ['html', 'HTML'], ['java', 'Java'], ['javascript', 'JavaScript'],
  ['json', 'JSON'], ['jsx', 'JSX'], ['kotlin', 'Kotlin'], ['lua', 'Lua'], ['markdown', 'Markdown'], ['php', 'PHP'],
  ['python', 'Python'], ['r', 'R'], ['ruby', 'Ruby'], ['rust', 'Rust'], ['scss', 'SCSS'], ['shell', 'Shell'],
  ['sql', 'SQL'], ['swift', 'Swift'], ['toml', 'TOML'], ['typescript', 'TypeScript'], ['xml', 'XML'], ['yaml', 'YAML'],
] as const;
const LANGUAGE_IDS = new Set<string>(LANGUAGES.map(([id]) => id));
const codeLanguageGroups: readonly CommandGroup[] = [{
  id: 'code-languages', label: 'Lenguajes', items: LANGUAGES.map(([id, label]) => ({ id, label, keywords: ['lenguaje', id] })),
}];
const CALL_OUT_ICONS = [
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
const calloutIconItems: readonly MenuItem[] = CALL_OUT_ICONS.map((item) => ({ id: `callout-icon:${item.id}`, label: item.label, icon: item.icon }));

const headingItems: readonly MenuItem[] = [1, 2, 3, 4].map((level) => ({
  id: `block:heading${level}`, label: `Encabezado ${level}`, icon: Type,
}));
const listItems: readonly MenuItem[] = [
  { id: 'block:bullet', label: 'Lista con viñetas', icon: List },
  { id: 'block:numbered', label: 'Lista numerada', icon: ListOrdered },
  { id: 'block:task', label: 'Lista de tareas', icon: ListTodo },
  { id: 'block:toggle', label: 'Lista desplegable', icon: ChevronDown },
];
const columnItems: readonly MenuItem[] = [2, 3, 4, 5].map((count) => ({
  id: `block:columns:${count}`, label: `${count} columnas`, icon: Columns3,
}));
const formatItems: readonly MenuItem[] = [
  { id: 'block:paragraph', label: 'Texto', icon: Type },
  { id: 'group:format-headings', type: 'submenu', label: 'Encabezados', icon: Type, children: headingItems },
  { id: 'group:format-lists', type: 'submenu', label: 'Listas', icon: List, children: listItems },
  { id: 'separator-format', type: 'separator' },
  { id: 'block:quote', label: 'Cita', icon: Quote },
  { id: 'block:callout-icon', label: 'Cita destacada con icono', icon: Quote },
  { id: 'block:callout-plain', label: 'Cita destacada', icon: Quote },
  { id: 'block:highlight', label: 'Destacado', icon: Highlighter },
  { id: 'block:table', label: 'Tabla', icon: TableIcon },
  { id: 'block:code', label: 'Bloque de código', icon: Code2 },
  { id: 'block:divider', label: 'Divisor', icon: Minus },
  { id: 'block:image', label: 'Imagen', icon: ImageIcon },
  { id: 'block:equation', label: 'Ecuación en bloque', icon: Sigma },
  { id: 'group:format-columns', type: 'submenu', label: 'Columnas', icon: Columns3, children: columnItems },
];
const slashBlockGroups: readonly CommandGroup[] = [{
  id: 'insert-blocks', label: 'Bloques', items: [
    { id: 'block:paragraph', label: 'Texto', keywords: ['párrafo', 'normal'], icon: Type },
    ...[1, 2, 3, 4].map((level) => ({ id: `block:heading${level}`, label: `Encabezado ${level}`, keywords: ['título'], icon: Type })),
    { id: 'block:bullet', label: 'Lista con viñetas', keywords: ['lista', 'puntos'], icon: List },
    { id: 'block:numbered', label: 'Lista numerada', keywords: ['lista', 'orden'], icon: ListOrdered },
    { id: 'block:task', label: 'Lista de tareas', keywords: ['checkbox', 'pendientes'], icon: ListTodo },
    { id: 'block:toggle', label: 'Lista desplegable', keywords: ['plegable', 'toggle'], icon: ChevronDown },
    { id: 'block:quote', label: 'Cita', keywords: ['bloque de cita'], icon: Quote },
    { id: 'block:callout-icon', label: 'Cita destacada con icono', keywords: ['aviso', 'callout', 'icono'], icon: Quote },
    { id: 'block:callout-plain', label: 'Cita destacada', keywords: ['aviso', 'callout', 'color'], icon: Quote },
    { id: 'block:highlight', label: 'Destacado', keywords: ['resaltar', 'marca'], icon: Highlighter },
    { id: 'block:table', label: 'Tabla', keywords: ['filas', 'columnas', 'tabla'], icon: TableIcon },
    { id: 'block:code', label: 'Código', keywords: ['programación', 'pre'], icon: Code2 },
    { id: 'block:divider', label: 'Divisor', keywords: ['línea', 'separador'], icon: Minus },
    { id: 'block:image', label: 'Imagen', keywords: ['foto', 'archivo', 'media'], icon: ImageIcon },
    { id: 'block:equation', label: 'Ecuación en bloque', keywords: ['math', 'fórmula'], icon: Sigma },
    ...[2, 3, 4, 5].map((count) => ({ id: `block:columns:${count}`, label: `${count} columnas`, keywords: ['columnas', 'diseño'], icon: Columns3 })),
  ],
}];

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
function safeBlockColor(value: string | null | undefined): string | null {
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
function safeLanguage(value: string | null): string {
  return value && LANGUAGE_IDS.has(value) ? value : 'plaintext';
}
interface EditorTableData { caption: string; headers: string[]; rows: string[][] }
const EMPTY_TABLE: EditorTableData = {
  caption: 'Tabla',
  headers: ['Columna 1', 'Columna 2', 'Columna 3'],
  rows: [['', '', ''], ['', '', '']],
};
function normalizeTableData(value: unknown): EditorTableData {
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
function tableDataFromBlock(block: HTMLElement): EditorTableData {
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
function mountTableBlocks(root: HTMLElement): void {
  for (const [block, app] of tableApps) {
    if (!root.contains(block)) {
      app.unmount();
      tableApps.delete(block);
    }
  }
  root.querySelectorAll<HTMLElement>('.knote-table-block').forEach((block) => {
    if (tableApps.has(block)) return;
    const data = tableDataFromBlock(block);
    block.replaceChildren();
    block.dataset.caption = data.caption;
    block.dataset.knoteTable = JSON.stringify(data);
    const app = createApp(TableBlockEditor, { model: data, onChange: () => emitDocument() });
    app.mount(block);
    tableApps.set(block, app);
  });
}
function unmountTableBlocks(): void {
  tableApps.forEach((app) => app.unmount());
  tableApps.clear();
}
function calloutGlyph(value: string | null | undefined): string {
  const nodes: IconNode = CALL_OUT_ICONS.find((icon) => icon.id === value)?.node || CALL_OUT_ICONS[0].node;
  const children = nodes.map(([tag, attributes]) => {
    const safeAttributes = Object.entries(attributes).map(([name, attribute]) => `${name}="${escapeHtml(String(attribute))}"`).join(' ');
    return `<${tag}${safeAttributes ? ` ${safeAttributes}` : ''}></${tag}>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${children}</svg>`;
}
function sanitizeNodes(nodes: NodeListOf<ChildNode> | ChildNode[]): string {
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

function initialHtml(value: string): string {
  if (value.startsWith(RICH_PREFIX)) {
    const parsed = new DOMParser().parseFromString(value.slice(RICH_PREFIX.length), 'text/html');
    return sanitizeNodes(Array.from(parsed.body.childNodes));
  }
  return legacyMarkdownToHtml(value);
}

function rootElement(): HTMLElement | null { return editor.value; }
function directBlock(node: Node | null): HTMLElement | null {
  const root = rootElement();
  if (!root || !node) return null;
  let element = node instanceof HTMLElement ? node : node.parentElement;
  while (element && element !== root) {
    const callout = element.closest('.knote-callout');
    if (callout instanceof HTMLElement && root.contains(callout)) return callout;
    // A list is one editor block. Returning each LI here created a fresh
    // manager for every line and made dragging/deleting a list unpredictable.
    if (element instanceof HTMLLIElement && element.parentElement
      && ['UL', 'OL'].includes(element.parentElement.tagName)) return element.parentElement;
    if (['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR', 'DETAILS', 'FIGURE'].includes(element.tagName)) return element;
    if (element instanceof HTMLDivElement && (element.classList.contains('knote-table-block') || element.classList.contains('knote-preview-columns') || element.classList.contains('knote-equation'))) return element;
    if (element.parentElement === root && element.tagName !== 'DIV') return element;
    if (element.parentElement === root && element.tagName === 'DIV'
      && (element.classList.contains('knote-callout') || element.classList.contains('knote-table-block') || element.classList.contains('knote-preview-columns') || element.classList.contains('knote-equation'))) return element;
    element = element.parentElement;
  }
  return null;
}
function nearestBlockAtY(clientY: number): HTMLElement | null {
  const root = rootElement();
  if (!root) return null;
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(
    'p, h1, h2, h3, h4, ul, ol, blockquote, pre, hr, details, figure, .knote-callout, .knote-table-block, .knote-preview-columns, .knote-equation',
  )).filter((candidate) => directBlock(candidate) === candidate);
  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestHeight = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    const style = getComputedStyle(candidate);
    const margin = Math.max(8, Number.parseFloat(style.marginTop) || 0, Number.parseFloat(style.marginBottom) || 0);
    if (distance > margin) continue;
    if (distance < nearestDistance || (distance === nearestDistance && rect.height < nearestHeight)) {
      nearest = candidate;
      nearestDistance = distance;
      nearestHeight = rect.height;
    }
  }
  return nearest;
}
function blockAtPointer(target: Element, clientY: number): HTMLElement | null {
  const root = rootElement();
  const block = directBlock(target);
  if (block) return block;
  if (!root || (!root.contains(target) && target !== shell.value)) return null;
  return nearestBlockAtY(clientY);
}
function editorHitAreaContains(clientX: number): boolean {
  const bounds = shell.value?.getBoundingClientRect();
  if (!bounds) return false;
  const sideReach = window.innerWidth <= 680 ? 12 : 90;
  return clientX >= bounds.left - sideReach && clientX <= bounds.right + sideReach;
}
function showBlockActions(block: HTMLElement): void {
  if (hoveredBlock.value === block) return;
  hoveredBlock.value = block;
  blockActionsPosition.value = blockActionsAt(block);
}
function canDropBlock(dragged: HTMLElement, target: HTMLElement): boolean {
  if (dragged === target || dragged.contains(target) || !dragged.parentElement || !target.parentElement) return false;
  if (dragged instanceof HTMLLIElement) {
    return target instanceof HTMLLIElement
      && ['UL', 'OL'].includes(dragged.parentElement.tagName)
      && ['UL', 'OL'].includes(target.parentElement.tagName);
  }
  if (target instanceof HTMLLIElement || ['UL', 'OL'].includes(target.parentElement.tagName)) return false;
  const isBlockContainer = (element: HTMLElement): boolean =>
    element === rootElement()
    || element.classList.contains('knote-preview-column')
    || (element.tagName === 'DIV' && element.parentElement?.tagName === 'DETAILS');
  return isBlockContainer(dragged.parentElement) && isBlockContainer(target.parentElement);
}
function textBlockAt(node: Node | null): HTMLElement | null {
  const root = rootElement();
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  const line = element?.closest('p, h1, h2, h3, h4, summary, figcaption');
  return line instanceof HTMLElement && root?.contains(line) ? line : directBlock(node);
}
function rememberSelection(allowCollapsed = true): void {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  if (range.collapsed && (!allowCollapsed || formatBlocksOpen.value || linkEditorOpen.value)) return;
  savedRange = range.cloneRange();
  if (!range.collapsed && selection.toString().trim()) {
    savedSelectionText = selection.toString();
    savedSelectedBlocks = resolveSelectedBlocks(root, range, savedSelectionText);
  } else {
    savedSelectionText = '';
    savedSelectedBlocks = [];
  }
}
function restoreSelection(): Range | null {
  const root = rootElement();
  if (!root || !savedRange || !root.contains(savedRange.startContainer) || !root.contains(savedRange.endContainer)) return null;
  root.focus({ preventScroll: true });
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(savedRange);
  return savedRange;
}
function scheduleSelectionUpdate(): void {
  if (selectionFrame) cancelAnimationFrame(selectionFrame);
  selectionFrame = requestAnimationFrame(() => {
    selectionFrame = 0;
    updateSelectionToolbar();
    if (hoveredBlock.value?.isConnected) blockActionsPosition.value = blockActionsAt(hoveredBlock.value);
    if (activeImage.value?.isConnected) imageResizePosition.value = imageResizeHandlesAt(activeImage.value);
  });
}
function updateHoveredBlockFromSelection(): void {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || document.activeElement !== root || !selection?.anchorNode || !root.contains(selection.anchorNode)) return;
  const block = directBlock(selection.anchorNode);
  if (!block) return;
  hoveredBlock.value = block;
  blockActionsPosition.value = blockActionsAt(block);
}
function handleEditorFocus(): void {
  void nextTick(updateHoveredBlockFromSelection);
}
function handleEditorKeyup(): void {
  updateHoveredBlockFromSelection();
  scheduleSelectionUpdate();
}
function isBlankParagraph(element: HTMLElement): boolean {
  if (!['P', 'DIV'].includes(element.tagName) || element.textContent?.trim()) return false;
  return Array.from(element.childNodes).every((node) =>
    node.nodeName === 'BR' || (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()),
  );
}
function hasMeaningfulContent(root: HTMLElement): boolean {
  if (root.innerText.trim()) return true;
  return Array.from(root.children).some((child) => !isBlankParagraph(child as HTMLElement));
}
function updateEditorPlaceholder(root: HTMLElement): void {
  const isBlank = !hasMeaningfulContent(root);
  root.dataset.blank = String(isBlank);
  Array.from(root.children).forEach((child) => child.removeAttribute('data-knote-editor-placeholder'));
  if (!isBlank) return;
  const blankBlock = Array.from(root.children).find((child) => isBlankParagraph(child as HTMLElement));
  blankBlock?.setAttribute('data-knote-editor-placeholder', props.placeholder || 'Empieza a escribir…');
}
function bookmarkEditorSelection(root: HTMLElement): () => void {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return () => undefined;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return () => undefined;

  const endMarker = range.collapsed ? null : document.createComment('knote-selection-end');
  if (endMarker) {
    const end = range.cloneRange();
    end.collapse(false);
    end.insertNode(endMarker);
  }
  const startMarker = document.createComment('knote-selection-start');
  const start = range.cloneRange();
  start.collapse(true);
  start.insertNode(startMarker);

  return () => {
    if (!root.contains(startMarker)) {
      endMarker?.remove();
      return;
    }
    const restored = document.createRange();
    restored.setStartBefore(startMarker);
    if (endMarker && root.contains(endMarker)) restored.setEndBefore(endMarker);
    else restored.collapse(true);
    startMarker.remove();
    endMarker?.remove();
    selection.removeAllRanges();
    selection.addRange(restored);
  };
}
function normalizeEditorDom(root: HTMLElement): void {
  const restoreSelection = bookmarkEditorSelection(root);
  try {
    Array.from(root.children).forEach((child) => {
      if (child.tagName !== 'DIV' || child.classList.contains('knote-callout') || child.classList.contains('knote-table-block') || child.classList.contains('knote-preview-columns') || child.classList.contains('knote-equation')) return;
      const wrapsBlocks = Array.from(child.children).some((nested) => /^(P|H1|H2|H3|H4|UL|OL|BLOCKQUOTE|PRE|DETAILS|FIGURE|HR)$/.test(nested.tagName));
      if (wrapsBlocks) child.replaceWith(...Array.from(child.childNodes));
      else {
        const paragraph = document.createElement('p');
        paragraph.replaceChildren(...Array.from(child.childNodes));
        if (!paragraph.childNodes.length) paragraph.append(document.createElement('br'));
        child.replaceWith(paragraph);
      }
    });
    root.querySelectorAll<HTMLElement>('.knote-callout').forEach((callout) => {
      let body = callout.querySelector<HTMLElement>(':scope > p');
      if (!body) { body = blankElement('p'); callout.append(body); }
      callout.dataset.empty = String(!body.textContent?.trim());
    });
    root.querySelectorAll<HTMLElement>('pre').forEach((code) => { code.dataset.empty = String(!code.textContent?.trim()); });
    root.querySelectorAll<HTMLElement>('.knote-equation').forEach((equation) => { equation.dataset.empty = String(!equation.textContent?.trim()); });
    root.querySelectorAll<HTMLElement>('blockquote').forEach((quote) => { quote.dataset.empty = String(!quote.textContent?.trim()); });
    root.querySelectorAll<HTMLElement>('details').forEach((details) => {
      let summary = details.querySelector<HTMLElement>(':scope > summary');
      if (!summary) { summary = document.createElement('summary'); details.prepend(summary); }
      if (!summary.textContent?.trim()) summary.textContent = 'Mostrar contenido';
    });
    root.querySelectorAll<HTMLElement>('figure.knote-image-block').forEach((figure) => { if (!figure.querySelector('img')) figure.remove(); });
    root.querySelectorAll<HTMLElement>('ul, ol').forEach((list) => { if (!list.querySelector(':scope > li')) list.remove(); });
    Array.from(root.children).forEach((child) => {
      const previous = child.previousElementSibling;
      if (previous && previous.tagName === child.tagName && ['UL', 'OL'].includes(child.tagName)) {
        previous.append(...Array.from(child.children));
        child.remove();
      }
    });
  } finally {
    restoreSelection();
  }
}
function updateSelectionToolbar(): void {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount) { selectionOpen.value = false; return; }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  const selectedText = selection.toString();
  if (range.collapsed || !selectedText.trim()) {
    if (!formatBlocksOpen.value && !linkEditorOpen.value) {
      savedRange = range.cloneRange();
      savedSelectionText = '';
      savedSelectedBlocks = [];
    }
    selectionOpen.value = false;
    linkEditorOpen.value = false;
    return;
  }
  savedRange = range.cloneRange();
  savedSelectionText = selectedText;
  savedSelectedBlocks = resolveSelectedBlocks(root, range, selectedText);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width || rect.height);
  const rect = rects[rects.length - 1] || range.getBoundingClientRect();
  const viewportPadding = 8;
  const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
  const width = Math.min(toolbar.value?.offsetWidth || 342, availableWidth);
  const height = toolbar.value?.offsetHeight || 44;
  const rightCandidate = rect.right + 12;
  const leftCandidate = rect.left - width - 12;
  let left: number;
  let top: number;

  if (rightCandidate + width <= window.innerWidth - viewportPadding) {
    left = rightCandidate;
    top = rect.top + rect.height / 2 - height / 2;
  } else if (leftCandidate >= viewportPadding) {
    left = leftCandidate;
    top = rect.top + rect.height / 2 - height / 2;
  } else {
    left = Math.max(viewportPadding, Math.min(window.innerWidth - width - viewportPadding, rect.left + rect.width / 2 - width / 2));
    const above = rect.top - height - 10;
    const below = rect.bottom + 10;
    if (above >= 56) top = above;
    else if (below + height <= window.innerHeight - viewportPadding) top = below;
    else top = rect.top + rect.height / 2 - height / 2;
  }

  const maxTop = Math.max(56, window.innerHeight - height - viewportPadding);
  toolbarPosition.value = {
    left: `${Math.max(viewportPadding, Math.min(window.innerWidth - width - viewportPadding, left))}px`,
    top: `${Math.max(56, Math.min(maxTop, top))}px`,
  };
  selectionOpen.value = true;
}
function emitDocument(normalize = true): void {
  const root = rootElement();
  if (!root) return;
  if (normalize) normalizeEditorDom(root);
  if ((activeCodeBlock.value && !root.contains(activeCodeBlock.value))
    || (activeCallout.value && !root.contains(activeCallout.value))
    || (activeImage.value && !root.contains(activeImage.value))) clearActiveComponentSettings();
  mountTableBlocks(root);
  const hasContent = hasMeaningfulContent(root);
  const html = hasContent ? sanitizeNodes(Array.from(root.childNodes)) : '';
  updateEditorPlaceholder(root);
  lastModelValue = RICH_PREFIX + html;
  emit('update:modelValue', lastModelValue);
}
async function hydrateImageAssets(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-asset-id]'));
  await Promise.all(images.map(async (image) => {
    const id = image.dataset.assetId;
    if (!id || image.src.startsWith('blob:')) return;
    try {
      const asset = await getBlockImage(id);
      if (!asset || !root.contains(image)) return;
      const objectUrl = URL.createObjectURL(asset);
      imageObjectUrls.add(objectUrl);
      image.src = objectUrl;
    } catch { /* Keep the block in place when a local asset is unavailable. */ }
  }));
  scheduleSelectionUpdate();
}
function requestImageInsertion(anchor: HTMLElement | null): void {
  insertionAnchor.value = anchor;
  if (anchor) imagePickerPosition.value = positionInsideShell(anchor, Math.max(6, anchor.getBoundingClientRect().height + 6));
  else imagePickerPosition.value = { left: '36px', top: '8px' };
  imageError.value = '';
  selectedImageFiles.value = [];
  imagePickerOpen.value = true;
  blockMenuOpen.value = false;
  codeLanguageMenuOpen.value = false;
}
function insertImageFile(file: File): void {
  const root = rootElement();
  if (!root || !file.type.startsWith('image/')) {
    imageError.value = 'Elige un archivo de imagen.';
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    imageError.value = 'La imagen supera el límite de 12 MB.';
    return;
  }
  void (async () => {
    try {
      const optimizedImage = await optimizeEditorImage(file);
      const id = await saveBlockImage(optimizedImage);
      const src = URL.createObjectURL(optimizedImage);
      imageObjectUrls.add(src);
      const figure = document.createElement('figure');
      figure.className = 'knote-image-block';
      figure.dataset.width = '100';
      figure.dataset.offset = '0';
      figure.style.setProperty('--knote-image-width', '100%');
      figure.style.setProperty('--knote-image-offset', '0%');
      const image = document.createElement('img');
      image.dataset.assetId = id;
      image.addEventListener('load', scheduleSelectionUpdate, { once: true });
      image.src = src;
      image.alt = file.name.replace(/\.[^.]+$/, '');
      image.contentEditable = 'false';
      const caption = document.createElement('figcaption');
      caption.append(document.createElement('br'));
      caption.dataset.placeholder = 'Añade un pie de foto…';
      figure.append(image, caption);

      let anchor = insertionAnchor.value;
      if (anchor instanceof HTMLLIElement && anchor.parentElement && ['UL', 'OL'].includes(anchor.parentElement.tagName)) anchor = anchor.parentElement;
      if (anchor && !root.contains(anchor)) anchor = null;
      const trailingParagraph = blankElement('p');
      if (anchor?.parentNode) {
        if (isBlankParagraph(anchor)) anchor.replaceWith(figure, trailingParagraph);
        else anchor.after(figure, trailingParagraph);
      } else root.append(figure, trailingParagraph);

      imagePickerOpen.value = false;
      insertionAnchor.value = null;
      selectedImageFiles.value = [];
      imageError.value = '';
      placeCaretAtEnd(trailingParagraph);
      emitDocument();
      scheduleSelectionUpdate();
    } catch {
      imageError.value = 'No se pudo guardar la imagen en este dispositivo.';
    }
  })();
}
async function optimizeEditorImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / bitmap.width, 1800 / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('No se pudo preparar la imagen.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (quality: number) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.')), 'image/webp', quality);
  });
  let blob = await encode(.88);
  if (blob.size > 4 * 1024 * 1024) blob = await encode(.8);
  if (blob.size > 6 * 1024 * 1024) throw new Error('La imagen sigue siendo demasiado grande después de optimizarla.');
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}
function handleImageSelection(files: readonly File[]): void {
  selectedImageFiles.value = files;
  if (files[0]) insertImageFile(files[0]);
}
function insertBlockAt(anchor: HTMLElement | null, id: string): void {
  const root = rootElement();
  if (!root || id === 'block:image') { requestImageInsertion(anchor); return; }
  const listItem = anchor instanceof HTMLLIElement ? anchor : null;
  const list = listItem?.parentElement;
  if (listItem && list && id === 'block:task' && list.tagName === 'UL') {
    const taskList = createBlock('block:task').querySelector('li') as HTMLLIElement;
    listItem.after(taskList);
    placeCaretAtEnd(taskList);
    emitDocument();
    scheduleSelectionUpdate();
    return;
  }
  if (listItem && list && id === 'block:bullet' && list.tagName === 'UL' && !listItem.hasAttribute('data-task')) {
    const item = document.createElement('li');
    item.append(document.createElement('br'));
    listItem.after(item);
    placeCaretAtEnd(item);
    emitDocument();
    scheduleSelectionUpdate();
    return;
  }
  if (listItem && list && id === 'block:numbered' && list.tagName === 'OL') {
    const item = document.createElement('li');
    item.append(document.createElement('br'));
    listItem.after(item);
    placeCaretAtEnd(item);
    emitDocument();
    scheduleSelectionUpdate();
    return;
  }

  let target = anchor;
  if (target instanceof HTMLLIElement && target.parentElement && ['UL', 'OL'].includes(target.parentElement.tagName)) target = target.parentElement;
  if (target && !root.contains(target)) target = null;
  const block = createBlock(id);
  const trailing = block.tagName === 'HR' ? blankElement('p') : null;
  if (target?.parentNode) {
    if (isBlankParagraph(target)) target.replaceWith(...(trailing ? [block, trailing] : [block]));
    else target.after(...(trailing ? [block, trailing] : [block]));
  } else root.append(...(trailing ? [block, trailing] : [block]));
  if (id === 'block:table') mountTableBlocks(root);
  blockMenuOpen.value = false;
  insertionAnchor.value = null;
  const caretTarget = trailing || block;
  placeCaretAtEnd(caretTarget);
  emitDocument();
  scheduleSelectionUpdate();
}
function positionInsideShell(element: HTMLElement, topOffset = 0, align: 'start' | 'end' = 'start'): { left: string; top: string } {
  const bounds = shell.value?.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  if (!bounds) return { left: '0px', top: '0px' };
  const width = shell.value?.clientWidth || 0;
  const left = align === 'end' ? Math.max(0, Math.min(width - 240, rect.right - bounds.left - 240)) : Math.max(0, rect.left - bounds.left);
  return { left: `${left}px`, top: `${Math.max(0, rect.top - bounds.top + topOffset)}px` };
}
function blockActionsAt(block: HTMLElement): { left: string; right?: string; top: string } {
  const bounds = shell.value?.getBoundingClientRect();
  if (!bounds) return { left: '-3.75rem', top: '0px' };
  const rect = block.getBoundingClientRect();
  const actionsWidth = shell.value?.querySelector<HTMLElement>('.knote-block-actions')?.offsetWidth || 68;
  const actionsHeight = shell.value?.querySelector<HTMLElement>('.knote-block-actions')?.offsetHeight || 36;
  const lineHeight = Number.parseFloat(getComputedStyle(block).lineHeight);
  const offset = Number.isFinite(lineHeight) ? (lineHeight - actionsHeight) / 2 : 0;
  const compactPlacement = window.innerWidth <= 680;
  const sideRailFits = !compactPlacement && bounds.left >= actionsWidth + 18;
  const left = sideRailFits ? -(actionsWidth + 10) : compactPlacement ? 0 : Math.max(0, rect.left - bounds.left);
  const top = rect.top - bounds.top + (sideRailFits || compactPlacement ? offset : -actionsHeight - 8);
  return { left: `${left}px`, top: `${top}px` };
}
function handleBlockContextSelection(selection: MenuSelection): void {
  if (selection.id === 'delete-block') deleteContextTargetBlock();
}
function rememberBlockContextTarget(): void {
  contextTargetBlock.value = hoveredBlock.value;
}
function deleteContextTargetBlock(): void {
  const block = contextTargetBlock.value;
  const root = rootElement();
  if (!block || !root?.contains(block) || !block.parentElement) return;
  const parent = block.parentElement;
  const isList = parent.tagName === 'UL' || parent.tagName === 'OL';
  const isQuote = parent.tagName === 'BLOCKQUOTE';
  const nextInParent = block.nextElementSibling;
  const previousInParent = block.previousElementSibling;
  const wrapperFallback = isList || isQuote ? parent.nextElementSibling || parent.previousElementSibling : null;
  if (activeCodeBlock.value === block || activeCallout.value === block || activeImage.value === block) clearActiveComponentSettings();
  block.remove();
  if (isList && !parent.querySelector(':scope > li')) parent.remove();
  if (isQuote && !parent.children.length && !parent.textContent?.trim()) parent.remove();

  const candidate = (nextInParent || previousInParent || wrapperFallback) as HTMLElement | null;
  const focusTarget = candidate && root.contains(candidate)
    ? candidate
    : (() => {
      const paragraph = document.createElement('p');
      paragraph.append(document.createElement('br'));
      root.append(paragraph);
      return paragraph;
    })();
  contextTargetBlock.value = null;
  hoveredBlock.value = focusTarget;
  blockActionsPosition.value = blockActionsAt(focusTarget);
  placeCaretAtEnd(focusTarget);
  emitDocument();
  scheduleSelectionUpdate();
}
function openBlockMenu(): void {
  const block = hoveredBlock.value;
  if (!block) return;
  insertionAnchor.value = block;
  const rect = block.getBoundingClientRect();
  const bounds = shell.value?.getBoundingClientRect();
  const width = shell.value?.clientWidth || 320;
  blockMenuPosition.value = {
    left: `${Math.max(0, Math.min(width - 320, rect.left - (bounds?.left || 0)))}px`,
    top: `${Math.max(0, rect.bottom - (bounds?.top || 0) + 5)}px`,
  };
  blockMenuQuery.value = '';
  blockMenuOpen.value = true;
  void nextTick(() => shell.value?.querySelector<HTMLElement>('.knote-block-insert-menu [data-balsa="command-menu"] input')?.focus({ preventScroll: true }));
}
function handleBlockMenuSelection(item: CommandItem): void {
  if (item.id.startsWith('block:')) insertBlockAt(insertionAnchor.value, item.id);
}
function updateCalloutColor(color: string): void {
  const callout = activeCallout.value;
  const safeColor = safeBlockColor(color);
  if (!callout || !safeColor) return;
  callout.dataset.knoteColor = safeColor;
  callout.style.setProperty('--knote-callout-color', safeColor);
  calloutColorDraft.value = safeColor;
  emitDocument();
}
function handleCalloutIconSelection(item: MenuSelection): void {
  const prefix = 'callout-icon:';
  if (!item.id.startsWith(prefix) || !activeCallout.value) return;
  const icon = item.id.slice(prefix.length);
  if (!CALL_OUT_ICONS.some((candidate) => candidate.id === icon)) return;
  activeCallout.value.dataset.knoteIcon = icon;
  const mark = activeCallout.value.querySelector<HTMLElement>(':scope > .knote-callout-icon');
  if (mark) {
    mark.dataset.knoteIcon = icon;
    mark.innerHTML = calloutGlyph(icon);
  }
  emitDocument();
}
function imageResizeHandlesAt(figure: HTMLElement): { left: string; top: string; width: string; height: string } {
  const bounds = shell.value?.getBoundingClientRect();
  const imageRect = figure.querySelector('img')?.getBoundingClientRect() || figure.getBoundingClientRect();
  if (!bounds) return { left: '0px', top: '0px', width: '0px', height: '0px' };
  return {
    left: `${imageRect.left - bounds.left}px`, top: `${imageRect.top - bounds.top}px`,
    width: `${imageRect.width}px`, height: `${imageRect.height}px`,
  };
}
function applyImageResize(event: PointerEvent): void {
  const state = imageResizeState;
  if (!state || event.pointerId !== state.pointerId) return;
  const direction = state.direction;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  const horizontal = direction.includes('e') ? dx : direction.includes('w') ? -dx : 0;
  const vertical = direction.includes('n') ? -dy * state.ratio : direction.includes('s') ? dy * state.ratio : 0;
  const delta = horizontal && vertical ? (Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical) : horizontal || vertical;
  const minWidth = Math.min(96, state.parentWidth);
  const nextWidth = Math.min(state.parentWidth, Math.max(minWidth, state.startWidth + delta));
  const widthPercent = Math.max(20, Math.min(100, Math.round((nextWidth / state.parentWidth) * 1000) / 10));
  const nextOffset = direction.includes('w')
    ? Math.max(0, Math.min(state.parentWidth - nextWidth, state.startOffset + state.startWidth - nextWidth))
    : state.startOffset;
  const offsetPercent = Math.min(100 - widthPercent, Math.max(0, Math.round((nextOffset / state.parentWidth) * 1000) / 10));
  state.figure.dataset.width = String(widthPercent);
  state.figure.dataset.offset = String(offsetPercent);
  state.figure.style.setProperty('--knote-image-width', `${widthPercent}%`);
  state.figure.style.setProperty('--knote-image-offset', `${offsetPercent}%`);
  imageResizePosition.value = imageResizeHandlesAt(state.figure);
}
function finishImageResize(event?: PointerEvent): void {
  const state = imageResizeState;
  if (!state || (event && event.pointerId !== state.pointerId)) return;
  imageResizeState = null;
  document.removeEventListener('pointermove', applyImageResize);
  document.removeEventListener('pointerup', finishImageResize);
  document.removeEventListener('pointercancel', finishImageResize);
  emitDocument();
}
function startImageResize(event: PointerEvent, direction: (typeof imageResizeDirections)[number]): void {
  const figure = activeImage.value;
  if (!figure || event.button !== 0) return;
  const image = figure.querySelector<HTMLImageElement>('img');
  const parentWidth = Math.max(1, figure.parentElement?.clientWidth || shell.value?.clientWidth || figure.clientWidth);
  const rect = figure.getBoundingClientRect();
  const startOffset = parentWidth * (Number.parseFloat(figure.dataset.offset || '0') / 100);
  const ratio = image?.naturalWidth && image.naturalHeight
    ? image.naturalWidth / image.naturalHeight
    : rect.width / Math.max(1, image?.getBoundingClientRect().height || rect.height);
  imageResizeState = {
    pointerId: event.pointerId,
    figure,
    direction,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startOffset,
    parentWidth,
    ratio: Math.max(.1, ratio),
  };
  event.preventDefault();
  document.addEventListener('pointermove', applyImageResize, { passive: false });
  document.addEventListener('pointerup', finishImageResize);
  document.addEventListener('pointercancel', finishImageResize);
}
function clearActiveComponentSettings(): void {
  activeCodeBlock.value = null;
  activeCallout.value = null;
  activeImage.value = null;
  codeLanguageMenuOpen.value = false;
  calloutToolsPinned.value = false;
  imageToolsPinned.value = false;
  calloutIconMenuOpen.value = false;
}
function handleComponentContextMenu(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const root = rootElement();
  if (!target || !root) return;
  const code = target.closest('pre');
  const callout = target.closest('.knote-callout');
  const image = target.closest('figure.knote-image-block');
  const nextCode = code instanceof HTMLElement && root.contains(code) ? code : null;
  const nextCallout = callout instanceof HTMLElement && root.contains(callout) ? callout : null;
  const nextImage = image instanceof HTMLElement && root.contains(image) ? image : null;
  if (!nextCode && !nextCallout && !nextImage) {
    if (shell.value?.contains(target)) clearActiveComponentSettings();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  activeCodeBlock.value = nextCode;
  activeCallout.value = nextCallout;
  activeImage.value = nextImage;
  codeLanguageMenuOpen.value = false;
  calloutIconMenuOpen.value = false;
  calloutToolsPinned.value = Boolean(nextCallout);
  imageToolsPinned.value = Boolean(nextImage);
  if (nextCode) codeToolbarPosition.value = positionInsideShell(nextCode, -42);
  if (nextCallout) {
    calloutColorDraft.value = safeBlockColor(nextCallout.dataset.knoteColor) || '#cbd5e1';
    calloutToolsPosition.value = positionInsideShell(nextCallout, -38, 'end');
  }
  if (nextImage) {
    imageToolbarPosition.value = positionInsideShell(nextImage, -48);
    imageResizePosition.value = imageResizeHandlesAt(nextImage);
  }
}
function handleEditorPointerOver(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.knote-editor-control')) return;
  const root = rootElement();
  if (!root) return;

  const block = blockAtPointer(target, event.clientY);
  if (block) showBlockActions(block);
}
const calloutToolsPosition = ref({ left: '0px', top: '0px' });
function handleEditorPointerLeave(event: PointerEvent): void {
  const relatedTarget = event.relatedTarget;
  if (blockContextMenuOpen.value || blockMenuOpen.value || imagePickerOpen.value || codeLanguageMenuOpen.value || calloutToolsPinned.value || imageToolsPinned.value) return;
  if (relatedTarget instanceof Node && shell.value?.contains(relatedTarget)) return;
  if (relatedTarget instanceof Element && relatedTarget.closest('.knote-editor-control, [data-balsa="menu-list"]')) return;
  if (editorHitAreaContains(event.clientX)) {
    const block = nearestBlockAtY(event.clientY);
    if (block) { showBlockActions(block); return; }
  }
  hoveredBlock.value = null;
}
function handleEditorPointerMove(event: PointerEvent): void {
  if (event.pointerType === 'touch') return;
  const target = event.target;
  if (target instanceof Element && target.closest('.knote-editor-control')) return;
  if (editorHitAreaContains(event.clientX)) {
    const block = nearestBlockAtY(event.clientY);
    if (block) { showBlockActions(block); return; }
  }
  if (editor.value !== document.activeElement && !blockContextMenuOpen.value && !blockMenuOpen.value) hoveredBlock.value = null;
}
function beginBlockPointerDrag(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || !hoveredBlock.value) return;
  const root = rootElement();
  dropBlockRects = new Map(
    Array.from(root?.querySelectorAll<HTMLElement>(
      'p, h1, h2, h3, h4, ul, ol, blockquote, pre, hr, details, figure, .knote-callout, .knote-table-block, .knote-preview-columns, .knote-equation',
    ) ?? [])
      .filter((block) => directBlock(block) === block)
      .map((block) => {
        const rect = block.getBoundingClientRect();
        return [block, { documentTop: rect.top + window.scrollY, height: rect.height }] as const;
      }),
  );
  event.preventDefault();
  blockPointerDrag = { pointerId: event.pointerId, block: hoveredBlock.value, startX: event.clientX, startY: event.clientY };
  try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch { /* Document listeners still handle browsers without pointer capture. */ }
  document.addEventListener('pointermove', handleBlockPointerMove, { passive: false });
  document.addEventListener('pointerup', handleBlockPointerUp);
  document.addEventListener('pointercancel', handleBlockPointerUp);
}
function updateDropPlaceholder(target: HTMLElement, clientY: number): void {
  const placeholder = dropPlaceholder;
  const targetParent = target.parentElement;
  if (!placeholder || !targetParent) return;
  if (dropAnchorTarget !== target || !dropAnchorRect) {
    const rect = target.getBoundingClientRect();
    const initial = dropBlockRects.get(target);
    dropAnchorTarget = target;
    dropAnchorRect = {
      top: initial ? initial.documentTop - window.scrollY : rect.top,
      height: initial?.height ?? rect.height,
    };
  }
  const middle = dropAnchorRect.top + dropAnchorRect.height / 2;
  let after = clientY > middle;
  const dragged = draggedBlock.value ?? blockPointerDrag?.block;
  if (Math.abs(clientY - middle) <= 1 && dragged?.parentElement === target.parentElement) {
    // Dropping on the midpoint of the adjacent block must still allow the
    // dragged block to leave its current slot.
    if (dragged.nextElementSibling === target) after = true;
    else if (target.nextElementSibling === dragged) after = false;
  }
  const reference = after ? target.nextSibling : target;
  if (reference !== placeholder) targetParent.insertBefore(placeholder, reference);
}
function dropTargetAtPointer(clientX: number, clientY: number): HTMLElement | null {
  const element = document.elementFromPoint(clientX, clientY);
  const direct = element ? directBlock(element) : null;
  if (direct) return direct;
  const root = rootElement();
  const bounds = shell.value?.getBoundingClientRect();
  const dragged = draggedBlock.value ?? blockPointerDrag?.block;
  if (!root || !bounds || !editorHitAreaContains(clientX)) return null;
  const verticalReach = Math.max(64, Number.parseFloat(getComputedStyle(root).lineHeight) || 24);
  if (clientY < bounds.top - verticalReach || clientY > bounds.bottom + verticalReach) return null;

  // Resolve empty gaps and the space after the final block to the nearest
  // compatible block so the insertion marker can reach every slot.
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(
    'p, h1, h2, h3, h4, ul, ol, blockquote, pre, hr, details, figure, .knote-callout, .knote-table-block, .knote-preview-columns, .knote-equation',
  )).filter((candidate) =>
    directBlock(candidate) === candidate
    && (!dragged || canDropBlock(dragged, candidate)),
  );
  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestHeight = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    if (distance < nearestDistance || (distance === nearestDistance && rect.height < nearestHeight)) {
      nearest = candidate;
      nearestDistance = distance;
      nearestHeight = rect.height;
    }
  }
  return nearest;
}
function createBlockDragPreview(block: HTMLElement, width: number): void {
  const preview = document.createElement('div');
  preview.className = 'knote-block-editor knote-block-drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.setAttribute('contenteditable', 'false');
  preview.style.width = `${Math.max(80, Math.min(width, window.innerWidth - 24))}px`;
  const clone = block.cloneNode(true) as HTMLElement;
  clone.classList.remove('knote-block-dragging');
  clone.removeAttribute('id');
  clone.querySelectorAll<HTMLElement>('[id]').forEach((element) => element.removeAttribute('id'));
  clone.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]').forEach((element) => element.tabIndex = -1);
  preview.append(clone);
  document.body.append(preview);
  blockDragPreview = preview;
}
function positionBlockDragPreview(clientX: number, clientY: number): void {
  if (!blockDragPreview) return;
  const gap = 14;
  const margin = 8;
  const width = blockDragPreview.offsetWidth;
  const height = blockDragPreview.offsetHeight;
  let left = clientX + gap;
  let top = clientY + gap;
  if (left + width > window.innerWidth - margin) left = clientX - width - gap;
  left = Math.max(margin, Math.min(window.innerWidth - width - margin, left));
  if (top + height > window.innerHeight - margin) top = window.innerHeight - height - margin;
  blockDragPreview.style.left = `${left}px`;
  blockDragPreview.style.top = `${Math.max(margin, top)}px`;
}
function commitDropPlaceholder(dragged: HTMLElement): boolean {
  if (!dropPlaceholder?.parentElement) return false;
  const destination = dropPlaceholder.parentElement;
  const reference = dropPlaceholder.nextSibling;
  const source = dragged.parentElement;
  dropPlaceholder.remove();
  destination.insertBefore(dragged, reference === dragged ? dragged : reference);
  if (source && source !== destination && ['UL', 'OL'].includes(source.tagName) && !source.querySelector(':scope > li')) source.remove();
  return true;
}
function handleBlockPointerMove(event: PointerEvent): void {
  const state = blockPointerDrag;
  if (!state || event.pointerId !== state.pointerId) return;
  if (!draggedBlock.value && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 5) return;
  if (!draggedBlock.value) {
    const blockWidth = state.block.getBoundingClientRect().width;
    draggedBlock.value = state.block;
    state.block.classList.add('knote-block-dragging');
    rootElement()?.classList.add('knote-reordering');
    dropPlaceholder = document.createElement(state.block instanceof HTMLLIElement ? 'li' : 'div');
    dropPlaceholder.className = 'knote-block-drop-placeholder';
    dropPlaceholder.setAttribute('aria-hidden', 'true');
    dropPlaceholder.setAttribute('contenteditable', 'false');
    state.block.before(dropPlaceholder);
    createBlockDragPreview(state.block, blockWidth);
    dropAnchorTarget = null;
    dropAnchorRect = null;
  }
  event.preventDefault();
  positionBlockDragPreview(event.clientX, event.clientY);
  const target = dropTargetAtPointer(event.clientX, event.clientY);
  if (!target || !canDropBlock(state.block, target)) {
    return;
  }
  updateDropPlaceholder(target, event.clientY);
}
function handleBlockPointerUp(event: PointerEvent): void {
  const state = blockPointerDrag;
  if (!state || event.pointerId !== state.pointerId) return;
  const cancelled = event.type === 'pointercancel';
  const dragged = draggedBlock.value;
  if (!cancelled && dragged && editorHitAreaContains(event.clientX)) {
    const target = dropTargetAtPointer(event.clientX, event.clientY);
    if (target && canDropBlock(dragged, target)) {
      updateDropPlaceholder(target, event.clientY);
      if (dropAnchorTarget && commitDropPlaceholder(dragged)) {
        emitDocument();
        scheduleSelectionUpdate();
      }
    }
  }
  blockPointerDrag = null;
  document.removeEventListener('pointermove', handleBlockPointerMove);
  document.removeEventListener('pointerup', handleBlockPointerUp);
  document.removeEventListener('pointercancel', handleBlockPointerUp);
  finishBlockDrag();
}
function handleEditorDragOver(event: DragEvent): void {
  const dragged = draggedBlock.value;
  const target = dropTargetAtPointer(event.clientX, event.clientY);
  if (!dragged || !target || !canDropBlock(dragged, target)) return;
  event.preventDefault();
  updateDropPlaceholder(target, event.clientY);
}
function finishBlockDrag(): void {
  blockDragPreview?.remove();
  blockDragPreview = null;
  dropPlaceholder?.remove();
  dropPlaceholder = null;
  dropAnchorTarget = null;
  dropAnchorRect = null;
  dropBlockRects.clear();
  draggedBlock.value?.classList.remove('knote-block-dragging');
  rootElement()?.classList.remove('knote-reordering');
  draggedBlock.value = null;
}
function handleEditorDrop(event: DragEvent): void {
  const dragged = draggedBlock.value;
  const target = dropTargetAtPointer(event.clientX, event.clientY);
  if (!dragged || !target || !canDropBlock(dragged, target)) { finishBlockDrag(); return; }
  event.preventDefault();
  updateDropPlaceholder(target, event.clientY);
  commitDropPlaceholder(dragged);
  finishBlockDrag();
  emitDocument();
  scheduleSelectionUpdate();
}
function moveBlockByKeyboard(direction: -1 | 1): void {
  const block = hoveredBlock.value;
  if (!block?.parentElement) return;
  const neighbor = direction < 0 ? block.previousElementSibling : block.nextElementSibling;
  if (!neighbor) return;
  if (direction < 0) neighbor.before(block); else neighbor.after(block);
  blockActionsPosition.value = blockActionsAt(block);
  emitDocument();
  scheduleSelectionUpdate();
}
function handleBlockHandlePointerDown(event: PointerEvent): void {
  rememberBlockContextTarget();
  beginBlockPointerDrag(event);
}
async function copyCode(): Promise<void> {
  const code = activeCodeBlock.value?.querySelector('code')?.innerText || activeCodeBlock.value?.innerText || '';
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    copiedCode.value = true;
    copyCodeUnavailable.value = false;
    window.setTimeout(() => { copiedCode.value = false; }, 1200);
  } catch {
    copyCodeUnavailable.value = true;
    window.setTimeout(() => { copyCodeUnavailable.value = false; }, 3200);
  }
}
function handleCodeLanguageSelection(item: CommandItem): void {
  if (!activeCodeBlock.value || !LANGUAGE_IDS.has(item.id)) return;
  activeCodeBlock.value.dataset.language = item.id;
  codeLanguageMenuOpen.value = false;
  codeLanguageQuery.value = '';
  emitDocument();
}
function languageLabel(block: HTMLElement | null): string {
  const id = safeLanguage(block?.dataset.language || null);
  return LANGUAGES.find(([candidate]) => candidate === id)?.[1] || 'Texto sin formato';
}
function blocksContainingSelection(root: HTMLElement, selectedText: string): HTMLElement[] {
  const normalizedSelection = selectedText.replace(/\s+/g, ' ').trim();
  if (!normalizedSelection) return [];
  const matches: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    if (textNode.textContent?.replace(/\s+/g, ' ').includes(normalizedSelection)) matches.push(textNode as Text);
    textNode = walker.nextNode();
  }
  if (matches.length !== 1) return [];
  const element = matches[0].parentElement;
  const item = element?.closest('li');
  if (item instanceof HTMLLIElement && root.contains(item)) return [item];
  const block = directBlock(matches[0]);
  return block ? [block] : [];
}
function resolveSelectedBlocks(root: HTMLElement, range: Range, selectedText: string): HTMLElement[] {
  const textMatch = blocksContainingSelection(root, selectedText);
  if (textMatch.length) return textMatch;
  const listItemFor = (node: Node): HTMLLIElement | null => {
    const element = node instanceof Element ? node : node.parentElement;
    const item = element?.closest('li');
    return item instanceof HTMLLIElement && root.contains(item) ? item : null;
  };
  const startItem = listItemFor(range.startContainer);
  const endItem = listItemFor(range.endContainer);
  if (startItem && startItem === endItem) return [startItem];
  if (startItem && endItem && startItem.parentElement === endItem.parentElement && startItem.parentElement && ['UL', 'OL'].includes(startItem.parentElement.tagName)) {
    const items = Array.from(startItem.parentElement.children).filter((child): child is HTMLLIElement => child instanceof HTMLLIElement);
    const start = items.indexOf(startItem);
    const end = items.indexOf(endItem);
    if (start >= 0 && end >= 0) return items.slice(Math.min(start, end), Math.max(start, end) + 1);
  }
  if (startItem) return [startItem];
  if (endItem) return [endItem];
  const selected = Array.from(root.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, pre, hr, details, .knote-table-block, .knote-preview-columns, .knote-equation')).filter((child) => {
    try { return range.intersectsNode(child); } catch { return false; }
  }) as HTMLElement[];
  return selected.length ? selected : [directBlock(range.startContainer)].filter((node): node is HTMLElement => Boolean(node));
}
function getSelectedBlocks(): HTMLElement[] {
  const root = rootElement();
  const range = savedRange && restoreSelection() ? savedRange : null;
  if (!root || !range) return [];
  const rangeText = range.toString();
  const selectedText = rangeText.trim() ? rangeText : savedSelectionText;
  const exactTextMatch = blocksContainingSelection(root, selectedText);
  if (exactTextMatch.length) return exactTextMatch;
  const captured = savedSelectedBlocks.filter((block) => root.contains(block));
  if (captured.length) return captured;
  return resolveSelectedBlocks(root, range, selectedText);
}
function listItemContent(item: HTMLLIElement): { content: Node[]; nestedLists: HTMLElement[]; checkbox: HTMLInputElement | null } {
  const content: Node[] = [];
  const nestedLists: HTMLElement[] = [];
  let checkbox: HTMLInputElement | null = null;
  Array.from(item.childNodes).forEach((child) => {
    if (child instanceof HTMLInputElement && child.type === 'checkbox') checkbox = child;
    else if (child instanceof HTMLElement && ['UL', 'OL'].includes(child.tagName)) nestedLists.push(child);
    else content.push(child);
  });
  return { content, nestedLists, checkbox };
}
function listSegment(source: HTMLOListElement | HTMLUListElement, items: HTMLLIElement[], offset: number): HTMLOListElement | HTMLUListElement | null {
  if (!items.length) return null;
  const segment = source.cloneNode(false) as HTMLOListElement | HTMLUListElement;
  if (source.tagName === 'OL' && offset) {
    const ordered = source as HTMLOListElement;
    segment.start = ordered.reversed ? ordered.start - offset : ordered.start + offset;
  }
  items.forEach((item) => segment.append(item));
  return segment;
}
function replaceSelectedListItems(items: HTMLLIElement[], build: (selected: HTMLLIElement[]) => HTMLElement[]): HTMLElement | null {
  const list = items[0]?.parentElement;
  if (!(list instanceof HTMLOListElement || list instanceof HTMLUListElement) || !items.every((item) => item.parentElement === list) || !list.parentNode) return null;
  const directItems = Array.from(list.children).filter((child): child is HTMLLIElement => child instanceof HTMLLIElement);
  const indexes = items.map((item) => directItems.indexOf(item)).filter((index) => index >= 0);
  if (!indexes.length) return null;
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  const selected = directItems.slice(first, last + 1);
  const replacement = build(selected);
  if (!replacement.length) return null;
  const before = listSegment(list, directItems.slice(0, first), 0);
  const after = listSegment(list, directItems.slice(last + 1), last + 1);
  if (before) list.parentNode.insertBefore(before, list);
  replacement.forEach((block) => list.parentNode?.insertBefore(block, list));
  if (after) list.parentNode.insertBefore(after, list);
  list.remove();
  return replacement[0];
}
function mergeAdjacentLists(block: HTMLElement): HTMLElement {
  let merged = block;
  const previous = merged.previousElementSibling;
  if (previous?.tagName === merged.tagName && ['UL', 'OL'].includes(merged.tagName)) {
    previous.append(...Array.from(merged.children));
    merged.remove();
    merged = previous as HTMLElement;
  }
  const next = merged.nextElementSibling;
  if (next?.tagName === merged.tagName && ['UL', 'OL'].includes(merged.tagName)) {
    merged.append(...Array.from(next.children));
    next.remove();
  }
  return merged;
}
function blockFromListItem(id: string, item: HTMLLIElement): HTMLElement[] {
  const { content, nestedLists } = listItemContent(item);
  const cloneContent = (): Node[] => content.map((node) => node.cloneNode(true));
  const heading = /^block:heading([1-4])$/.exec(id);
  if (id === 'block:paragraph' || heading) {
    const block = document.createElement(heading ? `h${heading[1]}` : 'p');
    cloneContent().forEach((node) => block.append(node));
    return [block, ...nestedLists.map((list) => list.cloneNode(true) as HTMLElement)];
  }
  if (id === 'block:quote') {
    const quote = document.createElement('blockquote');
    cloneContent().forEach((node) => quote.append(node));
    nestedLists.forEach((list) => quote.append(list.cloneNode(true)));
    return [quote];
  }
  if (id === 'block:callout-icon' || id === 'block:callout-plain') {
    const callout = createBlock(id);
    const contentBlock = callout.querySelector('p');
    if (contentBlock) cloneContent().forEach((node) => contentBlock.append(node));
    nestedLists.forEach((list) => callout.append(list.cloneNode(true)));
    return [callout];
  }
  if (id === 'block:code') {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = content.map((node) => node.textContent || '').join('');
    pre.append(code);
    return [pre, ...nestedLists.map((list) => list.cloneNode(true) as HTMLElement)];
  }
  if (id === 'block:toggle') {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const body = document.createElement('div');
    summary.textContent = 'Mostrar contenido';
    const paragraph = document.createElement('p');
    cloneContent().forEach((node) => paragraph.append(node));
    body.append(paragraph, ...nestedLists.map((list) => list.cloneNode(true)));
    details.append(summary, body);
    return [details];
  }
  if (id === 'block:equation') {
    const equation = blankElement('div');
    equation.className = 'knote-equation';
    equation.textContent = content.map((node) => node.textContent || '').join('');
    return [equation, ...nestedLists.map((list) => list.cloneNode(true) as HTMLElement)];
  }
  const columnsMatch = /^block:columns:([2-5])$/.exec(id);
  if (columnsMatch) {
    const columns = createBlock(id);
    const firstColumn = columns.querySelector('.knote-preview-column');
    if (firstColumn) firstColumn.replaceChildren(...cloneContent(), ...nestedLists.map((list) => list.cloneNode(true)));
    return [columns];
  }
  return [];
}
function convertListItemsToList(items: HTMLLIElement[], id: string): HTMLElement | null {
  const listTag = id === 'block:numbered' ? 'ol' : 'ul';
  let converted = replaceSelectedListItems(items, (selected) => {
    const list = document.createElement(listTag);
    selected.forEach((item) => {
      const { content, nestedLists, checkbox } = listItemContent(item);
      const next = document.createElement('li');
      if (id === 'block:task') {
        const checked = checkbox?.checked || item.dataset.task === 'true';
        next.dataset.task = String(checked);
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.setAttribute('contenteditable', 'false');
        next.append(input);
      }
      content.forEach((node) => next.append(node.cloneNode(true)));
      nestedLists.forEach((nested) => next.append(nested.cloneNode(true)));
      if (!next.childNodes.length || (id === 'block:task' && next.childNodes.length === 1)) next.append(document.createElement('br'));
      list.append(next);
    });
    return [list];
  });
  if (!(converted instanceof HTMLOListElement || converted instanceof HTMLUListElement)) return converted;
  return mergeAdjacentLists(converted);
}
function blankElement(tag: string): HTMLElement {
  const element = document.createElement(tag);
  element.append(document.createElement('br'));
  return element;
}
function createBlock(id: string): HTMLElement {
  const heading = /^block:heading([1-4])$/.exec(id);
  if (heading) return blankElement(`h${heading[1]}`);
  if (id === 'block:bullet' || id === 'block:numbered' || id === 'block:task') {
    const list = document.createElement(id === 'block:numbered' ? 'ol' : 'ul');
    const item = document.createElement('li');
    if (id === 'block:task') {
      item.dataset.task = 'false';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('contenteditable', 'false');
      item.append(checkbox);
    }
    item.append(document.createElement('br'));
    list.append(item);
    return list;
  }
  if (id === 'block:quote') return blankElement('blockquote');
  if (id === 'block:table') {
    const block = document.createElement('div');
    block.className = 'knote-table-block';
    block.dataset.knoteTable = JSON.stringify(EMPTY_TABLE);
    return block;
  }
  if (id === 'block:callout-icon' || id === 'block:callout-plain') {
    const isIcon = id === 'block:callout-icon';
    const color = '#cbd5e1';
    const callout = document.createElement('div');
    callout.className = `knote-callout knote-callout-${isIcon ? 'icon' : 'plain'}`;
    callout.dataset.knoteCallout = isIcon ? 'icon' : 'plain';
    callout.dataset.knoteColor = color;
    callout.style.setProperty('--knote-callout-color', color);
    if (isIcon) {
      callout.dataset.knoteIcon = 'archive';
      const icon = document.createElement('span');
      icon.className = 'knote-callout-icon';
      icon.dataset.knoteIcon = 'archive';
      icon.contentEditable = 'false';
      icon.innerHTML = calloutGlyph('archive');
      callout.append(icon);
    }
    callout.append(blankElement('p'));
    return callout;
  }
  if (id === 'block:code') {
    const block = document.createElement('pre');
    block.dataset.language = 'plaintext';
    block.append(document.createElement('code'), document.createElement('br'));
    return block;
  }
  if (id === 'block:divider') return document.createElement('hr');
  if (id === 'block:toggle') {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Mostrar contenido';
    const body = blankElement('div');
    details.append(summary, body);
    return details;
  }
  if (id === 'block:equation') return Object.assign(blankElement('div'), { className: 'knote-equation' });
  const columnsMatch = /^block:columns:([2-5])$/.exec(id);
  if (columnsMatch) {
    const count = Number(columnsMatch[1]);
    const columns = document.createElement('div');
    columns.className = 'knote-preview-columns';
    columns.dataset.columns = String(count);
    columns.style.setProperty('--knote-columns', String(count));
    for (let index = 0; index < count; index += 1) {
      const column = document.createElement('div');
      column.className = 'knote-preview-column';
      column.append(blankElement('p'));
      columns.append(column);
    }
    return columns;
  }
  return blankElement('p');
}

function wrapSelected(tag: string, attributes: Record<string, string> = {}): void {
  const range = restoreSelection();
  if (!range || range.collapsed) return;
  const wrapper = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => wrapper.setAttribute(key, value));
  try {
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    const next = document.createRange();
    next.selectNodeContents(wrapper);
    savedRange = next.cloneRange();
    restoreSelection();
  } catch {
    return;
  }
  emitDocument();
  scheduleSelectionUpdate();
}
function insertFragmentAtSelection(fragment: Node): boolean {
  const range = restoreSelection();
  if (!range) return false;
  range.deleteContents();
  const first = fragment instanceof DocumentFragment ? fragment.firstChild : fragment;
  const last = fragment instanceof DocumentFragment ? fragment.lastChild : fragment;
  if (!first || !last) return false;
  range.insertNode(fragment);
  range.setStartAfter(last);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  savedRange = range.cloneRange();
  savedSelectionText = '';
  savedSelectedBlocks = [];
  return true;
}
function unwrapSelectedFormatting(range: Range): void {
  const fragment = range.extractContents();
  const formatted = Array.from(fragment.querySelectorAll('strong,b,em,i,u,s,del,mark,code,a'));
  formatted.reverse().forEach((element) => element.replaceWith(...Array.from(element.childNodes)));
  const first = fragment.firstChild;
  const last = fragment.lastChild;
  if (!first || !last) return;
  range.insertNode(fragment);
  range.setStartBefore(first);
  range.setEndAfter(last);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  savedRange = range.cloneRange();
}
function applyInline(command: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'removeFormat' | 'hiliteColor' | 'insertHTML', value?: string): void {
  const range = restoreSelection();
  if (!range || range.collapsed) return;
  if (command === 'insertHTML') wrapSelected('code');
  else if (command === 'removeFormat') unwrapSelectedFormatting(range);
  else if (command === 'hiliteColor') {
    const color = safeBlockColor(value);
    if (color) wrapSelected('mark', { 'data-knote-color': color, style: `--knote-highlight-color:${color}` });
  } else {
    const tag = command === 'bold' ? 'strong'
      : command === 'italic' ? 'em'
        : command === 'underline' ? 'u' : 's';
    wrapSelected(tag);
  }
  rememberSelection();
  emitDocument();
  scheduleSelectionUpdate();
}
function safeLinkUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#page-') || trimmed.startsWith('mailto:')) return trimmed;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try { const url = new URL(candidate); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
function applyLink(): void {
  const url = safeLinkUrl(linkDraft.value);
  if (!url) { linkDraft.value = ''; return; }
  const range = restoreSelection();
  if (!range) return;
  const selectedAnchor = range.startContainer instanceof Element
    ? range.startContainer.closest('a')
    : range.startContainer.parentElement?.closest('a');
  if (selectedAnchor && range.endContainer && selectedAnchor.contains(range.endContainer)) {
    selectedAnchor.setAttribute('href', url);
    rememberSelection();
  } else if (!range.collapsed) wrapSelected('a', { href: url });
  else {
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    insertFragmentAtSelection(link);
  }
  linkEditorOpen.value = false;
  emitDocument();
  scheduleSelectionUpdate();
}
function startLinkEdit(): void {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode instanceof Element
    ? selection.anchorNode.closest('a')
    : selection?.anchorNode?.parentElement?.closest('a');
  linkDraft.value = anchor?.getAttribute('href') || 'https://';
  linkEditorOpen.value = true;
  void nextTick(() => document.getElementById(`block-link-${props.pageId}`)?.focus());
}

function placeCaretAtEnd(target: HTMLElement | null): void {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection) return;
  const block = target && root.contains(target) ? target : root.lastElementChild as HTMLElement | null;
  if (!block) return;
  const range = document.createRange();
  range.selectNodeContents(block);
  range.collapse(false);
  root.focus({ preventScroll: true });
  selection.removeAllRanges();
  selection.addRange(range);
  savedRange = range.cloneRange();
  savedSelectionText = '';
  savedSelectedBlocks = [];
}

function focusEnd(): void {
  const root = rootElement();
  if (!root) return;
  if (!root.firstChild) root.replaceChildren(blankElement('p'));
  placeCaretAtEnd(root.lastElementChild as HTMLElement | null);
  selectionOpen.value = false;
  linkEditorOpen.value = false;
  scheduleSelectionUpdate();
}

defineExpose({ focusEnd });

function applyBlock(id: string): void {
  if (id === 'block:highlight' && savedRange && !savedRange.collapsed) { wrapSelected('mark'); return; }
  const targets = getSelectedBlocks();
  if (!targets.length) return;
  if (id === 'block:image') { requestImageInsertion(targets[0]); return; }
  if (id === 'block:table') {
    if (targets.length === 1 && targets[0].classList.contains('knote-table-block')) return;
    const rows = targets.flatMap((target) => {
      const items = ['UL', 'OL'].includes(target.tagName) ? Array.from(target.querySelectorAll(':scope > li')) : [target];
      return items.map((item) => [item.textContent?.trim() || '', '', '']);
    });
    const tableBlock = createBlock('block:table');
    tableBlock.dataset.knoteTable = JSON.stringify({ ...EMPTY_TABLE, rows: rows.length ? rows : EMPTY_TABLE.rows.map((row) => [...row]) });
    targets[0].before(tableBlock);
    targets.forEach((target) => target.remove());
    mountTableBlocks(rootElement()!);
    placeCaretAtEnd(tableBlock);
    emitDocument();
    scheduleSelectionUpdate();
    return;
  }
  let focusTarget: HTMLElement | null = null;
  const heading = /^block:heading([1-4])$/.exec(id);
  const listItems = targets.filter((target): target is HTMLLIElement => target instanceof HTMLLIElement);
  if (listItems.length && listItems.length === targets.length) {
    if (id === 'block:bullet' || id === 'block:numbered' || id === 'block:task') {
      focusTarget = convertListItemsToList(listItems, id);
    } else if (id === 'block:divider') {
      focusTarget = replaceSelectedListItems(listItems, () => [document.createElement('hr'), blankElement('p')]);
    } else if (id === 'block:paragraph' || heading || id === 'block:quote' || id === 'block:callout-icon' || id === 'block:callout-plain' || id === 'block:code' || id === 'block:toggle' || id === 'block:equation' || /^block:columns:[2-5]$/.test(id)) {
      focusTarget = replaceSelectedListItems(listItems, (selected) => selected.flatMap((item) => blockFromListItem(id, item)));
    }
    if (id === 'block:highlight') {
      listItems.forEach((item) => {
        const { content, nestedLists, checkbox } = listItemContent(item);
        const mark = document.createElement('mark');
        content.forEach((node) => mark.append(node));
        if (!mark.childNodes.length) mark.append(document.createElement('br'));
        item.replaceChildren(...(checkbox ? [checkbox] : []), mark, ...nestedLists);
      });
      focusTarget = listItems[0];
    }
    if (focusTarget) {
      placeCaretAtEnd(focusTarget);
      emitDocument();
      scheduleSelectionUpdate();
    }
    return;
  }
  if (id === 'block:paragraph') {
    targets.forEach((node) => {
      if (/^H[1-4]$/.test(node.tagName) || node.tagName === 'BLOCKQUOTE') {
        const paragraph = replaceTag(node, 'p');
        focusTarget ??= paragraph;
      } else if (node.tagName === 'UL' || node.tagName === 'OL') {
        const paragraphs = Array.from(node.querySelectorAll(':scope > li')).map((item) => {
          const paragraph = document.createElement('p');
          Array.from(item.childNodes).filter((child) => !(child instanceof HTMLInputElement)).forEach((child) => paragraph.append(child.cloneNode(true)));
          return paragraph;
        });
        if (!paragraphs.length) paragraphs.push(blankElement('p'));
        node.replaceWith(...paragraphs);
        focusTarget ??= paragraphs[0];
      } else if (node.tagName === 'PRE' || node.tagName === 'DETAILS') {
        const paragraph = document.createElement('p');
        paragraph.textContent = node.innerText;
        node.replaceWith(paragraph);
        focusTarget ??= paragraph;
      } else {
        focusTarget ??= node;
      }
    });
  } else if (heading) {
    targets.forEach((node) => { const block = replaceTag(node, `h${heading[1]}`); focusTarget ??= block; });
  } else if (id === 'block:bullet' || id === 'block:numbered' || id === 'block:task') {
    const groups = new Map<Node, HTMLElement[]>();
    targets.forEach((node) => {
      const parent = node.parentNode;
      if (!parent) return;
      const group = groups.get(parent) || [];
      group.push(node);
      groups.set(parent, group);
    });
    for (const [parent, group] of groups) {
      const list = document.createElement(id === 'block:numbered' ? 'ol' : 'ul');
      for (const node of group) {
        const sourceItems = ['UL', 'OL'].includes(node.tagName) ? Array.from(node.querySelectorAll(':scope > li')) as HTMLElement[] : [node];
        sourceItems.forEach((source) => {
          const item = document.createElement('li');
          const content = source.tagName === 'LI' ? Array.from(source.childNodes).filter((child) => !(child instanceof HTMLInputElement)) : Array.from(source.childNodes);
          if (id === 'block:task') {
            item.dataset.task = 'false';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.setAttribute('contenteditable', 'false'); item.append(checkbox);
          }
          content.forEach((child) => item.append(child.cloneNode(true)));
          list.append(item);
        });
      }
      parent.insertBefore(list, group[0]);
      group.forEach((node) => node.remove());
      focusTarget ??= mergeAdjacentLists(list);
    }
  } else if (id === 'block:quote') {
    targets.forEach((node) => {
      const quote = document.createElement('blockquote');
      quote.innerHTML = node.innerHTML;
      node.replaceWith(quote);
      focusTarget ??= quote;
    });
  } else if (id === 'block:callout-icon' || id === 'block:callout-plain') {
    targets.forEach((node) => {
      const callout = createBlock(id);
      const body = callout.querySelector('p');
      if (body) body.innerHTML = node.innerHTML;
      node.replaceWith(callout);
      focusTarget ??= callout;
    });
  } else if (id === 'block:highlight') {
    targets.forEach((node) => { const mark = document.createElement('mark'); mark.innerHTML = node.innerHTML; node.replaceChildren(mark); focusTarget ??= node; });
  } else if (id === 'block:code') {
    targets.forEach((node) => {
      const pre = document.createElement('pre');
      pre.dataset.language = 'plaintext';
      const code = document.createElement('code'); code.textContent = node.innerText;
      pre.append(code); node.replaceWith(pre);
      focusTarget ??= pre;
    });
  } else if (id === 'block:divider') {
    const first = targets[0];
    const divider = document.createElement('hr');
    const paragraph = blankElement('p');
    first.replaceWith(divider, paragraph);
    targets.slice(1).forEach((node) => node.remove());
    focusTarget = paragraph;
  } else if (id === 'block:toggle') {
    targets.forEach((node) => {
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Mostrar contenido';
      const body = document.createElement('div'); body.append(node.cloneNode(true));
      details.append(summary, body); node.replaceWith(details);
      focusTarget ??= details;
    });
  } else if (id === 'block:equation' || /^block:columns:[2-5]$/.test(id)) {
    const replacement = createBlock(id);
    if (id === 'block:equation') replacement.textContent = targets.map((node) => node.innerText).join('\n');
    else {
      const firstColumn = replacement.querySelector('.knote-preview-column');
      if (firstColumn) firstColumn.replaceChildren(...targets.map((node) => node.cloneNode(true)));
    }
    targets[0].before(replacement);
    targets.forEach((node) => node.remove());
    focusTarget = replacement;
  } else return;
  placeCaretAtEnd(focusTarget);
  emitDocument();
  scheduleSelectionUpdate();
}
function replaceTag(node: HTMLElement, tag: string): HTMLElement {
  if (node.tagName.toLowerCase() === tag) return node;
  const replacement = document.createElement(tag);
  replacement.innerHTML = node.innerHTML;
  node.replaceWith(replacement);
  return replacement;
}
function handleFormatSelection(item: MenuSelection): void {
  if (item.id.startsWith('block:')) applyBlock(item.id);
}
function openSlashMenuFromCaret(): boolean {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount || slashMenuOpen.value) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.startContainer)) return false;
  const block = textBlockAt(range.startContainer);
  if (!block || !['P', 'DIV'].includes(block.tagName)) return false;
  const prefix = document.createRange();
  prefix.selectNodeContents(block);
  prefix.setEnd(range.startContainer, range.startOffset);
  const match = /^\/([^\s/]*)$/.exec(prefix.toString());
  if (!match) return false;

  const commandRange = document.createRange();
  commandRange.setStart(block, 0);
  commandRange.setEnd(range.startContainer, range.startOffset);
  commandRange.deleteContents();
  if (!block.textContent?.length) block.replaceChildren(document.createElement('br'));
  const caret = document.createRange();
  caret.setStart(block, 0);
  caret.collapse(true);
  savedRange = caret.cloneRange();

  const shell = root.parentElement;
  const shellRect = shell?.getBoundingClientRect();
  const caretRect = caret.getBoundingClientRect();
  if (shellRect) {
    const menuWidth = Math.max(0, Math.min(320, shellRect.width - 8));
    const left = Math.max(4, Math.min(shellRect.width - menuWidth - 4, caretRect.left - shellRect.left));
    slashMenuPosition.value = { left: `${left}px`, top: `${Math.max(0, caretRect.bottom - shellRect.top + 6)}px` };
  }
  slashQuery.value = match[1] || '';
  slashMenuOpen.value = true;
  void nextTick(() => shell?.querySelector<HTMLInputElement>('[data-balsa="command-menu"] input')?.focus({ preventScroll: true }));
  return true;
}
function handleSlashBlockSelection(item: CommandItem): void {
  if (!item.id.startsWith('block:')) return;
  slashMenuOpen.value = false;
  applyBlock(item.id);
}
function cancelSlashMenu(): void {
  slashMenuOpen.value = false;
  slashQuery.value = '';
  void nextTick(() => restoreSelection());
}
function applyTypedBlockShortcut(): boolean {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.startContainer)) return false;
  const block = textBlockAt(range.startContainer);
  if (!block || !['P', 'DIV'].includes(block.tagName)) return false;

  const suffix = document.createRange();
  suffix.selectNodeContents(block);
  suffix.setStart(range.startContainer, range.startOffset);
  if (suffix.toString()) return false;

  const prefix = document.createRange();
  prefix.selectNodeContents(block);
  prefix.setEnd(range.startContainer, range.startOffset);
  const marker = prefix.toString();
  const match = /^(#{1,4}|[-*+]|>|\d+\.|(?:[-*+]\s*)?\[\s*\])\s$/.exec(marker);
  if (!match) return false;

  const token = match[1];
  const blockId = token.startsWith('#')
    ? `block:heading${token.length}`
    : token === '>'
      ? 'block:quote'
      : /^\d+\.$/.test(token)
        ? 'block:numbered'
        : /^\[\s*\]$/.test(token) || /^[-*+]\s+\[\s*\]$/.test(token)
          ? 'block:task'
          : 'block:bullet';

  block.replaceChildren(document.createElement('br'));
  const caret = document.createRange();
  caret.selectNodeContents(block);
  caret.collapse(false);
  selection.removeAllRanges();
  selection.addRange(caret);
  savedRange = caret.cloneRange();
  applyBlock(blockId);
  return true;
}
function handleEditorInput(): void {
  const root = rootElement();
  if (!root) return;
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const paragraph = document.createElement('p'); paragraph.textContent = node.textContent; root.replaceChild(paragraph, node);
    }
  });
  normalizeEditorDom(root);
  updateEditorPlaceholder(root);
  rememberSelection();
  if (openSlashMenuFromCaret()) {
    emitDocument(false);
    selectionOpen.value = false;
    return;
  }
  if (applyTypedBlockShortcut()) return;
  emitDocument(false);
  scheduleSelectionUpdate();
}
function changeListIndent(item: HTMLLIElement, outdent: boolean): boolean {
  const root = rootElement();
  const list = item.parentElement;
  if (!root || !list || !['UL', 'OL'].includes(list.tagName)) return false;

  if (outdent) {
    const parentItem = list.parentElement;
    const parentList = parentItem?.parentElement;
    if (parentItem?.tagName !== 'LI' || !parentList || !['UL', 'OL'].includes(parentList.tagName)) return false;
    parentList.insertBefore(item, parentItem.nextSibling);
    if (!list.querySelector(':scope > li')) list.remove();
  } else {
    const previousItem = item.previousElementSibling;
    if (!(previousItem instanceof HTMLLIElement)) return false;
    let nestedList = Array.from(previousItem.children).find((child) => child.tagName === list.tagName) as HTMLOListElement | HTMLUListElement | undefined;
    if (!nestedList) {
      nestedList = document.createElement(list.tagName.toLowerCase()) as HTMLOListElement | HTMLUListElement;
      previousItem.append(nestedList);
    }
    nestedList.append(item);
  }

  const selection = window.getSelection();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0).cloneRange();
    if (root.contains(range.startContainer) && root.contains(range.endContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      savedRange = range.cloneRange();
    } else placeCaretAtEnd(item);
  } else placeCaretAtEnd(item);
  emitDocument();
  scheduleSelectionUpdate();
  return true;
}
function insertSoftBreak(range: Range): void {
  range.deleteContents();
  const lineBreak = document.createElement('br');
  range.insertNode(lineBreak);
  const caret = document.createRange();
  caret.setStartAfter(lineBreak);
  caret.collapse(true);
  const trailingBreak = document.createElement('br');
  caret.insertNode(trailingBreak);
  caret.setStartBefore(trailingBreak);
  caret.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
  savedRange = caret.cloneRange();
}
function caretLineText(block: HTMLElement, range: Range, side: 'before' | 'after'): string {
  const part = document.createRange();
  part.selectNodeContents(block);
  if (side === 'before') part.setEnd(range.startContainer, range.startOffset);
  else part.setStart(range.startContainer, range.startOffset);
  return part.toString();
}
function insertAfterBlock(block: HTMLElement): HTMLElement {
  const next = block.nextElementSibling as HTMLElement | null;
  const paragraph = next && isBlankParagraph(next) ? next : blankElement('p');
  if (paragraph !== next) block.after(paragraph);
  placeCaretAtEnd(paragraph);
  emitDocument();
  scheduleSelectionUpdate();
  return paragraph;
}
function handleEditorKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    const root = rootElement();
    const selection = window.getSelection();
    const anchor = selection?.anchorNode instanceof HTMLElement ? selection.anchorNode : selection?.anchorNode?.parentElement;
    if (!root || !selection?.rangeCount || !anchor || !root.contains(anchor)) return;
    const range = selection.getRangeAt(0);

    const summary = anchor.closest('summary');
    if (summary instanceof HTMLElement && root.contains(summary)) {
      event.preventDefault();
      const details = summary.closest('details');
      const body = details?.querySelector<HTMLElement>(':scope > div');
      if (details) details.open = true;
      if (body) {
        if (!body.firstElementChild) body.append(blankElement('p'));
        placeCaretAtEnd(body.firstElementChild as HTMLElement);
      } else insertAfterBlock(summary);
      return;
    }

    const pre = anchor.closest('pre');
    if (pre instanceof HTMLElement && root.contains(pre) && !event.shiftKey) {
      if ((event.ctrlKey || event.metaKey) && !range.collapsed) return;
      const codeRange = range.cloneRange();
      const before = caretLineText(pre, codeRange, 'before').split('\n').at(-1) || '';
      const after = caretLineText(pre, codeRange, 'after').split('\n')[0] || '';
      if (event.ctrlKey || event.metaKey || (!before.trim() && !after.trim())) {
        event.preventDefault();
        insertAfterBlock(pre);
      }
      return;
    }

    const item = anchor.closest('li');
    if (item instanceof HTMLLIElement && root.contains(item) && item.parentElement && ['UL', 'OL'].includes(item.parentElement.tagName)) {
      const list = item.parentElement;
      const task = item.hasAttribute('data-task');
      if (event.shiftKey) {
        event.preventDefault();
        insertSoftBreak(range);
        emitDocument();
        scheduleSelectionUpdate();
        return;
      }
      event.preventDefault();
      const hasNestedItems = Boolean(item.querySelector(':scope > ul li, :scope > ol li'));
      const content = Array.from(item.childNodes).filter((node) => !(node instanceof HTMLInputElement) && node.nodeName !== 'BR' && !(node instanceof HTMLElement && ['UL', 'OL'].includes(node.tagName)));
      const empty = !content.some((node) => node.textContent?.trim()) && !hasNestedItems;
      if (empty) {
        const parentItem = list.parentElement instanceof HTMLLIElement ? list.parentElement : null;
        if (parentItem) {
          changeListIndent(item, true);
          return;
        }
        item.remove();
        const paragraph = blankElement('p');
        if (!list.querySelector(':scope > li')) list.replaceWith(paragraph);
        else list.after(paragraph);
        placeCaretAtEnd(paragraph);
      } else {
        if (!range.collapsed) { range.deleteContents(); range.collapse(true); }
        const tailRange = document.createRange();
        tailRange.selectNodeContents(item);
        tailRange.setStart(range.startContainer, range.startOffset);
        const tail = tailRange.extractContents();
        tail.querySelectorAll('input[type="checkbox"]').forEach((input) => input.remove());
        const nextItem = document.createElement('li');
        if (task) {
          nextItem.dataset.task = 'false';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.setAttribute('contenteditable', 'false');
          nextItem.append(checkbox);
        }
        nextItem.append(tail);
        if (!nextItem.textContent?.trim() && !nextItem.querySelector('ul, ol')) nextItem.append(document.createElement('br'));
        item.after(nextItem);
        placeCaretAtEnd(nextItem);
      }
      emitDocument();
      scheduleSelectionUpdate();
      return;
    }

    const callout = anchor.closest('.knote-callout');
    const quote = anchor.closest('blockquote');
    const emptyQuoteLine = anchor.closest('blockquote p');
    if (!event.shiftKey && callout instanceof HTMLElement && root.contains(callout) && anchor.closest('p') instanceof HTMLElement && isBlankParagraph(anchor.closest('p') as HTMLElement)) {
      event.preventDefault();
      insertAfterBlock(callout);
      return;
    }
    if (!event.shiftKey && quote instanceof HTMLElement && root.contains(quote) && (!quote.textContent?.trim() || (emptyQuoteLine instanceof HTMLElement && isBlankParagraph(emptyQuoteLine)))) {
      event.preventDefault();
      insertAfterBlock(quote);
      return;
    }

    const caption = anchor.closest('figcaption');
    const figure = caption?.closest('figure.knote-image-block');
    if (!event.shiftKey && caption instanceof HTMLElement && figure instanceof HTMLElement && !caption.textContent?.trim()) {
      event.preventDefault();
      insertAfterBlock(figure);
      return;
    }

    const detailsBody = anchor.closest('details > div');
    if (!event.shiftKey && detailsBody instanceof HTMLElement && root.contains(detailsBody) && !detailsBody.textContent?.trim()) {
      event.preventDefault();
      const details = detailsBody.closest('details');
      if (details instanceof HTMLElement) insertAfterBlock(details);
      return;
    }
  }
  if (event.key === 'Tab') {
    const root = rootElement();
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount || !selection.getRangeAt(0).collapsed || !root.contains(selection.anchorNode)) return;
    const anchor = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement;
    const item = anchor?.closest('li');
    if (item && root.contains(item) && changeListIndent(item, event.shiftKey)) event.preventDefault();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
    const key = event.key.toLowerCase();
    const command = key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : null;
    if (command) { event.preventDefault(); applyInline(command); return; }
  }
  if (event.key === 'Escape') { selectionOpen.value = false; linkEditorOpen.value = false; }
}
function handlePaste(event: ClipboardEvent): void {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const pastedImage = Array.from(clipboard.files).find((file) => file.type.startsWith('image/'));
  if (pastedImage) {
    event.preventDefault();
    const selection = window.getSelection();
    insertionAnchor.value = selection?.anchorNode ? directBlock(selection.anchorNode) : null;
    insertImageFile(pastedImage);
    return;
  }
  event.preventDefault();
  rememberSelection();
  const plainTextValue = clipboard.getData('text/plain');
  const plainText = plainTextValue.trim();
  if (/^(?:https?:\/\/|www\.)[^\s]+$/i.test(plainText)) {
    const url = safeLinkUrl(plainText);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = plainText;
      insertFragmentAtSelection(link);
      handleEditorInput();
      return;
    }
  }
  const html = clipboard.getData('text/html');
  let inserted = false;
  if (html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const clean = sanitizeNodes(Array.from(parsed.body.childNodes));
    if (clean) {
      const template = document.createElement('template');
      template.innerHTML = clean;
      inserted = insertFragmentAtSelection(template.content);
    }
  }
  if (!inserted) {
    const fragment = document.createDocumentFragment();
    plainTextValue.split(/\r?\n/).forEach((line, index) => {
      if (index) fragment.append(document.createElement('br'));
      fragment.append(document.createTextNode(line));
    });
    insertFragmentAtSelection(fragment);
  }
  handleEditorInput();
}
function handleEditorClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const checkbox = target instanceof HTMLInputElement && target.type === 'checkbox' ? target : null;
  if (checkbox) {
    const item = checkbox.closest('li');
    if (item) item.dataset.task = String(checkbox.checked);
    emitDocument();
    return;
  }
  const link = target.closest('a');
  if (link instanceof HTMLAnchorElement) {
    const href = safeLinkUrl(link.getAttribute('href') || '');
    event.preventDefault();
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  }
}
function handleImageRejected(rejections: readonly { message: string }[]): void {
  imageError.value = rejections[0]?.message || 'No se pudo añadir esa imagen.';
}
function handleOutsidePointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-balsa="menu-list"], [data-balsa="popup-panel"], .knote-format-toolbar, .knote-link-editor, .knote-editor-control')) return;
  if (shell.value?.contains(target)) {
    const isActiveComponent = activeCodeBlock.value?.contains(target)
      || activeCallout.value?.contains(target)
      || activeImage.value?.contains(target);
    if (!isActiveComponent) clearActiveComponentSettings();
    return;
  }
  selectionOpen.value = false;
  linkEditorOpen.value = false;
  blockMenuOpen.value = false;
  codeLanguageMenuOpen.value = false;
  calloutIconMenuOpen.value = false;
  imagePickerOpen.value = false;
  clearActiveComponentSettings();
  hoveredBlock.value = null;
  savedSelectionText = '';
  savedSelectedBlocks = [];
}
watch(() => props.modelValue, (value) => {
  if (value === lastModelValue) return;
  lastModelValue = value;
  if (editor.value) {
    clearActiveComponentSettings();
    unmountTableBlocks();
    editor.value.innerHTML = initialHtml(value);
    normalizeEditorDom(editor.value);
    mountTableBlocks(editor.value);
    updateEditorPlaceholder(editor.value);
    void hydrateImageAssets(editor.value);
  }
});
watch(() => props.placeholder, () => {
  if (editor.value) updateEditorPlaceholder(editor.value);
});
watch(blockContextMenuOpen, (open) => { if (!open) contextTargetBlock.value = null; });
watch(slashMenuOpen, (open) => { if (!open) slashQuery.value = ''; });
watch(blockMenuOpen, (open) => { if (!open) blockMenuQuery.value = ''; });
watch(codeLanguageMenuOpen, (open) => { if (!open) codeLanguageQuery.value = ''; });
watch(selectionOpen, (open) => {
  if (open) void nextTick(updateSelectionToolbar);
});
onMounted(() => {
  if (editor.value) {
    editor.value.innerHTML = initialHtml(props.modelValue);
    normalizeEditorDom(editor.value);
    mountTableBlocks(editor.value);
    updateEditorPlaceholder(editor.value);
    void hydrateImageAssets(editor.value);
  }
  document.addEventListener('selectionchange', scheduleSelectionUpdate, { passive: true });
  document.addEventListener('pointerdown', handleOutsidePointerDown);
  document.addEventListener('pointermove', handleEditorPointerMove, { passive: true });
  window.addEventListener('scroll', scheduleSelectionUpdate, { passive: true, capture: true });
  window.addEventListener('resize', scheduleSelectionUpdate, { passive: true });
});
onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', scheduleSelectionUpdate);
  document.removeEventListener('pointerdown', handleOutsidePointerDown);
  document.removeEventListener('pointermove', handleEditorPointerMove);
  document.removeEventListener('pointermove', handleBlockPointerMove);
  document.removeEventListener('pointerup', handleBlockPointerUp);
  document.removeEventListener('pointercancel', handleBlockPointerUp);
  document.removeEventListener('pointermove', applyImageResize);
  document.removeEventListener('pointerup', finishImageResize);
  document.removeEventListener('pointercancel', finishImageResize);
  window.removeEventListener('scroll', scheduleSelectionUpdate, true);
  window.removeEventListener('resize', scheduleSelectionUpdate);
  blockPointerDrag = null;
  imageResizeState = null;
  unmountTableBlocks();
  finishBlockDrag();
  if (selectionFrame) cancelAnimationFrame(selectionFrame);
  imageObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  imageObjectUrls.clear();
});
</script>

<template>
  <div
    ref="shell"
    class="knote-block-editor-shell"
    @contextmenu="handleComponentContextMenu"
    @keydown.esc="clearActiveComponentSettings"
    @pointerover="handleEditorPointerOver"
    @pointerleave="handleEditorPointerLeave"
    @dragover="handleEditorDragOver"
    @drop="handleEditorDrop"
  >
    <div
      ref="editor"
      class="knote-block-editor"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-label="placeholder || 'Documento editable'"
      :data-placeholder="placeholder || 'Empieza a escribir…'"
      :data-page-id="pageId"
      spellcheck="true"
      @input="handleEditorInput"
      @keydown="handleEditorKeydown"
      @focus="handleEditorFocus"
      @keyup="handleEditorKeyup"
      @mouseup="scheduleSelectionUpdate"
      @pointerup="scheduleSelectionUpdate"
      @paste="handlePaste"
      @click="handleEditorClick"
    />

    <div
    v-if="hoveredBlock"
      class="knote-block-actions knote-editor-control"
      :style="blockActionsPosition"
      role="toolbar"
      aria-label="Acciones del bloque"
      @pointerdown.stop
    >
      <Button variant="glass" color="neutral" size="sm" aria-label="Añadir un bloque debajo" title="Añadir un bloque" @click="openBlockMenu">
        <Icon :icon="Plus" size="sm" />
      </Button>
      <ContextMenu
        :id="blockContextMenuId"
        label="Opciones del bloque"
        :items="blockContextMenuItems"
        variant="surface"
        color="neutral"
        rounded="md"
        v-model="blockContextMenuOpen"
        @select="handleBlockContextSelection"
      >
        <Button
          variant="glass"
          color="neutral"
          size="sm"
          aria-label="Arrastrar o mover bloque"
          title="Arrastra para mover; clic derecho para borrar; Alt + flechas para reordenar"
          @pointerdown.stop="handleBlockHandlePointerDown"
          @focus="rememberBlockContextTarget"
          @keydown.alt.up.prevent="moveBlockByKeyboard(-1)"
          @keydown.alt.down.prevent="moveBlockByKeyboard(1)"
        >
          <Icon :icon="GripVertical" size="sm" />
        </Button>
      </ContextMenu>
    </div>

    <div v-if="blockMenuOpen" class="knote-block-insert-menu knote-editor-control" :style="blockMenuPosition" @keydown.esc.capture="blockMenuOpen = false">
      <CommandMenu
        :id="`insert-blocks-${pageId}`"
        v-model="blockMenuOpen"
        v-model:query="blockMenuQuery"
        label="Añadir un bloque"
        placeholder="Buscar bloques…"
        :groups="slashBlockGroups"
        size="sm"
        variant="surface"
        rounded="lg"
        shadow="md"
        contained
        hotkey=""
        @select="handleBlockMenuSelection"
      />
    </div>

    <div v-if="activeCodeBlock" class="knote-code-tools knote-editor-control" :style="codeToolbarPosition" @pointerdown.stop>
      <Button variant="glass" color="neutral" size="sm" aria-label="Elegir lenguaje del código" @click="codeLanguageMenuOpen = !codeLanguageMenuOpen">
        {{ languageLabel(activeCodeBlock) }}<Icon :icon="ChevronDown" size="xs" />
      </Button>
      <Button variant="glass" color="neutral" size="sm" :aria-label="copiedCode ? 'Código copiado' : copyCodeUnavailable ? 'No se pudo copiar el código' : 'Copiar código'" :title="copiedCode ? 'Copiado' : copyCodeUnavailable ? 'Permite el portapapeles en el navegador' : 'Copiar código'" @click="copyCode">
        <Icon :icon="Copy" size="xs" />
      </Button>
      <span v-if="copiedCode" class="knote-code-copied" role="status">Copiado</span>
      <span v-else-if="copyCodeUnavailable" class="knote-code-copied" role="status">No se pudo acceder al portapapeles</span>
      <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Cerrar opciones del código" title="Cerrar" @click="clearActiveComponentSettings"><Icon :icon="X" size="xs" /></Button>
      <div v-if="codeLanguageMenuOpen" class="knote-code-language-menu" @keydown.esc.capture="codeLanguageMenuOpen = false">
        <CommandMenu
          :id="`code-languages-${pageId}`"
          v-model="codeLanguageMenuOpen"
          v-model:query="codeLanguageQuery"
          label="Lenguaje del bloque de código"
          placeholder="Busca un idioma…"
          :groups="codeLanguageGroups"
          size="sm"
          variant="surface"
          rounded="lg"
          shadow="md"
          contained
          hotkey=""
          @select="handleCodeLanguageSelection"
        />
      </div>
    </div>

    <div v-if="activeCallout" class="knote-callout-tools knote-editor-control" :style="calloutToolsPosition" @pointerdown.stop="calloutToolsPinned = true">
      <DropdownMenu :id="`callout-icon-${pageId}`" v-if="activeCallout.dataset.knoteCallout === 'icon'" v-model="calloutIconMenuOpen" label="Cambiar icono de la cita" :items="calloutIconItems" side="bottom" align="start" variant="surface" rounded="lg" @select="handleCalloutIconSelection">
        <template #trigger><span class="knote-callout-tool-glyph" v-html="calloutGlyph(activeCallout.dataset.knoteIcon)" /><Icon :icon="ChevronDown" size="xs" /></template>
      </DropdownMenu>
      <ColorPicker :id="`callout-color-${pageId}`" v-model="calloutColorDraft" label="Color de la cita" type="palette" variant="glass" rounded="md" @update:model-value="updateCalloutColor" />
      <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Cerrar opciones de la cita" title="Cerrar" @click="clearActiveComponentSettings"><Icon :icon="X" size="xs" /></Button>
    </div>

    <div v-if="activeImage" class="knote-image-tools knote-editor-control" :style="imageToolbarPosition" @pointerdown.stop="imageToolsPinned = true">
      <span class="knote-image-tools-label">Arrastra los tiradores para cambiar el tamaño</span>
      <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Cerrar opciones de imagen" title="Cerrar" @click="clearActiveComponentSettings"><Icon :icon="X" size="xs" /></Button>
    </div>

    <div v-if="activeImage" class="knote-image-resize-handles knote-editor-control" :style="imageResizePosition" @pointerdown.stop>
      <button
        v-for="direction in imageResizeDirections"
        :key="direction"
        type="button"
        class="knote-image-resize-handle"
        :class="`knote-image-resize-handle--${direction}`"
        :aria-label="imageResizeLabels[direction]"
        :title="imageResizeLabels[direction]"
        @pointerdown.stop.prevent="startImageResize($event, direction)"
      />
    </div>

    <div v-if="imagePickerOpen" class="knote-image-picker knote-editor-control" :style="imagePickerPosition" @pointerdown.stop>
      <div class="knote-image-picker-heading">
        <div><strong>Añadir imagen</strong><span>Se guarda localmente y conserva su calidad.</span></div>
        <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Cerrar selector de imagen" @click="imagePickerOpen = false"><Icon :icon="Minus" size="xs" /></Button>
      </div>
      <Attachment :id="`block-image-${pageId}`" v-model="selectedImageFiles" label="Seleccionar imagen" hint="JPG, PNG, GIF o WebP · hasta 12 MB" accept="image/*" :max-size="12 * 1024 * 1024" :max-files="1" size="sm" @update:model-value="handleImageSelection" @reject="handleImageRejected" />
      <p v-if="imageError" class="knote-image-error" role="alert">{{ imageError }}</p>
    </div>

    <div
      v-if="slashMenuOpen"
      class="knote-slash-command knote-editor-control"
      :style="slashMenuPosition"
      @keydown.esc.capture="cancelSlashMenu"
    >
      <CommandMenu
        :id="`slash-blocks-${pageId}`"
        v-model="slashMenuOpen"
        v-model:query="slashQuery"
        label="Insertar un bloque"
        placeholder="Buscar bloques…"
        :groups="slashBlockGroups"
        size="sm"
        variant="surface"
        rounded="lg"
        shadow="md"
        contained
        hotkey=""
        @select="handleSlashBlockSelection"
      />
    </div>

    <div
      v-if="selectionOpen"
      ref="toolbar"
      class="knote-format-toolbar"
      role="toolbar"
      aria-label="Formato del texto seleccionado"
      :style="toolbarPosition"
      @pointerdown.stop
    >
      <Button variant="glass" color="neutral" size="sm" shape="fab" :prefix-icon="Bold" aria-label="Negrita" title="Negrita" @pointerdown.prevent @click="applyInline('bold')" />
      <Button variant="glass" color="neutral" size="sm" shape="fab" :prefix-icon="Italic" aria-label="Cursiva" title="Cursiva" @pointerdown.prevent @click="applyInline('italic')" />
      <Button variant="glass" color="neutral" size="sm" shape="fab" :prefix-icon="Underline" aria-label="Subrayado" title="Subrayado" @pointerdown.prevent @click="applyInline('underline')" />
      <Button variant="glass" color="neutral" size="sm" shape="fab" :prefix-icon="Strikethrough" aria-label="Tachado" title="Tachado" @pointerdown.prevent @click="applyInline('strikeThrough')" />
      <Button variant="glass" color="neutral" size="sm" shape="fab" :prefix-icon="Link2" aria-label="Insertar enlace" title="Insertar enlace" @pointerdown.prevent @click="startLinkEdit" />
      <Button variant="glass" color="neutral" size="sm" shape="fab" :prefix-icon="Code2" aria-label="Código en línea" title="Código en línea" @pointerdown.prevent @click="applyInline('insertHTML')" />
      <DropdownMenu :id="`selection-formats-${pageId}`" v-model="formatBlocksOpen" open-on-hover label="Más formatos de texto" :items="formatItems" side="bottom" align="end" variant="surface" rounded="xl" class="knote-format-menu" @pointerdown.prevent @select="handleFormatSelection">
        <template #trigger><Icon :icon="Type" size="sm" /><span>Bloques</span><Icon :icon="ChevronDown" size="xs" /></template>
      </DropdownMenu>
    </div>
    <div v-if="linkEditorOpen" class="knote-link-editor" :style="{ left: toolbarPosition.left, top: `calc(${toolbarPosition.top} + 3rem)` }">
      <input :id="`block-link-${pageId}`" v-model="linkDraft" type="url" aria-label="Dirección del enlace" placeholder="https://…" @keydown.enter.stop.prevent="applyLink" @keydown.escape.stop="linkEditorOpen = false" />
      <Button variant="glass" color="neutral" size="sm" @pointerdown.prevent @click="applyLink">Aplicar</Button>
      <Button variant="soft" color="neutral" size="sm" @pointerdown.prevent @click="linkEditorOpen = false">Cancelar</Button>
    </div>
  </div>
</template>
