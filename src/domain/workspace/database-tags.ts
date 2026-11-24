import type { WorkspacePage } from './types';
import { entryTags } from './normalizers';

export function databaseTags(page: WorkspacePage): string[] {
  return [...new Set([...(page.tagOptions || []), ...page.entries.flatMap(entryTags)])]
    .sort((left, right) => left.localeCompare(right, 'es'));
}

export function updateDatabaseTag(page: WorkspacePage, former: string, next: string): void {
  page.tagOptions = databaseTags(page).map((tag) => tag === former ? next : tag).filter(Boolean);
  if (!former) { page.tagOptions.push(next); return; }
  for (const entry of page.entries) {
    const tags = entryTags(entry);
    if (!tags.includes(former)) continue;
    entry.tags = tags.map((tag) => tag === former ? next : tag).filter(Boolean);
    entry.tag = entry.tags[0];
  }
}

export function databaseTagSelection(value: string | readonly string[] | undefined): string[] {
  return typeof value === 'string' ? [value] : [...(value || [])].slice(0, 12);
}
