<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Activity, AlignLeft, AlarmClock, Archive, ArrowRight, ArrowUpDown, ArrowUpRight, Atom, Award, Bell, BookMarked, BookOpen, Bot, BriefcaseBusiness, Building2, CalendarDays, Camera, ChartNoAxesCombined, Check, CheckCheck, ChefHat,
  ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleHelp, ClipboardList, Cloud, Code2, Coffee, Compass, Cpu, Crown,
  Database, Diamond, Dumbbell, Earth, Eye, FileCode, FileImage, FileText, Fingerprint, Flag, Flame, FlaskConical, Folder, FolderOpen, Gamepad2, Gauge, Gem, GitBranch, Globe, Hammer, Handshake, HardDrive, Headphones, Heart, History, House, Inbox, KeyRound, Laptop, Layers, Leaf, LifeBuoy, Link2, LockKeyhole, Mail, Map as MapIcon, MapPin, Medal, Mic, Monitor, Moon, Mountain,
  LayoutDashboard, Lightbulb, ListTodo, Link as LinkIcon, Menu, MessageCircle,
  MoreHorizontal, Music2, Network, Newspaper, NotebookPen, Package, Paintbrush, Palette, Paperclip, Pencil, PenTool, Plane, Plug, Plus, Puzzle, Radio, Rocket, Scale, Scissors, Search, Send, Server, Settings, Settings2, ShieldCheck, ShoppingBag, SlidersHorizontal, Smartphone, Smile, Sparkles, Sprout, Star, StickyNote, Sun, Sword,
  Table2, Tag, Target, Terminal, Ticket, Timer, Trash2, Trees, Trophy, UserRound, UsersRound, Video, Wallet, Waves, Workflow, Wrench, Zap, Filter, X,
} from '@lucide/vue';
import Badge from '@/components/ui/Badge.vue';
import Breadcrumb from '@/components/ui/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';
import Calendar from '@/components/ui/Calendar.vue';
import Card from '@/components/ui/Card.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import CommandMenu from '@/components/ui/CommandMenu.vue';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import DatePicker from '@/components/ui/DatePicker.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Link from '@/components/ui/Link.vue';
import Modal from '@/components/ui/Modal.vue';
import Progress from '@/components/ui/Progress.vue';
import Select from '@/components/ui/Select.vue';
import Separator from '@/components/ui/Separator.vue';
import Sidebar from '@/components/ui/Sidebar.vue';
import Table from '@/components/ui/Table.vue';
import Tabs from '@/components/ui/Tabs.vue';
import ToastViewport, { type ToastItem } from '@/components/ui/ToastViewport.vue';
import Attachment from '@/components/ui/Attachment.vue';
import PageIconPicker from '@/components/PageIconPicker.vue';
import WorkspaceTransfer from '@/components/WorkspaceTransfer.vue';
import HomeDashboard from '@/components/workspace/HomeDashboard.vue';
import CreatePageDialog from '@/components/workspace/CreatePageDialog.vue';
import WorkspacePreferencesDialog from '@/components/workspace/WorkspacePreferencesDialog.vue';
import PageEntryDialog from '@/components/workspace/PageEntryDialog.vue';
import DeleteEntryDialog from '@/components/workspace/DeleteEntryDialog.vue';
import DatabaseWorkspace from '@/components/workspace/DatabaseWorkspace.vue';
import type { CalendarModelValue } from '@/components/ui/Calendar.vue';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import type { SidebarGroup } from '@/components/ui/Sidebar.vue';
import { deleteBlockImage, saveBlockImage } from '@/lib/block-images';
import { getDesktopVaultError, isDesktopRuntime } from '@/lib/desktop-vault';
import type { WorkspaceSnapshot } from '@/lib/desktop-vault';
import type { PreparedWorkspaceTransfer } from '@/lib/workspace-transfer';
import type { BoardStatus, CanvasWidth, DatabaseFilter, DatabaseProperty, DatabaseSort, DatabaseViewState, GlassStrength, PageEntry, PageSubtask, PageType, ReadingDensity, TaskPriority, TodayTask, WorkspacePage, WorkspacePreferences } from '@/domain/workspace/types';
import { BOARD_STATUSES, DEFAULT_DATABASE_PROPERTIES, defaultPreferences, PREFERENCES_STORAGE_KEY, priorityCellOptions, priorityOptions, statusOptions, TASK_PRIORITIES, widthOptions } from '@/domain/workspace/constants';
import { pageIconOptions } from '@/domain/workspace/page-icons';
import { entryTags, normalizeDatabaseViewStates, normalizePages, normalizePreferences, normalizeTodayTasks, readPages, readPreferences, readTodayTasks, readDatabaseViewStates } from '@/domain/workspace/normalizers';
import { useWorkspacePersistence } from '@/composables/useWorkspacePersistence';
import { useDatabaseWorkspace } from '@/composables/useDatabaseWorkspace';
import { makeId } from '@/domain/workspace/ids';

const BlockEditor = defineAsyncComponent({ loader: () => import('@/components/BlockEditor.vue'), delay: 120, timeout: 15000 });
const CodeWorkspace = defineAsyncComponent({ loader: () => import('@/components/workspace/CodeWorkspace.vue'), delay: 100, timeout: 15000 });
const pages = ref<WorkspacePage[]>(readPages());
const todayTasks = ref<TodayTask[]>(readTodayTasks());
const preferences = ref<WorkspacePreferences>(readPreferences());
const databaseViewStates = ref<Record<string, DatabaseViewState>>(readDatabaseViewStates());
const workspaceSnapshot = computed<WorkspaceSnapshot>(() => ({
  pages: pages.value,
  todayTasks: todayTasks.value,
  preferences: preferences.value,
  databaseViewStates: databaseViewStates.value,
}));
const currentTime = ref(Date.now());
function pageIdFromHash(): string {
  let requestedId = '';
  try { requestedId = decodeURIComponent(window.location.hash.slice(1)); }
  catch { requestedId = window.location.hash.slice(1); }
  return pages.value.some((page) => page.id === requestedId) ? requestedId : 'home';
}
const selectedId = ref(pageIdFromHash());
const sidebarCollapsed = ref(true);
const mobileSidebarOpen = ref(false);
const createModalOpen = ref(false);
const preferencesOpen = ref(false);
const dataTransferOpen = ref(false);
const entryModalOpen = ref(false);
const preferencesTab = ref('appearance');
const entryEditingId = ref<string | null>(null);
const entryTitle = ref('');
const entryTag = ref('');
const entryPriority = ref<TaskPriority | 'Sin prioridad'>('Media');
const entryDue = ref('');
const entryStatus = ref<BoardStatus>('Por hacer');
const nonDatabaseActiveView = ref('board');
const entryInspectorOpen = ref(false);
const deleteEntryModalOpen = ref(false);
const detailPageId = ref<string | null>(null);
const detailEntryId = ref<string | null>(null);
const entryInspectorScroll = ref<HTMLElement | null>(null);
const detailTagsDraft = ref('');
const newSubtaskTitle = ref('');
const tableSubtaskComposerId = ref<string | null>(null);
const tableSubtaskDraft = ref('');
const newTableEntryTitle = ref('');
const editingTagsEntryId = ref<string | null>(null);
const databaseTagsDraft = ref('');
const draggedEntryId = ref<string | null>(null);
const dropTargetEntryId = ref<string | null>(null);
const taskDescriptionEditor = ref<{ focusEnd: () => void } | null>(null);
const createTitle = ref('');
const createType = ref<PageType>('doc');
const createParentId = ref<string | null>(null);
const quickCapture = ref('');
const commandOpen = ref(false);
const commandQuery = ref('');
const selectedDate = ref<CalendarModelValue>(new Date());
const toasts = ref<readonly ToastItem[]>([]);
let clockTimer: number | undefined;
let toastCounter = 0;
let removeDesktopCloseListener: (() => void) | undefined;
let desktopCloseInProgress = false;
let sidebarCloseTimer: number | undefined;

const activePage = computed(() => pages.value.find((page) => page.id === selectedId.value) ?? null);
const appPreferencesStyle = computed(() => ({
  '--knote-glass-alpha': preferences.value.glass === 'soft' ? '50%' : preferences.value.glass === 'deep' ? '84%' : '68%',
  '--knote-glass-blur': preferences.value.glass === 'soft' ? '12px' : preferences.value.glass === 'deep' ? '30px' : '20px',
  '--knote-canvas-width': preferences.value.width === 'compact' ? '48rem' : preferences.value.width === 'wide' ? '72rem' : '56rem',
}));
const sortedPages = computed(() => [...pages.value].sort((left, right) => right.updatedAt - left.updatedAt));
const recentPages = computed(() => {
  const seenTitles = new Set<string>();
  return sortedPages.value.filter((page) => {
    if (page.type === 'folder') return false;
    const title = page.title.trim().toLocaleLowerCase('es');
    if (seenTitles.has(title)) return false;
    seenTitles.add(title);
    return true;
  }).slice(0, 7);
});
const homeTasksRemaining = computed(() => todayTasks.value.filter((task) => !task.done).length);
const pageCount = computed(() => pages.value.filter((page) => page.type !== 'folder').length);
const favoriteCount = computed(() => pages.value.filter((page) => page.favorite).length);
const todayDoneCount = computed(() => todayTasks.value.filter((task) => task.done).length);
const greeting = computed(() => {
  const hour = new Date(currentTime.value).getHours();
  return hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
});
const dateLabel = computed(() => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(currentTime.value)));
const selectedDateLabel = computed(() => selectedDate.value instanceof Date
  ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(selectedDate.value)
  : 'Próximas fechas');
const entryDialogTitle = computed(() => entryEditingId.value ? 'Editar elemento' : activePage.value?.type === 'calendar' ? 'Añadir evento' : activePage.value?.type === 'tasks' ? 'Añadir paso' : 'Añadir elemento');
const focusProject = computed(() => pages.value.find((page) => page.id === 'page-abyss-ideas') ?? null);
const projectCompletion = computed(() => {
  const entries = focusProject.value?.entries ?? [];
  return entries.length ? Math.round(entries.filter((entry) => entry.status === 'Hecho').length / entries.length * 100) : 0;
});
function pageTypeLabel(type: PageType): string {
  return { folder: 'Carpeta', doc: 'Documento', code: 'Código', board: 'Tablero', database: 'Tabla', calendar: 'Calendario', tasks: 'Lista de tareas' }[type];
}
function pageTypeIcon(type: PageType) {
  return { folder: Folder, doc: FileText, code: Code2, board: LayoutDashboard, database: Table2, calendar: CalendarDays, tasks: ListTodo }[type];
}
function pageIcon(page: WorkspacePage) {
  return pageIconOptions.find((option) => option.id === page.icon)?.icon ?? pageTypeIcon(page.type);
}
function pageIconColor(page: WorkspacePage): string {
  return page.iconColor || 'var(--balsa-role-accent)';
}
function pageIconStyle(page: WorkspacePage): Record<string, string> {
  return { '--knote-page-icon-color': pageIconColor(page) };
}
function entryIcon(entry: PageEntry) {
  return pageIconOptions.find((option) => option.id === entry.icon)?.icon ?? FileText;
}
function entryIconStyle(entry: PageEntry): Record<string, string> {
  return { color: entry.iconColor || 'var(--balsa-role-accent)' };
}
function pageBannerStyle(page: WorkspacePage): Record<string, string> {
  if (!page.banner) return {};
  const assetId = page.banner.startsWith('knote-asset:') ? page.banner.slice('knote-asset:'.length) : '';
  const source = assetId ? bannerObjectUrls.value[assetId] : page.banner;
  return source ? { backgroundImage: `url("${source}")` } : {};
}
function formatRelative(timestamp: number): string {
  const minutes = Math.floor(Math.max(0, currentTime.value - (timestamp || currentTime.value)) / 60000);
  if (minutes < 1) return 'Ahora mismo';
  if (minutes < 60) return 'Hace ' + minutes + ' min';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return 'Hace ' + hours + ' h';
  if (hours < 48) return 'Ayer';
  return 'Hace ' + Math.floor(hours / 24) + ' días';
}
function pageChildren(parentId: string): WorkspacePage[] {
  return sortedPages.value.filter((page) => page.parentId === parentId);
}
function sidebarItemsFor(parentId: string | null): SidebarGroup['items'] {
  return sortedPages.value.filter((page) => page.parentId === parentId).map((page) => {
    const children = sidebarItemsFor(page.id);
    return {
      id: page.id, label: page.title || 'Sin título', icon: pageIcon(page), iconColor: page.iconColor,
      ...(page.favorite ? { badge: '★' } : {}),
      ...(children.length ? { children } : {}),
    };
  });
}
const sidebarGroups = computed<readonly SidebarGroup[]>(() => {
  const recentItems = recentPages.value.slice(0, 7).map((page) => ({
    id: page.id, label: page.title || 'Sin título', icon: pageIcon(page), iconColor: page.iconColor,
    ...(page.favorite ? { badge: '★' } : {}),
  }));
  return [
    { id: 'meetings', label: 'Reuniones', items: [
      { id: 'meetings-empty', label: 'No hay eventos próximos', icon: CalendarDays, disabled: true },
      { id: 'create-meeting-note', label: 'Nueva nota de reunión', icon: Plus },
      { id: 'page-agenda', label: 'Ver agenda', icon: ArrowUpRight },
    ] },
    { id: 'recents', label: 'Recientes', items: recentItems },
    { id: 'private', label: 'Privado', items: sidebarItemsFor(null) },
  ];
});
const breadcrumbItems = computed(() => {
  if (!activePage.value) return [{ label: 'Mi espacio', href: '#home' }, { label: 'Inicio', current: true }];
  const ancestors: WorkspacePage[] = [];
  let cursor: WorkspacePage | undefined = activePage.value;
  while (cursor) {
    ancestors.unshift(cursor);
    const parentId = cursor.parentId;
    cursor = parentId ? pages.value.find((page) => page.id === parentId) : undefined;
  }
  return [
    { label: 'Mi espacio', href: '#home' },
    ...ancestors.map((page, index) => index === ancestors.length - 1
      ? { label: page.title || 'Sin título', current: true }
      : { label: page.title || 'Sin título', href: '#' + page.id }),
  ];
});
const pageMenuItems = computed<readonly MenuItem[]>(() => [
  { id: 'favorite', type: 'checkbox', label: activePage.value?.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos', icon: Star, checked: Boolean(activePage.value?.favorite), disabled: !activePage.value },
  { id: 'copy-link', label: 'Copiar enlace de esta instalación', icon: Link2, disabled: !activePage.value },
  { id: 'menu-separator', type: 'separator' },
  { id: 'delete', label: 'Eliminar página', icon: Trash2, destructive: true, disabled: !activePage.value },
]);
const detailEntryMenuItems = computed<readonly MenuItem[]>(() => [
  ...(saveState.value === 'error' ? [{ id: 'retry-save', label: 'Reintentar guardado', icon: CircleAlert }] : []),
  { id: 'duplicate-entry', label: 'Duplicar tarea', icon: FileText },
  { id: 'detail-entry-menu-separator', type: 'separator' },
  { id: 'delete-entry', label: 'Eliminar tarea', icon: Trash2, destructive: true },
]);
const commandGroups = computed(() => [
  { id: 'pages', label: 'Páginas', items: recentPages.value.map((page) => ({
    id: 'page:' + page.id, label: page.title || 'Sin título',
    keywords: [pageTypeLabel(page.type), page.content.slice(0, 60)], icon: pageIcon(page),
  })) },
  { id: 'create', label: 'Crear', items: [
    { id: 'new:doc', label: 'Nuevo documento', keywords: ['página', 'nota'], icon: FileText },
    { id: 'new:code', label: 'Nuevo editor Python', keywords: ['código', 'python', 'script', 'programar'], icon: Code2 },
    { id: 'new:board', label: 'Nuevo tablero', keywords: ['kanban', 'proyecto'], icon: LayoutDashboard },
    { id: 'new:database', label: 'Nueva tabla', keywords: ['base de datos', 'lista'], icon: Table2 },
    { id: 'new:calendar', label: 'Nuevo calendario', keywords: ['agenda', 'fecha'], icon: CalendarDays },
  ] },
]);

function notify(title: string, description: string, color: ToastItem['color'] = 'success'): void {
  toastCounter += 1;
  toasts.value = [...toasts.value, { id: 'toast-' + toastCounter, title, description, color, variant: 'surface', duration: 3200, dismissible: true }];
}
const {
  bannerFiles, bannerObjectUrls, saveState,
  persist, queueSave, queueDatabaseViewSave, flushPendingChanges,
  pruneUnusedBlockImages, hydratePageBanners, migrateLegacyBanners, touchPage,
  waitForPendingSaves, saveSnapshot, dispose,
} = useWorkspacePersistence({ pages, todayTasks, preferences, databaseViewStates, snapshot: workspaceSnapshot, notify });
const {
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
} = useDatabaseWorkspace({
  pages, selectedId, databaseViewStates, activePage, nonDatabaseActiveView, entryInspectorOpen,
  deleteEntryModalOpen, detailPageId, detailEntryId, entryInspectorScroll, detailTagsDraft,
  newSubtaskTitle, tableSubtaskComposerId, tableSubtaskDraft, newTableEntryTitle,
  editingTagsEntryId, databaseTagsDraft, draggedEntryId, dropTargetEntryId,
  taskDescriptionEditor, selectedDate, touchPage, notify,
});
function setActive(id: string, updateHistory = true): void {
  if (id !== 'home' && !pages.value.some((page) => page.id === id)) id = 'home';
  entryInspectorOpen.value = false;
  deleteEntryModalOpen.value = false;
  tableSubtaskComposerId.value = null;
  tableSubtaskDraft.value = '';
  newTableEntryTitle.value = '';
  selectedId.value = id;
  bannerFiles.value = [];
  mobileSidebarOpen.value = false;
  const page = pages.value.find((item) => item.id === id);
  if (page?.type === 'database' || page?.type === 'board') {
    if (!databaseViewStates.value[page.id]) databaseViewStates.value[page.id] = defaultDatabaseViewState(page);
  } else nonDatabaseActiveView.value = page?.type === 'calendar' ? 'calendar' : 'board';
  if (page?.type === 'calendar' && page.entries[0]?.due) {
    const firstDate = new Date(page.entries[0].due.length === 10 ? page.entries[0].due + 'T12:00:00' : page.entries[0].due);
    if (!Number.isNaN(firstDate.getTime())) selectedDate.value = firstDate;
  }
  if (updateHistory) {
    const fragment = id === 'home' ? '' : '#' + encodeURIComponent(id);
    if (window.location.hash !== fragment) window.history.pushState({ pageId: id }, '', window.location.pathname + window.location.search + fragment);
  }
}
function syncPageFromHistory(): void { setActive(pageIdFromHash(), false); }
function revealSidebar(): void {
  if (sidebarCloseTimer !== undefined) window.clearTimeout(sidebarCloseTimer);
  sidebarCollapsed.value = false;
}
function scheduleSidebarClose(keepWhenFocused = false): void {
  if (sidebarCloseTimer !== undefined) window.clearTimeout(sidebarCloseTimer);
  if (mobileSidebarOpen.value) return;
  sidebarCloseTimer = window.setTimeout(() => {
    const navigation = document.getElementById('knote-navigation');
    if (keepWhenFocused && navigation?.contains(document.activeElement)) return;
    sidebarCollapsed.value = true;
  }, 180);
}
function handleSidebarPointerLeave(): void {
  scheduleSidebarClose(true);
}
function handleSidebarFocusOut(): void { scheduleSidebarClose(true); }
function onSidebarSelect(item: { id: string }): void {
  if (item.id === 'create-meeting-note') { openCreatePage('doc', 'folder-reuniones'); return; }
  if (item.id === 'meetings-empty') return;
  setActive(item.id);
}
function goHome(): void { setActive('home'); }
function goBreadcrumb(item: { href?: string }, event: MouseEvent): void {
  event.preventDefault();
  setActive(item.href?.slice(1) || 'home');
}
function openCreatePage(type: PageType = 'doc', parentId: string | null = activePage.value?.type === 'folder' ? activePage.value.id : activePage.value?.parentId ?? null): void {
  createType.value = type;
  createParentId.value = parentId;
  createTitle.value = '';
  createModalOpen.value = true;
}
function dateInputValue(date: Date): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function openEntryModal(status: BoardStatus = 'Por hacer', entry?: PageEntry): void {
  const page = activePage.value;
  if (!page) return;
  entryEditingId.value = entry?.id ?? null;
  entryTitle.value = entry?.title ?? '';
  entryTag.value = entry ? entryTags(entry).join(', ') : '';
  entryPriority.value = entry?.priority ?? (entry ? 'Sin prioridad' : 'Media');
  entryDue.value = entry?.due ?? (page.type === 'calendar' && selectedDate.value instanceof Date ? dateInputValue(selectedDate.value) : '');
  entryStatus.value = page.type === 'calendar' || page.type === 'tasks' ? 'Por hacer' : entry?.status ?? status;
  entryModalOpen.value = true;
}
function saveEntry(close?: () => void): void {
  const page = activePage.value;
  const title = entryTitle.value.trim();
  if (!page || !title) {
    notify('Falta un nombre', 'Escribe un título para guardar este elemento.', 'warning');
    return;
  }
  const selectedPriority: TaskPriority | undefined = entryPriority.value === 'Sin prioridad' ? undefined : entryPriority.value;
  const existing = entryEditingId.value ? page.entries.find((entry) => entry.id === entryEditingId.value) : undefined;
  if (existing) {
    existing.title = title;
    existing.tags = parseEntryTags(entryTag.value);
    existing.tag = existing.tags[0];
    existing.priority = selectedPriority;
    existing.due = entryDue.value.trim() || undefined;
    if (page.type === 'tasks') existing.done = Boolean(existing.done);
    else existing.status = entryStatus.value;
  } else {
    const tags = parseEntryTags(entryTag.value);
    page.entries.unshift({
      id: makeId(), title, tag: tags[0], tags, priority: selectedPriority,
      due: entryDue.value.trim() || undefined, status: entryStatus.value, content: '',
      ...(page.type === 'tasks' ? { done: false } : {}),
    });
  }
  touchPage(page);
  entryModalOpen.value = false;
  close?.();
  notify(existing ? 'Elemento actualizado' : 'Elemento añadido', title);
}
function defaultEntries(type: PageType): PageEntry[] {
  // New databases and boards start empty. Seed content is only for the demo workspace.
  void type;
  return [];
}
function submitNewPage(close?: () => void): void {
  const titles: Record<PageType, string> = { folder: 'Nueva carpeta', doc: 'Sin título', code: 'Python', board: 'Nuevo tablero', database: 'Nueva tabla', calendar: 'Calendario', tasks: 'Lista de tareas' };
  const title = createTitle.value.trim() || titles[createType.value];
  const timestamp = Date.now();
  const page: WorkspacePage = {
    id: makeId(), title, type: createType.value, parentId: createParentId.value, content: createType.value === 'code' ? 'print("Hola desde KNote")' : '',
    favorite: false, createdAt: timestamp, updatedAt: timestamp, entries: defaultEntries(createType.value),
  };
  pages.value.unshift(page);
  createModalOpen.value = false;
  close?.();
  setActive(page.id);
  persist();
  notify('Página creada', title + ' ya está en tu espacio.');
}
function captureQuickNote(): void {
  const content = quickCapture.value.trim();
  if (!content) return;
  const timestamp = Date.now();
  const page: WorkspacePage = {
    id: makeId(), title: content.length > 48 ? content.slice(0, 47).trimEnd() + '…' : content,
    type: 'doc', parentId: pages.value.some((page) => page.id === 'folder-personal' && page.type === 'folder') ? 'folder-personal' : null, content: content.length > 48 ? content : '',
    favorite: false, createdAt: timestamp, updatedAt: timestamp, entries: [],
  };
  pages.value.unshift(page);
  quickCapture.value = '';
  persist();
  notify('Idea guardada', 'Se añadió a Personal y quedó lista para seguir editando.');
}
function toggleFavorite(page: WorkspacePage): void {
  page.favorite = !page.favorite;
  touchPage(page);
  notify(page.favorite ? 'Añadido a favoritos' : 'Quitado de favoritos', page.title);
}
function descendantIds(rootId: string): Set<string> {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages.value) {
      if (page.parentId && result.has(page.parentId) && !result.has(page.id)) { result.add(page.id); changed = true; }
    }
  }
  return result;
}
function deleteCurrentPage(): void {
  const page = activePage.value;
  if (!page) return;
  const removedIds = descendantIds(page.id);
  const count = removedIds.size;
  if (!window.confirm('¿Eliminar “' + page.title + '” y ' + (count > 1 ? (count - 1) + ' páginas dentro de la carpeta' : 'esta página') + '?')) return;
  pages.value = pages.value.filter((item) => !removedIds.has(item.id));
  setActive('home');
  persist();
  notify('Página eliminada', page.title, 'info');
}
async function copyCurrentLink(): Promise<void> {
  if (!activePage.value) return;
  try {
    await navigator.clipboard.writeText(window.location.origin + window.location.pathname + window.location.search + '#' + encodeURIComponent(activePage.value.id));
    notify('Enlace copiado', 'Abre esta página en esta instalación. Los datos siguen guardados en este dispositivo.');
  } catch { notify('No se pudo copiar', 'El navegador no ha dado acceso al portapapeles.', 'warning'); }
}
function onPageMenu(selection: MenuSelection): void {
  if (selection.id === 'favorite' && activePage.value) toggleFavorite(activePage.value);
  if (selection.id === 'copy-link') void copyCurrentLink();
  if (selection.id === 'delete') deleteCurrentPage();
}
function onDetailEntryMenu(selection: MenuSelection): void {
  if (selection.id === 'retry-save') persist();
  if (selection.id === 'duplicate-entry') duplicateDetailEntry();
  if (selection.id === 'delete-entry') deleteEntryModalOpen.value = true;
}
function setPageIcon(iconId: string | undefined): void {
  if (!activePage.value) return;
  if (iconId && !pageIconOptions.some((option) => option.id === iconId)) return;
  activePage.value.icon = iconId;
  touchPage(activePage.value);
}
function setPageIconColor(color: string): void {
  if (!activePage.value) return;
  if (color && !/^#[\da-f]{6}$/i.test(color)) return;
  activePage.value.iconColor = color ? color.toLowerCase() : undefined;
  touchPage(activePage.value);
}
function setDetailEntryIcon(iconId: string | undefined): void {
  if (!detailEntry.value) return;
  if (iconId && !pageIconOptions.some((option) => option.id === iconId)) return;
  detailEntry.value.icon = iconId;
  touchDetailEntry();
}
function setDetailEntryIconColor(color: string): void {
  if (!detailEntry.value || (color && !/^#[\da-f]{6}$/i.test(color))) return;
  detailEntry.value.iconColor = color ? color.toLowerCase() : undefined;
  touchDetailEntry();
}
async function optimizeBanner(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Elige una imagen para la portada.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / bitmap.width, 1400 / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('No se pudo preparar la imagen.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (quality: number) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.')), 'image/webp', quality);
  });
  let blob = await toBlob(.9);
  if (blob.size > 930000) blob = await toBlob(.86);
  if (blob.size > 930000) blob = await toBlob(.82);
  if (blob.size > 930000) throw new Error('La portada es demasiado grande. Prueba con una imagen más pequeña.');
  return blob;
}
async function setPageBanner(files: readonly File[]): Promise<void> {
  const file = files[0];
  const pageId = activePage.value?.id;
  bannerFiles.value = files;
  if (!file || !pageId) return;
  try {
    const image = await optimizeBanner(file);
    const assetId = await saveBlockImage(image);
    const page = pages.value.find((item) => item.id === pageId);
    if (!page) { await deleteBlockImage(assetId); return; }
    const previousAssetId = page.banner?.startsWith('knote-asset:') ? page.banner.slice('knote-asset:'.length) : null;
    page.banner = `knote-asset:${assetId}`;
    bannerObjectUrls.value = { ...bannerObjectUrls.value, [assetId]: URL.createObjectURL(image) };
    if (previousAssetId && bannerObjectUrls.value[previousAssetId]) {
      URL.revokeObjectURL(bannerObjectUrls.value[previousAssetId]);
      const next = { ...bannerObjectUrls.value };
      delete next[previousAssetId];
      bannerObjectUrls.value = next;
    }
    touchPage(page);
    notify('Portada actualizada', 'La imagen quedó optimizada y guardada fuera de los datos del documento.');
  } catch (error) {
    notify('No se pudo usar la portada', error instanceof Error ? error.message : 'Elige otra imagen.', 'warning');
  } finally { bannerFiles.value = []; }
}
function openPageBannerPicker(pageId: string): void {
  const input = document.getElementById(`banner-${pageId}`);
  if (input instanceof HTMLInputElement) input.click();
}
function removePageBanner(): void {
  if (!activePage.value) return;
  activePage.value.banner = undefined;
  touchPage(activePage.value);
}
function setPreference<K extends keyof WorkspacePreferences>(key: K, value: WorkspacePreferences[K]): void {
  preferences.value = { ...preferences.value, [key]: value };
}
function resetPreferences(): void {
  preferences.value = { ...defaultPreferences };
  notify('Apariencia restablecida', 'Se aplicaron los ajustes equilibrados.');
}
async function importWorkspaceTransfer(transfer: PreparedWorkspaceTransfer): Promise<void> {
  const rawPages = transfer.snapshot.pages;
  const rawTasks = transfer.snapshot.todayTasks;
  const rawPreferences = transfer.snapshot.preferences as Partial<WorkspacePreferences> | undefined;
  if (!Array.isArray(rawPages) || !rawPages.every((page) => page && typeof page === 'object'
    && typeof page.id === 'string' && typeof page.title === 'string' && Array.isArray(page.entries))) {
    notify('No se importó la transferencia', 'El archivo no contiene páginas válidas.', 'destructive');
    return;
  }
  if (!Array.isArray(rawTasks) || !rawPreferences
    || !['soft', 'balanced', 'deep'].includes(rawPreferences.glass || '')
    || !['compact', 'standard', 'wide'].includes(rawPreferences.width || '')
    || !['comfortable', 'compact'].includes(rawPreferences.density || '')) {
    notify('No se importó la transferencia', 'El archivo no contiene preferencias y tareas válidas.', 'destructive');
    return;
  }
  try {
    for (const asset of transfer.assets) await saveBlockImage(asset.blob, asset.id);
    pages.value = normalizePages(rawPages);
    todayTasks.value = normalizeTodayTasks(rawTasks);
    preferences.value = normalizePreferences(rawPreferences);
    databaseViewStates.value = normalizeDatabaseViewStates(transfer.snapshot.databaseViewStates);
    selectedId.value = 'home';
    await nextTick();
    if (isDesktopRuntime()) {
      await saveSnapshot(JSON.stringify(workspaceSnapshot.value));
    } else {
      persist();
    }
    void hydratePageBanners();
    void pruneUnusedBlockImages();
    notify('Transferencia importada', `${pages.value.length} páginas y ${transfer.assets.length} imágenes quedaron en este dispositivo.`);
  } catch (error) {
    notify('No se importó la transferencia', error instanceof Error ? error.message : 'No se pudieron guardar los datos.', 'destructive');
  }
}
function onCommandSelect(item: { id: string }): void {
  if (item.id.startsWith('page:')) { setActive(item.id.slice(5)); commandOpen.value = false; return; }
  if (item.id.startsWith('new:')) {
    const type = item.id.slice(4) as PageType;
    commandOpen.value = false;
    openCreatePage(type);
  }
}
function todayTaskChanged(): void { queueSave(); }
function removeToast(item: ToastItem): void { toasts.value = toasts.value.filter((toast) => toast.id !== item.id); }
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); openCreatePage(); }
  if (event.key === 'Escape') {
    mobileSidebarOpen.value = false;
    sidebarCollapsed.value = true;
    preferencesOpen.value = false;
    if (commandOpen.value) commandOpen.value = false;
  }
}
watch(preferences, (value) => {
  if (isDesktopRuntime()) { void value; queueSave(); return; }
  try { localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(value)); }
  catch { notify('No se guardaron los ajustes', 'El navegador no permitió guardar las preferencias.', 'warning'); }
}, { deep: true });
watch(databaseViewStates, (value) => {
  void value;
  queueDatabaseViewSave();
}, { deep: true });
watch(() => pages.value.map((page) => `${page.id}:${page.banner || ''}`).join('|'), () => { void hydratePageBanners(); });
onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('popstate', syncPageFromHistory);
  window.addEventListener('pagehide', flushPendingChanges);
  if (isDesktopRuntime()) {
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (desktopCloseInProgress) return;
      event.preventDefault();
      desktopCloseInProgress = true;
      flushPendingChanges();
      try {
        await waitForPendingSaves();
        await getCurrentWindow().destroy();
      } catch {
        desktopCloseInProgress = false;
        notify('No se pudo cerrar KNote', 'El último cambio no quedó guardado. Revisa el archivo local y vuelve a intentarlo.', 'destructive');
      }
    }).then((unlisten) => { removeDesktopCloseListener = unlisten; });
  }
  clockTimer = window.setInterval(() => { currentTime.value = Date.now(); }, 60_000);
  const vaultError = getDesktopVaultError();
  if (vaultError) notify('No se pudo abrir el archivo local', vaultError, 'destructive');
  persist();
  void migrateLegacyBanners().then(hydratePageBanners);
  void hydratePageBanners();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('popstate', syncPageFromHistory);
  window.removeEventListener('pagehide', flushPendingChanges);
  removeDesktopCloseListener?.();
  flushPendingChanges();
  if (clockTimer !== undefined) window.clearInterval(clockTimer);
  if (sidebarCloseTimer !== undefined) window.clearTimeout(sidebarCloseTimer);
  dispose();
});
</script>

<template>
  <div class="knote-shell" :data-density="preferences.density" :style="appPreferencesStyle">
    <button
      class="knote-edge-trigger"
      type="button"
      aria-label="Mostrar navegación"
      aria-controls="knote-navigation"
      :aria-expanded="!sidebarCollapsed"
      @pointerenter="revealSidebar"
      @focus="revealSidebar"
      @blur="handleSidebarFocusOut"
      @click="revealSidebar"
    />
    <Sidebar
      id="knote-navigation"
      v-model="selectedId"
      v-model:collapsed="sidebarCollapsed"
      v-model:mobile-open="mobileSidebarOpen"
      class="knote-sidebar"
      label="Navegación de KNote"
      :groups="sidebarGroups"
      variant="glass"
      collapsible="none"
      width="16.75rem"
      rail-width="4.25rem"
      mobile-breakpoint-label="Abrir navegación"
      shortcut="b"
      @pointerenter="revealSidebar"
      @pointerleave="handleSidebarPointerLeave"
      @focusin="revealSidebar"
      @focusout="handleSidebarFocusOut"
      @select="onSidebarSelect"
    >
      <template #header>
        <div class="knote-sidebar-header">
          <div class="knote-side-shortcuts">
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="House" @click="goHome">Inicio</Button>
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="MessageCircle" aria-label="Reuniones" title="Abrir reuniones" @click="setActive('folder-reuniones')" />
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="NotebookPen" aria-label="Notas" title="Notas" @click="openCreatePage('doc')" />
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="Search" aria-label="Buscar" title="Buscar" @click="commandOpen = true" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="knote-workspace-heading knote-workspace-heading--footer">
          <span class="knote-workspace-mark">K</span>
          <span><strong>Mi espacio</strong><small>Personal</small></span>
          <Button variant="soft" color="neutral" size="sm" :prefix-icon="Plus" aria-label="Crear una página" title="Crear una página" @click="openCreatePage()" />
          <Button variant="glass" color="neutral" size="sm" :prefix-icon="Settings2" aria-label="Personalizar espacio" title="Personalizar espacio" @click="preferencesOpen = true" />
        </div>
      </template>
    </Sidebar>

    <div class="knote-main" :class="{ 'knote-main--inspector': entryInspectorOpen && Boolean(detailEntry && detailPage) }">
      <header class="knote-topbar">
        <div class="knote-topbar-left">
          <Button class="knote-mobile-nav" variant="glass" color="neutral" size="sm" :prefix-icon="Menu" aria-label="Abrir navegación" @click="mobileSidebarOpen = true" />
          <Breadcrumb :items="breadcrumbItems" separator="slash" size="sm" aria-label="Ubicación actual" @navigate="goBreadcrumb" />
        </div>
        <div class="knote-topbar-actions">
          <div v-if="activePage?.type === 'code'" id="knote-code-actions-target" class="knote-code-actions-target" />
          <template v-else>
            <Button v-if="activePage" variant="soft" color="neutral" size="sm" :prefix-icon="Link2" aria-label="Copiar enlace local" title="Copia un enlace local. Los datos no se sincronizan entre dispositivos." class="knote-topbar-copy-link" @click="copyCurrentLink">Copiar enlace local</Button>
            <Button v-if="activePage" variant="soft" color="neutral" size="sm" :prefix-icon="Star" :aria-label="activePage.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'" :title="activePage.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'" :class="{ 'knote-is-favorite': activePage.favorite }" @click="toggleFavorite(activePage)" />
            <DropdownMenu v-if="activePage" id="page-actions" label="Más acciones de página" align="end" variant="surface" :items="pageMenuItems" @select="onPageMenu">
              <template #trigger><Icon :icon="MoreHorizontal" size="sm" /></template>
            </DropdownMenu>
          </template>
        </div>
      </header>

      <main :class="['knote-canvas', { 'knote-canvas--home': !activePage, 'knote-canvas--board': activePage?.type === 'board' || activePage?.type === 'database', 'knote-canvas--calendar': activePage?.type === 'calendar', 'knote-canvas--document': activePage?.type === 'doc' || activePage?.type === 'folder', 'knote-canvas--code': activePage?.type === 'code' }]">
        <HomeDashboard
          v-if="!activePage"
          v-model:quick-capture="quickCapture"
          :date-label="dateLabel"
          :greeting="greeting"
          :home-tasks-remaining="homeTasksRemaining"
          :page-count="pageCount"
          :favorite-count="favoriteCount"
          :today-done-count="todayDoneCount"
          :today-tasks="todayTasks"
          :recent-pages="recentPages"
          :focus-project="focusProject"
          :project-completion="projectCompletion"
          :page-icon="pageIcon"
          :page-icon-style="pageIconStyle"
          :page-type-label="pageTypeLabel"
          :format-relative="formatRelative"
          @create-page="openCreatePage"
          @select-page="setActive"
          @capture-quick-note="captureQuickNote"
          @today-task-changed="todayTaskChanged"
        />

        <template v-else-if="activePage.type === 'folder'">
          <div v-if="activePage.banner" class="knote-page-banner" :style="pageBannerStyle(activePage)">
            <div class="knote-page-banner-actions">
              <Attachment :id="'banner-' + activePage.id" v-model="bannerFiles" class="knote-banner-file-picker" label="Cambiar portada" accept="image/*" :max-size="10485760" size="sm" rounded="lg" hint="Se reduce para guardarse localmente." @update:model-value="setPageBanner" />
              <Button variant="glass" color="neutral" size="sm" :prefix-icon="Paperclip" class="knote-banner-change" @click="openPageBannerPicker(activePage.id)">Cambiar portada</Button>
              <Button variant="glass" color="neutral" size="sm" :prefix-icon="Trash2" class="knote-banner-remove" @click="removePageBanner">Quitar portada</Button>
            </div>
          </div>
          <div v-else class="knote-page-banner-empty">
            <Attachment :id="'banner-' + activePage.id" v-model="bannerFiles" label="Añadir portada" accept="image/*" :max-size="10485760" size="sm" rounded="lg" hint="Opcional · se reduce para guardarse localmente." @update:model-value="setPageBanner" />
          </div>
          <header class="knote-page-heading">
            <div class="knote-page-glyph knote-page-glyph-controls">
              <PageIconPicker :id="'page-icon-' + activePage.id" :label="'Personalizar icono de ' + activePage.title" :icon="pageIcon(activePage)" :icon-id="activePage.icon" :options="pageIconOptions" :color="activePage.iconColor" @update:icon-id="setPageIcon" @update:color="setPageIconColor" />
            </div>
            <Badge variant="outline" color="secondary" size="sm">CARPETA</Badge>
            <h1>{{ activePage.title || 'Sin título' }}</h1>
            <p>{{ pageChildren(activePage.id).length }} páginas dentro de esta rama</p>
          </header>
          <section class="knote-section knote-folder-contents">
            <div class="knote-section-heading knote-section-heading--compact"><div><span class="knote-overline">EN ESTA CARPETA</span><h2>Páginas</h2></div><Button variant="soft" color="neutral" size="sm" :prefix-icon="Plus" @click="openCreatePage('doc', activePage.id)">Añadir</Button></div>
            <ul class="knote-folder-list">
              <li v-for="child in pageChildren(activePage.id)" :key="child.id">
                <span class="knote-list-icon" :style="pageIconStyle(child)"><Icon :icon="pageIcon(child)" size="sm" /></span>
                <Link :href="'#' + child.id" variant="text" size="md" @click.prevent="setActive(child.id)">{{ child.title || 'Sin título' }}</Link>
                <Badge variant="outline" color="secondary" size="sm">{{ pageTypeLabel(child.type) }}</Badge>
                <span class="knote-recent-time">{{ formatRelative(child.updatedAt) }}</span>
              </li>
              <li v-if="!pageChildren(activePage.id).length" class="knote-empty-row">Todavía no hay páginas en esta carpeta.</li>
            </ul>
          </section>
          <BlockEditor :key="activePage.id + '-folder-content'" v-model="activePage.content" :page-id="activePage.id" placeholder="Añade una nota sobre esta carpeta…" class="knote-folder-description" @update:model-value="touchPage(activePage)" />
        </template>

        <template v-else-if="activePage.type === 'code'">
          <header class="knote-page-heading knote-document-heading knote-code-page-heading">
            <div class="knote-page-glyph knote-page-glyph-controls">
              <PageIconPicker :id="'page-icon-' + activePage.id" :label="'Personalizar icono de ' + activePage.title" :icon="pageIcon(activePage)" :icon-id="activePage.icon" :options="pageIconOptions" :color="activePage.iconColor" @update:icon-id="setPageIcon" @update:color="setPageIconColor" />
            </div>
            <Badge variant="outline" color="secondary" size="sm">PYTHON</Badge>
            <Input :id="'title-' + activePage.id" v-model="activePage.title" label="Título de la página" placeholder="Python" size="lg" variant="surface" class="knote-title-field" @update:model-value="touchPage(activePage)" />
          </header>
          <CodeWorkspace :key="activePage.id + '-python-editor'" v-model="activePage.content" :page-id="activePage.id" :page-title="activePage.title" @update:model-value="touchPage(activePage)" />
        </template>

        <template v-else>
          <div v-if="activePage.banner" class="knote-page-banner" :style="pageBannerStyle(activePage)">
            <div class="knote-page-banner-actions">
              <Attachment :id="'banner-' + activePage.id" v-model="bannerFiles" class="knote-banner-file-picker" label="Cambiar portada" accept="image/*" :max-size="10485760" size="sm" rounded="lg" hint="Se reduce para guardarse localmente." @update:model-value="setPageBanner" />
              <Button variant="glass" color="neutral" size="sm" :prefix-icon="Paperclip" class="knote-banner-change" @click="openPageBannerPicker(activePage.id)">Cambiar portada</Button>
              <Button variant="glass" color="neutral" size="sm" :prefix-icon="Trash2" class="knote-banner-remove" @click="removePageBanner">Quitar portada</Button>
            </div>
          </div>
          <div v-else class="knote-page-banner-empty">
            <Attachment :id="'banner-' + activePage.id" v-model="bannerFiles" label="Añadir portada" accept="image/*" :max-size="10485760" size="sm" rounded="lg" hint="Opcional · se reduce para guardarse localmente." @update:model-value="setPageBanner" />
          </div>
          <header class="knote-page-heading knote-document-heading">
            <div class="knote-page-glyph knote-page-glyph-controls">
              <PageIconPicker :id="'page-icon-' + activePage.id" :label="'Personalizar icono de ' + activePage.title" :icon="pageIcon(activePage)" :icon-id="activePage.icon" :options="pageIconOptions" :color="activePage.iconColor" @update:icon-id="setPageIcon" @update:color="setPageIconColor" />
            </div>
            <Badge variant="outline" color="secondary" size="sm">{{ pageTypeLabel(activePage.type).toUpperCase() }}</Badge>
            <Input :id="'title-' + activePage.id" v-model="activePage.title" label="Título de la página" placeholder="Sin título" size="lg" variant="surface" class="knote-title-field" @update:model-value="touchPage(activePage)" />
          </header>

          <template v-if="activePage.type === 'doc'">
            <BlockEditor :key="activePage.id + '-document-content'" v-model="activePage.content" :page-id="activePage.id" placeholder="Empieza a escribir…" class="knote-document-editor" @update:model-value="touchPage(activePage)" />
          </template>
          <template v-else>
            <BlockEditor :key="activePage.id + '-page-content'" v-model="activePage.content" :page-id="activePage.id" :placeholder="activePage.type === 'calendar' ? 'Fechas y eventos de tu espacio…' : 'Organiza aquí el trabajo y las ideas del proyecto…'" class="knote-page-summary-editor" @update:model-value="touchPage(activePage)" />

            <template v-if="activePage.type === 'tasks'">
              <section class="knote-section knote-task-page">
                <div class="knote-section-heading knote-section-heading--compact"><div><span class="knote-overline">PROGRESO</span><h2>Pasos de la lista</h2></div><div class="knote-section-actions"><Badge variant="outline" color="secondary" size="sm">{{ activePage.entries.filter((entry) => entry.done).length }} / {{ activePage.entries.length }}</Badge><Button variant="glass" color="neutral" size="sm" :prefix-icon="Plus" @click="openEntryModal()">Añadir paso</Button></div></div>
                <Progress label="Progreso de la lista" :value="activePage.entries.length ? Math.round(activePage.entries.filter((entry) => entry.done).length / activePage.entries.length * 100) : 0" :show-value="false" color="info" size="sm" />
                <ul class="knote-today-list knote-page-task-list">
                  <li v-for="entry in activePage.entries" :key="entry.id">
                    <Icon :icon="entryIcon(entry)" size="sm" class="knote-task-list-icon" :style="entryIconStyle(entry)" aria-hidden="true" />
                    <Checkbox :id="'entry-' + entry.id" :model-value="Boolean(entry.done)" :label="entry.title" size="sm" variant="surface" @update:model-value="(done) => entryDoneChanged(activePage, entry, done)" />
                    <Badge v-if="entry.tag" variant="outline" color="secondary" size="sm">{{ entry.tag }}</Badge>
                    <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="ArrowUpRight" :aria-label="'Editar ' + entry.title" :title="'Editar ' + entry.title" @click="openEntryDetails(activePage, entry)" />
                  </li>
                  <li v-if="!activePage.entries.length" class="knote-empty-row">Esta lista está vacía. Añade un paso para empezar.</li>
                </ul>
              </section>
            </template>

            <template v-else-if="activePage.type === 'calendar'">
              <div class="knote-calendar-view">
                <Calendar :id="'calendar-' + activePage.id" v-model="selectedDate" label="Calendario de la página" mode="single" locale="es-ES" :week-starts-on="1" :months="1" class="knote-calendar" />
                <section class="knote-calendar-agenda">
                  <div class="knote-agenda-heading"><div><span class="knote-overline">AGENDA</span><h2>{{ selectedDateLabel }}</h2></div><Button variant="glass" color="neutral" size="sm" :prefix-icon="Plus" @click="openEntryModal()">Añadir evento</Button></div>
                  <ul class="knote-agenda-list">
                    <li v-for="entry in entriesForSelectedDate(activePage)" :key="entry.id" tabindex="0" role="button" :aria-label="'Abrir ' + entry.title" @click="openEntryDetails(activePage, entry)" @keydown.enter.prevent="openEntryDetails(activePage, entry)" @keydown.space.prevent="openEntryDetails(activePage, entry)"><span class="knote-agenda-dot" /><div><strong>{{ entry.title }}</strong><small>{{ entryDateLabel(entry) }}<span v-if="entryTags(entry).length"> · {{ entryTagsLabel(entry) }}</span></small></div></li>
                    <li v-if="!entriesForSelectedDate(activePage).length" class="knote-empty-row">No hay elementos para esta fecha.</li>
                  </ul>
                </section>
              </div>
            </template>

            <DatabaseWorkspace v-else-if="activePage.type === 'board' || activePage.type === 'database'"
              v-model:active-view="activeView"
              v-model:database-query="databaseQuery"
              v-model:database-status-filter="databaseStatusFilter"
              v-model:collapsed-table-entries="collapsedTableEntries"
              v-model:table-subtask-composer-id="tableSubtaskComposerId"
              v-model:table-subtask-draft="tableSubtaskDraft"
              v-model:new-table-entry-title="newTableEntryTitle"
              v-model:editing-tags-entry-id="editingTagsEntryId"
              v-model:database-tags-draft="databaseTagsDraft"
              :active-page="activePage"
              :visible-board-statuses="visibleBoardStatuses"
              :board-view-tabs="boardViewTabs"
              :database-view-tabs="databaseViewTabs"
              :database-status-options="databaseStatusOptions"
              :visible-database-properties="visibleDatabaseProperties"
              :database-entries="databaseEntries"
              :database-entry-count="databaseEntryCount"
              :database-sort-items="databaseSortItems"
              :database-property-items="databasePropertyItems"
              :entry-inspector-open="entryInspectorOpen"
              :detail-page-id="detailPageId"
              :detail-entry-id="detailEntryId"
              :dragged-entry-id="draggedEntryId"
              :drop-target-entry-id="dropTargetEntryId"
              :entries-for-status="entriesForStatus"
              :entry-icon="entryIcon"
              :entry-icon-style="entryIconStyle"
              :entry-subtasks="entrySubtasks"
              :entry-description="entryDescription"
              :entry-date-label="entryDateLabel"
              :entry-calendar-date="entryCalendarDate"
              :entry-tags="entryTags"
              :entry-tags-label="entryTagsLabel"
              :handle-board-drag-start="handleBoardDragStart"
              :handle-board-drag-over="handleBoardDragOver"
              :drop-board-entry="dropBoardEntry"
              :handle-board-drag-end="handleBoardDragEnd"
              :open-entry-details="openEntryDetails"
              :open-entry-modal="openEntryModal"
              :set-entry-status="setEntryStatus"
              :set-entry-priority="setEntryPriority"
              :update-entry-due-from-picker="updateEntryDueFromPicker"
              :update-entry-tags-draft="updateEntryTagsDraft"
              :finish-entry-tags-edit="finishEntryTagsEdit"
              :cancel-entry-tags-edit="cancelEntryTagsEdit"
              :begin-entry-tags-edit="beginEntryTagsEdit"
              :update-table-subtask="updateTableSubtask"
              :toggle-table-entry="toggleTableEntry"
              :open-table-subtask-composer="openTableSubtaskComposer"
              :add-table-subtask="addTableSubtask"
              :add-table-entry="addTableEntry"
              :open-entry-description="openEntryDescription"
              :handle-database-sort="handleDatabaseSort"
              :handle-database-property="handleDatabaseProperty"
              :focus-new-table-entry="focusNewTableEntry"
            />
          </template>
        </template>
      </main>

      <aside v-if="entryInspectorOpen && detailEntry && detailPage" class="knote-entry-inspector" :aria-label="'Editar ' + detailEntry.title">
        <Card variant="surface" padding="none" class="knote-entry-inspector-card" role="region" aria-labelledby="entry-inspector-heading">
          <header class="knote-entry-inspector-header">
            <div><span class="knote-overline">DETALLE DE TAREA</span><small>{{ detailPage.title }}</small></div>
            <div class="knote-entry-inspector-header-actions">
              <DropdownMenu id="entry-detail-actions" label="Acciones de la tarea" side="bottom" align="end" variant="surface" color="neutral" rounded="lg" class="knote-task-detail-menu" :items="detailEntryMenuItems" @select="onDetailEntryMenu">
                <template #trigger><Icon :icon="MoreHorizontal" size="sm" /><span class="sr-only">Acciones de la tarea</span></template>
              </DropdownMenu>
              <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="X" aria-label="Cerrar panel de tarea" title="Cerrar panel" @click="entryInspectorOpen = false" />
            </div>
          </header>
          <div ref="entryInspectorScroll" class="knote-entry-inspector-scroll">
            <div class="knote-entry-detail-title-row">
              <PageIconPicker :id="'entry-icon-' + detailEntry.id" :label="'Personalizar icono de ' + detailEntry.title" :icon="entryIcon(detailEntry)" :icon-id="detailEntry.icon" :options="pageIconOptions" :color="detailEntry.iconColor" subject="tarea" class="knote-entry-icon-picker" @update:icon-id="setDetailEntryIcon" @update:color="setDetailEntryIconColor" />
              <Input id="entry-detail-title" :model-value="detailEntry.title" label="Título de la tarea" placeholder="Sin título" size="lg" variant="surface" class="knote-entry-inspector-title" @update:model-value="updateDetailTitle" />
            </div>

            <section class="knote-inspector-section">
              <div class="knote-inspector-section-heading knote-detail-properties-heading"><h2 id="entry-inspector-heading">Propiedades de {{ detailEntry.title }}</h2></div>
              <div class="knote-entry-detail-properties">
                <div v-if="detailPage.type !== 'calendar' && detailPage.type !== 'tasks'" class="knote-detail-property-row">
                  <Icon :icon="CircleDot" size="sm" class="knote-detail-property-icon" aria-hidden="true" />
                  <Select id="entry-detail-status" :model-value="detailEntry.status" label="Estado" :options="statusOptions" size="sm" variant="surface" @update:model-value="setDetailStatus" />
                </div>
                <div class="knote-detail-property-row">
                  <Icon :icon="Flag" size="sm" class="knote-detail-property-icon" aria-hidden="true" />
                  <Select id="entry-detail-priority" :model-value="detailEntry.priority || 'Sin prioridad'" label="Prioridad" :options="priorityOptions" size="sm" variant="surface" @update:model-value="setDetailPriority" />
                </div>
                <div class="knote-detail-property-row">
                  <Icon :icon="CalendarDays" size="sm" class="knote-detail-property-icon" aria-hidden="true" />
                  <DatePicker v-if="detailDueIsDate(detailEntry)" id="entry-detail-due" :model-value="detailDateValue(detailEntry)" label="Fecha" locale="es-ES" :display-format="{ day: 'numeric', month: 'short', year: 'numeric' }" placeholder="Sin fecha" clear-label="Quitar fecha" @update:model-value="updateDetailDueFromPicker" />
                  <Input v-else id="entry-detail-due-note" :model-value="detailEntry.due" label="Fecha" placeholder="Escribe una fecha o una nota" size="sm" variant="surface" @update:model-value="updateDetailDue" />
                </div>
                <div class="knote-detail-property-row">
                  <Icon :icon="Tag" size="sm" class="knote-detail-property-icon" aria-hidden="true" />
                  <Input id="entry-detail-tags" :model-value="detailTagsDraft" label="Etiquetas" placeholder="Añadir etiquetas…" size="sm" variant="surface" @update:model-value="updateDetailTags" />
                </div>
                <div class="knote-detail-property-row knote-detail-subtasks-row">
                  <Icon :icon="ListTodo" size="sm" class="knote-detail-property-icon" aria-hidden="true" />
                  <span class="knote-detail-property-label" aria-hidden="true">Subtareas</span>
                  <div class="knote-detail-property-value">
                    <div class="knote-subtask-tools">
                      <Badge variant="outline" color="secondary" size="sm">{{ detailSubtaskProgress.done }} / {{ detailSubtaskProgress.total }}</Badge>
                      <Button v-if="detailSubtaskProgress.done" variant="soft" color="neutral" size="sm" :prefix-icon="Trash2" title="Quitar subtareas completadas" @click="clearCompletedSubtasks">Limpiar hechas</Button>
                    </div>
                    <div class="knote-subtask-composer">
                      <Input id="entry-detail-new-subtask" v-model="newSubtaskTitle" label="Escribe una subtarea" placeholder="Añadir una subtarea…" size="sm" variant="surface" @keydown.enter.prevent="addDetailSubtask" />
                      <Button variant="glass" color="neutral" size="sm" :prefix-icon="Plus" aria-label="Añadir subtarea" title="Añadir subtarea" class="knote-subtask-add" @click="addDetailSubtask">Añadir</Button>
                    </div>
                    <ul v-if="entrySubtasks(detailEntry).length" class="knote-detail-subtask-list">
                      <li v-for="(subtask, index) in entrySubtasks(detailEntry)" :key="subtask.id" class="knote-detail-subtask" :class="{ 'knote-detail-subtask--done': subtask.done }">
                        <Checkbox :id="'entry-subtask-check-' + subtask.id" :model-value="subtask.done" :label="'Marcar como hecha: ' + subtask.title" size="sm" variant="surface" class="knote-subtask-toggle" @update:model-value="(done) => setDetailSubtaskDone(subtask.id, done)" />
                        <Input :id="'entry-subtask-title-' + subtask.id" :model-value="subtask.title" :label="'Nombre de subtarea ' + (index + 1)" size="sm" variant="surface" class="knote-subtask-name" @update:model-value="(title) => setDetailSubtaskTitle(subtask.id, String(title))" @keydown.enter.stop.prevent="focusNewSubtask" />
                        <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="Trash2" :aria-label="'Eliminar subtarea ' + subtask.title" title="Eliminar subtarea" class="knote-subtask-remove" @click="removeDetailSubtask(subtask.id)" />
                      </li>
                    </ul>
                    <p v-else class="knote-subtask-empty">Todavía no hay subtareas.</p>
                  </div>
                </div>
              </div>
            </section>

            <section class="knote-inspector-section knote-entry-detail-content">
              <div class="knote-inspector-section-heading"><h2>Descripción</h2></div>
              <BlockEditor ref="taskDescriptionEditor" :key="'detail-' + detailEntry.id" :model-value="detailEntry.content || ''" :page-id="'detail-' + detailEntry.id" placeholder="Escribe una descripción…" class="knote-task-detail-editor" @update:model-value="updateDetailContent" />
            </section>
          </div>
        </Card>
      </aside>

            <DeleteEntryDialog v-model="deleteEntryModalOpen" :entry-title="detailEntry?.title || ''" @delete="deleteDetailEntry" />

            <CreatePageDialog
        v-model="createModalOpen"
        v-model:title="createTitle"
        v-model:page-type="createType"
        :pages="pages"
        :parent-id="createParentId"
        :page-type-label="pageTypeLabel"
        @submit="submitNewPage"
      />

            <WorkspacePreferencesDialog
        v-model="preferencesOpen"
        v-model:active-tab="preferencesTab"
        :preferences="preferences"
        @set-preference="setPreference"
        @set-width="(value) => setPreference('width', value)"
        @set-density="(value) => setPreference('density', value)"
        @reset="resetPreferences"
        @open-transfer="dataTransferOpen = true"
      />

      <WorkspaceTransfer v-model="dataTransferOpen" :snapshot="workspaceSnapshot" @import="importWorkspaceTransfer" />

            <PageEntryDialog
        v-model="entryModalOpen"
        v-model:entry-title="entryTitle"
        v-model:entry-status="entryStatus"
        v-model:entry-due="entryDue"
        v-model:entry-tag="entryTag"
        v-model:entry-priority="entryPriority"
        :active-page="activePage"
        :dialog-title="entryDialogTitle"
        @save="saveEntry"
      />

      <CommandMenu id="knote-command-menu" v-model="commandOpen" v-model:query="commandQuery" label="Buscar en KNote" title="Buscar en tu espacio" description="Encuentra páginas o crea una nueva sin salir del teclado." :groups="commandGroups" mode="dialog" variant="surface" size="md" placeholder="Buscar páginas y acciones…" hotkey="k" @select="onCommandSelect">
        <template #empty><p class="knote-command-empty">No encontramos esa página. Prueba con otro término o crea una nueva.</p></template>
      </CommandMenu>
      <ToastViewport v-model="toasts" position="bottom-end" label="Avisos de KNote" @dismiss="removeToast" />
    </div>
  </div>
</template>
