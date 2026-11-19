import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { expect, it, vi } from 'vitest';
import { defaultPreferences } from '@/domain/workspace/constants';
import type { WorkspacePage } from '@/domain/workspace/types';
import type { CloudLocalState, CloudSnapshot } from '@/lib/cloud-cache';
import { CloudRequestError, type CloudConflict, type CloudWorkspaceResponse } from '@/lib/cloud-workspace-api';
import { useCloudWorkspace } from './useCloudWorkspace';

const cloud = vi.hoisted(() => ({
  fetch: vi.fn(),
  putPage: vi.fn(),
  resolveConflict: vi.fn(),
  saveLocal: vi.fn<(value: CloudLocalState) => Promise<void>>(),
}));

vi.mock('@/lib/cloud-cache', () => ({
  readCloudLocalState: async () => null,
  writeCloudLocalState: cloud.saveLocal,
}));
vi.mock('@/lib/cloud-workspace-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/cloud-workspace-api')>(),
  fetchCloudWorkspace: cloud.fetch,
  putCloudPage: cloud.putPage,
  resolveCloudConflict: cloud.resolveConflict,
}));

function pageFixture(id = 'doc', content = 'A'): WorkspacePage {
  return {
    id, title: 'Notas', type: 'doc', parentId: null, content,
    favorite: false, createdAt: 1, updatedAt: 1, entries: [],
  };
}

function openWorkspace(initial = [pageFixture()], conflicts: CloudConflict[] = []) {
  const snapshot: CloudSnapshot = { pages: initial, todayTasks: [], preferences: defaultPreferences, databaseViewStates: {} };
  const pages = ref(initial.map((page) => ({ ...page })));
  const preferences = ref({ ...defaultPreferences });
  let lastLocal: CloudLocalState | undefined;
  cloud.putPage.mockReset();
  cloud.resolveConflict.mockReset();
  cloud.saveLocal.mockImplementation(async (value) => { lastLocal = structuredClone(value); });
  cloud.fetch.mockResolvedValue({
    snapshot, revisions: Object.fromEntries(initial.map((page) => [page.id, 1])), stateRevision: 0, conflicts,
  });
  const holder: { workspace?: ReturnType<typeof useCloudWorkspace> } = {};
  const app = mount(defineComponent({
    setup() {
      holder.workspace = useCloudWorkspace({
        pages, todayTasks: ref([]), preferences, databaseViewStates: ref({}),
        applySnapshot: (value) => {
          pages.value = value.pages as WorkspacePage[];
          preferences.value = value.preferences as typeof defaultPreferences;
        },
        notify: vi.fn(),
      });
      return () => null;
    },
  }));
  return { app, workspace: holder.workspace!, pages, preferences, snapshot, cachedState: () => lastLocal };
}

it('keeps the most recent local document pending while an older save finishes', async () => {
  const { app, workspace, pages, snapshot, cachedState } = openWorkspace();
  let finishPut!: (value: { revision: number }) => void;
  cloud.putPage.mockImplementationOnce(() => new Promise((resolve) => { finishPut = resolve; }));
  try {
    await workspace.connect('account', snapshot, false);
    pages.value[0].content = 'B';
    const saving = workspace.flush();
    await vi.waitFor(() => expect(cloud.putPage).toHaveBeenCalledOnce());
    pages.value[0].content = 'C';
    finishPut({ revision: 2 });

    await expect(saving).resolves.toBe('pending');
    expect(cachedState()?.pending).toBe(true);
    expect(cachedState()?.snapshot.pages[0]).toMatchObject({ content: 'C' });
    expect(cachedState()?.baseSnapshot?.pages[0]).toMatchObject({ content: 'B' });
  } finally {
    app.unmount();
  }
});

it.each([[503, 'retry'], [401, 'pending']] as const)('keeps a failed save pending locally and classifies HTTP %s', async (status, result) => {
  const { app, workspace, pages, snapshot, cachedState } = openWorkspace();
  cloud.putPage.mockRejectedValueOnce(new CloudRequestError('Servicio no disponible', status));
  try {
    await workspace.connect('account', snapshot, false);
    pages.value[0].content = 'Cambio pendiente';
    await expect(workspace.flush()).resolves.toBe(result);
    expect(workspace.status.value).toBe('pending');
    expect(cachedState()?.snapshot.pages[0]).toMatchObject({ content: 'Cambio pendiente' });
    expect(cachedState()?.baseSnapshot?.pages[0]).toMatchObject({ content: 'A' });
  } finally { app.unmount(); }
});

const pageConflict: CloudConflict = {
  id: 'conflict-doc', kind: 'page', pageId: 'doc', createdAt: 1,
  localVersion: pageFixture('doc', 'Conflicto local'),
  cloudVersion: pageFixture('doc', 'Conflicto remoto'),
};

it('retains edits and their original revisions outside a resolved page', async () => {
  const initial = [pageFixture('doc', 'Conflicto remoto'), pageFixture('other', 'Base'), pageFixture('removed', 'Base')];
  const { app, workspace, pages, preferences, snapshot, cachedState } = openWorkspace(initial, [pageConflict]);
  let finishResolution!: (result: CloudWorkspaceResponse) => void;
  cloud.resolveConflict.mockImplementationOnce(() => new Promise((resolve) => { finishResolution = resolve; }));
  try {
    await workspace.connect('account', snapshot, false);
    pages.value.find((page) => page.id === 'other')!.content = 'Primera edición';
    const resolving = workspace.resolveConflict(pageConflict.id, 'cloud');
    await vi.waitFor(() => expect(cloud.resolveConflict).toHaveBeenCalledOnce());
    pages.value.find((page) => page.id === 'other')!.content = 'Segunda edición';
    pages.value = pages.value.filter((page) => page.id !== 'removed');
    pages.value.push(pageFixture('new-local', 'Nueva página'));
    preferences.value.width = 'wide';
    finishResolution({
      snapshot: {
        ...snapshot,
        pages: [pageFixture('doc', 'Versión elegida'), pageFixture('other', 'Cambio remoto'),
          pageFixture('removed', 'Cambio remoto'), pageFixture('other-device', 'Nueva en la nube')],
        preferences: { ...defaultPreferences, density: 'compact' },
      },
      revisions: { doc: 3, other: 2, removed: 2, 'other-device': 1 }, stateRevision: 2, conflicts: [],
    });

    await resolving;
    expect(pages.value.map((page) => [page.id, page.content])).toEqual([
      ['doc', 'Versión elegida'], ['other', 'Segunda edición'], ['other-device', 'Nueva en la nube'], ['new-local', 'Nueva página'],
    ]);
    expect(preferences.value.width).toBe('wide');
    expect(cachedState()?.revisions).toEqual({ doc: 3, other: 1, removed: 1, 'other-device': 1 });
    expect(cachedState()?.stateRevision).toBe(0);
    expect(cachedState()?.pending).toBe(true);
  } finally { app.unmount(); }
});

it('ignores a conflict response from an account that has signed out', async () => {
  const { app, workspace, pages, snapshot } = openWorkspace([pageFixture()], [pageConflict]);
  let finishResolution!: (result: CloudWorkspaceResponse) => void;
  cloud.resolveConflict.mockImplementationOnce(() => new Promise((resolve) => { finishResolution = resolve; }));
  try {
    await workspace.connect('account', snapshot, false);
    const resolving = workspace.resolveConflict(pageConflict.id, 'cloud');
    await vi.waitFor(() => expect(cloud.resolveConflict).toHaveBeenCalledOnce());
    workspace.activateGuest({ ...snapshot, pages: [pageFixture('guest', 'Borrador que se queda en este dispositivo')] });
    finishResolution({ snapshot, revisions: { doc: 2 }, stateRevision: 0, conflicts: [] });

    await resolving;
    expect(workspace.active.value).toBe(false);
    expect(workspace.owner.value).toBeNull();
    expect(pages.value.map((page) => page.id)).toEqual(['guest']);
  } finally { app.unmount(); }
});

it('submits a newer local draft when the user chooses to keep their changes', async () => {
  const { app, workspace, pages, snapshot } = openWorkspace([pageFixture()], [pageConflict]);
  const recent = pageFixture('doc', 'Edición posterior al conflicto');
  cloud.resolveConflict.mockResolvedValueOnce({
    snapshot: { ...snapshot, pages: [recent] }, revisions: { doc: 2 }, stateRevision: 0, conflicts: [],
  });
  try {
    await workspace.connect('account', snapshot, false);
    pages.value[0].content = recent.content;
    await expect(workspace.resolveConflict(pageConflict.id, 'local')).resolves.toBe(true);

    expect(cloud.resolveConflict).toHaveBeenCalledWith(pageConflict.id, 'local', recent);
    expect(pages.value[0].content).toBe(recent.content);
  } finally { app.unmount(); }
});

it('retains a new edit made while the chosen cloud version is being applied', async () => {
  const { app, workspace, pages, snapshot, cachedState } = openWorkspace([pageFixture()], [pageConflict]);
  let finishResolution!: (result: CloudWorkspaceResponse) => void;
  cloud.resolveConflict.mockImplementationOnce(() => new Promise((resolve) => { finishResolution = resolve; }));
  try {
    await workspace.connect('account', snapshot, false);
    const resolving = workspace.resolveConflict(pageConflict.id, 'cloud');
    await vi.waitFor(() => expect(cloud.resolveConflict).toHaveBeenCalledOnce());
    pages.value[0].content = 'Edición después de elegir';
    finishResolution({
      snapshot: { ...snapshot, pages: [pageFixture('doc', 'Versión remota')] },
      revisions: { doc: 2 }, stateRevision: 0, conflicts: [],
    });

    await expect(resolving).resolves.toBe(true);
    expect(pages.value[0].content).toBe('Edición después de elegir');
    expect(cachedState()?.revisions.doc).toBe(1);
    expect(cachedState()?.pending).toBe(true);
  } finally { app.unmount(); }
});
