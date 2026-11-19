import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { expect, it, vi } from 'vitest';
import { defaultPreferences } from '@/domain/workspace/constants';
import type { WorkspacePage } from '@/domain/workspace/types';
import type { CloudLocalState, CloudSnapshot } from '@/lib/cloud-cache';
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
vi.mock('@/lib/cloud-workspace-api', () => ({
  fetchCloudWorkspace: cloud.fetch,
  putCloudPage: cloud.putPage,
}));

it('keeps the most recent local document pending while an older save finishes', async () => {
  const page: WorkspacePage = {
    id: 'doc', title: 'Notas', type: 'doc', parentId: null, content: 'A',
    favorite: false, createdAt: 1, updatedAt: 1, entries: [],
  };
  const snapshot: CloudSnapshot = { pages: [page], todayTasks: [], preferences: defaultPreferences, databaseViewStates: {} };
  const pages = ref([{ ...page }]);
  let lastLocal: CloudLocalState | undefined;
  cloud.saveLocal.mockImplementation(async (value) => { lastLocal = structuredClone(value); });
  cloud.fetch.mockResolvedValue({ snapshot, revisions: { doc: 1 }, stateRevision: 0, conflicts: [] });
  let finishPut!: (value: { revision: number }) => void;
  cloud.putPage.mockImplementationOnce(() => new Promise((resolve) => { finishPut = resolve; }));
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
  try {
    const workspace = holder.workspace!;
    await workspace.connect('account', snapshot, false);
    pages.value[0].content = 'B';
    const saving = workspace.flush();
    await vi.waitFor(() => expect(cloud.putPage).toHaveBeenCalledOnce());
    pages.value[0].content = 'C';
    finishPut({ revision: 2 });

    await expect(saving).resolves.toBe('pending');
    expect(lastLocal?.pending).toBe(true);
    expect(lastLocal?.snapshot.pages[0]).toMatchObject({ content: 'C' });
    expect(lastLocal?.baseSnapshot?.pages[0]).toMatchObject({ content: 'B' });
  } finally {
    app.unmount();
  }
});
