import { computed, nextTick, type ComputedRef, type Ref } from 'vue';
import { LayoutDashboard, Table2 } from '@lucide/vue';
import type { CalendarModelValue } from '@/components/ui/Calendar.vue';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import type { ToastItem } from '@/components/ui/ToastViewport.vue';
import type { BoardStatus, DatabaseViewState, PageEntry, PageSubtask, WorkspacePage } from '@/domain/workspace/types';
import { BOARD_STATUSES, DEFAULT_DATABASE_PROPERTIES, TASK_PRIORITIES } from '@/domain/workspace/constants';
import { entryTags } from '@/domain/workspace/normalizers';
import { makeId } from '@/domain/workspace/ids';

type DatabaseWorkspaceContext = {
  pages: Ref<WorkspacePage[]>;
  selectedId: Ref<string>;
  databaseViewStates: Ref<Record<string, DatabaseViewState>>;
  activePage: ComputedRef<WorkspacePage | null>;
  nonDatabaseActiveView: Ref<string>;
  entryInspectorOpen: Ref<boolean>;
  deleteEntryModalOpen: Ref<boolean>;
  detailPageId: Ref<string | null>;
  detailEntryId: Ref<string | null>;
  entryInspectorScroll: Ref<HTMLElement | null>;
  detailTagsDraft: Ref<string>;
  newSubtaskTitle: Ref<string>;
  tableSubtaskComposerId: Ref<string | null>;
  tableSubtaskDraft: Ref<string>;
  newTableEntryTitle: Ref<string>;
  editingTagsEntryId: Ref<string | null>;
  databaseTagsDraft: Ref<string>;
  draggedEntryId: Ref<string | null>;
  dropTargetEntryId: Ref<string | null>;
  taskDescriptionEditor: Ref<{ focusEnd: () => void } | null>;
  selectedDate: Ref<CalendarModelValue>;
  touchPage: (page: WorkspacePage) => void;
  notify: (title: string, description: string, color?: ToastItem['color']) => void;
};

export function useDatabaseWorkspace(context: DatabaseWorkspaceContext) {
  const {
    pages, selectedId, databaseViewStates, activePage, nonDatabaseActiveView, entryInspectorOpen,
    deleteEntryModalOpen, detailPageId, detailEntryId, entryInspectorScroll, detailTagsDraft,
    newSubtaskTitle, tableSubtaskComposerId, tableSubtaskDraft, newTableEntryTitle,
    editingTagsEntryId, databaseTagsDraft, draggedEntryId, dropTargetEntryId,
    taskDescriptionEditor, selectedDate, touchPage, notify,
  } = context;
function defaultDatabaseViewState(page: WorkspacePage): DatabaseViewState {
  return {
    view: page.type === 'database' ? 'table' : 'board', query: '', filter: 'Todas', sort: 'manual',
    properties: [...DEFAULT_DATABASE_PROPERTIES], collapsedEntryIds: [],
  };
}
function getDatabaseViewState(pageId = selectedId.value): DatabaseViewState | null {
  const page = pages.value.find((item) => item.id === pageId);
  if (!page || (page.type !== 'board' && page.type !== 'database')) return null;
  return databaseViewStates.value[pageId] ?? defaultDatabaseViewState(page);
}
function updateDatabaseViewState<K extends keyof DatabaseViewState>(key: K, value: DatabaseViewState[K]): void {
  const page = activePage.value;
  if (!page || (page.type !== 'board' && page.type !== 'database')) return;
  const current = getDatabaseViewState(page.id) ?? defaultDatabaseViewState(page);
  databaseViewStates.value[page.id] = { ...current, [key]: value };
}
const databaseQuery = computed({
  get: () => getDatabaseViewState()?.query ?? '',
  set: (value: string) => updateDatabaseViewState('query', value.slice(0, 240)),
});
const databaseStatusFilter = computed<DatabaseFilter>({
  get: () => getDatabaseViewState()?.filter ?? 'Todas',
  set: (value) => updateDatabaseViewState('filter', value),
});
const databaseSort = computed<DatabaseSort>({
  get: () => getDatabaseViewState()?.sort ?? 'manual',
  set: (value) => updateDatabaseViewState('sort', value),
});
const databaseProperties = computed<DatabaseProperty[]>({
  get: () => getDatabaseViewState()?.properties ?? DEFAULT_DATABASE_PROPERTIES,
  set: (value) => updateDatabaseViewState('properties', value),
});
const visibleDatabaseProperties = computed(() => entryInspectorOpen.value && activeView.value === 'table'
  ? databaseProperties.value.filter((property) => property !== 'content' && property !== 'tags')
  : databaseProperties.value);
const collapsedTableEntries = computed<string[]>({
  get: () => getDatabaseViewState()?.collapsedEntryIds ?? [],
  set: (value) => updateDatabaseViewState('collapsedEntryIds', value),
});
const activeView = computed({
  get: () => getDatabaseViewState()?.view ?? nonDatabaseActiveView.value,
  set: (value: string) => {
    if (value !== 'board' && value !== 'table') { nonDatabaseActiveView.value = value; return; }
    updateDatabaseViewState('view', value);
  },
});
const detailPage = computed(() => pages.value.find((page) => page.id === detailPageId.value) ?? null);
const detailEntry = computed(() => detailPage.value?.entries.find((entry) => entry.id === detailEntryId.value) ?? null);

const boardStatuses = BOARD_STATUSES;
const visibleBoardStatuses = computed(() => {
  const filter = getDatabaseViewState()?.filter ?? 'Todas';
  return boardStatuses.filter((status) => filter === 'Todas' || filter === status);
});
const boardViewTabs = [
  { id: 'board', label: 'Tablero', icon: LayoutDashboard },
  { id: 'table', label: 'Tabla', icon: Table2 },
];
const databaseViewTabs = [
  { id: 'board', label: 'Tablero', icon: LayoutDashboard },
  { id: 'table', label: 'Tabla', icon: Table2 },
];
const databaseStatusOptions = [
  { label: 'Todos', value: 'Todas' },
  ...BOARD_STATUSES.map((status) => ({ label: status, value: status })),
];
const databasePropertyLabels: Record<DatabaseProperty, string> = {
  content: 'Descripción', status: 'Estado', priority: 'Prioridad', due: 'Fecha', tags: 'Etiquetas',
};
const databaseSortItems = computed<MenuItem[]>(() => [
  { id: 'sort:manual', label: 'Orden original', type: 'radio', group: 'sort', checked: databaseSort.value === 'manual' },
  { id: 'sort:title', label: 'Nombre A–Z', type: 'radio', group: 'sort', checked: databaseSort.value === 'title' },
  { id: 'sort:due', label: 'Fecha más próxima', type: 'radio', group: 'sort', checked: databaseSort.value === 'due' },
  { id: 'sort:priority', label: 'Prioridad', type: 'radio', group: 'sort', checked: databaseSort.value === 'priority' },
]);
const databasePropertyItems = computed<MenuItem[]>(() => (Object.keys(databasePropertyLabels) as DatabaseProperty[]).map((property) => ({
  id: `property:${property}`,
  label: databasePropertyLabels[property],
  type: 'checkbox',
  checked: databaseProperties.value.includes(property),
})));

function entriesForStatus(page: WorkspacePage, status: BoardStatus): PageEntry[] {
  const viewState = getDatabaseViewState(page.id) ?? defaultDatabaseViewState(page);
  const query = viewState.query.trim().toLocaleLowerCase('es');
  return sortDatabaseEntries(page.entries.filter((entry) => {
    if (entry.status !== status) return false;
    if (viewState.filter !== 'Todas' && viewState.filter !== status) return false;
    if (!query) return true;
    return [entry.title, entry.status, entry.priority, entry.due, entryDescription(entry), ...entryTags(entry), ...entrySubtasks(entry).map((subtask) => subtask.title)]
      .filter(Boolean).join(' ').replace(/<[^>]*>/g, ' ').toLocaleLowerCase('es').includes(query);
  }), page.id);
}
function sortDatabaseEntries(entries: PageEntry[], pageId = selectedId.value): PageEntry[] {
  const sort = getDatabaseViewState(pageId)?.sort ?? 'manual';
  const result = [...entries];
  if (sort === 'title') result.sort((left, right) => left.title.localeCompare(right.title, 'es'));
  if (sort === 'due') result.sort((left, right) => (entryCalendarDate(left)?.getTime() ?? Number.POSITIVE_INFINITY) - (entryCalendarDate(right)?.getTime() ?? Number.POSITIVE_INFINITY));
  if (sort === 'priority') {
    const rank: Record<TaskPriority, number> = { Urgente: 0, Alta: 1, Media: 2, Baja: 3 };
    result.sort((left, right) => (left.priority ? rank[left.priority] : 4) - (right.priority ? rank[right.priority] : 4));
  }
  return result;
}
const databaseEntries = computed(() => {
  const page = activePage.value;
  if (!page) return [];
  const viewState = getDatabaseViewState(page.id) ?? defaultDatabaseViewState(page);
  const query = viewState.query.trim().toLocaleLowerCase('es');
  return sortDatabaseEntries(page.entries.filter((entry) => {
    if (viewState.filter !== 'Todas' && viewState.filter !== entry.status) return false;
    if (!query) return true;
    return [entry.title, entry.status, entry.priority, entry.due, entryDescription(entry), ...entryTags(entry), ...entrySubtasks(entry).map((subtask) => subtask.title)]
      .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query);
  }), page.id);
});
const databaseEntryCount = computed(() => databaseEntries.value.reduce((count, entry) => count + 1 + entrySubtasks(entry).length, 0));
function toggleTableEntry(entryId: string): void {
  collapsedTableEntries.value = collapsedTableEntries.value.includes(entryId)
    ? collapsedTableEntries.value.filter((id) => id !== entryId)
    : [...collapsedTableEntries.value, entryId];
}
function openTableSubtaskComposer(entryId: string): void {
  tableSubtaskComposerId.value = entryId;
  tableSubtaskDraft.value = '';
  collapsedTableEntries.value = collapsedTableEntries.value.filter((id) => id !== entryId);
  void nextTick(() => document.getElementById(`table-new-subtask-${entryId}`)?.focus({ preventScroll: true }));
}
function addTableSubtask(page: WorkspacePage, entry: PageEntry): void {
  const title = tableSubtaskDraft.value.trim();
  if (!title || tableSubtaskComposerId.value !== entry.id) return;
  if (entrySubtasks(entry).length >= 100) {
    notify('Límite de subtareas alcanzado', 'Cada tarea admite hasta 100 subtareas.', 'warning');
    return;
  }
  entry.subtasks = [...entrySubtasks(entry), { id: makeId(), title, done: false }];
  tableSubtaskDraft.value = '';
  touchPage(page);
  void nextTick(() => document.getElementById(`table-new-subtask-${entry.id}`)?.focus({ preventScroll: true }));
}
function updateTableSubtask(page: WorkspacePage, subtask: PageSubtask, patch: Partial<Pick<PageSubtask, 'title' | 'done'>>): void {
  Object.assign(subtask, patch);
  touchPage(page);
}
function focusNewTableEntry(): void {
  if (activeView.value !== 'table') activeView.value = 'table';
  void nextTick(() => document.getElementById('table-new-entry')?.focus({ preventScroll: true }));
}
function addTableEntry(page: WorkspacePage): void {
  const title = newTableEntryTitle.value.trim();
  if (!title) return;
  const entry: PageEntry = { id: makeId(), title, status: 'Por hacer', content: '', subtasks: [] };
  page.entries.push(entry);
  newTableEntryTitle.value = '';
  databaseStatusFilter.value = 'Todas';
  databaseQuery.value = '';
  touchPage(page);
  openEntryDetails(page, entry);
}
function handleDatabaseSort(selection: MenuSelection): void {
  if (!selection.id.startsWith('sort:')) return;
  databaseSort.value = selection.id.slice(5) as DatabaseSort;
}
function handleDatabaseProperty(selection: MenuSelection): void {
  if (!selection.id.startsWith('property:')) return;
  const property = selection.id.slice(9) as DatabaseProperty;
  databaseProperties.value = databaseProperties.value.includes(property)
    ? databaseProperties.value.filter((item) => item !== property)
    : [...databaseProperties.value, property];
}
function entrySubtasks(entry: PageEntry): PageSubtask[] {
  return entry.subtasks ?? [];
}
function entryDescription(entry: PageEntry): string {
  return (entry.content || '')
    .replace(/^knote-rich-v1:/, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
const detailSubtaskProgress = computed(() => {
  const subtasks = detailEntry.value ? entrySubtasks(detailEntry.value) : [];
  return { done: subtasks.filter((subtask) => subtask.done).length, total: subtasks.length };
});
function parseEntryTags(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}
function entryTagsLabel(entry: PageEntry): string {
  return entryTags(entry).join(', ') || '—';
}
function openEntryDetails(page: WorkspacePage, entry: PageEntry): void {
  tableSubtaskComposerId.value = null;
  tableSubtaskDraft.value = '';
  detailPageId.value = page.id;
  detailEntryId.value = entry.id;
  detailTagsDraft.value = entryTags(entry).join(', ');
  newSubtaskTitle.value = '';
  entryInspectorOpen.value = true;
  void nextTick(() => { if (entryInspectorScroll.value) entryInspectorScroll.value.scrollTop = 0; });
}
function duplicateDetailEntry(): void {
  const page = detailPage.value;
  const entry = detailEntry.value;
  if (!page || !entry) return;
  const copy: PageEntry = {
    ...entry, id: makeId(), title: `${entry.title || 'Sin título'} (copia)`,
    tags: entryTags(entry),
    subtasks: entrySubtasks(entry).map((subtask) => ({ ...subtask, id: makeId() })),
  };
  page.entries.splice(page.entries.findIndex((item) => item.id === entry.id) + 1, 0, copy);
  touchPage(page);
  openEntryDetails(page, copy);
  notify('Tarea duplicada', copy.title);
}
function deleteDetailEntry(): void {
  const page = detailPage.value;
  const entry = detailEntry.value;
  if (!page || !entry) return;
  page.entries = page.entries.filter((item) => item.id !== entry.id);
  entryInspectorOpen.value = false;
  deleteEntryModalOpen.value = false;
  detailEntryId.value = null;
  tableSubtaskComposerId.value = null;
  touchPage(page);
  notify('Tarea eliminada', entry.title);
}
function updateDetailTitle(value: string): void {
  if (!detailEntry.value) return;
  detailEntry.value.title = value;
  touchDetailEntry();
}
function updateDetailDue(value: string): void {
  if (!detailEntry.value) return;
  detailEntry.value.due = value.trim() || undefined;
  touchDetailEntry();
}
function detailDateValue(entry: PageEntry): CalendarModelValue {
  return entryCalendarDate(entry);
}
function detailDueIsDate(entry: PageEntry): boolean {
  return !entry.due || Boolean(entryCalendarDate(entry));
}
function updateDetailDueFromPicker(value: CalendarModelValue): void {
  if (!detailEntry.value) return;
  if (!(value instanceof Date)) { updateDetailDue(''); return; }
  updateDetailDue(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`);
}
function updateEntryDue(page: WorkspacePage, entry: PageEntry, value: string | number): void {
  entry.due = String(value).trim() || undefined;
  touchPage(page);
}
function updateEntryDueFromPicker(page: WorkspacePage, entry: PageEntry, value: CalendarModelValue): void {
  if (!(value instanceof Date)) {
    updateEntryDue(page, entry, '');
    return;
  }
  const dateValue = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  updateEntryDue(page, entry, dateValue);
}
function setEntryStatus(page: WorkspacePage, entry: PageEntry, value: string | readonly string[] | undefined): void {
  if (typeof value !== 'string' || !BOARD_STATUSES.includes(value as BoardStatus)) return;
  entry.status = value as BoardStatus;
  touchPage(page);
}
function setEntryPriority(page: WorkspacePage, entry: PageEntry, value: string | readonly string[] | undefined): void {
  if (typeof value !== 'string') return;
  if (value === 'Sin prioridad') entry.priority = undefined;
  else if (TASK_PRIORITIES.includes(value as TaskPriority)) entry.priority = value as TaskPriority;
  else return;
  touchPage(page);
}
function openEntryDescription(page: WorkspacePage, entry: PageEntry): void {
  openEntryDetails(page, entry);
  void nextTick(() => taskDescriptionEditor.value?.focusEnd());
}
function beginEntryTagsEdit(entry: PageEntry): void {
  databaseTagsDraft.value = entryTags(entry).join(', ');
  editingTagsEntryId.value = entry.id;
  void nextTick(() => document.getElementById(`database-tags-${entry.id}`)?.focus({ preventScroll: true }));
}
function updateEntryTagsDraft(value: string | number): void {
  databaseTagsDraft.value = String(value);
}
function finishEntryTagsEdit(page: WorkspacePage, entry: PageEntry): void {
  if (editingTagsEntryId.value !== entry.id) return;
  const tags = parseEntryTags(databaseTagsDraft.value);
  entry.tags = tags;
  entry.tag = tags[0];
  editingTagsEntryId.value = null;
  touchPage(page);
}
function cancelEntryTagsEdit(entry: PageEntry): void {
  if (editingTagsEntryId.value === entry.id) editingTagsEntryId.value = null;
}
function updateDetailContent(value: string): void {
  if (!detailEntry.value) return;
  detailEntry.value.content = value;
  touchDetailEntry();
}
function touchDetailEntry(): void {
  if (detailPage.value) touchPage(detailPage.value);
}
function updateDetailTags(value: string): void {
  detailTagsDraft.value = value;
  if (!detailEntry.value) return;
  detailEntry.value.tags = parseEntryTags(value);
  detailEntry.value.tag = detailEntry.value.tags[0];
  touchDetailEntry();
}
function addDetailSubtask(): void {
  const title = newSubtaskTitle.value.trim();
  const entry = detailEntry.value;
  if (!entry) return;
  if (!title) {
    document.getElementById('entry-detail-new-subtask')?.focus();
    return;
  }
  if (entrySubtasks(entry).length >= 100) {
    notify('Límite de subtareas alcanzado', 'Cada tarea admite hasta 100 subtareas.', 'warning');
    return;
  }
  entry.subtasks = [...entrySubtasks(entry), { id: makeId(), title, done: false }];
  newSubtaskTitle.value = '';
  collapsedTableEntries.value = collapsedTableEntries.value.filter((id) => id !== entry.id);
  touchDetailEntry();
  void nextTick(() => document.getElementById('entry-detail-new-subtask')?.focus({ preventScroll: true }));
}
function focusNewSubtask(): void {
  void nextTick(() => document.getElementById('entry-detail-new-subtask')?.focus({ preventScroll: true }));
}
function setDetailSubtaskTitle(subtaskId: string, value: string): void {
  const subtask = detailEntry.value ? entrySubtasks(detailEntry.value).find((item) => item.id === subtaskId) : undefined;
  if (!subtask) return;
  subtask.title = value;
  touchDetailEntry();
}
function setDetailSubtaskDone(subtaskId: string, done: boolean): void {
  const subtask = detailEntry.value ? entrySubtasks(detailEntry.value).find((item) => item.id === subtaskId) : undefined;
  if (!subtask) return;
  subtask.done = done;
  touchDetailEntry();
}
function removeDetailSubtask(subtaskId: string): void {
  if (!detailEntry.value) return;
  detailEntry.value.subtasks = entrySubtasks(detailEntry.value).filter((subtask) => subtask.id !== subtaskId);
  touchDetailEntry();
  focusNewSubtask();
}
function clearCompletedSubtasks(): void {
  if (!detailEntry.value) return;
  detailEntry.value.subtasks = entrySubtasks(detailEntry.value).filter((subtask) => !subtask.done);
  touchDetailEntry();
  focusNewSubtask();
}
function setDetailPriority(value: string | readonly string[] | undefined): void {
  if (!detailEntry.value || typeof value !== 'string') return;
  if (value === 'Sin prioridad') detailEntry.value.priority = undefined;
  else if (TASK_PRIORITIES.includes(value as TaskPriority)) detailEntry.value.priority = value as TaskPriority;
  else return;
  touchDetailEntry();
}
function setDetailStatus(value: string | readonly string[] | undefined): void {
  if (!detailEntry.value || typeof value !== 'string' || !BOARD_STATUSES.includes(value as BoardStatus)) return;
  detailEntry.value.status = value as BoardStatus;
  touchDetailEntry();
}
function handleBoardDragStart(entry: PageEntry, event: DragEvent): void {
  draggedEntryId.value = entry.id;
  dropTargetEntryId.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', entry.id);
  }
}
function handleBoardDragOver(entryId: string, event: DragEvent): void {
  if (!draggedEntryId.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTargetEntryId.value = entryId === draggedEntryId.value ? null : entryId;
}
function dropBoardEntry(status: BoardStatus, event: DragEvent, target?: PageEntry): void {
  const page = activePage.value;
  const entryId = draggedEntryId.value || event.dataTransfer?.getData('text/plain');
  if (!page || !entryId) return;
  if (target?.id === entryId) { handleBoardDragEnd(); return; }
  if (getDatabaseViewState(page.id)?.sort !== 'manual') {
    updateDatabaseViewState('sort', 'manual');
    notify('Orden manual activado', 'La vista se ha cambiado a orden manual para conservar el movimiento.');
  }
  const fromIndex = page.entries.findIndex((entry) => entry.id === entryId);
  if (fromIndex < 0) return;
  const [moving] = page.entries.splice(fromIndex, 1);
  if (!moving) return;
  moving.status = status;
  const targetIndex = target ? page.entries.findIndex((entry) => entry.id === target.id) : -1;
  if (targetIndex >= 0 && target) {
    const targetElement = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-entry-id]');
    const bounds = targetElement?.getBoundingClientRect();
    const insertAfter = bounds ? event.clientY >= bounds.top + bounds.height / 2 : false;
    page.entries.splice(targetIndex + (insertAfter ? 1 : 0), 0, moving);
  } else {
    let insertAt = page.entries.length;
    for (let index = 0; index < page.entries.length; index += 1) {
      if (page.entries[index]?.status === status) insertAt = index + 1;
    }
    page.entries.splice(insertAt, 0, moving);
  }
  draggedEntryId.value = null;
  dropTargetEntryId.value = null;
  touchPage(page);
}
function handleBoardDragEnd(): void {
  draggedEntryId.value = null;
  dropTargetEntryId.value = null;
}
function entryDateLabel(entry: PageEntry): string {
  if (!entry.due) return 'Sin fecha';
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.due)) return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(entry.due + 'T12:00:00'));
  return entry.due;
}
function entryCalendarDate(entry: PageEntry): Date | null {
  if (!entry.due) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.due)) {
    const [year, month, day] = entry.due.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ? null : date;
  }
  const base = new Date();
  if (entry.due.toLocaleLowerCase('es') === 'hoy') return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12);
  if (entry.due.toLocaleLowerCase('es') === 'mañana') return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 12);
  if (entry.due.toLocaleLowerCase('es') === 'ayer') return new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1, 12);
  const match = entry.due.match(/^(\d{1,2})\s+([a-záéíóúñ.]+)/i);
  if (!match) return null;
  const months: Record<string, number> = { ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10, dic: 11, diciembre: 11 };
  const month = months[match[2].toLocaleLowerCase('es').replace('.', '')];
  if (month === undefined) return null;
  const day = Number(match[1]);
  const date = new Date(base.getFullYear(), month, day, 12);
  return date.getMonth() === month && date.getDate() === day ? date : null;
}
function entriesForSelectedDate(page: WorkspacePage): PageEntry[] {
  const selected = selectedDate.value;
  if (!(selected instanceof Date)) return [];
  return page.entries.filter((entry) => {
    const date = entryCalendarDate(entry);
    return date?.toDateString() === selected.toDateString();
  });
}
function entryDoneChanged(page: WorkspacePage, entry: PageEntry, done: boolean): void {
  entry.done = done;
  entry.status = done ? 'Hecho' : 'Por hacer';
  touchPage(page);
}

  return {
    defaultDatabaseViewState, parseEntryTags, touchDetailEntry,
    databaseQuery, databaseStatusFilter, visibleDatabaseProperties, collapsedTableEntries, activeView,
    detailPage, detailEntry, visibleBoardStatuses, boardViewTabs, databaseViewTabs, databaseStatusOptions,
    databaseSortItems, databasePropertyItems, entriesForStatus, databaseEntries, databaseEntryCount,
    toggleTableEntry, openTableSubtaskComposer, addTableSubtask, updateTableSubtask, focusNewTableEntry,
    addTableEntry, handleDatabaseSort, handleDatabaseProperty, entrySubtasks, entryDescription,
    detailSubtaskProgress, entryTagsLabel, openEntryDetails, duplicateDetailEntry, deleteDetailEntry,
    updateDetailTitle, updateDetailDue, detailDateValue, detailDueIsDate, updateDetailDueFromPicker,
    updateEntryDueFromPicker, setEntryStatus, setEntryPriority, openEntryDescription,
    beginEntryTagsEdit, updateEntryTagsDraft, finishEntryTagsEdit, cancelEntryTagsEdit,
    updateDetailContent, updateDetailTags, addDetailSubtask, focusNewSubtask, setDetailSubtaskTitle,
    setDetailSubtaskDone, removeDetailSubtask, clearCompletedSubtasks, setDetailPriority, setDetailStatus,
    handleBoardDragStart, handleBoardDragOver, dropBoardEntry, handleBoardDragEnd,
    entryDateLabel, entryCalendarDate, entriesForSelectedDate, entryDoneChanged,
  };
}
