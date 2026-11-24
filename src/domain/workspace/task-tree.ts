import type { PageEntry } from './types';

export function* walkTasks(entries: readonly PageEntry[] = []): Generator<PageEntry> {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    yield entry;
    if (entry.subtasks?.length) yield* walkTasks(entry.subtasks);
  }
}

export function taskPath(entries: readonly PageEntry[], id: string): PageEntry[] {
  for (const entry of entries) {
    if (entry.id === id) return [entry];
    if (entry.subtasks?.length) {
      const path = taskPath(entry.subtasks, id);
      if (path.length) return [entry, ...path];
    }
  }
  return [];
}
