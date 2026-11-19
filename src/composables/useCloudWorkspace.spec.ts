import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { expect, it, vi } from 'vitest';
import { defaultPreferences } from '@/domain/workspace/constants';
import type { WorkspacePage } from '@/domain/workspace/types';
import type { CloudLocalState, CloudSnapshot } from '@/lib/cloud-cache';
import { CloudRequestError } from '@/lib/cloud-workspace-api';
import { useCloudWorkspace } from './useCloudWorkspace';

const cloud = vi.hoisted(() => ({
  fetch: vi.fn(),
  putPage: vi.fn(),
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
}));

function openWorkspace() {
  const page: WorkspacePage = {
    id: 'doc', title: 'Notas', type: 'doc', parentId: null, content: 'A',
    favorite: false, createdAt: 1, updatedAt: 1, entries: [],
  };
  const snapshot: CloudSnapshot = { pages: [page], todayTasks: [], preferences: defaultPreferences, databaseViewStates: {} };
  const pages = ref([{ ...page }]);
  let lastLocal: CloudLocalState | undefined;
  cloud.putPage.mockReset();
  cloud.saveLocal.mockImplementation(async (value) => { lastLocal = structuredClone(value); });
  cloud.fetch.mockResolvedValue({ snapshot, revisions: { doc: 1 }, stateRevision: 0, conflicts: [] });
  const holder: { workspace?: ReturnType<typeof useCloudWorkspace> } = {};
  const app = mount(defineComponent({
    setup() {
      holder.workspace = useCloudWorkspace({
        pages, todayTasks: ref([]), preferences: ref({ ...defaultPreferences }), databaseViewStates: ref({}),
        applySnapshot: (value) => { pages.value = value.pages as WorkspacePage[]; },
        notify: vi.fn(),
      });
      return () => null;
    },
  }));
  return { app, workspace: holder.workspace!, pages, snapshot, cachedState: () => lastLocal };
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
