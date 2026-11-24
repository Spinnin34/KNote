import { BOARD_STATUSES, DATABASE_VIEWS_STORAGE_KEY, DEFAULT_DATABASE_PROPERTIES, PAGE_STORAGE_KEY, PREFERENCES_STORAGE_KEY, TASK_PRIORITIES, TASK_STORAGE_KEY, defaultPreferences } from '@/domain/workspace/constants';
import { pageIconOptions } from '@/domain/workspace/page-icons';
import { samplePages, sampleTodayTasks } from '@/domain/workspace/samples';
import type { BoardStatus, DatabaseField, DatabaseFilter, DatabaseProperty, DatabaseSort, DatabaseViewState, PageEntry, PageSubtask, PageType, TaskPriority, TodayTask, WorkspacePage, WorkspacePreferences } from '@/domain/workspace/types';
import { getInitialWorkspaceValue, isDesktopRuntime } from '@/lib/desktop-vault';
import { makeId } from '@/domain/workspace/ids';
const now = Date.now();
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readStoredValue<T>(desktopKey: 'pages' | 'todayTasks' | 'preferences' | 'databaseViewStates', browserKey: string): T | null {
  if (isDesktopRuntime()) return (getInitialWorkspaceValue(desktopKey) as T | undefined) ?? null;
  try {
    const raw = localStorage.getItem(browserKey);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

export function normalizePreferences(raw: unknown): WorkspacePreferences {
  const parsed = raw as Partial<WorkspacePreferences> | null;
  return {
    glass: ['soft', 'balanced', 'deep'].includes(parsed?.glass || '') ? parsed!.glass! : defaultPreferences.glass,
    width: ['compact', 'standard', 'wide'].includes(parsed?.width || '') ? parsed!.width! : defaultPreferences.width,
    density: ['comfortable', 'compact'].includes(parsed?.density || '') ? parsed!.density! : defaultPreferences.density,
  };
}
export function readPreferences(): WorkspacePreferences {
  return normalizePreferences(readStoredValue<unknown>('preferences', PREFERENCES_STORAGE_KEY));
}
export function entryTags(entry: PageEntry): string[] {
  const tags = entry.tags?.filter((tag) => tag.trim()) ?? [];
  return tags.length ? tags : entry.tag?.trim() ? [entry.tag.trim()] : [];
}
function normalizeEntry(value: unknown, fallbackId?: string): PageEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PageEntry>;
  const id = typeof raw.id === 'string' ? raw.id : fallbackId ?? makeId();
  const rawSubtasks = (value as { subtasks?: unknown }).subtasks;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
    : typeof raw.tag === 'string' && raw.tag.trim() ? [raw.tag.trim()] : [];
  const subtasks = Array.isArray(rawSubtasks) ? rawSubtasks.flatMap((item, index): PageSubtask[] => {
    const child = typeof item === 'string' ? { title: item } : item;
    if (!isRecord(child) || typeof child.title !== 'string') return [];
    const title = child.title.trim();
    if (!title && typeof child.id !== 'string') return [];
    const entry = normalizeEntry({ ...child, title }, `${id}-sub-${index}`);
    return entry ? [{ ...entry, done: Boolean(entry.done) }] : [];
  }).slice(0, 100) : [];
  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : 'Sin título',
    status: BOARD_STATUSES.includes(raw.status as BoardStatus) ? raw.status as BoardStatus : 'Por hacer',
    due: typeof raw.due === 'string' ? raw.due : undefined,
    tag: tags[0],
    tags,
    priority: TASK_PRIORITIES.includes(raw.priority as TaskPriority) ? raw.priority as TaskPriority : undefined,
    content: typeof raw.content === 'string' ? raw.content : '',
    subtasks,
    ...(isRecord(raw.fields) ? { fields: Object.fromEntries(Object.entries(raw.fields).filter(([id, val]) =>
      /^field-[\w-]+$/.test(id) && (typeof val === 'string' || typeof val === 'boolean'))) } : {}),
    done: Boolean(raw.done),
    icon: pageIconOptions.some((option) => option.id === raw.icon) ? raw.icon : undefined,
    iconColor: typeof raw.iconColor === 'string' && /^#[\da-f]{6}$/i.test(raw.iconColor) ? raw.iconColor.toLowerCase() : undefined,
  };
}
function cloneSamplePage(page: WorkspacePage): WorkspacePage {
  return { ...page, entries: page.entries.map((entry) => normalizeEntry(entry)).filter((entry): entry is PageEntry => Boolean(entry)) };
}
export function normalizePages(stored: unknown): WorkspacePage[] {
  if (!Array.isArray(stored)) return samplePages.map(cloneSamplePage);
  const supportedTypes: readonly PageType[] = ['folder', 'doc', 'code', 'board', 'database', 'calendar', 'tasks'];
  const normalized = stored.filter((page: unknown): page is Record<string, unknown> => isRecord(page) && typeof page.title === 'string').map((page) => {
    const type = typeof page.type === 'string' && supportedTypes.includes(page.type as PageType) ? page.type as PageType : 'doc';
    const entries: PageEntry[] = Array.isArray(page.entries)
      ? page.entries.map((entry: unknown) => normalizeEntry(entry)).filter((entry): entry is PageEntry => Boolean(entry))
      : [];
    if (page.id === 'page-reading') {
      const legacyFormats: Record<string, string> = { 'reading-1': 'Libro', 'reading-2': 'Artículo', 'reading-3': 'Ensayo' };
      entries.forEach((entry) => {
        const format = legacyFormats[entry.id];
        if (format && entry.due === format) {
          entry.tags = [...new Set([...entryTags(entry), format])];
          entry.tag = entry.tags[0];
          entry.due = undefined;
        }
      });
    }
    return {
      id: typeof page.id === 'string' ? page.id : makeId(), title: String(page.title), type,
      parentId: typeof page.parentId === 'string' ? page.parentId : null,
      content: typeof page.content === 'string' ? page.content : '', favorite: Boolean(page.favorite),
      icon: pageIconOptions.some((option) => option.id === page.icon) ? page.icon as string : undefined,
      iconColor: typeof page.iconColor === 'string' && /^#[\da-f]{6}$/i.test(page.iconColor) ? page.iconColor.toLowerCase() : undefined,
      banner: typeof page.banner === 'string' && (
        /^data:image\/(?:webp|jpeg|png);base64,[\da-z+/=]+$/i.test(page.banner) && page.banner.length <= 1300000
        || /^knote-asset:[\da-f-]{20,}$/i.test(page.banner)
      ) ? page.banner : undefined,
      createdAt: Number(page.createdAt) || now, updatedAt: Number(page.updatedAt) || now,
      entries,
      ...(Array.isArray(page.tagOptions) ? { tagOptions: [...new Set(page.tagOptions.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())))] } : {}),
      ...(Array.isArray(page.fields) ? { fields: page.fields.filter((field): field is DatabaseField =>
        isRecord(field) && typeof field.id === 'string' && /^field-[\w-]+$/.test(field.id)
        && typeof field.name === 'string' && ['text', 'number', 'checkbox'].includes(String(field.type))) } : {}),
    } as WorkspacePage;
  });
  // Existing storage is authoritative: merging seed pages here resurrected pages
  // users had deleted every time the app loaded.
  return normalized;
}
export function readPages(): WorkspacePage[] {
  return normalizePages(readStoredValue<unknown>('pages', PAGE_STORAGE_KEY));
}
export function normalizeTodayTasks(parsed: unknown): TodayTask[] {
  if (Array.isArray(parsed)) return parsed
    .filter((task): task is TodayTask => Boolean(task && typeof task === 'object'
      && typeof task.id === 'string' && typeof task.title === 'string' && typeof task.group === 'string'))
    .slice(0, 500)
    .map((task) => ({ id: task.id, title: task.title, done: Boolean(task.done), group: task.group }));
  return sampleTodayTasks.map((task) => ({ ...task }));
}
export function readTodayTasks(): TodayTask[] {
  return normalizeTodayTasks(readStoredValue<unknown>('todayTasks', TASK_STORAGE_KEY));
}
export function normalizeDatabaseViewStates(parsed: unknown): Record<string, DatabaseViewState> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const knownProperties = new Set<DatabaseProperty>(DEFAULT_DATABASE_PROPERTIES);
    const knownSorts = new Set<DatabaseSort>(['manual', 'title', 'title-desc', 'due', 'due-desc', 'priority', 'status']);
    return Object.fromEntries(Object.entries(parsed).flatMap(([pageId, raw]) => {
      if (!raw || typeof raw !== 'object') return [];
      const state = raw as Partial<DatabaseViewState>;
      const view = state.view === 'table' ? 'table' : state.view === 'board' ? 'board' : null;
      if (!view) return [];
      const filter = state.filter === 'Todas' || BOARD_STATUSES.includes(state.filter as BoardStatus)
        ? state.filter as DatabaseFilter : 'Todas';
      const properties = Array.isArray(state.properties)
        ? state.properties.filter((property): property is DatabaseProperty => knownProperties.has(property as DatabaseProperty))
        : [...DEFAULT_DATABASE_PROPERTIES];
      return [[pageId, {
        view,
        query: typeof state.query === 'string' ? state.query.slice(0, 240) : '',
        filter,
        sort: knownSorts.has(state.sort as DatabaseSort) ? state.sort as DatabaseSort : 'manual',
        properties: [...new Set(properties)],
        ...(Array.isArray(state.hiddenFields) ? { hiddenFields: state.hiddenFields.filter((id): id is string => typeof id === 'string') } : {}),
        ...(Array.isArray(state.columnOrder) ? { columnOrder: [...new Set(state.columnOrder.filter((id): id is string => typeof id === 'string'))] } : {}),
        ...(isRecord(state.columnWidths) ? { columnWidths: Object.fromEntries(Object.entries(state.columnWidths).filter(
          (item): item is [string, number] => typeof item[1] === 'number' && Number.isFinite(item[1]) && item[1] >= 96 && item[1] <= 700,
        )) } : {}),
        collapsedEntryIds: Array.isArray(state.collapsedEntryIds)
          ? state.collapsedEntryIds.filter((id): id is string => typeof id === 'string').slice(0, 1000)
          : [],
      } satisfies DatabaseViewState]];
    }));
}
export function readDatabaseViewStates(): Record<string, DatabaseViewState> {
  return normalizeDatabaseViewStates(readStoredValue<unknown>('databaseViewStates', DATABASE_VIEWS_STORAGE_KEY));
}
