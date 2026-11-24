import { describe, expect, it } from 'vitest';
import { normalizeDatabaseViewStates, normalizePages, normalizeTodayTasks } from '@/domain/workspace/normalizers';
import { databaseTags, updateDatabaseTag } from '@/domain/workspace/database-tags';
import { taskPath, walkTasks } from '@/domain/workspace/task-tree';
import { samplePages } from '@/domain/workspace/samples';

describe('workspace normalizers', () => {
  it('keeps custom properties, unchecked values and their visibility after a reload', () => {
    const fields = [{ id: 'field-1', name: 'Revisado', type: 'checkbox' }];
    const [page] = normalizePages([{ title: 'Seguimiento', type: 'database', fields, entries: [{ title: 'Ficha', fields: { 'field-1': false } }] }]);
    expect(page.fields).toEqual(fields);
    expect(page.entries[0].fields).toEqual({ 'field-1': false });
    const state = normalizeDatabaseViewStates({ page: { view: 'table', sort: 'title-desc', hiddenFields: ['field-1'], columnOrder: ['field-1', 'title', 'title'], columnWidths: { title: 290, due: 12 } } });
    expect(state.page).toMatchObject({ sort: 'title-desc', hiddenFields: ['field-1'], columnOrder: ['field-1', 'title'], columnWidths: { title: 290 } });
  });

  it('keeps a shared tag catalog and updates legacy assignments when a tag is renamed or removed', () => {
    const [page] = normalizePages([{ title: 'Hoja de ruta', entries: [{ title: 'Tarea', tag: 'Diseño' }] }]);
    updateDatabaseTag(page, '', 'Pruebas');
    updateDatabaseTag(page, 'Diseño', 'Interfaz');
    expect(databaseTags(page)).toEqual(['Interfaz', 'Pruebas']);
    expect(page.entries[0].tags).toEqual(['Interfaz']);
    updateDatabaseTag(page, 'Interfaz', '');
    expect(databaseTags(page)).toEqual(['Pruebas']);
    expect(page.entries[0].tag).toBeUndefined();
  });

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

  it('preserves nested tasks and their documents, properties and completion independently', () => {
    const [page] = normalizePages([{
      id: 'roadmap', title: 'Hoja de ruta', type: 'database', entries: [{ id: 'root', title: 'Entrega', subtasks: [{
        id: 'child', title: 'Diseño', done: true, status: 'En curso', content: 'Plan y referencias', due: '2026-11-27',
        subtasks: [{ id: 'grandchild', title: 'Revisión', status: 'Hecho', tags: ['Interfaz'], priority: 'Alta', fields: { 'field-review': true } }],
      }] }],
    }]);
    expect(taskPath(page.entries, 'grandchild').map((entry) => entry.id)).toEqual(['root', 'child', 'grandchild']);
    const [, child, grandchild] = Array.from(walkTasks(page.entries));
    expect(child).toMatchObject({ done: true, status: 'En curso', content: 'Plan y referencias', due: '2026-11-27' });
    expect(grandchild).toMatchObject({ done: false, status: 'Hecho', tags: ['Interfaz'], priority: 'Alta', fields: { 'field-review': true } });
    updateDatabaseTag(page, 'Interfaz', 'Diseño');
    const [reloaded] = normalizePages(JSON.parse(JSON.stringify([page])));
    expect(taskPath(reloaded.entries, 'grandchild').at(-1)?.tags).toEqual(['Diseño']);
    child.title = '';
    expect(normalizePages([page])[0].entries[0].subtasks?.[0].content).toBe('Plan y referencias');
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
