<script setup lang="ts">
import { acceptCompletion, autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { indentLess, indentMore, moveLineDown, moveLineUp } from '@codemirror/commands';
import { globalCompletion as pythonGlobalCompletion, localCompletionSource as pythonLocalCompletion, python, pythonLanguage } from '@codemirror/lang-python';
import { linter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { findNext, findPrevious, replaceAll as replaceAllMatches, replaceNext as replaceNextMatch, search, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView, hoverTooltip, keymap, type Tooltip } from '@codemirror/view';
import { AlertCircle, ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, ChevronUp, Code2, Download, LayoutPanelTop, LoaderCircle, MoreHorizontal, PanelBottom, PanelRight, Play, Replace, Search, Square, Terminal, Trash2, Upload, X } from '@lucide/vue';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Attachment, { type AttachmentRejection } from '@/components/ui/Attachment.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Modal from '@/components/ui/Modal.vue';
import Resizable from '@/components/ui/Resizable.vue';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import { getPythonRuntimeConnection, nextPythonMessageId, type PythonRuntimeConnection, type PythonRuntimeMessage } from '@/lib/python-runtime-client';
import { countSearchMatches } from '@/components/workspace/code-search';

type AnalysisMode = 'complete' | 'signature' | 'hover' | 'syntax' | 'lint' | 'types';
type DiagnosticResult = {
  syntax?: Array<{ message: string; line: number; column: number; endLine?: number; endColumn?: number }>;
  pyflakes?: string;
  pyflakesError?: string;
  mypy?: string;
  mypyError?: string;
  jediError?: string;
  error?: string;
  signature?: string;
  title?: string;
  documentation?: string;
  fromOffset?: number;
  completions?: Array<{ label: string; apply: string; type: string; detail: string }>;
};
type ConsoleLine = { id: number; kind: 'output' | 'error' | 'system' | 'input'; text: string };
type CodeDiagnostic = Diagnostic & { line: number; source: 'syntax' | 'lint' | 'types' };

const PythonGuideDrawer = defineAsyncComponent(() => import('@/components/workspace/PythonGuideDrawer.vue'));
const props = defineProps<{ pageId: string; pageTitle?: string; code: string }>();
const emit = defineEmits<{ 'update-code': [pageId: string, code: string] }>();
const runShortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↵' : 'Ctrl+↵';

const editorHost = shallowRef<HTMLElement | null>(null);
const consoleScroll = shallowRef<HTMLElement | null>(null);
const consoleInput = shallowRef<HTMLFormElement | null>(null);
const editor = shallowRef<EditorView | null>(null);
let runtime: PythonRuntimeConnection | null = null;
const runId = ref<number | null>(null);
const running = computed(() => runId.value !== null);
const stopping = ref(false);
const runtimeState = ref<'starting' | 'runtime' | 'analysis' | 'ready' | 'error'>('starting');
const runtimeError = ref('');
const jediReady = ref(false);
const waitingForInput = ref(false);
const inputSessionStarted = ref(false);
const inputValue = ref('');
const currentLine = ref(1);
const currentColumn = ref(1);
const lineCount = ref(1);
const characterCount = ref(0);
const diagnostics = ref<CodeDiagnostic[]>([]);
const problemsOpen = ref(false);
const errorDiagnostics = computed(() => diagnostics.value.filter((diagnostic) => diagnostic.severity === 'error'));
const warningCount = computed(() => diagnostics.value.filter((diagnostic) => diagnostic.severity === 'warning').length);
const diagnosticsPending = ref(false);
const diagnosticsNotice = ref('');
const typeAnalysisComplete = ref(false);
const signatureHelp = ref('');
const searchOpen = ref(false);
const replaceOpen = ref(false);
const searchText = ref('');
const replaceText = ref('');
const searchCaseSensitive = ref(false);
const searchWholeWord = ref(false);
const searchRegexp = ref(false);
const searchMatchCount = ref(0);
const searchQueryInvalid = computed(() => Boolean(searchText.value) && !currentSearchQuery().valid);
const searchResultLabel = computed(() => !searchText.value
  ? ''
  : searchQueryInvalid.value
    ? 'Expresión regular no válida'
    : searchMatchCount.value === 0
      ? 'Sin coincidencias'
      : `${searchMatchCount.value} ${searchMatchCount.value === 1 ? 'coincidencia' : 'coincidencias'}`);
const executionError = ref('');
const executionErrorLine = ref<number | null>(null);
const consoleLines = ref<ConsoleLine[]>([]);
type ConsolePosition = 'bottom' | 'right' | 'hidden';
const layoutKey = 'knote.python.layout';
const wideLayout = window.matchMedia('(min-width: 58rem)');
const canDockRight = ref(wideLayout.matches);
const consolePosition = ref<ConsolePosition>('bottom');
const bottomSize = ref(76);
const rightSize = ref(70);
const consoleDockedRight = computed(() => consolePosition.value === 'right' && canDockRight.value);
const consoleVisible = computed(() => consolePosition.value !== 'hidden');
const panelSize = computed({
  get: () => consoleDockedRight.value ? rightSize.value : bottomSize.value,
  set: (size: number) => { (consoleDockedRight.value ? rightSize : bottomSize).value = Math.round(size); },
});
const stackedPanelStyle = computed(() => consoleDockedRight.value || !consoleVisible.value ? undefined : {
  gridTemplateRows: `minmax(var(--knote-code-editor-min), ${panelSize.value}fr) auto minmax(var(--knote-code-console-min), ${100 - panelSize.value}fr)`,
});
const panelClasses = computed(() => ({
  'knote-code-panels--editor-only': !consoleVisible.value,
  'knote-code-panels--search': searchOpen.value,
  'knote-code-panels--replace': replaceOpen.value,
  'knote-code-panels--problems': problemsOpen.value && diagnostics.value.length > 0,
  'knote-code-panels--input': inputSessionStarted.value,
}));
const layoutItems = computed<readonly MenuItem[]>(() => [
  { id: 'bottom', type: 'radio', group: 'console', label: 'Consola abajo', icon: PanelBottom, checked: consoleVisible.value && !consoleDockedRight.value },
  { id: 'right', type: 'radio', group: 'console', label: 'Consola a la derecha', icon: PanelRight, checked: consoleDockedRight.value, disabled: !canDockRight.value },
  { id: 'hidden', type: 'radio', group: 'console', label: 'Solo editor', icon: LayoutPanelTop, checked: !consoleVisible.value, disabled: waitingForInput.value },
]);
const scriptItems = computed<readonly MenuItem[]>(() => [
  { id: 'import', label: 'Abrir archivo .py', icon: Upload, disabled: running.value },
  { id: 'export', label: 'Descargar archivo .py', icon: Download },
  { id: 'files-end', type: 'separator' },
  { id: 'move-up', label: 'Mover selección arriba', icon: ArrowUp, shortcut: 'Alt+↑' },
  { id: 'move-down', label: 'Mover selección abajo', icon: ArrowDown, shortcut: 'Alt+↓' },
  { id: 'guide', label: 'Guía de Python', icon: BookOpen },
]);
const exportModalOpen = ref(false);
const importModalOpen = ref(false);
const pythonGuideOpen = ref(false);
const exportName = ref('');
const exportError = ref('');
const importError = ref('');
const importing = ref(false);
const importFiles = ref<readonly File[]>([]);
const importedFileName = ref('');
const activeFileName = computed(() => importedFileName.value || `${suggestFileStem(props.pageTitle || 'main')}.py`);
let layoutSaveTimer: number | undefined;
const pendingRequests = new Map<number, (result: DiagnosticResult | null) => void>();
let consoleLineId = 0;
let followConsole = true;
let diagnosticsTimer: number | undefined;
let signatureTimer: number | undefined;
let modelSyncTimer: number | undefined;
let cursorSyncTimer: number | undefined;
let searchRefreshTimer: number | undefined;
let completionSequence = 0;
let signatureSequence = 0;
let disposed = false;
let lastAnalyzerNotice = '';
let unsubscribeRuntime: (() => void) | null = null;

const codeHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--knote-code-syntax-keyword)', fontWeight: '650' },
  { tag: tags.definition(tags.variableName), color: 'var(--knote-code-syntax-variable)' },
  { tag: tags.function(tags.variableName), color: 'var(--knote-code-syntax-title)' },
  { tag: tags.string, color: 'var(--knote-code-syntax-string)' },
  { tag: tags.number, color: 'var(--knote-code-syntax-number)' },
  { tag: tags.comment, color: 'var(--knote-code-syntax-comment)', fontStyle: 'italic' },
  { tag: tags.operator, color: 'var(--balsa-role-code-foreground)' },
  { tag: tags.typeName, color: 'var(--knote-code-syntax-title)' },
  { tag: tags.bool, color: 'var(--knote-code-syntax-meta)' },
]);

const editorTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--balsa-role-foreground)', backgroundColor: 'var(--knote-code-editor-surface)', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--balsa-font-mono, "Cascadia Code", Consolas, monospace)', lineHeight: '1.68' },
  '.cm-content': { padding: '1rem 0 2rem', caretColor: 'var(--balsa-role-accent)' },
  '.cm-line': { padding: '0 .85rem 0 .35rem' },
  '.cm-gutters': { color: 'var(--balsa-role-secondary)', backgroundColor: 'var(--knote-code-editor-surface)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '.92rem', padding: '0 .14rem 0 .18rem' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--balsa-role-foreground) 3%, transparent)' },
  '.cm-activeLineGutter': { color: 'var(--balsa-role-foreground)', backgroundColor: 'color-mix(in oklab, var(--balsa-role-foreground) 3%, transparent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--balsa-role-accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--balsa-role-accent) 28%, transparent) !important' },
  '.cm-matchingBracket': { color: 'var(--balsa-role-foreground) !important', backgroundColor: 'color-mix(in oklab, var(--balsa-role-accent) 22%, transparent)' },
  '.cm-tooltip': { color: 'var(--balsa-role-foreground)', backgroundColor: 'var(--knote-code-raised-surface)', border: '1px solid var(--balsa-role-border)', borderRadius: '.55rem', boxShadow: '0 14px 38px color-mix(in oklab, var(--balsa-role-background) 38%, transparent)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { color: 'var(--balsa-role-foreground)', backgroundColor: 'color-mix(in oklab, var(--balsa-role-accent) 19%, var(--balsa-role-surface))' },
  '.cm-completionDetail': { color: 'var(--balsa-role-secondary)', fontStyle: 'normal' },
  '.cm-diagnostic': { borderLeftWidth: '2px' },
}, { dark: true });

function appendConsole(kind: ConsoleLine['kind'], text: string): void {
  const clean = text.replace(/\r\n/g, '\n');
  if (!clean) return;
  consoleLines.value = [...consoleLines.value, { id: ++consoleLineId, kind, text: clean }].slice(-500);
}

function currentSearchQuery(): SearchQuery {
  return new SearchQuery({
    search: searchText.value,
    replace: replaceText.value,
    caseSensitive: searchCaseSensitive.value,
    wholeWord: searchWholeWord.value,
    regexp: searchRegexp.value,
  });
}

function refreshSearchMatches(): void {
  const view = editor.value;
  const query = currentSearchQuery();
  if (!view || !query.valid || !query.search) {
    searchMatchCount.value = 0;
    return;
  }
  searchMatchCount.value = countSearchMatches(query, view.state);
}

function updateSearchQuery(): void {
  const view = editor.value;
  if (!view) return;
  const query = currentSearchQuery();
  view.dispatch({ effects: setSearchQuery.of(query) });
  refreshSearchMatches();
}

function scheduleSearchMatchRefresh(): void {
  if (searchRefreshTimer !== undefined) window.clearTimeout(searchRefreshTimer);
  if (searchOpen.value) searchRefreshTimer = window.setTimeout(refreshSearchMatches, 180);
}

async function openFind(withReplace = false): Promise<void> {
  if (!editor.value) return;
  searchOpen.value = true;
  problemsOpen.value = false;
  if (withReplace) replaceOpen.value = true;
  if (!searchText.value && !editor.value.state.selection.main.empty) {
    searchText.value = editor.value.state.sliceDoc(editor.value.state.selection.main.from, editor.value.state.selection.main.to);
  }
  updateSearchQuery();
  await nextTick();
  const field = withReplace ? 'replace' : 'search';
  document.getElementById(`python-${field}-${props.pageId}`)?.focus();
}

function closeFind(restoreFocus = true): void {
  searchOpen.value = false;
  replaceOpen.value = false;
  const view = editor.value;
  if (view) {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
    if (restoreFocus) view.focus();
  }
  searchMatchCount.value = 0;
}

function toggleReplace(): void {
  if (replaceOpen.value) replaceOpen.value = false;
  else void openFind(true);
}

function toggleProblems(): void {
  if (searchOpen.value) closeFind(false);
  problemsOpen.value = !problemsOpen.value;
}

function navigateSearch(direction: 1 | -1): void {
  const view = editor.value;
  if (!view || !currentSearchQuery().valid || !searchText.value) return;
  updateSearchQuery();
  (direction > 0 ? findNext : findPrevious)(view);
  refreshSearchMatches();
}

function replaceSearchMatch(all = false): void {
  const view = editor.value;
  if (!view || !currentSearchQuery().valid || !searchText.value) return;
  updateSearchQuery();
  (all ? replaceAllMatches : replaceNextMatch)(view);
  refreshSearchMatches();
}

function handleSearchKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    void openFind(true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeFind();
  } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    if (event.target.id === `python-replace-${props.pageId}`) replaceSearchMatch();
    else navigateSearch(event.shiftKey ? -1 : 1);
  }
}

function changeLayout({ id }: MenuSelection): void {
  if (id === 'bottom' || id === 'right' || id === 'hidden') consolePosition.value = id;
}

function handleScriptAction({ id }: MenuSelection): void {
  if (id === 'import') openImportDialog();
  else if (id === 'export') openExportDialog();
  else if (id === 'guide') pythonGuideOpen.value = true;
  else if (editor.value && (id === 'move-up' || id === 'move-down')) {
    (id === 'move-up' ? moveLineUp : moveLineDown)(editor.value);
    requestAnimationFrame(() => editor.value?.focus());
  }
}

function updateDockAvailability(event: MediaQueryListEvent): void {
  canDockRight.value = event.matches;
}

function restoreLayout(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey) ?? 'null');
    if (saved?.position === 'bottom' || saved?.position === 'right' || saved?.position === 'hidden') consolePosition.value = saved.position;
    if (Number.isFinite(saved?.bottom)) bottomSize.value = Math.min(82, Math.max(42, saved.bottom));
    if (Number.isFinite(saved?.right)) rightSize.value = Math.min(78, Math.max(44, saved.right));
  } catch {
    // The default layout remains usable when storage is unavailable.
  }
}

function saveLayout(): void {
  window.clearTimeout(layoutSaveTimer);
  layoutSaveTimer = undefined;
  try {
    localStorage.setItem(layoutKey, JSON.stringify({ position: consolePosition.value, bottom: bottomSize.value, right: rightSize.value }));
  } catch {
    // Layout changes still work for this session.
  }
}

function revealConsole(): void {
  if (!consoleVisible.value) consolePosition.value = 'bottom';
}

function runScript(): boolean {
  if (!runtime || runtimeState.value !== 'ready' || running.value) return false;
  const code = editor.value?.state.doc.toString() ?? props.code;
  flushCode();
  const id = runtime.run(code);
  if (id === null) {
    revealConsole();
    appendConsole('system', 'La ejecución anterior todavía se está deteniendo. Vuelve a intentarlo en un momento.');
    return true;
  }
  followConsole = true;
  consoleLines.value = [];
  executionError.value = '';
  executionErrorLine.value = null;
  runId.value = id;
  window.clearTimeout(diagnosticsTimer);
  window.clearTimeout(signatureTimer);
  signatureSequence += 1;
  signatureHelp.value = '';
  diagnosticsPending.value = false;
  for (const resolve of pendingRequests.values()) resolve(null);
  pendingRequests.clear();
  appendConsole('system', `▶ Ejecutando ${activeFileName.value}`);
  return true;
}

function stopScript(): void {
  if (runId.value === null || !runtime?.stop(runId.value)) return;
  stopping.value = true;
  waitingForInput.value = false;
  inputSessionStarted.value = false;
  appendConsole('system', 'Deteniendo ejecución…');
}

function focusConsoleInput(): void {
  consoleInput.value?.querySelector('input')?.focus();
}

function submitInput(): void {
  if (!waitingForInput.value || runId.value === null) return;
  const result = runtime?.submitInput(runId.value, inputValue.value);
  if (result === 'too-long') appendConsole('error', 'La entrada es demasiado larga (máximo 64 KB).');
  if (result === 'sent') {
    appendConsole('input', `› ${inputValue.value}`);
    inputValue.value = '';
    waitingForInput.value = false;
  }
  focusConsoleInput();
}

function trackConsoleScroll(): void {
  const view = consoleScroll.value;
  if (!view || !consoleVisible.value) return;
  followConsole = view.scrollHeight - view.scrollTop - view.clientHeight < 4;
}

function clearConsole(): void {
  followConsole = true;
  consoleLines.value = [];
  executionError.value = '';
  executionErrorLine.value = null;
}

function insertPythonExample(code: string): void {
  const view = editor.value;
  if (!view) return;
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  // A complete example belongs on its own lines, even when the caret is inside a statement.
  const from = selection.empty && selection.from > line.from ? line.to : selection.from;
  const to = selection.empty ? from : selection.to;
  const prefix = from > view.state.doc.lineAt(from).from ? '\n' : '';
  const suffix = to < view.state.doc.lineAt(to).to ? '\n' : '';
  const insert = prefix + code + suffix;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + prefix.length + code.length },
    userEvent: 'input.type',
  });
  view.focus();
}

const forbiddenWindowsFilenameCharacter = /[<>:"/\\|?*]/;
function suggestFileStem(value: string): string {
  const stem = value.trim().replace(/(\.py)+$/i, '');
  const safeStem = Array.from(stem, (character) => (
    character.charCodeAt(0) < 0x20 || forbiddenWindowsFilenameCharacter.test(character) ? '-' : character
  )).join('');
  return safeStem.replace(/[. ]+$/g, '') || 'main';
}

function pythonFilename(value: string): string | null {
  const stem = value.trim().replace(/(\.py)+$/i, '');
  const hasInvalidCharacter = Array.from(stem).some((character) => (
    character.charCodeAt(0) < 0x20 || forbiddenWindowsFilenameCharacter.test(character)
  ));
  if (!stem || hasInvalidCharacter || /[. ]$/.test(stem)) return null;
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) return null;
  return `${stem}.py`;
}

function openExportDialog(): void {
  exportError.value = '';
  exportName.value = suggestFileStem(activeFileName.value);
  exportModalOpen.value = true;
}

function downloadScript(close: () => void): void {
  const filename = pythonFilename(exportName.value);
  if (!filename) {
    exportError.value = 'Escribe un nombre válido sin barras ni caracteres especiales. La extensión .py se añade automáticamente.';
    return;
  }
  const blobUrl = URL.createObjectURL(new Blob([editor.value?.state.doc.toString() ?? props.code], { type: 'text/x-python;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  appendConsole('system', `Archivo descargado: ${filename}`);
  close();
}

function openImportDialog(): void {
  importError.value = '';
  importFiles.value = [];
  importModalOpen.value = true;
}

function handleImportRejection(rejections: readonly AttachmentRejection[]): void {
  importError.value = rejections[0]?.message ?? 'No se pudo leer el archivo seleccionado.';
}

async function importScript(close: () => void): Promise<void> {
  const file = importFiles.value[0];
  if (!file) return;
  importError.value = '';
  importing.value = true;
  try {
    const content = (await file.text()).replace(/^\uFEFF/, '');
    if (disposed) return;
    const view = editor.value;
    if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content }, scrollIntoView: true });
    flushCode();
    importedFileName.value = file.name;
    executionError.value = '';
    executionErrorLine.value = null;
    appendConsole('system', `Archivo cargado en el editor: ${file.name}`);
    close();
    await nextTick();
    editor.value?.focus();
  } catch (error) {
    importError.value = error instanceof Error ? `No se pudo abrir ${file.name}: ${error.message}` : `No se pudo abrir ${file.name}.`;
  } finally {
    importing.value = false;
  }
}

function positionAt(view: EditorView, position: number): { line: number; column: number; lineFrom: number } {
  const line = view.state.doc.lineAt(position);
  return { line: line.number, column: position - line.from, lineFrom: line.from };
}

function pythonColumn(text: string, utf16Column: number): number {
  let column = 0;
  for (const _character of text.slice(0, utf16Column)) column += 1;
  return column;
}

function codeMirrorColumn(text: string, pythonColumnNumber: number): number {
  let column = 0;
  let codePoints = 0;
  for (const character of text) {
    if (codePoints >= pythonColumnNumber) break;
    column += character.length;
    codePoints += 1;
  }
  return column;
}

function focusLine(lineNumber: number, column = 1): void {
  const view = editor.value;
  if (!view || !Number.isFinite(lineNumber)) return;
  const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, Math.trunc(lineNumber))));
  const position = Math.min(line.to, line.from + Math.max(0, Math.trunc(column) - 1));
  view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
  view.focus();
}

function jumpToDiagnostic(direction = 1): void {
  const view = editor.value;
  const items = errorDiagnostics.value;
  if (!view || items.length === 0) return;
  const currentPosition = view.state.selection.main.head;
  let nextIndex = -1;
  if (direction > 0) {
    nextIndex = items.findIndex((item) => item.from > currentPosition);
  } else {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index].from < currentPosition) {
        nextIndex = index;
        break;
      }
    }
  }
  const item = items[nextIndex < 0 ? (direction > 0 ? 0 : items.length - 1) : nextIndex];
  view.dispatch({
    selection: { anchor: item.from, head: item.to },
    effects: EditorView.scrollIntoView(item.from, { y: 'center' }),
    userEvent: 'select',
  });
  view.focus();
}

function focusDiagnostic(item: CodeDiagnostic): void {
  const view = editor.value;
  if (!view) return;
  view.dispatch({
    selection: { anchor: item.from, head: item.to },
    effects: EditorView.scrollIntoView(item.from, { y: 'center' }),
    userEvent: 'select',
  });
  view.focus();
}

function executionLine(trace: string): number | null {
  const frames = [...trace.matchAll(/File ["']([^"']+)["'], line (\d+)/g)];
  const frame = frames.reverse().find((item) => item[1] === 'main.py');
  const line = Number(frame?.[2]);
  return Number.isInteger(line) && line > 0 ? line : null;
}

function executionSummary(trace: string): string {
  const lastLine = trace.trim().split('\n').reverse().find((line) => line.trim() && !/^\s*File ["']/.test(line));
  return (lastLine ?? trace).trim().slice(0, 260) || 'Python terminó con un error.';
}

function requestAnalysis(mode: AnalysisMode, code: string, line: number, column: number, timeout = 18_000): Promise<DiagnosticResult | null> {
  if (!runtime || runtimeState.value !== 'ready' || running.value) return Promise.resolve(null);
  const id = nextPythonMessageId();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      if (!pendingRequests.has(id)) return;
      pendingRequests.delete(id);
      resolve(null);
    }, timeout);
    pendingRequests.set(id, (result) => {
      window.clearTimeout(timer);
      resolve(result);
    });
    runtime?.worker.postMessage({ type: 'analyze', id, code, line, column, mode });
  });
}

function completionSource(context: CompletionContext): Promise<CompletionResult | null> | CompletionResult | null {
  const view = editor.value;
  if (!view || runtimeState.value !== 'ready') return null;
  const cursor = positionAt(view, context.pos);
  const line = view.state.doc.line(cursor.line);
  const typed = line.text.slice(0, cursor.column);
  // CodeMirror's incremental Python sources handle names, keywords and
  // built-ins synchronously. Jedi is reserved for member access after a dot.
  if (!typed.endsWith('.')) return null;

  const sequence = ++completionSequence;
  const code = view.state.doc.toString();
  return requestAnalysis('complete', code, cursor.line, pythonColumn(line.text, cursor.column), 15_000).then((result) => {
    if (sequence !== completionSequence || context.aborted || !result || !Array.isArray(result.completions)) return null;
    const seenCompletions = new Set<string>();
    const items = result.completions.filter((item) => {
      if (seenCompletions.has(item.label)) return false;
      seenCompletions.add(item.label);
      return true;
    });
    const fromOffset = Number(result.fromOffset) || 0;
    const options: Completion[] = items.map((item) => ({
      label: item.label,
      apply: item.apply,
      type: item.type === 'function' || item.type === 'class' || item.type === 'module' || item.type === 'keyword' ? item.type : 'variable',
      detail: item.detail,
    }));
    if (editor.value?.state.doc.toString() !== code) return null;
    return { from: cursor.lineFrom + codeMirrorColumn(line.text, fromOffset), options, filter: false };
  });
}

function isMemberAccess(context: CompletionContext): boolean {
  const line = context.state.doc.lineAt(context.pos);
  return line.text.slice(0, context.pos - line.from).trimEnd().endsWith('.');
}

function localPythonCompletion(context: CompletionContext): CompletionResult | null {
  return jediReady.value && context.explicit && isMemberAccess(context) ? null : pythonLocalCompletion(context);
}

function globalPythonCompletion(context: CompletionContext): CompletionResult | null | Promise<CompletionResult | null> {
  return jediReady.value && context.explicit && isMemberAccess(context) ? null : pythonGlobalCompletion(context);
}

function hoverSource(view: EditorView, position: number): Promise<Tooltip | null> | null {
  if (runtimeState.value !== 'ready') return null;
  const cursor = positionAt(view, position);
  const row = view.state.doc.line(cursor.line);
  const token = row.text.slice(0, cursor.column).match(/[\w.]+$/)?.[0];
  if (!token || token.length < 2) return null;
  return requestAnalysis('hover', view.state.doc.toString(), cursor.line, pythonColumn(row.text, cursor.column), 15_000).then((result) => {
    if (!result || (!result.title && !result.documentation)) return null;
    return {
      pos: position - token.length,
      end: position,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'knote-python-hover';
        if (result.title) {
          const title = document.createElement('strong');
          title.textContent = String(result.title);
          dom.append(title);
        }
        if (result.documentation) {
          const body = document.createElement('p');
          body.textContent = String(result.documentation).slice(0, 1800);
          dom.append(body);
        }
        return { dom };
      },
    };
  });
}

function applyDiagnostics(result: DiagnosticResult | null, source: CodeDiagnostic['source']): void {
  const view = editor.value;
  if (!view || !result) {
    diagnosticsPending.value = false;
    diagnosticsNotice.value = 'No se pudo completar el análisis local';
    return;
  }
  const found: CodeDiagnostic[] = [];
  const doc = view.state.doc;

  for (const issue of result.syntax ?? []) {
    if (issue.line < 1 || issue.line > doc.lines) continue;
    const line = doc.line(issue.line);
    const issueColumn = codeMirrorColumn(line.text, Math.max(0, issue.column));
    const from = Math.max(line.from, Math.min(line.to, line.from + issueColumn));
    const endLine = issue.endLine && issue.endLine >= issue.line && issue.endLine <= doc.lines ? doc.line(issue.endLine) : line;
    const endColumn = codeMirrorColumn(endLine.text, Math.max(0, issue.endColumn ?? issue.column + 1));
    const to = Math.max(from + (from < doc.length ? 1 : 0), Math.min(doc.length, endLine.from + endColumn));
    found.push({ from, to, severity: 'error', message: String(issue.message || 'Error de sintaxis'), line: issue.line, source: 'syntax' });
  }

  const pyflakesText = result.pyflakes ?? '';
  let parsedPyflakesIssue = false;
  for (const row of pyflakesText.split('\n')) {
    const match = row.match(/^main\.py:(\d+):(\d+):\s*(.*)$/);
    if (!match) continue;
    parsedPyflakesIssue = true;
    const lineNumber = Number(match[1]);
    if (lineNumber < 1 || lineNumber > doc.lines) continue;
    const line = doc.line(lineNumber);
    const column = Math.max(1, Number(match[2]) || 1);
    const from = Math.max(line.from, Math.min(line.to, line.from + codeMirrorColumn(line.text, column - 1)));
    const message = match[3].trim();
    const warning = /imported but unused|assigned to but never used|redefinition of unused name/.test(message);
    const identifier = message.match(/(?:undefined name|imported but unused|assigned to but never used) ['"]([A-Za-z_]\w*)['"]/)?.[1];
    const to = Math.min(line.to, Math.max(from + (from < doc.length ? 1 : 0), from + (identifier?.length ?? 1)));
    found.push({ from, to, severity: warning ? 'warning' : 'error', message: `Python: ${message}`, line: lineNumber, source: 'lint' });
  }

  const mypyText = result.mypy ?? '';
  let parsedMypyIssue = false;
  for (const row of mypyText.split('\n')) {
    const match = row.match(/(?:^|[/\\])knote_editor\.py:(\d+)(?::(\d+))?:\s*(error|warning|note):\s*(.*?)(?:\s+\[([^\]]+)\])?\s*$/);
    if (!match) continue;
    parsedMypyIssue = true;
    if (match[3] === 'note') continue;
    const lineNumber = Number(match[1]);
    if (lineNumber < 1 || lineNumber > doc.lines) continue;
    const line = doc.line(lineNumber);
    const column = Math.max(1, Number(match[2]) || 1);
    const from = Math.max(line.from, Math.min(line.to, line.from + codeMirrorColumn(line.text, column - 1)));
    const to = Math.min(doc.length, Math.max(from + (from < doc.length ? 1 : 0), from + 1));
    const code = match[5] ? ` [${match[5]}]` : '';
    found.push({ from, to, severity: match[3] === 'error' ? 'error' : match[3] === 'warning' ? 'warning' : 'info', message: `Tipos: ${match[4]}${code}`, line: lineNumber, source: 'types' });
  }

  if (source === 'syntax') diagnostics.value = found;
  else diagnostics.value = [...diagnostics.value.filter((item) => item.source !== source), ...found].sort((left, right) => left.from - right.from);
  view.dispatch(setDiagnostics(view.state, diagnostics.value));

  const analyzerNotice = result.error || result.pyflakesError || result.mypyError || result.jediError
    || (source === 'lint' && pyflakesText.trim() && !parsedPyflakesIssue ? pyflakesText.trim() : '')
    || (source === 'types' && mypyText.trim() && !parsedMypyIssue && !/Success: no issues found/.test(mypyText) ? mypyText.trim() : '');
  diagnosticsNotice.value = analyzerNotice ? String(analyzerNotice).split('\n')[0].slice(0, 180) : '';
  if (source === 'lint') typeAnalysisComplete.value = !analyzerNotice;
  if (source === 'types') typeAnalysisComplete.value = !analyzerNotice && typeof result.mypy === 'string';
  if (analyzerNotice && analyzerNotice !== lastAnalyzerNotice) {
    lastAnalyzerNotice = String(analyzerNotice);
    appendConsole('system', `El análisis estático no está disponible: ${String(analyzerNotice).split('\n')[0]}`);
  }
}

async function analyzeTypes(code: string, line: number, column: number, syntaxValidated = false): Promise<void> {
  if (!syntaxValidated) {
    const syntax = await requestAnalysis('syntax', code, line, column, 5_000);
    if (disposed || running.value || editor.value?.state.doc.toString() !== code) return;
    if (!syntax || syntax.error || syntax.syntax?.length) {
      applyDiagnostics(syntax, 'syntax');
      diagnosticsPending.value = false;
      return;
    }
  }
  const result = await requestAnalysis('types', code, line, column, 25_000);
  if (!disposed && !running.value && editor.value?.state.doc.toString() === code) {
    applyDiagnostics(result, 'types');
    diagnosticsPending.value = false;
  }
}

function runTypeAnalysis(): void {
  const view = editor.value;
  if (!view || runtimeState.value !== 'ready' || diagnosticsPending.value || running.value) return;
  const code = view.state.doc.toString();
  const cursor = positionAt(view, view.state.selection.main.head);
  diagnosticsPending.value = true;
  diagnosticsNotice.value = '';
  void analyzeTypes(code, cursor.line, cursor.column);
}

function scheduleDiagnostics(): void {
  if (diagnosticsTimer !== undefined) window.clearTimeout(diagnosticsTimer);
  if (!editor.value || runtimeState.value !== 'ready' || running.value) return;
  diagnosticsPending.value = true;
  diagnosticsNotice.value = '';
  typeAnalysisComplete.value = false;
  diagnosticsTimer = window.setTimeout(async () => {
    const view = editor.value;
    if (!view || disposed) return;
    const code = view.state.doc.toString();
    const cursor = positionAt(view, view.state.selection.main.head);
    const syntax = await requestAnalysis('syntax', code, cursor.line, cursor.column, 5_000);
    if (disposed || running.value || editor.value?.state.doc.toString() !== code) return;
    if (!syntax || syntax.error || syntax.syntax?.length) {
      applyDiagnostics(syntax, 'syntax');
      diagnosticsPending.value = false;
      return;
    }

    applyDiagnostics({ syntax: [] }, 'syntax');
    const lint = await requestAnalysis('lint', code, cursor.line, cursor.column, 8_000);
    if (disposed || running.value || editor.value?.state.doc.toString() !== code) return;
    applyDiagnostics(lint, 'lint');
    if (!lint || lint.pyflakesError) {
      diagnosticsPending.value = false;
      return;
    }

    diagnosticsPending.value = false;
    typeAnalysisComplete.value = true;
  }, 220);
}

function scheduleSignature(): void {
  const sequence = ++signatureSequence;
  if (signatureTimer !== undefined) window.clearTimeout(signatureTimer);
  if (!editor.value || runtimeState.value !== 'ready' || running.value) {
    signatureHelp.value = '';
    return;
  }
  signatureTimer = window.setTimeout(async () => {
    const view = editor.value;
    if (!view || disposed) return;
    const code = view.state.doc.toString();
    const cursor = positionAt(view, view.state.selection.main.head);
    const current = view.state.doc.line(cursor.line).text.slice(0, cursor.column);
    if (!/[\w.]+\([^()]*$/.test(current)) {
      signatureHelp.value = '';
      return;
    }
    const result = await requestAnalysis('signature', code, cursor.line, pythonColumn(view.state.doc.line(cursor.line).text, cursor.column), 15_000);
    if (!disposed && sequence === signatureSequence && editor.value?.state.doc.toString() === code) signatureHelp.value = result?.signature ? String(result.signature) : '';
  }, 240);
}

function handleWorkerMessage(message: PythonRuntimeMessage): void {
  if (message.type === 'stage') {
    runtimeState.value = message.stage === 'runtime' ? 'runtime' : 'analysis';
  } else if (message.type === 'ready') {
    runtimeState.value = 'ready';
    jediReady.value = Boolean(message.jediReady);
    scheduleDiagnostics();
    scheduleSignature();
  } else if (message.type === 'jedi-ready') {
    jediReady.value = true;
    scheduleSignature();
  } else if (message.type === 'analysis-warning') {
    appendConsole('system', message.message ?? 'Un analizador no pudo inicializarse.');
  } else if (message.type === 'fatal') {
    runId.value = null;
    stopping.value = false;
    waitingForInput.value = false;
    inputSessionStarted.value = false;
    diagnosticsPending.value = false;
    runtimeState.value = 'error';
    runtimeError.value = message.message ?? 'No se pudo preparar Python.';
  } else if (message.type === 'analysis-result' && typeof message.id === 'number') {
    pendingRequests.get(message.id)?.(message.result as DiagnosticResult | null);
    pendingRequests.delete(message.id);
  } else if (runId.value !== null && message.id === runId.value) {
    handleRunMessage(message);
  }
}

function handleRunMessage(message: PythonRuntimeMessage): void {
  if (message.type === 'output') {
    appendConsole(message.channel === 'stderr' ? 'error' : 'output', message.text ?? '');
    return;
  }
  if (message.type === 'input-needed') {
    if (stopping.value) return;
    revealConsole();
    inputSessionStarted.value = true;
    waitingForInput.value = true;
    return;
  }

  if (message.type !== 'run-finished' && message.type !== 'run-stopped' && message.type !== 'run-error') return;
  runId.value = null;
  stopping.value = false;
  waitingForInput.value = false;
  inputSessionStarted.value = false;
  inputValue.value = '';
  if (message.type === 'run-finished') {
    appendConsole('system', '✓ Ejecución terminada');
  } else if (message.type === 'run-stopped') {
    appendConsole('system', 'Ejecución detenida');
  } else if (message.type === 'run-error') {
    revealConsole();
    const trace = message.message ?? 'Python terminó con un error.';
    executionError.value = executionSummary(trace);
    executionErrorLine.value = executionLine(trace);
    appendConsole('error', trace);
  }
  scheduleDiagnostics();
  scheduleSignature();
}

function updateCursor(view: EditorView): void {
  const cursor = positionAt(view, view.state.selection.main.head);
  currentLine.value = cursor.line;
  currentColumn.value = cursor.column + 1;
  lineCount.value = view.state.doc.lines;
  characterCount.value = view.state.doc.length;
}

function scheduleEditorStatus(view: EditorView): void {
  if (cursorSyncTimer !== undefined) window.clearTimeout(cursorSyncTimer);
  cursorSyncTimer = window.setTimeout(() => {
    if (editor.value === view) updateCursor(view);
  }, 180);
}

function flushCode(): void {
  window.clearTimeout(modelSyncTimer);
  modelSyncTimer = undefined;
  const latest = editor.value?.state.doc.toString();
  if (latest !== undefined && latest !== props.code) emit('update-code', props.pageId, latest);
}

function scheduleModelSync(): void {
  window.clearTimeout(modelSyncTimer);
  modelSyncTimer = window.setTimeout(flushCode, 240);
}

function createEditor(): void {
  if (!editorHost.value || editor.value) return;
  const editorView = new EditorView({
    parent: editorHost.value,
    state: EditorState.create({
      doc: props.code,
      extensions: [
        keymap.of([
          { key: 'Tab', run: (view) => acceptCompletion(view) || indentMore(view) },
          { key: 'Shift-Tab', run: indentLess },
          { key: 'Mod-Enter', run: () => runScript() },
          { key: 'Mod-f', run: () => { void openFind(); return true; } },
          { key: 'Mod-h', run: () => { void openFind(true); return true; } },
          { key: 'F3', run: () => { navigateSearch(1); return searchOpen.value; } },
          { key: 'Shift-F3', run: () => { navigateSearch(-1); return searchOpen.value; } },
          { key: 'F8', run: () => { jumpToDiagnostic(1); return errorDiagnostics.value.length > 0; } },
          { key: 'Shift-F8', run: () => { jumpToDiagnostic(-1); return errorDiagnostics.value.length > 0; } },
        ]),
        basicSetup,
        autocompletion({ override: [completionSource, localPythonCompletion, globalPythonCompletion] }),
        python(),
        pythonLanguage.data.of({ autocomplete: completionSource }),
        hoverTooltip(hoverSource, { hoverTime: 500 }),
        linter(() => [], { delay: 100_000 }),
        search({ top: true }),
        syntaxHighlighting(codeHighlight),
        editorTheme,
        EditorView.contentAttributes.of({ 'aria-label': 'Código Python' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            scheduleModelSync();
            scheduleSearchMatchRefresh();
            executionError.value = '';
            executionErrorLine.value = null;
            completionSequence += 1;
            signatureHelp.value = '';
            typeAnalysisComplete.value = false;
            scheduleDiagnostics();
          }
          if (update.selectionSet || update.docChanged) {
            scheduleEditorStatus(update.view);
            scheduleSignature();
          }
        }),
      ],
    }),
  });
  editor.value = editorView;
  updateCursor(editorView);
}

watch(() => props.code, (nextValue) => {
  const view = editor.value;
  if (!view || view.state.doc.toString() === nextValue) return;
  window.clearTimeout(modelSyncTimer);
  modelSyncTimer = undefined;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: nextValue } });
});

watch([waitingForInput, consoleLines, consoleVisible, inputSessionStarted, panelSize, consoleDockedRight], ([waiting], [wasWaiting]) => {
  if (waiting && !wasWaiting) followConsole = true;
  const view = consoleScroll.value;
  if (view && consoleVisible.value && followConsole) view.scrollTop = view.scrollHeight;
}, { flush: 'post' });

const dialogOpen = computed(() => exportModalOpen.value || importModalOpen.value || pythonGuideOpen.value);
watch([waitingForInput, dialogOpen], ([waiting, dialog]) => {
  if (waiting && !dialog) focusConsoleInput();
}, { flush: 'post' });

watch([consolePosition, bottomSize, rightSize], () => {
  window.clearTimeout(layoutSaveTimer);
  layoutSaveTimer = window.setTimeout(saveLayout, 180);
});

onMounted(() => {
  restoreLayout();
  wideLayout.addEventListener('change', updateDockAvailability);
  window.addEventListener('pagehide', flushCode, { capture: true });
  createEditor();
  try {
    runtime = getPythonRuntimeConnection();
    if (runtime) {
      unsubscribeRuntime = runtime.subscribe(handleWorkerMessage);
      return;
    }
    runtimeError.value = 'Este origen requiere las cabeceras COOP y COEP para ejecutar Python.';
  } catch (error) {
    runtimeError.value = error instanceof Error ? error.message : 'No se pudo preparar Python.';
  }
  runtimeState.value = 'error';
});

onBeforeUnmount(() => {
  stopScript();
  if (modelSyncTimer !== undefined) flushCode();
  if (layoutSaveTimer !== undefined) saveLayout();
  wideLayout.removeEventListener('change', updateDockAvailability);
  window.removeEventListener('pagehide', flushCode, { capture: true });
  window.clearTimeout(cursorSyncTimer);
  window.clearTimeout(searchRefreshTimer);
  window.clearTimeout(diagnosticsTimer);
  window.clearTimeout(signatureTimer);
  disposed = true;
  for (const resolve of pendingRequests.values()) resolve(null);
  pendingRequests.clear();
  unsubscribeRuntime?.();
  editor.value?.destroy();
  editor.value = null;
  runtime = null;
});
</script>

<template>
  <section class="knote-code-workspace" aria-label="Editor de Python">
    <Teleport to="#knote-code-actions-target">
      <div class="knote-code-actions" aria-label="Acciones de Python">
        <DropdownMenu :id="`python-script-actions-${pageId}`" label="Acciones del script" align="end" variant="surface" :items="scriptItems" @select="handleScriptAction">
          <template #trigger><Icon :icon="MoreHorizontal" size="sm" /><span class="sr-only">Acciones del script</span></template>
        </DropdownMenu>
        <Button variant="soft" color="neutral" size="sm" :prefix-icon="Search" aria-label="Buscar y reemplazar" title="Buscar y reemplazar (Ctrl/Cmd+F)" :disabled="!editor" @click="openFind()"><span class="knote-code-search-label">Buscar</span></Button>
        <DropdownMenu :id="`python-layout-${pageId}`" label="Distribución del editor" align="end" variant="surface" :items="layoutItems" @select="changeLayout">
          <template #trigger><Icon :icon="!consoleVisible ? LayoutPanelTop : consoleDockedRight ? PanelRight : PanelBottom" size="sm" /><span class="knote-code-layout-label" aria-hidden="true">Distribución</span><span class="sr-only">Distribución del editor</span></template>
        </DropdownMenu>
        <Button
          :variant="running ? 'soft' : 'solid'"
          :color="running ? 'destructive' : 'primary'"
          size="sm"
          :prefix-icon="running ? Square : Play"
          :aria-label="running ? 'Detener ejecución' : 'Ejecutar Python'"
          :aria-keyshortcuts="running ? undefined : runShortcut === '⌘↵' ? 'Meta+Enter' : 'Control+Enter'"
          :disabled="running ? stopping : runtimeState !== 'ready'"
          @click="running ? stopScript() : runScript()"
        >{{ stopping ? 'Deteniendo…' : running ? 'Detener' : 'Ejecutar' }}<kbd v-if="!running">{{ runShortcut }}</kbd></Button>
      </div>
    </Teleport>

    <p v-if="runtimeError" class="knote-code-runtime-error" role="alert"><Icon :icon="AlertCircle" size="sm" />{{ runtimeError }}</p>
    <div v-if="executionError" class="knote-code-execution-error" role="alert">
      <Icon :icon="AlertCircle" size="sm" />
      <div><strong>Error al ejecutar {{ activeFileName }}</strong><span>{{ executionError }}</span></div>
      <Button v-if="executionErrorLine" variant="soft" color="destructive" size="sm" @click="focusLine(executionErrorLine)">Ir a línea {{ executionErrorLine }}</Button>
    </div>
    <Resizable
      :id="`python-editor-console-${pageId}`"
      v-model="panelSize"
      label="Cambiar el espacio entre editor y consola"
      :orientation="consoleDockedRight ? 'horizontal' : 'vertical'"
      :min="consoleDockedRight ? 44 : 42"
      :max="consoleDockedRight ? 78 : 82"
      :step="2"
      size="lg"
      variant="surface"
      rounded="none"
      class="knote-code-panels"
      :style="stackedPanelStyle"
      :class="panelClasses"
    >
      <template #first>
        <div class="knote-code-editor-panel">
          <div class="knote-code-filebar">
            <span class="knote-code-file-name" :title="activeFileName"><Icon :icon="Code2" size="sm" /><span>{{ activeFileName }}</span></span>
            <div class="knote-code-analysis-state" aria-live="polite">
              <template v-if="runtimeState === 'error'"><span class="knote-code-diagnostic-count knote-code-diagnostic-count--error"><Icon :icon="AlertCircle" size="xs" />Python no disponible</span></template>
              <template v-else-if="runtimeState !== 'ready'"><Icon :icon="LoaderCircle" size="xs" class="knote-code-spinner" />Preparando editor</template>
              <template v-else-if="diagnosticsPending"><Icon :icon="LoaderCircle" size="xs" class="knote-code-spinner" />Comprobando código</template>
              <span v-else-if="diagnosticsNotice" class="knote-code-diagnostic-count knote-code-diagnostic-count--warning" :title="diagnosticsNotice"><Icon :icon="AlertCircle" size="xs" />Análisis limitado</span>
              <template v-else>
                <span v-if="!diagnostics.length" class="knote-code-syntax-status"><Icon :icon="Check" size="xs" />{{ typeAnalysisComplete ? 'Análisis correcto' : 'Sintaxis correcta' }}</span>
                <Button variant="soft" color="neutral" size="sm" :disabled="running" @click="runTypeAnalysis">Comprobar tipos</Button>
              </template>
              <Button
                v-if="diagnostics.length"
                variant="soft"
                :color="errorDiagnostics.length ? 'destructive' : 'neutral'"
                size="sm"
                :prefix-icon="AlertCircle"
                :aria-expanded="problemsOpen"
                :aria-controls="`python-problems-${pageId}`"
                @click="toggleProblems"
              >{{ diagnostics.length }} {{ diagnostics.length === 1 ? 'problema' : 'problemas' }}</Button>
            </div>
          </div>
          <div v-if="diagnostics.length" v-show="problemsOpen" :id="`python-problems-${pageId}`" class="knote-code-problems" role="region" aria-label="Problemas detectados">
            <div class="knote-code-problems-heading">
              <strong>{{ errorDiagnostics.length }} {{ errorDiagnostics.length === 1 ? 'error' : 'errores' }}<span v-if="warningCount"> · {{ warningCount }} {{ warningCount === 1 ? 'aviso' : 'avisos' }}</span></strong>
              <Button v-if="errorDiagnostics.length" variant="soft" color="destructive" size="sm" @click="jumpToDiagnostic(1)">Siguiente <kbd>F8</kbd></Button>
            </div>
            <ul v-if="problemsOpen" class="knote-code-problems-list">
              <li v-for="issue in diagnostics" :key="`${issue.source}-${issue.from}-${issue.message}`">
                <Button variant="soft" :color="issue.severity === 'error' ? 'destructive' : 'neutral'" size="sm" class="knote-code-problem" @click="focusDiagnostic(issue)">
                  <span class="knote-code-problem-line" aria-hidden="true">L{{ issue.line }}</span>
                  <span class="sr-only">{{ issue.severity === 'error' ? 'Error' : 'Aviso' }} en línea {{ issue.line }}.</span>
                  <span class="knote-code-problem-message">{{ issue.message }}</span>
                </Button>
              </li>
            </ul>
          </div>
          <div v-if="searchOpen" class="knote-code-search" role="search" aria-label="Buscar y reemplazar en el script" @keydown="handleSearchKeydown">
            <div class="knote-code-search-row">
              <Input :id="`python-search-${pageId}`" v-model="searchText" label="Buscar en el código" placeholder="Buscar en el código…" size="sm" variant="surface" @update:model-value="updateSearchQuery" />
              <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="ChevronUp" :disabled="!searchMatchCount || searchQueryInvalid" aria-label="Coincidencia anterior" title="Coincidencia anterior (Mayús+Intro)" @click="navigateSearch(-1)" />
              <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="ChevronDown" :disabled="!searchMatchCount || searchQueryInvalid" aria-label="Coincidencia siguiente" title="Coincidencia siguiente (Intro)" @click="navigateSearch(1)" />
              <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="Replace" :aria-label="replaceOpen ? 'Ocultar reemplazo' : 'Mostrar reemplazo'" :title="replaceOpen ? 'Ocultar reemplazo' : 'Mostrar reemplazo'" :aria-expanded="replaceOpen" :aria-controls="`python-replace-row-${pageId}`" @click="toggleReplace" />
              <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="X" aria-label="Cerrar búsqueda" title="Cerrar búsqueda (Esc)" @click="closeFind()" />
            </div>
            <div v-show="replaceOpen" :id="`python-replace-row-${pageId}`" class="knote-code-search-row">
              <Input :id="`python-replace-${pageId}`" v-model="replaceText" label="Reemplazar por" placeholder="Reemplazar por…" size="sm" variant="surface" @update:model-value="updateSearchQuery" />
              <Button variant="soft" color="neutral" size="sm" :disabled="!searchMatchCount || searchQueryInvalid" @click="replaceSearchMatch()">Reemplazar</Button>
              <Button variant="soft" color="primary" size="sm" :disabled="!searchMatchCount || searchQueryInvalid" @click="replaceSearchMatch(true)">Reemplazar todo</Button>
            </div>
            <div class="knote-code-search-options">
              <span class="knote-code-search-count" :class="{ 'knote-code-search-count--invalid': searchQueryInvalid }" aria-live="polite">{{ searchResultLabel }}</span>
              <div class="knote-code-search-toggles" role="group" aria-label="Opciones de búsqueda">
                <Button variant="soft" color="neutral" size="sm" :aria-pressed="searchCaseSensitive" aria-label="Distinguir mayúsculas y minúsculas" title="Distinguir mayúsculas y minúsculas" @click="searchCaseSensitive = !searchCaseSensitive; updateSearchQuery()">Aa</Button>
                <Button variant="soft" color="neutral" size="sm" :aria-pressed="searchWholeWord" aria-label="Buscar palabra completa" title="Buscar palabra completa" @click="searchWholeWord = !searchWholeWord; updateSearchQuery()">Palabra</Button>
                <Button variant="soft" color="neutral" size="sm" :aria-pressed="searchRegexp" aria-label="Usar expresión regular" title="Usar expresión regular" @click="searchRegexp = !searchRegexp; updateSearchQuery()">.*</Button>
              </div>
            </div>
          </div>
          <div ref="editorHost" class="knote-code-editor-host" aria-label="Código Python" />
          <div v-if="signatureHelp" class="knote-code-signature" role="status">{{ signatureHelp }}</div>
          <div class="knote-code-statusbar"><span>Línea {{ currentLine }}, columna {{ currentColumn }}</span><span>{{ lineCount }} líneas · {{ characterCount }} caracteres</span><span>{{ jediReady ? 'Ayuda contextual activa' : 'Sugerencias locales activas' }}</span></div>
        </div>
      </template>

      <template #second>
        <div class="knote-code-console-panel" role="region" aria-label="Consola de Python">
          <div class="knote-code-console-heading">
            <div><Icon :icon="Terminal" size="sm" /><strong>Consola</strong></div>
            <div class="knote-code-console-actions">
              <Badge v-if="running" variant="soft" color="warning" size="sm" role="status">
                <template v-if="waitingForInput">
                  <span class="knote-code-input-status-full">Esperando entrada</span>
                  <span aria-hidden="true" class="knote-code-input-status-short">Entrada</span>
                </template>
                <template v-else>{{ stopping ? 'Deteniendo…' : 'Ejecutando' }}</template>
              </Badge>
              <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="Trash2" aria-label="Limpiar consola" title="Limpiar consola" :disabled="!consoleLines.length || waitingForInput" @click="clearConsole" />
            </div>
          </div>
          <div ref="consoleScroll" class="knote-code-console-scroll" role="log" aria-label="Salida de Python" aria-live="polite" aria-relevant="additions text" tabindex="0" @scroll.passive="trackConsoleScroll">
            <pre v-for="entry in consoleLines" :key="entry.id" :class="['knote-code-console-line', `knote-code-console-line--${entry.kind}`]">{{ entry.text }}</pre>
            <p v-if="consoleLines.length === 0" class="knote-code-console-empty">Ejecuta el script para ver la salida.</p>
          </div>
          <form v-if="inputSessionStarted" ref="consoleInput" class="knote-code-input-row" @submit.prevent="submitInput">
            <Input :id="`python-input-${pageId}`" v-model="inputValue" label="Entrada de Python" placeholder="Respuesta…" autocomplete="off" size="sm" variant="surface" />
            <Button type="submit" variant="solid" color="primary" size="sm" :disabled="!waitingForInput">Enviar</Button>
          </form>
        </div>
      </template>
    </Resizable>

    <Modal :id="`python-export-${pageId}`" v-model="exportModalOpen" title="Descargar script Python" description="Guarda una copia del código actual con el nombre que elijas." presentation="dialog" variant="glass" size="sm" close-label="Cerrar descarga">
      <div class="knote-code-file-dialog-body">
        <Input :id="`python-export-name-${pageId}`" v-model="exportName" label="Nombre del archivo" placeholder="mi-script" size="md" variant="surface" />
        <p class="knote-code-file-dialog-hint">Se descargará como <code>.py</code>. Si escribes la extensión, no se duplicará.</p>
        <p v-if="exportError" class="knote-code-file-dialog-error" role="alert">{{ exportError }}</p>
      </div>
      <template #footer="{ close }">
        <Button variant="soft" color="neutral" @click="close">Cancelar</Button>
        <Button variant="solid" color="primary" :prefix-icon="Download" @click="downloadScript(close)">Descargar .py</Button>
      </template>
    </Modal>

    <Modal :id="`python-import-${pageId}`" v-model="importModalOpen" title="Cargar archivo Python" description="El archivo sustituirá el código de esta página y se guardará automáticamente en KNote." presentation="dialog" variant="glass" size="md" close-label="Cerrar carga">
      <div class="knote-code-file-dialog-body">
        <Attachment :id="`python-import-file-${pageId}`" v-model="importFiles" label="Selecciona o arrastra un archivo .py" accept=".py" :max-size="5242880" size="sm" rounded="lg" hint="Solo se lee en este dispositivo; no se envía a ningún servidor." @reject="handleImportRejection" />
        <p v-if="importError" class="knote-code-file-dialog-error" role="alert">{{ importError }}</p>
      </div>
      <template #footer="{ close }">
        <Button variant="soft" color="neutral" :disabled="importing" @click="close">Cancelar</Button>
        <Button variant="solid" color="primary" :prefix-icon="Upload" :disabled="!importFiles.length" :loading="importing" @click="importScript(close)">Cargar en el editor</Button>
      </template>
    </Modal>

    <PythonGuideDrawer :page-id="pageId" v-model="pythonGuideOpen" @insert-example="insertPythonExample" />
  </section>
</template>
