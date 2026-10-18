import { BOARD_STATUSES, DATABASE_VIEWS_STORAGE_KEY, DEFAULT_DATABASE_PROPERTIES, PAGE_STORAGE_KEY, PREFERENCES_STORAGE_KEY, TASK_PRIORITIES, TASK_STORAGE_KEY, defaultPreferences } from '@/domain/workspace/constants';
import { pageIconOptions } from '@/domain/workspace/page-icons';
import { samplePages, sampleTodayTasks } from '@/domain/workspace/samples';
import type { BoardStatus, DatabaseFilter, DatabaseProperty, DatabaseSort, DatabaseViewState, PageEntry, PageSubtask, PageType, TodayTask, WorkspacePage, WorkspacePreferences } from '@/domain/workspace/types';
import { getInitialWorkspaceValue, isDesktopRuntime } from '@/lib/desktop-vault';
import { makeId } from '@/domain/workspace/ids';
const now = Date.now();
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
function normalizeEntry(value: unknown): PageEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PageEntry>;
  const id = typeof raw.id === 'string' ? raw.id : makeId();
  const rawSubtasks = (value as { subtasks?: unknown }).subtasks;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
    : typeof raw.tag === 'string' && raw.tag.trim() ? [raw.tag.trim()] : [];
  const subtasks = Array.isArray(rawSubtasks) ? rawSubtasks.flatMap((item, index): PageSubtask[] => {
    if (typeof item === 'string') {
      const title = item.trim();
      return title ? [{ id: `${id}-sub-${index}`, title, done: false }] : [];
    }
    if (!item || typeof item !== 'object') return [];
    const subtask = item as Partial<PageSubtask>;
    const title = typeof subtask.title === 'string' ? subtask.title.trim() : '';
    return title ? [{ id: typeof subtask.id === 'string' ? subtask.id : `${id}-sub-${index}`, title, done: Boolean(subtask.done) }] : [];
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
    done: Boolean(raw.done),
    icon: pageIconOptions.some((option) => option.id === raw.icon) ? raw.icon : undefined,
    iconColor: typeof raw.iconColor === 'string' && /^#[\da-f]{6}$/i.test(raw.iconColor) ? raw.iconColor.toLowerCase() : undefined,
  };
}
function cloneSamplePage(page: WorkspacePage): WorkspacePage {
  return { ...page, entries: page.entries.map(normalizeEntry).filter((entry): entry is PageEntry => Boolean(entry)) };
}
export function normalizePages(stored: unknown): WorkspacePage[] {
  if (!Array.isArray(stored)) return samplePages.map(cloneSamplePage);
  const normalized = stored.filter((page) => page && typeof page.title === 'string').map((page) => {
    const type: PageType = ['folder', 'doc', 'code', 'board', 'database', 'calendar', 'tasks'].includes(page.type) ? page.type : 'doc';
    const entries = Array.isArray(page.entries) ? page.entries.map(normalizeEntry).filter((entry): entry is PageEntry => Boolean(entry)) : [];
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
      id: typeof page.id === 'string' ? page.id : makeId(), title: page.title, type,
      parentId: typeof page.parentId === 'string' ? page.parentId : null,
      content: typeof page.content === 'string' ? page.content : '', favorite: Boolean(page.favorite),
      icon: pageIconOptions.some((option) => option.id === page.icon) ? page.icon : undefined,
      iconColor: typeof page.iconColor === 'string' && /^#[\da-f]{6}$/i.test(page.iconColor) ? page.iconColor.toLowerCase() : undefined,
      banner: typeof page.banner === 'string' && (
        /^data:image\/(?:webp|jpeg|png);base64,[\da-z+/=]+$/i.test(page.banner) && page.banner.length <= 1300000
        || /^knote-asset:[\da-f-]{20,}$/i.test(page.banner)
      ) ? page.banner : undefined,
      createdAt: Number(page.createdAt) || now, updatedAt: Number(page.updatedAt) || now,
      entries,
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
    const knownSorts = new Set<DatabaseSort>(['manual', 'title', 'due', 'priority']);
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
        collapsedEntryIds: Array.isArray(state.collapsedEntryIds)
          ? state.collapsedEntryIds.filter((id): id is string => typeof id === 'string').slice(0, 1000)
          : [],
      } satisfies DatabaseViewState]];
    }));
}
export function readDatabaseViewStates(): Record<string, DatabaseViewState> {
  return normalizeDatabaseViewStates(readStoredValue<unknown>('databaseViewStates', DATABASE_VIEWS_STORAGE_KEY));
}
