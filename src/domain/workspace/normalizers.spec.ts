import { describe, expect, it } from 'vitest';
import { normalizeDatabaseViewStates, normalizePages, normalizeTodayTasks } from '@/domain/workspace/normalizers';
import { samplePages } from '@/domain/workspace/samples';

describe('workspace normalizers', () => {
  it('provides editable copies of sample data only when storage is absent', () => {
    const pages = normalizePages(null);

    expect(pages).toHaveLength(samplePages.length);
    expect(pages[0]).not.toBe(samplePages[0]);
    expect(normalizePages([])).toEqual([]);
  });

  it('normalizes malformed records and keeps valid user content', () => {
    const pages = normalizePages([
      null,
      {
        id: 'saved-page',
        title: 'Mis notas',
        type: 'unknown',
        parentId: 12,
        entries: [
          null,
          {
            id: 'saved-entry',
            title: 42,
            status: 'unknown',
            tags: [7, '  idea  '],
            subtasks: ['  paso  ', { title: ' siguiente ', done: true }, {}],
          },
        ],
      },
    ]);

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ id: 'saved-page', title: 'Mis notas', type: 'doc', parentId: null });
    expect(pages[0]?.entries).toHaveLength(1);
    expect(pages[0]?.entries[0]).toMatchObject({
      id: 'saved-entry',
      title: 'Sin título',
      status: 'Por hacer',
      tags: ['idea'],
      subtasks: [
        { id: 'saved-entry-sub-0', title: 'paso', done: false },
        { id: 'saved-entry-sub-1', title: 'siguiente', done: true },
      ],
    });
  });

  it('filters invalid daily tasks and constrains saved view state', () => {
    expect(normalizeTodayTasks([null, { id: 'one', title: 'Válida', group: 'Hoy', done: 1 }, { id: 5 }]))
      .toEqual([{ id: 'one', title: 'Válida', group: 'Hoy', done: true }]);

    expect(normalizeDatabaseViewStates({
      board: { view: 'other', properties: ['status'] },
      table: { view: 'table', query: 'x'.repeat(300), sort: 'invalid', properties: ['status', 'nope'], collapsedEntryIds: ['entry'] },
    })).toEqual({
      table: {
        view: 'table',
        query: 'x'.repeat(240),
        filter: 'Todas',
        sort: 'manual',
        properties: ['status'],
        collapsedEntryIds: ['entry'],
      },
    });
  });
});
