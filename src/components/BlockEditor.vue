<script setup lang="ts">
import { computed, createApp, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowDown, ArrowUp, Bold, ChevronDown, Code2, Columns3, Copy, GripVertical, Highlighter, Image as ImageIcon, Italic,
  Link2, List, ListOrdered, ListTodo, Minus, Plus, Quote, Sigma, Strikethrough, Table as TableIcon,
  BookOpen, ListTree, SeparatorHorizontal, Trash2, Type, Underline, X,
} from '@lucide/vue';
import Button from '@/components/ui/Button.vue';
import CommandMenu from '@/components/ui/CommandMenu.vue';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import Icon from '@/components/ui/Icon.vue';
import ColorPicker from '@/components/ui/ColorPicker.vue';
import Attachment from '@/components/ui/Attachment.vue';
import TableBlockEditor from '@/components/BlockTableEditor.vue';
import type { CommandGroup, CommandItem } from '@/components/ui/command';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import { CALL_OUT_ICONS, EMPTY_TABLE, LANGUAGE_IDS, LANGUAGES, RICH_PREFIX, TABLE_LIMITS, calloutGlyph, codeBlockText, initialHtml, normalizeTableData, safeBlockColor, safeLanguage, sanitizeNodes, tableDataFromBlock, type EditorTableData } from '@/components/block-editor/content';
import { refreshDocumentOutline } from '@/components/block-editor/outline';
import { blankElement, createBlock, createTaskCheckbox } from '@/components/block-editor/block-factory';
import { blockFromListItem, convertListItemsToList, listItemContent, mergeAdjacentLists, replaceSelectedListItems } from '@/components/block-editor/list-transformations';
import { captureDocumentSelection, createDocumentHistory, restoreDocumentSelection } from '@/components/block-editor/history';
import { getBlockImage, retainBlockImage, saveBlockImage } from '@/lib/block-images';

const props = defineProps<{ modelValue: string; pageId: string; placeholder?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const editor = ref<HTMLElement | null>(null);
const toolbar = ref<HTMLElement | null>(null);
const shell = ref<HTMLElement | null>(null);
const linkDraft = ref('https://');
const linkEditorOpen = ref(false);
const selectionOpen = ref(false);
const formatBlocksOpen = ref(false);
const formatQuery = ref('');
const formatTrigger = ref<HTMLElement | null>(null);
const formatGroups = ref<readonly CommandGroup[]>([]);
const formatPosition = ref<Record<string, string>>({});
const toolbarPosition = ref({ left: '8px', top: '8px' });
const insertMenu = ref<{ anchor: HTMLElement; source: 'slash' | 'button' } | null>(null);
const insertQuery = ref('');
const insertPosition = ref<Record<string, string>>({});
const hoveredBlock = ref<HTMLElement | null>(null);
const blockActionsPosition = ref({ left: '0px', top: '0px' });
const draggedBlock = ref<HTMLElement | null>(null);
const blockContextMenuOpen = ref(false);
const contextTargetBlock = ref<HTMLElement | null>(null);
const blockContextMenuId = `block-context-${props.pageId}-${Math.random().toString(36).slice(2, 8)}`;
const blockContextMenuItems = computed<readonly MenuItem[]>(() => {
  const block = contextTargetBlock.value ?? hoveredBlock.value;
  return [
    ...(block?.matches('pre, .knote-callout, .knote-image-block') ? [{ id: 'settings', label: 'Configurar bloque' }] : []),
    { id: 'duplicate', label: 'Duplicar', icon: Copy },
    { id: 'move-up', label: 'Mover arriba', icon: ArrowUp, disabled: !block?.previousElementSibling },
    { id: 'move-down', label: 'Mover abajo', icon: ArrowDown, disabled: !block?.nextElementSibling },
    { id: 'delete-block', label: 'Eliminar bloque', icon: Trash2, destructive: true },
  ];
});
const insertionAnchor = ref<HTMLElement | null>(null);
const imagePickerOpen = ref(false);
const imagePickerPosition = ref({ left: '0px', top: '0px' });
const selectedImageFiles = ref<readonly File[]>([]);
const imageError = ref('');
const activeCodeBlock = ref<HTMLElement | null>(null);
const codeToolbarPosition = ref({ left: '0px', top: '0px' });
const codeLanguageMenuOpen = ref(false);
const codeLanguageQuery = ref('');
const codeLanguageTrigger = ref<HTMLElement | null>(null);
const codeLanguagePosition = ref<Record<string, string>>({});
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
let nextTableId = 0;
let savedRange: Range | null = null;
let savedSelectedBlocks: HTMLElement[] = [];
let lastModelValue = props.modelValue;
let history = createDocumentHistory(props.modelValue);
let composing = false;
let renderingVersion = false;
let selectionFrame = 0;
const imageObjectUrls = new Map<string, string>();
const imageLoads = new Map<string, Promise<string | null>>();
const retainedImages = new Map<string, () => void>();
let imageRequestVersion = 0;
const imageUploading = ref(false);
interface BlockPointerDragState { pointerId: number; block: HTMLElement; startX: number; startY: number }
let blockPointerDrag: BlockPointerDragState | null = null;
let suppressBlockClickUntil = 0;
let dropPlaceholder: HTMLElement | null = null;
let blockDragPreview: HTMLElement | null = null;
let dropAnchorTarget: HTMLElement | null = null;
let dropAnchorRect: { top: number; height: number } | null = null;
let dropBlockRects = new Map<HTMLElement, { documentTop: number; height: number }>();
interface ImageResizeState { pointerId: number; figure: HTMLElement; direction: (typeof imageResizeDirections)[number]; startX: number; startY: number; startWidth: number; startOffset: number; parentWidth: number; ratio: number }
let imageResizeState: ImageResizeState | null = null;

const codeLanguageGroups: readonly CommandGroup[] = [{
  id: 'code-languages', label: 'Lenguajes', items: LANGUAGES.map(([id, label]) => ({ id, label, keywords: ['lenguaje', id] })),
}];
const calloutIconItems: readonly MenuItem[] = CALL_OUT_ICONS.map((item) => ({ id: `callout-icon:${item.id}`, label: item.label, icon: item.icon }));

const slashBlockGroups: readonly CommandGroup[] = [{
  id: 'insert-text', label: 'Texto y listas', items: [
    { id: 'block:paragraph', label: 'Texto', keywords: ['párrafo', 'normal'], icon: Type },
    ...[1, 2, 3, 4].map((level) => ({ id: `block:heading${level}`, label: `Encabezado ${level}`, keywords: ['título'], icon: Type })),
    { id: 'block:bullet', label: 'Lista con viñetas', keywords: ['lista', 'puntos'], icon: List },
    { id: 'block:numbered', label: 'Lista numerada', keywords: ['lista', 'orden'], icon: ListOrdered },
    { id: 'block:task', label: 'Lista de tareas', keywords: ['checkbox', 'pendientes'], icon: ListTodo },
    { id: 'block:quote', label: 'Cita', keywords: ['bloque de cita'], icon: Quote },
    { id: 'block:highlight', label: 'Destacado', keywords: ['resaltar', 'marca'], icon: Highlighter },
  ],
}, {
  id: 'insert-content', label: 'Contenido', items: [
    { id: 'block:callout-icon', label: 'Cita destacada con icono', keywords: ['aviso', 'callout', 'icono'], icon: Quote },
    { id: 'block:callout-plain', label: 'Cita destacada', keywords: ['aviso', 'callout', 'color'], icon: Quote },
    { id: 'block:table', label: 'Tabla', keywords: ['filas', 'columnas', 'tabla'], icon: TableIcon },
    { id: 'block:code', label: 'Código', keywords: ['programación', 'pre'], icon: Code2 },
    { id: 'block:image', label: 'Imagen', keywords: ['foto', 'archivo', 'media'], icon: ImageIcon },
    { id: 'block:equation', label: 'Ecuación en bloque', keywords: ['math', 'fórmula'], icon: Sigma },
  ],
}, {
  id: 'insert-layout', label: 'Estructura', items: [
    { id: 'block:toggle', label: 'Lista desplegable', keywords: ['plegable', 'toggle'], icon: ChevronDown },
    { id: 'block:toc', label: 'Índice de contenidos', keywords: ['índice', 'encabezados', 'navegar'], icon: ListTree },
    { id: 'block:page-break', label: 'Salto de página', keywords: ['pdf', 'imprimir', 'sección'], icon: SeparatorHorizontal },
    { id: 'block:definition', label: 'Definición', keywords: ['glosario', 'término'], icon: BookOpen },
    { id: 'block:divider', label: 'Divisor', keywords: ['línea', 'separador'], icon: Minus },
    ...[2, 3, 4, 5].map((count) => ({ id: `block:columns:${count}`, label: `${count} columnas`, keywords: ['columnas', 'diseño'], icon: Columns3 })),
  ],
}];

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
    block.contentEditable = 'false';
    block.dataset.knoteTable = JSON.stringify(data);
    const id = `table-${props.pageId}-${++nextTableId}`;
    const app = createApp(TableBlockEditor, {
      id,
      model: data,
      onChange: (value: EditorTableData, group?: string) => {
        block.dataset.knoteTable = JSON.stringify(value);
        emitDocument(false, group ? `${id}-${group}` : '');
      },
    });
    app.mount(block);
    tableApps.set(block, app);
  });
}
function unmountTableBlocks(): void {
  tableApps.forEach((app) => app.unmount());
  tableApps.clear();
}
function rootElement(): HTMLElement | null { return editor.value; }
function directBlock(node: Node | null): HTMLElement | null {
  const root = rootElement();
  if (!root || !node) return null;
  let element = node instanceof HTMLElement ? node : node.parentElement;
  while (element && element !== root) {
    const callout = element.closest<HTMLElement>('.knote-callout, .knote-toc, dl');
    if (callout instanceof HTMLElement && root.contains(callout)) return callout;
    // A list is one editor block. Returning each LI here created a fresh
    // manager for every line and made dragging/deleting a list unpredictable.
    if (element instanceof HTMLLIElement && element.parentElement
      && ['UL', 'OL'].includes(element.parentElement.tagName)) return element.parentElement;
    const figure = element.closest<HTMLElement>('figure.knote-image-block');
    if (figure && root.contains(figure)) return figure;
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
    'p, h1, h2, h3, h4, ul, ol, blockquote, pre, hr, details, figure, dl, .knote-toc, .knote-callout, .knote-table-block, .knote-preview-columns, .knote-equation',
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
    savedSelectedBlocks = resolveSelectedBlocks(root, range);
  } else {
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
    if (insertMenu.value?.anchor.isConnected) insertPosition.value = commandPosition(insertMenu.value.anchor);
    if (formatBlocksOpen.value && formatTrigger.value) formatPosition.value = commandPosition(formatTrigger.value, 'end');
    if (codeLanguageMenuOpen.value && codeLanguageTrigger.value) codeLanguagePosition.value = commandPosition(codeLanguageTrigger.value);
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
  if (!['P', 'DIV'].includes(element.tagName) || hasVisibleEditorText(element.textContent)) return false;
  return Array.from(element.childNodes).every((node) =>
    node.nodeName === 'BR' || (node.nodeType === Node.TEXT_NODE && !hasVisibleEditorText(node.textContent)),
  );
}
function hasVisibleEditorText(value: string | null | undefined): boolean {
  return Boolean(value?.replace(/[\s\u00a0\u200b\ufeff]/g, ''));
}
function hasMeaningfulContent(root: HTMLElement): boolean {
  if (hasVisibleEditorText(root.textContent)) return true;
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
const editorContainers = '.knote-preview-column, details > div';
const plainEditorDiv = 'div:not(.knote-toc, .knote-callout, .knote-table-block, .knote-preview-columns, .knote-equation)';
const inlineEditorNode = 'a, span, strong, b, em, i, u, s, del, strike, code, mark, img, br';

function normalizeEditorDom(root: HTMLElement): void {
  const containers = [root, ...root.querySelectorAll<HTMLElement>(editorContainers)];
  const isInlineNode = (child: Node) => (child.nodeType === Node.TEXT_NODE && hasVisibleEditorText(child.textContent))
    || (child instanceof HTMLElement && child.matches(inlineEditorNode));
  const needsRepair = containers.some((container) => Array.from(container.childNodes).some((child) =>
    (child instanceof HTMLElement && child.matches(plainEditorDiv)) || isInlineNode(child),
  ));
  const restoreSelection = needsRepair ? bookmarkEditorSelection(root) : () => undefined;
  try {
    for (const container of containers) {
      let paragraph: HTMLElement | null = null;
      for (const child of Array.from(container.childNodes)) {
        if (child instanceof HTMLElement && child.matches(plainEditorDiv)) {
          paragraph = null;
          const wrapsBlocks = Boolean(child.querySelector(':scope > :is(p, h1, h2, h3, h4, ul, ol, blockquote, pre, details, figure, hr, div)'));
          if (wrapsBlocks) child.replaceWith(...Array.from(child.childNodes));
          else replaceTag(child, 'p');
        } else if (isInlineNode(child)) {
          if (!paragraph) {
            paragraph = document.createElement('p');
            container.insertBefore(paragraph, child);
          }
          paragraph.append(child);
        } else if (child.nodeType !== Node.COMMENT_NODE) paragraph = null;
      }
      if (!container.firstElementChild) container.append(blankElement('p'));
    }
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
      if (!summary.childNodes.length) summary.append(document.createElement('br'));
    });
    root.querySelectorAll<HTMLElement>('figure.knote-image-block').forEach((figure) => { if (!figure.querySelector('img')) figure.remove(); });
    root.querySelectorAll<HTMLElement>('ul, ol').forEach((list) => { if (!list.querySelector(':scope > li')) list.remove(); });
  } finally {
    restoreSelection();
  }
}
function updateSelectionToolbar(): void {
  if (formatBlocksOpen.value || linkEditorOpen.value || insertMenu.value || blockContextMenuOpen.value) return;
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount) { selectionOpen.value = false; return; }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)
    || (document.activeElement !== root && !toolbar.value?.contains(document.activeElement))) {
    selectionOpen.value = false;
    return;
  }
  const selectedText = selection.toString();
  if (range.collapsed || !selectedText.trim()) {
    savedRange = range.cloneRange();
    savedSelectedBlocks = [];
    selectionOpen.value = false;
    return;
  }
  savedRange = range.cloneRange();
  savedSelectedBlocks = resolveSelectedBlocks(root, range);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width || rect.height);
  const rect = rects[rects.length - 1] || range.getBoundingClientRect();
  if (rect.bottom < 48 || rect.top > window.innerHeight) { selectionOpen.value = false; return; }
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
function emitDocument(normalize = true, group = ''): void {
  const root = rootElement();
  if (!root || composing || renderingVersion) return;
  if (normalize) normalizeEditorDom(root);
  if ((activeCodeBlock.value && !root.contains(activeCodeBlock.value))
    || (activeCallout.value && !root.contains(activeCallout.value))
    || (activeImage.value && !root.contains(activeImage.value))) clearActiveComponentSettings();
  refreshDocumentOutline(root, props.pageId);
  mountTableBlocks(root);
  const contentNodes = Array.from(root.childNodes).filter((node) =>
    node instanceof HTMLElement || (node.nodeType === Node.TEXT_NODE && hasVisibleEditorText(node.textContent)),
  );
  const html = contentNodes.length > 1 || hasMeaningfulContent(root) ? sanitizeNodes(contentNodes) : '';
  updateEditorPlaceholder(root);
  const value = RICH_PREFIX + html;
  if (value === lastModelValue) return;
  history.record(value, captureDocumentSelection(root), group);
  lastModelValue = value;
  emit('update:modelValue', value);
}
function retainImage(id: string): void {
  if (!retainedImages.has(id)) retainedImages.set(id, retainBlockImage(id));
}
function loadImageUrl(id: string, root: HTMLElement): Promise<string | null> {
  const url = imageObjectUrls.get(id);
  if (url) return Promise.resolve(url);
  const pending = imageLoads.get(id);
  if (pending) return pending;
  const load = getBlockImage(id).then((asset) => {
    if (!asset || !root.isConnected) return null;
    const objectUrl = URL.createObjectURL(asset);
    imageObjectUrls.set(id, objectUrl);
    return objectUrl;
  }).catch(() => null).finally(() => imageLoads.delete(id));
  imageLoads.set(id, load);
  return load;
}
async function hydrateImageAssets(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-asset-id]'));
  await Promise.all(images.map(async (image) => {
    const id = image.dataset.assetId;
    if (!id || image.src.startsWith('blob:')) return;
    retainImage(id);
    const url = await loadImageUrl(id, root);
    if (url && root.contains(image)) image.src = url;
  }));
  if (root.isConnected) scheduleSelectionUpdate();
}
function requestImageInsertion(anchor: HTMLElement | null): void {
  insertionAnchor.value = anchor;
  if (anchor) imagePickerPosition.value = positionInsideShell(anchor, Math.max(6, anchor.getBoundingClientRect().height + 6));
  else imagePickerPosition.value = { left: '36px', top: '8px' };
  imageError.value = '';
  selectedImageFiles.value = [];
  imagePickerOpen.value = true;
  codeLanguageMenuOpen.value = false;
}
function insertImageFile(file: File): void {
  const root = rootElement();
  if (!root || imageUploading.value) return;
  if (!file.type.startsWith('image/')) {
    imageError.value = 'Elige un archivo de imagen.';
    imagePickerOpen.value = true;
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    imageError.value = 'La imagen supera el límite de 12 MB.';
    imagePickerOpen.value = true;
    return;
  }
  const originalAnchor = insertionAnchor.value;
  const request = ++imageRequestVersion;
  imageUploading.value = true;
  void (async () => {
    try {
      const optimizedImage = await optimizeEditorImage(file);
      if (!root.isConnected || request !== imageRequestVersion) return;
      const id = crypto.randomUUID();
      const release = retainBlockImage(id);
      try {
        await saveBlockImage(optimizedImage, id);
        if (!root.isConnected || request !== imageRequestVersion) return;
        retainImage(id);
      } finally { release(); }
      const src = URL.createObjectURL(optimizedImage);
      imageObjectUrls.set(id, src);
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

      let anchor = originalAnchor;
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
    } catch (error) {
      if (!root.isConnected || request !== imageRequestVersion) return;
      imagePickerOpen.value = true;
      imageError.value = error instanceof Error ? `No se pudo insertar la imagen: ${error.message}` : 'No se pudo guardar la imagen en este dispositivo.';
    } finally {
      if (request === imageRequestVersion) imageUploading.value = false;
    }
  })();
}
async function optimizeEditorImage(file: File): Promise<Blob> {
  // Keep animated GIFs intact; rasterizing them would silently discard animation.
  if (file.type === 'image/gif') return file;
  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (typeof createImageBitmap !== 'function') throw new Error('Este navegador no puede procesar la imagen.');
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / bitmap.width, 1800 / bitmap.height);
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas?.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.')), 'image/webp', quality);
    });
    const blob = await encode(.88);
    if (blob.size <= 6 * 1024 * 1024) return blob;
    const smaller = await encode(.72);
    if (smaller.size <= 6 * 1024 * 1024) return smaller;
    throw new Error('La imagen sigue siendo demasiado grande después de optimizarla.');
  } catch (error) {
    if (file.size <= 6 * 1024 * 1024) return file;
    throw error;
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
function handleImageSelection(files: readonly File[]): void {
  selectedImageFiles.value = files;
  if (files[0]) insertImageFile(files[0]);
}
function cancelImageInsertion(): void {
  imageRequestVersion += 1;
  imageUploading.value = false;
  imagePickerOpen.value = false;
  insertionAnchor.value = null;
  selectedImageFiles.value = [];
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
  const trailing = block.matches('hr, .knote-toc') ? blankElement('p') : null;
  if (target?.parentNode) {
    if (isBlankParagraph(target)) target.replaceWith(...(trailing ? [block, trailing] : [block]));
    else target.after(...(trailing ? [block, trailing] : [block]));
  } else root.append(...(trailing ? [block, trailing] : [block]));
  if (id === 'block:table') mountTableBlocks(root);
  insertionAnchor.value = null;
  const caretTarget = trailing || block.querySelector<HTMLElement>(':scope > dd') || block;
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
  const top = rect.top - bounds.top + (sideRailFits ? offset : -actionsHeight - 6);
  return { left: `${left}px`, top: `${top}px` };
}
function handleBlockContextSelection(selection: MenuSelection): void {
  const block = contextTargetBlock.value ?? hoveredBlock.value;
  const root = rootElement();
  if (!block || !root?.contains(block)) return;
  if (selection.id === 'delete-block') deleteContextTargetBlock();
  if (selection.id === 'move-up' || selection.id === 'move-down') moveBlockByKeyboard(selection.id === 'move-up' ? -1 : 1, block);
  if (selection.id === 'settings') showComponentSettings(block);
  if (selection.id === 'duplicate') {
    const template = document.createElement('template');
    template.innerHTML = sanitizeNodes([block]);
    const copy = template.content.firstElementChild as HTMLElement | null;
    if (!copy) return;
    block.after(copy);
    if (copy.matches('.knote-table-block')) mountTableBlocks(root);
    finishBlockAction(copy);
    void hydrateImageAssets(root);
  }
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
  finishBlockAction(focusTarget);
}
function commandPosition(anchor: HTMLElement, align: 'start' | 'end' = 'start'): Record<string, string> {
  const rect = anchor.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportBottom = viewportTop + viewportHeight;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const width = Math.max(0, Math.min(20 * rem, viewportWidth - 16));
  const left = align === 'end' ? rect.right - width : rect.left;
  const gap = 6;
  const below = viewportBottom - rect.bottom - gap - 8;
  const above = rect.top - viewportTop - gap - 8;
  const searchHeight = 2.5 * rem + 2;
  const listHeight = Math.min(18 * rem, viewportHeight * .45);
  const showAbove = below < searchHeight + listHeight && above > below;
  return {
    left: `${Math.max(viewportLeft + 8, Math.min(left, viewportLeft + viewportWidth - width - 8))}px`,
    width: `${width}px`,
    ...(showAbove
      ? { bottom: `${window.innerHeight - Math.min(rect.top - gap, viewportBottom - 8)}px` }
      : { top: `${Math.max(rect.bottom + gap, viewportTop + 8)}px` }),
    '--knote-command-list-height': `${Math.max(0, Math.min(listHeight, (showAbove ? above : below) - searchHeight))}px`,
  };
}
function focusCommand(selector: string): void {
  void nextTick(() => shell.value?.querySelector<HTMLInputElement>(`${selector} [role="combobox"]`)?.focus({ preventScroll: true }));
}
function showInsertMenu(anchor: HTMLElement, source: 'slash' | 'button', query = ''): void {
  selectionOpen.value = false;
  linkEditorOpen.value = false;
  blockContextMenuOpen.value = false;
  clearActiveComponentSettings();
  insertMenu.value = { anchor, source };
  insertQuery.value = query;
  insertPosition.value = commandPosition(anchor);
  focusCommand('.knote-block-insert-menu');
}
function openBlockMenu(): void {
  if (insertMenu.value?.source === 'button') { closeInsertMenu(true); return; }
  const block = hoveredBlock.value;
  closeInsertMenu();
  if (block && editor.value?.contains(block)) showInsertMenu(block, 'button');
}
function handleBlockMenuSelection(item: CommandItem): void {
  const menu = insertMenu.value;
  if (!menu || !item.id.startsWith('block:')) return;
  insertMenu.value = null;
  insertQuery.value = '';
  insertBlockAt(menu.anchor, item.id);
}
function closeInsertMenu(restoreFocus = false): void {
  const menu = insertMenu.value;
  if (!menu) return;
  const query = insertQuery.value;
  insertMenu.value = null;
  insertQuery.value = '';
  if (!editor.value?.contains(menu.anchor)) return;
  if (menu.source === 'slash') {
    menu.anchor.textContent = '/' + query;
    emitDocument();
  }
  if (restoreFocus) placeCaretAtEnd(menu.anchor);
  scheduleSelectionUpdate();
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
  setImageDimensions(state.figure, widthPercent, offsetPercent);
}
function setImageDimensions(figure: HTMLElement, width: number, offset: number): void {
  figure.dataset.width = String(width);
  figure.dataset.offset = String(offset);
  figure.style.setProperty('--knote-image-width', `${width}%`);
  figure.style.setProperty('--knote-image-offset', `${offset}%`);
  imageResizePosition.value = imageResizeHandlesAt(figure);
}
function resizeImageWithKeyboard(event: KeyboardEvent): void {
  const figure = activeImage.value;
  if (!figure || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
  const width = Math.max(20, Math.min(100, Number(figure.dataset.width || 100) + direction * (event.shiftKey ? 10 : 2)));
  setImageDimensions(figure, width, Math.min(Number(figure.dataset.offset || 0), 100 - width));
  emitDocument(false);
}
function finishImageResize(event?: PointerEvent): void {
  const state = imageResizeState;
  if (!state || (event && event.pointerId !== state.pointerId)) return;
  imageResizeState = null;
  document.removeEventListener('pointermove', applyImageResize);
  document.removeEventListener('pointerup', finishImageResize);
  document.removeEventListener('pointercancel', finishImageResize);
  if (event?.type === 'pointercancel') {
    const width = state.startWidth / state.parentWidth * 100;
    const offset = state.startOffset / state.parentWidth * 100;
    setImageDimensions(state.figure, width, offset);
    scheduleSelectionUpdate();
    return;
  }
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
  if (showComponentSettings(target)) event.preventDefault();
}
function showComponentSettings(target: Element): boolean {
  const root = rootElement();
  if (!root) return false;
  const code = target.closest('pre');
  const callout = target.closest('.knote-callout');
  const image = target.closest('figure.knote-image-block');
  const nextCode = code instanceof HTMLElement && root.contains(code) ? code : null;
  const nextCallout = callout instanceof HTMLElement && root.contains(callout) ? callout : null;
  const nextImage = image instanceof HTMLElement && root.contains(image) ? image : null;
  if (!nextCode && !nextCallout && !nextImage) {
    if (shell.value?.contains(target)) clearActiveComponentSettings();
    return false;
  }

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
  return true;
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
  if (event.pointerType === 'touch') return;
  const relatedTarget = event.relatedTarget;
  if (blockContextMenuOpen.value || insertMenu.value || imagePickerOpen.value || codeLanguageMenuOpen.value || calloutToolsPinned.value || imageToolsPinned.value) return;
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
  if (target instanceof Element && (target.closest('.knote-editor-control, [data-balsa="menu-list"]') || blockContextMenuOpen.value || insertMenu.value)) return;
  if (editorHitAreaContains(event.clientX)) {
    const root = editor.value;
    const block = target instanceof Element && root?.contains(target)
      ? blockAtPointer(target, event.clientY)
      : nearestBlockAtY(event.clientY);
    if (block) { showBlockActions(block); return; }
  }
  if (editor.value !== document.activeElement) hoveredBlock.value = null;
}
function beginBlockPointerDrag(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || !hoveredBlock.value) return;
  const root = rootElement();
  dropBlockRects = new Map(
    Array.from(root?.querySelectorAll<HTMLElement>(
      'p, h1, h2, h3, h4, ul, ol, blockquote, pre, hr, details, figure, dl, .knote-toc, .knote-callout, .knote-table-block, .knote-preview-columns, .knote-equation',
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
    'p, h1, h2, h3, h4, ul, ol, blockquote, pre, hr, details, figure, dl, .knote-toc, .knote-callout, .knote-table-block, .knote-preview-columns, .knote-equation',
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
  let moved = false;
  if (dragged) suppressBlockClickUntil = performance.now() + 350;
  if (!cancelled && dragged && editorHitAreaContains(event.clientX)) {
    const target = dropTargetAtPointer(event.clientX, event.clientY);
    if (target && canDropBlock(dragged, target)) {
      updateDropPlaceholder(target, event.clientY);
      moved = Boolean(dropAnchorTarget && commitDropPlaceholder(dragged));
    }
  }
  blockPointerDrag = null;
  document.removeEventListener('pointermove', handleBlockPointerMove);
  document.removeEventListener('pointerup', handleBlockPointerUp);
  document.removeEventListener('pointercancel', handleBlockPointerUp);
  finishBlockDrag();
  if (dragged && moved) finishBlockAction(dragged);
}
function handleEditorDragOver(event: DragEvent): void {
  if (Array.from(event.dataTransfer?.files ?? []).some((file) => file.type.startsWith('image/'))) {
    event.preventDefault();
    return;
  }
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
  const image = Array.from(event.dataTransfer?.files ?? []).find((file) => file.type.startsWith('image/'));
  if (image) {
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    insertionAnchor.value = target ? directBlock(target) : null;
    insertImageFile(image);
    return;
  }
  const dragged = draggedBlock.value;
  const target = dropTargetAtPointer(event.clientX, event.clientY);
  if (!dragged || !target || !canDropBlock(dragged, target)) { finishBlockDrag(); return; }
  event.preventDefault();
  updateDropPlaceholder(target, event.clientY);
  const moved = commitDropPlaceholder(dragged);
  finishBlockDrag();
  if (moved) finishBlockAction(dragged);
}
function finishBlockAction(block: HTMLElement): void {
  hoveredBlock.value = block;
  placeCaretAtEnd(block);
  emitDocument();
  scheduleSelectionUpdate();
}
function moveBlockByKeyboard(direction: -1 | 1, block = hoveredBlock.value): void {
  if (!block?.parentElement) return;
  const neighbor = direction < 0 ? block.previousElementSibling : block.nextElementSibling;
  if (!neighbor) return;
  if (direction < 0) neighbor.before(block); else neighbor.after(block);
  finishBlockAction(block);
}
function handleBlockHandlePointerDown(event: PointerEvent): void {
  suppressBlockClickUntil = 0;
  rememberBlockContextTarget();
  beginBlockPointerDrag(event);
}
function handleBlockHandleClick(event: MouseEvent): void {
  if (performance.now() >= suppressBlockClickUntil) return;
  event.preventDefault();
  event.stopPropagation();
}
async function copyCode(): Promise<void> {
  const block = activeCodeBlock.value;
  if (!block) return;
  const code = codeBlockText(block);
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
  closeCodeLanguageMenu(true);
  emitDocument();
}
function toggleCodeLanguageMenu(event: MouseEvent): void {
  if (codeLanguageMenuOpen.value) { closeCodeLanguageMenu(true); return; }
  if (!(event.currentTarget instanceof HTMLElement)) return;
  codeLanguageTrigger.value = event.currentTarget;
  codeLanguagePosition.value = commandPosition(event.currentTarget);
  codeLanguageMenuOpen.value = true;
  focusCommand('.knote-code-language-menu');
}
function closeCodeLanguageMenu(restoreFocus = false): void {
  codeLanguageMenuOpen.value = false;
  if (restoreFocus) codeLanguageTrigger.value?.focus({ preventScroll: true });
}
function languageLabel(block: HTMLElement | null): string {
  const id = safeLanguage(block?.dataset.language || null);
  return LANGUAGES.find(([candidate]) => candidate === id)?.[1] || 'Texto sin formato';
}
function resolveSelectedBlocks(root: HTMLElement, range: Range): HTMLElement[] {
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
  const start = directBlock(range.startContainer);
  const end = directBlock(range.endContainer);
  if (start && start === end) return [start];
  const container = start?.parentElement === end?.parentElement ? start?.parentElement ?? root : root;
  return Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement && range.intersectsNode(child));
}
function getSelectedBlocks(): HTMLElement[] {
  const root = rootElement();
  const range = savedRange && restoreSelection() ? savedRange : null;
  if (!root || !range) return [];
  const captured = savedSelectedBlocks.filter((block) => root.contains(block));
  if (captured.length) return captured;
  return resolveSelectedBlocks(root, range);
}
function wrapSelected(tag: string, attributes: Record<string, string> = {}): void {
  const range = restoreSelection();
  if (!range || range.collapsed) return;
  const root = rootElement();
  if (!root) return;
  history.remember(captureDocumentSelection(root));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const segments: { node: Text; start: number; end: number }[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!range.intersectsNode(node) || node.parentElement?.closest('[contenteditable="false"], pre')) continue;
    const start = range.startContainer === node ? range.startOffset : 0;
    const end = range.endContainer === node ? range.endOffset : node.length;
    if (start < end) segments.push({ node, start, end });
  }
  const wrappers: HTMLElement[] = [];
  for (const { node, start, end } of segments) {
    if (tag === 'a' && node.parentElement?.closest('a')) continue;
    const selected = document.createRange();
    selected.setStart(node, start);
    selected.setEnd(node, end);
    const wrapper = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) wrapper.setAttribute(key, value);
    selected.surroundContents(wrapper);
    wrappers.push(wrapper);
  }
  if (!wrappers.length) return;
  const next = document.createRange();
  next.setStart(wrappers[0], 0);
  const last = wrappers[wrappers.length - 1];
  next.setEnd(last, last.childNodes.length);
  savedRange = next;
  restoreSelection();
  emitDocument();
  scheduleSelectionUpdate();
}
function insertFragmentAtSelection(fragment: Node): boolean {
  const range = restoreSelection();
  if (!range) return false;
  const first = fragment instanceof DocumentFragment ? fragment.firstChild : fragment;
  const last = fragment instanceof DocumentFragment ? fragment.lastChild : fragment;
  if (!first || !last) return false;
  range.deleteContents();
  range.insertNode(fragment);
  range.setStartAfter(last);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  savedRange = range.cloneRange();
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
  closeFormatMenu();
  const range = restoreSelection();
  if (!range || range.startContainer.parentElement?.closest('pre')) return;
  if (command === 'insertHTML') wrapSelected('code');
  else if (command === 'removeFormat') {
    if (!range.collapsed && textBlockAt(range.startContainer) === textBlockAt(range.endContainer)) unwrapSelectedFormatting(range);
  } else if (command === 'hiliteColor') {
    const color = safeBlockColor(value);
    if (color) wrapSelected('mark', { 'data-knote-color': color, style: '--knote-highlight-color:' + color });
  } else document.execCommand(command);
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
  closeFormatMenu();
  const selection = window.getSelection();
  const anchor = selection?.anchorNode instanceof Element
    ? selection.anchorNode.closest('a')
    : selection?.anchorNode?.parentElement?.closest('a');
  linkDraft.value = anchor?.getAttribute('href') || 'https://';
  linkEditorOpen.value = true;
  void nextTick(() => document.getElementById(`block-link-${props.pageId}`)?.focus());
}
function cancelLinkEdit(): void {
  linkEditorOpen.value = false;
  restoreSelection();
  scheduleSelectionUpdate();
}

function placeCaretAtEnd(target: HTMLElement | null, atStart = false): void {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection) return;
  let block = target && root.contains(target) ? target : root.lastElementChild as HTMLElement | null;
  if (!block) return;
  if (block.matches('.knote-table-block')) {
    const cell = block.querySelector<HTMLElement>('[data-table-row="0"][data-table-column="0"]');
    cell?.focus({ preventScroll: true });
    if (cell) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(atStart);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return;
  }
  if (block instanceof HTMLDetailsElement) block = block.querySelector('summary') ?? block;
  if (block.matches('.knote-preview-columns')) block = block.querySelector<HTMLElement>('.knote-preview-column > p') ?? block;
  if (block.matches('ul, ol')) block = block.querySelector<HTMLElement>(':scope > li:last-child') ?? block;
  if (block.matches('.knote-callout')) block = block.querySelector('p') ?? block;
  if (block.matches('pre')) block = block.querySelector('code') ?? block;
  if (block.matches('figure')) block = block.querySelector('figcaption') ?? block;
  if (block.matches('p:has(> mark:only-child)') && !hasVisibleEditorText(block.textContent)) block = block.firstElementChild as HTMLElement;
  const range = document.createRange();
  range.selectNodeContents(block);
  const nestedList = block.querySelector(':scope > :is(ul, ol)');
  if (nestedList) range.setEndBefore(nestedList);
  range.collapse(atStart);
  if (atStart && block.firstChild instanceof HTMLInputElement) range.setStartAfter(block.firstChild);
  root.focus({ preventScroll: true });
  selection.removeAllRanges();
  selection.addRange(range);
  savedRange = range.cloneRange();
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

function canApplyBlock(id: string, targets: readonly HTMLElement[]): boolean {
  if (['block:toc', 'block:page-break', 'block:definition'].includes(id)) return false;
  if (['block:image', 'block:divider', 'block:highlight'].includes(id)) return true;
  if (targets.some((target) => target.matches('figure, .knote-table-block, .knote-preview-columns, details, hr'))) return false;
  return !targets.some((target) => target.matches('ul, ol'))
    || ['block:paragraph', 'block:bullet', 'block:numbered', 'block:task', 'block:table'].includes(id);
}
function convertBlocksToTable(targets: HTMLElement[]): void {
  const items = targets.flatMap((target) => target.matches('ul, ol')
    ? Array.from(target.querySelectorAll<HTMLLIElement>(':scope > li'))
    : [target]);
  const nestedLists: HTMLElement[] = [];
  const rows = items.map((item) => {
    if (!(item instanceof HTMLLIElement)) return [item.innerText, '', ''];
    const { content, nestedLists: nested } = listItemContent(item);
    nestedLists.push(...nested);
    return [content.map((node) => node.nodeName === 'BR' ? '\n' : node.textContent ?? '').join(''), '', ''];
  });
  if (rows.length > TABLE_LIMITS.rows || rows.some(([value]) => value.length > TABLE_LIMITS.cell)) {
    insertBlockAt(targets[targets.length - 1], 'block:table');
    return;
  }
  const tableBlock = createBlock('block:table');
  tableBlock.dataset.knoteTable = JSON.stringify(normalizeTableData({ ...EMPTY_TABLE, rows }));
  const replacement = [tableBlock, ...nestedLists];
  if (targets.every((target): target is HTMLLIElement => target instanceof HTMLLIElement)) {
    if (!replaceSelectedListItems(targets, () => replacement)) return;
  } else {
    targets[0].before(...replacement);
    targets.forEach((target) => target.remove());
  }
  emitDocument();
  placeCaretAtEnd(tableBlock);
  scheduleSelectionUpdate();
}
function textLinesFromWrapper(wrapper: HTMLElement): HTMLElement[] {
  const lines: HTMLElement[] = [];
  let inlineLine: HTMLParagraphElement | null = null;
  for (const node of Array.from(wrapper.childNodes)) {
    if (node instanceof HTMLElement && node.matches('.knote-callout-icon')) continue;
    if (node instanceof HTMLElement && !node.matches(inlineEditorNode)) {
      lines.push(node);
      inlineLine = null;
    } else {
      if (!inlineLine) {
        inlineLine = document.createElement('p');
        lines.push(inlineLine);
      }
      inlineLine.append(node);
    }
  }
  return lines.length ? lines : [blankElement('p')];
}
function changeTextBlockTag(block: HTMLElement, tag: string): HTMLElement {
  if (!block.matches('blockquote, .knote-callout')) return replaceTag(block, tag);
  const lines = textLinesFromWrapper(block).map((line) => line.matches('p, h1, h2, h3, h4') ? replaceTag(line, tag) : line);
  block.replaceWith(...lines);
  return lines[0];
}
function applyBlock(id: string): void {
  const root = rootElement();
  if (!root) return;
  if (id === 'block:highlight' && savedRange && !savedRange.collapsed) { wrapSelected('mark'); return; }
  const targets = getSelectedBlocks();
  if (!targets.length || !canApplyBlock(id, targets)) return;
  history.remember(captureDocumentSelection(root));
  if (id === 'block:image') { requestImageInsertion(targets[0]); return; }
  if (id === 'block:table') { convertBlocksToTable(targets); return; }
  let focusTarget: HTMLElement | null = null;
  const heading = /^block:heading([1-4])$/.exec(id);
  const listItems = targets.filter((target): target is HTMLLIElement => target instanceof HTMLLIElement);
  if (listItems.length && listItems.length === targets.length) {
    if (id === 'block:bullet' || id === 'block:numbered' || id === 'block:task') {
      focusTarget = convertListItemsToList(listItems, id);
    } else if (id === 'block:divider') {
      const lastList = listItems[listItems.length - 1].parentElement;
      if (lastList) insertBlockAt(lastList, id);
      return;
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
      if (node.matches('h1, h2, h3, h4, blockquote, .knote-callout')) {
        const paragraph = changeTextBlockTag(node, 'p');
        focusTarget ??= paragraph;
      } else if (node.tagName === 'UL' || node.tagName === 'OL') {
        const paragraphs = Array.from(node.querySelectorAll<HTMLLIElement>(':scope > li'))
          .flatMap((item) => blockFromListItem('block:paragraph', item));
        if (!paragraphs.length) paragraphs.push(blankElement('p'));
        node.replaceWith(...paragraphs);
        focusTarget ??= paragraphs[0];
      } else if (node.matches('pre, .knote-equation')) {
        const paragraph = document.createElement('p');
        paragraph.textContent = node.innerText;
        node.replaceWith(paragraph);
        focusTarget ??= paragraph;
      } else {
        focusTarget ??= node;
      }
    });
  } else if (heading) {
    targets.forEach((node) => { const block = changeTextBlockTag(node, `h${heading[1]}`); focusTarget ??= block; });
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
          const content = source.matches('blockquote, .knote-callout')
            ? textLinesFromWrapper(source)
            : Array.from(source.childNodes).filter((child) => !(child instanceof HTMLInputElement));
          if (id === 'block:task') {
            const checked = source.querySelector<HTMLInputElement>(':scope > input[type="checkbox"]')?.checked ?? false;
            item.dataset.task = String(checked);
            item.append(createTaskCheckbox(checked));
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
      quote.append(...(node.matches('.knote-callout') ? textLinesFromWrapper(node) : Array.from(node.childNodes)));
      node.replaceWith(quote);
      focusTarget ??= quote;
    });
  } else if (id === 'block:callout-icon' || id === 'block:callout-plain') {
    targets.forEach((node) => {
      const callout = createBlock(id);
      const body = callout.querySelector('p');
      const lines = node.matches('blockquote, .knote-callout') ? textLinesFromWrapper(node) : [node];
      for (const line of lines) {
        if (line.matches('p, h1, h2, h3, h4, pre, .knote-equation') && body) {
          if (line !== lines[0]) body.append(document.createElement('br'));
          if (line === lines[0]) body.replaceChildren();
          if (line.matches('pre, .knote-equation')) body.append(line.innerText);
          else body.append(...line.childNodes);
        } else callout.append(line);
      }
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
    const divider = document.createElement('hr');
    const paragraph = blankElement('p');
    const last = targets[targets.length - 1];
    if (isBlankParagraph(last)) last.replaceWith(divider, paragraph);
    else last.after(divider, paragraph);
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
  replacement.append(...node.childNodes);
  if (!replacement.childNodes.length) replacement.append(document.createElement('br'));
  node.replaceWith(replacement);
  return replacement;
}
function toggleFormatMenu(event: MouseEvent): void {
  if (formatBlocksOpen.value) { closeFormatMenu(true); return; }
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const targets = savedSelectedBlocks;
  formatGroups.value = slashBlockGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => canApplyBlock(item.id, targets)),
  }));
  formatTrigger.value = event.currentTarget;
  formatPosition.value = commandPosition(event.currentTarget, 'end');
  formatBlocksOpen.value = true;
  focusCommand('.knote-selection-format-menu');
}
function closeFormatMenu(restoreFocus = false): void {
  if (!formatBlocksOpen.value) return;
  formatBlocksOpen.value = false;
  formatQuery.value = '';
  if (restoreFocus) restoreSelection();
  scheduleSelectionUpdate();
}
function handleFormatSelection(item: CommandItem): void {
  closeFormatMenu();
  applyBlock(item.id);
}
function handleCommandEscape(event: KeyboardEvent, close: () => void): void {
  if (event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  close();
}
function openSlashMenuFromCaret(): boolean {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount || insertMenu.value) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.startContainer)) return false;
  const block = textBlockAt(range.startContainer);
  if (!block || block.tagName !== 'P' || !block.parentElement?.matches('.knote-block-editor, ' + editorContainers)) return false;
  const suffix = document.createRange();
  suffix.selectNodeContents(block);
  suffix.setStart(range.endContainer, range.endOffset);
  if (suffix.toString()) return false;
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

  showInsertMenu(block, 'slash', match[1]);
  return true;
}
function applyTypedBlockShortcut(): boolean {
  const root = rootElement();
  const selection = window.getSelection();
  if (!root || !selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.startContainer)) return false;
  const block = textBlockAt(range.startContainer);
  if (!block || block.tagName !== 'P' || !block.parentElement?.matches('.knote-block-editor, ' + editorContainers)) return false;

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
function handleEditorInput(event?: InputEvent): void {
  const root = rootElement();
  if (!root || composing || event?.isComposing || renderingVersion) return;
  normalizeEditorDom(root);
  updateEditorPlaceholder(root);
  rememberSelection();
  const typing = !event || event.inputType === 'insertText' || event.inputType === 'insertCompositionText';
  if (typing && openSlashMenuFromCaret()) {
    selectionOpen.value = false;
    return;
  }
  if (typing && applyTypedBlockShortcut()) return;
  const type = event?.inputType;
  const group = type === 'insertText' || type === 'deleteContentBackward' || type === 'deleteContentForward' ? type : '';
  emitDocument(false, group);
  scheduleSelectionUpdate();
}
function finishComposition(): void {
  composing = false;
  handleEditorInput();
}
function startComposition(): void {
  if (editor.value) history.remember(captureDocumentSelection(editor.value));
  composing = true;
}
function changeListIndent(item: HTMLLIElement, outdent: boolean): boolean {
  const root = rootElement();
  const list = item.parentElement;
  if (!root || !list || !['UL', 'OL'].includes(list.tagName)) return false;
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const focus = selection?.focusNode;
  const anchorOffset = selection?.anchorOffset ?? 0;
  const focusOffset = selection?.focusOffset ?? 0;

  if (outdent) {
    const parentItem = list.parentElement;
    const parentList = parentItem?.parentElement;
    if (parentItem?.tagName !== 'LI' || !parentList || !['UL', 'OL'].includes(parentList.tagName)) return false;
    if (item.nextElementSibling) {
      const tail = list.cloneNode(false) as HTMLElement;
      if (list instanceof HTMLOListElement && tail instanceof HTMLOListElement) {
        const offset = Array.from(list.children).indexOf(item) + 1;
        tail.start = list.start + (list.reversed ? -offset : offset);
      }
      while (item.nextElementSibling) tail.append(item.nextElementSibling);
      item.append(tail);
    }
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

  if (selection && anchor && focus && item.contains(anchor) && item.contains(focus)) {
    selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
    rememberSelection();
  } else placeCaretAtEnd(item);
  emitDocument();
  scheduleSelectionUpdate();
  return true;
}
function insertSoftBreak(range: Range): void {
  if (document.execCommand('insertLineBreak')) return;
  range.deleteContents();
  const lineBreak = document.createElement('br');
  range.insertNode(lineBreak);
  const caret = document.createRange();
  caret.setStartAfter(lineBreak);
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
function insertCodeText(block: HTMLElement, range: Range, text: string): void {
  const source = codeBlockText(block);
  const before = caretLineText(block, range, 'before').length;
  const throughSelection = document.createRange();
  throughSelection.selectNodeContents(block);
  throughSelection.setEnd(range.endContainer, range.endOffset);
  const end = throughSelection.toString().length;
  const node = document.createTextNode(source.slice(0, before) + text + source.slice(end));
  const code = document.createElement('code');
  code.append(node);
  block.replaceChildren(code);
  window.getSelection()?.collapse(node, before + text.length);
  rememberSelection();
  emitDocument();
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
  if (event.isComposing || composing || event.defaultPrevented) return;
  if (event.altKey && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    const block = directBlock(window.getSelection()?.anchorNode ?? null);
    if (!block) return;
    event.preventDefault();
    moveBlockByKeyboard(event.key === 'ArrowUp' ? -1 : 1, block);
    return;
  }
  if (event.key === 'Backspace') {
    const root = rootElement();
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount || !selection.getRangeAt(0).collapsed || !root.contains(selection.anchorNode)) return;
    const anchor = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement;
    const adjacent = selection.anchorNode === root
      ? root.childNodes.item(selection.anchorOffset) ?? root.childNodes.item(selection.anchorOffset - 1)
      : null;
    const adjacentList = adjacent instanceof HTMLElement && ['UL', 'OL'].includes(adjacent.tagName) ? adjacent : null;
    const item = anchor?.closest('li') ?? adjacentList?.querySelector(':scope > li:last-child');
    if (item instanceof HTMLLIElement && root.contains(item) && item.parentElement && ['UL', 'OL'].includes(item.parentElement.tagName)) {
      const list = item.parentElement;
      const hasNestedItems = Boolean(item.querySelector(':scope > ul li, :scope > ol li'));
      const content = Array.from(item.childNodes).filter((node) => !(node instanceof HTMLInputElement) && node.nodeName !== 'BR' && !(node instanceof HTMLElement && ['UL', 'OL'].includes(node.tagName)));
      const empty = !content.some((node) => hasVisibleEditorText(node.textContent)) && !hasNestedItems;
      const range = selection.getRangeAt(0);
      const atStart = !hasVisibleEditorText(caretLineText(item, range, 'before'));
      if (empty && atStart) {
        event.preventDefault();
        if (list.parentElement instanceof HTMLLIElement) {
          changeListIndent(item, true);
          return;
        }
        item.remove();
        const paragraph = blankElement('p');
        if (!list.querySelector(':scope > li')) list.replaceWith(paragraph);
        else list.after(paragraph);
        placeCaretAtEnd(paragraph);
        emitDocument();
        scheduleSelectionUpdate();
        return;
      }
    }
    const paragraph = anchor?.closest('p');
    const previous = paragraph?.previousElementSibling;
    if (paragraph instanceof HTMLElement && root.contains(paragraph) && isBlankParagraph(paragraph) && previous instanceof HTMLElement && ['UL', 'OL'].includes(previous.tagName)) {
      const lastItem = previous.querySelector(':scope > li:last-child');
      if (lastItem instanceof HTMLLIElement) {
        event.preventDefault();
        paragraph.remove();
        placeCaretAtEnd(lastItem);
        emitDocument();
        scheduleSelectionUpdate();
        return;
      }
    }
    return;
  }
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
    if (pre instanceof HTMLElement && root.contains(pre) && pre.contains(range.startContainer) && pre.contains(range.endContainer)) {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        insertAfterBlock(pre);
      } else {
        insertCodeText(pre, range, '\n');
      }
      return;
    }

    const item = anchor.closest('li');
    if (item instanceof HTMLLIElement && root.contains(item) && item.parentElement && ['UL', 'OL'].includes(item.parentElement.tagName)) {
      const end = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
      if (!range.collapsed && end?.closest('li') !== item) return;
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
      const empty = !content.some((node) => hasVisibleEditorText(node.textContent)) && !hasNestedItems;
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
        Array.from(tail.children).filter((child) => child.matches('input[type="checkbox"]')).forEach((input) => input.remove());
        const nextItem = document.createElement('li');
        if (task) {
          nextItem.dataset.task = 'false';
          nextItem.append(createTaskCheckbox());
        }
        nextItem.append(tail);
        if (!nextItem.textContent?.trim() && !nextItem.querySelector('ul, ol')) nextItem.append(document.createElement('br'));
        if (!item.textContent?.trim() && !item.querySelector('br, ul, ol')) item.append(document.createElement('br'));
        item.after(nextItem);
        placeCaretAtEnd(nextItem, true);
      }
      emitDocument();
      scheduleSelectionUpdate();
      return;
    }

    const callout = anchor.closest('.knote-callout');
    const quote = anchor.closest('blockquote');
    const emptyQuoteLine = anchor.closest('blockquote p');
    const calloutLine = anchor.closest('.knote-callout > p');
    if (callout instanceof HTMLElement && calloutLine instanceof HTMLElement && calloutLine.contains(range.endContainer)) {
      event.preventDefault();
      if (!event.shiftKey && (event.ctrlKey || event.metaKey || isBlankParagraph(calloutLine))) insertAfterBlock(callout);
      else {
        insertSoftBreak(range);
        emitDocument();
      }
      return;
    }
    if (!event.shiftKey && quote instanceof HTMLElement && root.contains(quote) && (!quote.textContent?.trim() || (emptyQuoteLine instanceof HTMLElement && isBlankParagraph(emptyQuoteLine)))) {
      event.preventDefault();
      insertAfterBlock(quote);
      return;
    }

    const caption = anchor.closest('figcaption');
    const figure = caption?.closest('figure.knote-image-block');
    const equation = anchor.closest('.knote-equation');
    if (!event.shiftKey && ((caption instanceof HTMLElement && figure instanceof HTMLElement) || equation instanceof HTMLElement)) {
      event.preventDefault();
      insertAfterBlock((caption ? figure : equation) as HTMLElement);
      return;
    }

    const detailsBody = anchor.closest('details > div');
    if (!event.shiftKey && detailsBody instanceof HTMLElement && root.contains(detailsBody) && !detailsBody.textContent?.trim()) {
      event.preventDefault();
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
    const codeBlock = anchor?.closest('pre');
    if (!event.shiftKey && codeBlock instanceof HTMLElement && root.contains(codeBlock)) {
      event.preventDefault();
      insertCodeText(codeBlock, selection.getRangeAt(0), '    ');
      return;
    }
    const item = anchor?.closest('li');
    if (item && root.contains(item) && changeListIndent(item, event.shiftKey)) event.preventDefault();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
    const key = event.key.toLowerCase();
    const command = key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : null;
    if (command) {
      event.preventDefault();
      rememberSelection();
      applyInline(command);
      return;
    }
  }
  if (event.key === 'Escape') { selectionOpen.value = false; linkEditorOpen.value = false; }
}
function handleEditorBeforeInput(event: InputEvent): void {
  if (event.defaultPrevented || event.isComposing || composing) return;
  if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const block = range.startContainer.parentElement?.closest('pre');
    if (block instanceof HTMLElement && editor.value?.contains(block) && block.contains(range.endContainer) && event.cancelable) {
      event.preventDefault();
      insertCodeText(block, range, '\n');
    }
    return;
  }
  if (event.inputType !== 'deleteContentBackward') return;
  const fallback = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
  handleEditorKeydown(fallback);
  if (fallback.defaultPrevented) event.preventDefault();
}
function handleHistoryBeforeInput(event: InputEvent): void {
  const root = editor.value;
  if (!root || !(event.target instanceof Node) || !root.contains(event.target) || composing || event.isComposing) return;
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    if (!event.cancelable) return;
    event.preventDefault();
    changeVersion(event.inputType === 'historyUndo' ? 'undo' : 'redo');
  } else history.remember(captureDocumentSelection(root));
}
function handleHistoryKey(event: KeyboardEvent): void {
  const root = editor.value;
  if (!root || !(event.target instanceof HTMLElement) || !root.contains(event.target)
    || event.isComposing || composing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  event.preventDefault();
  event.stopPropagation();
  changeVersion(key === 'y' || event.shiftKey ? 'redo' : 'undo');
}
function changeVersion(direction: 'undo' | 'redo'): void {
  const root = editor.value;
  if (!root) return;
  const version = history.step(direction);
  if (!version) return;
  lastModelValue = version.value;
  renderDocument(root, version.value);
  if (version.selection) restoreDocumentSelection(root, version.selection);
  else focusEnd();
  rememberSelection();
  emit('update:modelValue', version.value);
}
function handlePaste(event: ClipboardEvent): void {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const root = editor.value;
  if (!root) return;
  rememberSelection();
  const range = restoreSelection();
  if (!range) return;
  history.remember(captureDocumentSelection(root));
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const textOnly = start?.closest<HTMLElement>('pre, summary, figcaption, .knote-equation');
  const pastedImage = Array.from(clipboard.files).find((file) => file.type.startsWith('image/'))
    ?? Array.from(clipboard.items).find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
    ?? null;
  if (pastedImage && !textOnly) {
    event.preventDefault();
    const selection = window.getSelection();
    insertionAnchor.value = selection?.anchorNode ? directBlock(selection.anchorNode) : null;
    insertImageFile(pastedImage);
    return;
  }
  event.preventDefault();
  const plainTextValue = clipboard.getData('text/plain');
  const plainText = plainTextValue.trim();
  if (textOnly?.contains(range.endContainer)) {
    const text = textOnly.matches('summary, figcaption') ? plainTextValue.replace(/\r?\n/g, ' ') : plainTextValue.replaceAll('\r', '');
    if (textOnly.tagName === 'PRE') {
      if (text) insertCodeText(textOnly, range, text);
      return;
    }
    if (text && !document.execCommand('insertText', false, text)) insertFragmentAtSelection(document.createTextNode(text));
    emitDocument();
    return;
  }
  if (/^(?:https?:\/\/|www\.)[^\s]+$/i.test(plainText)) {
    const url = safeLinkUrl(plainText);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = plainText;
      insertFragmentAtSelection(link);
      emitDocument();
      return;
    }
  }
  const html = clipboard.getData('text/html');
  let inserted = false;
  if (html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const clean = sanitizeNodes(Array.from(parsed.body.childNodes));
    if (clean) {
      inserted = document.execCommand('insertHTML', false, clean);
    }
  }
  if (!inserted) {
    if (!plainTextValue) return;
    const template = document.createElement('template');
    for (const line of plainTextValue.split(/\r?\n/)) {
      const paragraph = document.createElement('p');
      if (line) paragraph.textContent = line;
      else paragraph.append(document.createElement('br'));
      template.content.append(paragraph);
    }
    if (!document.execCommand('insertHTML', false, template.innerHTML)) insertFragmentAtSelection(document.createTextNode(plainTextValue));
  }
  emitDocument();
  void hydrateImageAssets(root);
}
function handleEditorClick(event: MouseEvent): void {
  const outlineLink = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.knote-toc a') : null;
  if (outlineLink) {
    event.preventDefault();
    document.getElementById(outlineLink.hash.slice(1))?.scrollIntoView({ block: 'center' });
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  updateHoveredBlockFromSelection();
  const checkbox = target instanceof HTMLInputElement && target.type === 'checkbox' ? target : null;
  if (checkbox) {
    const item = checkbox.closest('li');
    if (item) {
      item.dataset.task = String(checkbox.checked);
      checkbox.toggleAttribute('checked', checkbox.checked);
    }
    emitDocument();
    return;
  }
  const link = target.closest('a');
  if (link instanceof HTMLAnchorElement) {
    const href = safeLinkUrl(link.getAttribute('href') || '');
    event.preventDefault();
    if (href && (event.metaKey || event.ctrlKey || event.detail === 0)) window.open(href, '_blank', 'noopener,noreferrer');
  }
}
function handleDisclosureToggle(event: Event): void {
  const details = event.target;
  if (details instanceof HTMLDetailsElement && editor.value?.contains(details)) emitDocument(false);
}
function handleImageRejected(rejections: readonly { message: string }[]): void {
  imageError.value = rejections[0]?.message || 'No se pudo añadir esa imagen.';
}
function handleOutsidePointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest('.knote-block-insert-menu, .knote-block-actions')) closeInsertMenu();
  if (!target.closest('.knote-selection-format-menu, .knote-format-toolbar')) closeFormatMenu();
  if (!target.closest('.knote-link-editor, .knote-format-toolbar')) linkEditorOpen.value = false;
  if (target.closest('[data-balsa="menu-list"], [data-balsa="popup-panel"], .knote-format-toolbar, .knote-link-editor, .knote-editor-control')) return;
  selectionOpen.value = false;
  linkEditorOpen.value = false;
  if (imagePickerOpen.value) cancelImageInsertion();
  if (shell.value?.contains(target)) {
    const isActiveComponent = activeCodeBlock.value?.contains(target)
      || activeCallout.value?.contains(target)
      || activeImage.value?.contains(target);
    if (!isActiveComponent) clearActiveComponentSettings();
    return;
  }
  codeLanguageMenuOpen.value = false;
  calloutIconMenuOpen.value = false;
  clearActiveComponentSettings();
  hoveredBlock.value = null;
  savedSelectedBlocks = [];
}
function renderDocument(root: HTMLElement, value: string): void {
  renderingVersion = true;
  try {
    savedRange = null;
    savedSelectedBlocks = [];
    hoveredBlock.value = null;
    insertMenu.value = null;
    insertQuery.value = '';
    blockContextMenuOpen.value = false;
    selectionOpen.value = false;
    linkEditorOpen.value = false;
    formatBlocksOpen.value = false;
    formatQuery.value = '';
    cancelImageInsertion();
    clearActiveComponentSettings();
    unmountTableBlocks();
    const template = document.createElement('template');
    template.innerHTML = initialHtml(value);
    template.content.querySelectorAll('img[data-asset-id]').forEach((image) => image.removeAttribute('src'));
    root.replaceChildren(template.content);
    refreshDocumentOutline(root, props.pageId);
    normalizeEditorDom(root);
    mountTableBlocks(root);
    updateEditorPlaceholder(root);
    void hydrateImageAssets(root);
  } finally {
    renderingVersion = false;
  }
}
watch(() => [props.pageId, props.modelValue] as const, ([id, value], [previousId]) => {
  if (id === previousId && value === lastModelValue) return;
  lastModelValue = value;
  history = createDocumentHistory(value);
  if (editor.value) renderDocument(editor.value, value);
});
watch(() => props.placeholder, () => {
  if (editor.value) updateEditorPlaceholder(editor.value);
});
watch(blockContextMenuOpen, (open) => { if (!open) contextTargetBlock.value = null; });
watch(codeLanguageMenuOpen, (open) => { if (!open) codeLanguageQuery.value = ''; });
watch(selectionOpen, (open) => {
  if (open) void nextTick(updateSelectionToolbar);
});
onMounted(() => {
  if (editor.value) renderDocument(editor.value, props.modelValue);
  document.addEventListener('selectionchange', scheduleSelectionUpdate, { passive: true });
  document.addEventListener('pointerdown', handleOutsidePointerDown);
  document.addEventListener('pointermove', handleEditorPointerMove, { passive: true });
  window.addEventListener('scroll', scheduleSelectionUpdate, { passive: true, capture: true });
  window.addEventListener('resize', scheduleSelectionUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleSelectionUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleSelectionUpdate);
});
onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', scheduleSelectionUpdate);
  document.removeEventListener('pointerdown', handleOutsidePointerDown);
  window.visualViewport?.removeEventListener('resize', scheduleSelectionUpdate);
  window.visualViewport?.removeEventListener('scroll', scheduleSelectionUpdate);
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
  retainedImages.forEach((release) => release());
  retainedImages.clear();
  imageRequestVersion += 1;
});
</script>

<template>
  <div
    ref="shell"
    class="knote-block-editor-shell"
    @contextmenu="handleComponentContextMenu"
    @keydown.esc="clearActiveComponentSettings"
    @keydown.capture="handleHistoryKey"
    @beforeinput.capture="handleHistoryBeforeInput"
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
      @beforeinput="handleEditorBeforeInput"
      @compositionstart.self="startComposition"
      @compositionend.self="finishComposition"
      @keydown="handleEditorKeydown"
      @focus="handleEditorFocus"
      @keyup="handleEditorKeyup"
      @mouseup="scheduleSelectionUpdate"
      @pointerup="scheduleSelectionUpdate"
      @paste="handlePaste"
      @click="handleEditorClick"
      @toggle.capture="handleDisclosureToggle"
    />

    <div
      v-if="hoveredBlock && !selectionOpen"
      class="knote-block-actions knote-editor-control"
      :style="blockActionsPosition"
      role="toolbar"
      aria-label="Acciones del bloque"
      @pointerdown.stop
    >
      <Button variant="glass" color="neutral" size="sm" aria-label="Añadir un bloque debajo" title="Añadir un bloque" :aria-expanded="insertMenu?.source === 'button'" @click="openBlockMenu">
        <Icon :icon="Plus" size="sm" />
      </Button>
      <DropdownMenu
        :id="blockContextMenuId"
        label="Opciones del bloque"
        :items="blockContextMenuItems"
        variant="surface"
        color="neutral"
        rounded="md"
        v-model="blockContextMenuOpen"
        @update:model-value="(open) => open && rememberBlockContextTarget()"
        @select="handleBlockContextSelection"
      >
        <template #trigger>
          <span
          class="knote-block-drag-grip"
          title="Arrastra para mover o pulsa para ver las acciones"
          @pointerdown.stop="handleBlockHandlePointerDown"
          @click.capture="handleBlockHandleClick"
          ><Icon :icon="GripVertical" size="sm" /></span>
        </template>
      </DropdownMenu>
    </div>

    <div v-if="insertMenu" class="knote-editor-command knote-block-insert-menu knote-editor-control" :style="insertPosition" @keydown.esc.capture="handleCommandEscape($event, () => closeInsertMenu(true))">
      <CommandMenu
        :id="`insert-blocks-${pageId}`"
        :model-value="true"
        v-model:query="insertQuery"
        :label="insertMenu.source === 'slash' ? 'Insertar un bloque' : 'Añadir un bloque'"
        placeholder="Buscar bloques…"
        :groups="slashBlockGroups"
        size="sm"
        variant="surface"
        rounded="lg"
        panel
        @update:model-value="(open) => !open && closeInsertMenu()"
        @select="handleBlockMenuSelection"
      ><template #empty>No se encontraron bloques.</template></CommandMenu>
    </div>

    <div v-if="activeCodeBlock" class="knote-code-tools knote-editor-control" :style="codeToolbarPosition" @pointerdown.stop>
      <Button variant="glass" color="neutral" size="sm" aria-label="Elegir lenguaje del código" :aria-expanded="codeLanguageMenuOpen" @click="toggleCodeLanguageMenu">
        {{ languageLabel(activeCodeBlock) }}<Icon :icon="ChevronDown" size="xs" />
      </Button>
      <Button variant="glass" color="neutral" size="sm" :aria-label="copiedCode ? 'Código copiado' : copyCodeUnavailable ? 'No se pudo copiar el código' : 'Copiar código'" :title="copiedCode ? 'Copiado' : copyCodeUnavailable ? 'Permite el portapapeles en el navegador' : 'Copiar código'" @click="copyCode">
        <Icon :icon="Copy" size="xs" />
      </Button>
      <span v-if="copiedCode" class="knote-code-copied" role="status">Copiado</span>
      <span v-else-if="copyCodeUnavailable" class="knote-code-copied" role="status">No se pudo acceder al portapapeles</span>
      <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Cerrar opciones del código" title="Cerrar" @click="clearActiveComponentSettings"><Icon :icon="X" size="xs" /></Button>
    </div>
    <div v-if="codeLanguageMenuOpen" class="knote-editor-command knote-code-language-menu knote-editor-control" :style="codeLanguagePosition" @keydown.esc.capture="handleCommandEscape($event, () => closeCodeLanguageMenu(true))">
      <CommandMenu
        :id="`code-languages-${pageId}`"
        v-model="codeLanguageMenuOpen"
        v-model:query="codeLanguageQuery"
        label="Lenguaje del bloque de código"
        placeholder="Buscar lenguajes…"
        :groups="codeLanguageGroups"
        size="sm"
        variant="surface"
        rounded="lg"
        panel
        @select="handleCodeLanguageSelection"
      ><template #empty>No se encontraron lenguajes.</template></CommandMenu>
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
        @keydown="resizeImageWithKeyboard"
      />
    </div>

    <div v-if="imagePickerOpen" class="knote-image-picker knote-editor-control" :style="imagePickerPosition" @pointerdown.stop>
      <div class="knote-image-picker-heading">
        <strong>Añadir imagen</strong>
        <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Cerrar selector de imagen" @click="cancelImageInsertion"><Icon :icon="Minus" size="xs" /></Button>
      </div>
      <Attachment :id="`block-image-${pageId}`" v-model="selectedImageFiles" label="Seleccionar imagen" hint="JPG, PNG, GIF o WebP · hasta 12 MB" accept="image/*" :max-size="12 * 1024 * 1024" :max-files="1" size="sm" @update:model-value="handleImageSelection" @reject="handleImageRejected" />
      <p v-if="imageError" class="knote-image-error" role="alert">{{ imageError }}</p>
      <p v-if="imageUploading" role="status">Preparando imagen…</p>
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
      <Button variant="glass" color="neutral" size="sm" :prefix-icon="Type" :suffix-icon="ChevronDown" class="knote-format-menu" aria-label="Más formatos de texto" :aria-expanded="formatBlocksOpen" @pointerdown.prevent @click="toggleFormatMenu">Bloques</Button>
    </div>
    <div v-if="formatBlocksOpen" class="knote-editor-command knote-selection-format-menu knote-editor-control" :style="formatPosition" @keydown.esc.capture="handleCommandEscape($event, () => closeFormatMenu(true))">
      <CommandMenu
        :id="`selection-formats-${pageId}`"
        :model-value="true"
        v-model:query="formatQuery"
        label="Cambiar el tipo de bloque"
        placeholder="Buscar formatos…"
        :groups="formatGroups"
        size="sm"
        variant="surface"
        rounded="lg"
        panel
        @update:model-value="(open) => !open && closeFormatMenu()"
        @select="handleFormatSelection"
      ><template #empty>No se encontraron formatos.</template></CommandMenu>
    </div>
    <div v-if="linkEditorOpen" class="knote-link-editor" :style="{ '--knote-link-left': toolbarPosition.left, '--knote-link-top': toolbarPosition.top }" @keydown.esc="handleCommandEscape($event, cancelLinkEdit)">
      <input :id="`block-link-${pageId}`" v-model="linkDraft" type="url" aria-label="Dirección del enlace" placeholder="https://…" @keydown.enter.stop.prevent="applyLink" />
      <Button variant="glass" color="neutral" size="sm" @pointerdown.prevent @click="applyLink">Aplicar</Button>
      <Button variant="soft" color="neutral" size="sm" @pointerdown.prevent @click="cancelLinkEdit">Cancelar</Button>
    </div>
  </div>
</template>
