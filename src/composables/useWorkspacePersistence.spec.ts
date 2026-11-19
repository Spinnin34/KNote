import { computed, ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultPreferences } from '@/domain/workspace/constants';
import type { WorkspacePage } from '@/domain/workspace/types';
import type { CloudSaveResult } from './useCloudWorkspace';
import { useWorkspacePersistence } from './useWorkspacePersistence';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createPersistence() {
  vi.stubGlobal('navigator', { onLine: true });
  const page: WorkspacePage = {
    id: 'doc', title: 'Notas', type: 'doc', parentId: null, content: 'Inicial',
    favorite: false, createdAt: 1, updatedAt: 1, entries: [],
  };
  const pages = ref([page]);
  const todayTasks = ref([]);
  const preferences = ref({ ...defaultPreferences });
  const databaseViewStates = ref({});
  const snapshot = computed(() => ({
    pages: pages.value, todayTasks: todayTasks.value, preferences: preferences.value,
    databaseViewStates: databaseViewStates.value,
  }));
  const persistCloud = vi.fn<(value: string) => Promise<CloudSaveResult>>();
  const persistence = useWorkspacePersistence({
    pages, todayTasks, preferences, databaseViewStates, snapshot, persistCloud,
    cloudActive: ref(true), notify: vi.fn(),
  });
  return { pages, persistCloud, persistence };
}

it('retries a temporary outage with the latest document and reports it saved after recovery', async () => {
  vi.useFakeTimers();
  const { pages, persistCloud, persistence } = createPersistence();
  persistCloud.mockResolvedValueOnce('retry').mockResolvedValueOnce('synced');
  try {
    persistence.persist();
    await vi.advanceTimersByTimeAsync(0);
    expect(persistence.saveState.value).toBe('pending');
    pages.value[0].content = 'Última edición';

    await vi.advanceTimersByTimeAsync(2_000);
    expect(persistCloud).toHaveBeenCalledTimes(2);
    expect(JSON.parse(persistCloud.mock.calls[1][0])).toMatchObject({ pages: [{ content: 'Última edición' }] });
    expect(persistence.saveState.value).toBe('saved');
  } finally { persistence.dispose(); }
});

it('updates the save status when the browser comes back online', async () => {
  vi.useFakeTimers();
  const { persistCloud, persistence } = createPersistence();
  persistCloud.mockResolvedValueOnce('pending').mockResolvedValueOnce('synced');
  try {
    persistence.persist();
    await vi.advanceTimersByTimeAsync(0);
    expect(persistence.saveState.value).toBe('pending');

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(persistCloud).toHaveBeenCalledTimes(2);
    expect(persistence.saveState.value).toBe('saved');
  } finally { persistence.dispose(); }
});

it('bounds automatic retries during a persistent outage', async () => {
  vi.useFakeTimers();
  const { persistCloud, persistence } = createPersistence();
  persistCloud.mockResolvedValue('retry');
  try {
    persistence.persist();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(persistCloud).toHaveBeenCalledTimes(6);
    expect(persistence.saveState.value).toBe('pending');
  } finally { persistence.dispose(); }
});
