import { ref, type ComputedRef, type Ref } from 'vue';
import type { ToastItem } from '@/components/ui/ToastViewport.vue';
import type { DatabaseViewState, TodayTask, WorkspacePage, WorkspacePreferences } from '@/domain/workspace/types';
import {
  DATABASE_VIEWS_STORAGE_KEY, PAGE_STORAGE_KEY, TASK_STORAGE_KEY,
} from '@/domain/workspace/constants';
import { deleteBlockImage, getBlockImage, isBlockImageRetained, listBlockImageIds, saveBlockImage } from '@/lib/block-images';
import type { WorkspaceSnapshot } from '@/lib/desktop-vault';
import { isDesktopRuntime, isDesktopVaultReady, saveDesktopWorkspace } from '@/lib/desktop-vault';
import { listCloudLocalStates } from '@/lib/cloud-cache';
import type { CloudSaveResult } from '@/composables/useCloudWorkspace';

interface WorkspacePersistenceOptions {
  pages: Ref<WorkspacePage[]>;
  todayTasks: Ref<TodayTask[]>;
  preferences: Ref<WorkspacePreferences>;
  databaseViewStates: Ref<Record<string, DatabaseViewState>>;
  snapshot: ComputedRef<WorkspaceSnapshot>;
  notify: (title: string, description: string, color?: ToastItem['color']) => void;
  enabled?: Ref<boolean>;
  cloudActive?: Ref<boolean>;
  persistCloud?: (serializedSnapshot: string) => Promise<CloudSaveResult>;
}

const cloudRetryDelays = [2_000, 5_000, 15_000, 30_000, 60_000];

export function useWorkspacePersistence(options: WorkspacePersistenceOptions) {
  const { pages, todayTasks, databaseViewStates, snapshot, notify } = options;
  const enabled = options.enabled ?? ref(true);
  const cloudActive = options.cloudActive ?? ref(false);
  const bannerFiles = ref<readonly File[]>([]);
  const bannerObjectUrls = ref<Record<string, string>>({});
  const saveState = ref<'saved' | 'saving' | 'pending' | 'conflict' | 'error'>(isDesktopRuntime() && !isDesktopVaultReady() ? 'error' : 'saved');
  let saveTimer: number | undefined;
  let databaseViewSaveTimer: number | undefined;
  let assetPruneTimer: number | undefined;
  let cloudRetryTimer: number | undefined;
  let cloudRetryIndex = 0;
  let desktopSaveQueue: Promise<void> = Promise.resolve();
  let saveRevision = 0;
  let disposed = false;

  async function pruneUnusedBlockImages(): Promise<void> {
    try {
      const stored = await listBlockImageIds();
      const referenced = new Set<string>();
      const collect = (value: string | undefined) => {
        if (!value) return;
        for (const match of value.matchAll(/(?:knote-asset:|data-asset-id=["'])([\da-f-]{20,})/gi)) referenced.add(match[1]);
      };
      const collectPages = (items: unknown) => {
        if (!Array.isArray(items)) return;
        items.forEach((value) => {
          if (!value || typeof value !== 'object') return;
          const page = value as Partial<WorkspacePage>;
          collect(page.banner);
          collect(page.content);
          page.entries?.forEach((entry) => collect(entry.content));
        });
      };
      collectPages(pages.value);
      if (!isDesktopRuntime()) {
        const guestPages = localStorage.getItem(PAGE_STORAGE_KEY);
        if (guestPages) {
          try { collectPages(JSON.parse(guestPages) as unknown); }
          catch { return; }
        }
        const cloudStates = await listCloudLocalStates();
        for (const cloudState of cloudStates) {
          collectPages(cloudState.snapshot.pages);
          collectPages(cloudState.baseSnapshot?.pages);
        }
      }
      // Pages may have changed while the cloud cache was being read.
      collectPages(pages.value);
      await Promise.all(stored.filter((id) => !referenced.has(id) && !isBlockImageRetained(id)).map(deleteBlockImage));
    } catch { /* Keep existing images if the browser cannot inspect IndexedDB. */ }
  }

  function cancelCloudRetry(): void {
    if (cloudRetryTimer === undefined) return;
    window.clearTimeout(cloudRetryTimer);
    cloudRetryTimer = undefined;
  }

  function scheduleCloudRetry(revision: number): void {
    const delay = cloudRetryDelays[cloudRetryIndex];
    if (disposed || delay === undefined || !navigator.onLine) return;
    cloudRetryIndex += 1;
    cloudRetryTimer = window.setTimeout(() => {
      cloudRetryTimer = undefined;
      if (revision === saveRevision && cloudActive.value && navigator.onLine) persistSnapshot();
    }, delay);
  }

  function persist(): void {
    cloudRetryIndex = 0;
    persistSnapshot();
  }

  function persistSnapshot(): void {
    if (!enabled.value) return;
    cancelCloudRetry();
    const revision = ++saveRevision;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    const previousState = saveState.value;
    if (isDesktopRuntime()) {
      if (!isDesktopVaultReady()) { saveState.value = 'error'; return; }
      saveState.value = 'saving';
      let serializedSnapshot: string;
      try {
        serializedSnapshot = JSON.stringify(snapshot.value);
      } catch {
        saveState.value = 'error';
        if (previousState !== 'error') notify('No se pudo guardar', 'KNote no pudo preparar los datos locales.', 'destructive');
        return;
      }
      desktopSaveQueue = desktopSaveQueue.catch(() => undefined).then(() => saveDesktopWorkspace(serializedSnapshot));
      void desktopSaveQueue.then(() => {
        if (revision !== saveRevision) return;
        saveState.value = 'saved';
        if (assetPruneTimer !== undefined) window.clearTimeout(assetPruneTimer);
        assetPruneTimer = window.setTimeout(() => { void pruneUnusedBlockImages(); }, 250);
      }).catch(() => {
        if (revision !== saveRevision) return;
        saveState.value = 'error';
        if (previousState !== 'error') notify('No se pudo guardar', 'Revisa el archivo local de KNote y el acceso a Documentos.', 'destructive');
      });
      return;
    }
    if (cloudActive.value && options.persistCloud) {
      saveState.value = 'saving';
      let serializedSnapshot: string;
      try { serializedSnapshot = JSON.stringify(snapshot.value); }
      catch {
        saveState.value = 'error';
        if (previousState !== 'error') notify('No se pudo guardar', 'KNote no pudo preparar los datos para la nube.', 'destructive');
        return;
      }
      void options.persistCloud(serializedSnapshot).then((result) => {
        if (revision !== saveRevision) return;
        if (result === 'retry') {
          saveState.value = 'pending';
          scheduleCloudRetry(revision);
          return;
        }
        saveState.value = result === 'synced' ? 'saved' : result;
        if (result === 'synced') {
          cloudRetryIndex = 0;
          if (disposed) return;
          if (assetPruneTimer !== undefined) window.clearTimeout(assetPruneTimer);
          assetPruneTimer = window.setTimeout(() => { void pruneUnusedBlockImages(); }, 250);
        }
      }).catch(() => {
        if (revision !== saveRevision) return;
        saveState.value = 'error';
        if (previousState !== 'error') notify('No se pudo guardar', 'Mantén abierta esta pestaña y vuelve a intentar el guardado.', 'destructive');
      });
      return;
    }
    saveState.value = 'saving';
    try {
      localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify(pages.value));
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(todayTasks.value));
      saveState.value = 'saved';
      if (assetPruneTimer !== undefined) window.clearTimeout(assetPruneTimer);
      assetPruneTimer = window.setTimeout(() => { void pruneUnusedBlockImages(); }, 250);
    } catch {
      saveState.value = 'error';
      if (previousState !== 'error') notify('No se pudo guardar', 'El almacenamiento local está lleno o no disponible. Libera espacio y vuelve a intentarlo.', 'destructive');
    }
  }

  function queueSave(): void {
    if (!enabled.value) return;
    if (isDesktopRuntime() && !isDesktopVaultReady()) { saveState.value = 'error'; return; }
    saveRevision += 1;
    cancelCloudRetry();
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveState.value = 'saving';
    saveTimer = window.setTimeout(persist, 320);
  }

  function queueDatabaseViewSave(): void {
    if (!enabled.value) return;
    if (isDesktopRuntime() && !isDesktopVaultReady()) { saveState.value = 'error'; return; }
    if (databaseViewSaveTimer !== undefined) window.clearTimeout(databaseViewSaveTimer);
    databaseViewSaveTimer = window.setTimeout(() => {
      databaseViewSaveTimer = undefined;
      if (isDesktopRuntime() || cloudActive.value) { persist(); return; }
      try { localStorage.setItem(DATABASE_VIEWS_STORAGE_KEY, JSON.stringify(databaseViewStates.value)); }
      catch { notify('No se guardaron las vistas', 'El navegador no permitió guardar las preferencias de esta tabla.', 'warning'); }
    }, 180);
  }

  function flushPendingChanges(): void {
    const contentPending = saveTimer !== undefined;
    const viewsUseSnapshot = isDesktopRuntime() || cloudActive.value;
    const viewsPending = databaseViewSaveTimer !== undefined;
    if (databaseViewSaveTimer !== undefined) {
      window.clearTimeout(databaseViewSaveTimer);
      databaseViewSaveTimer = undefined;
      if (!viewsUseSnapshot) {
        try { localStorage.setItem(DATABASE_VIEWS_STORAGE_KEY, JSON.stringify(databaseViewStates.value)); }
        catch { /* Keep the rest of the workspace available if view preferences cannot be stored. */ }
      }
    }
    if (contentPending || (viewsPending && viewsUseSnapshot)) persist();
  }

  async function hydratePageBanners(): Promise<void> {
    const references = new Map(pages.value.flatMap((page) => page.banner?.startsWith('knote-asset:')
      ? [[page.id, { banner: page.banner, assetId: page.banner.slice('knote-asset:'.length) }] as const]
      : []));
    for (const [pageId, reference] of references) {
      if (bannerObjectUrls.value[reference.assetId]) continue;
      try {
        const blob = await getBlockImage(reference.assetId);
        const current = pages.value.find((page) => page.id === pageId);
        if (!blob || current?.banner !== reference.banner) continue;
        bannerObjectUrls.value = { ...bannerObjectUrls.value, [reference.assetId]: URL.createObjectURL(blob) };
      } catch { /* A missing local asset does not make the page unusable. */ }
    }
    const activeIds = new Set([...references.values()].map((reference) => reference.assetId));
    for (const [assetId, objectUrl] of Object.entries(bannerObjectUrls.value)) {
      if (!activeIds.has(assetId)) {
        URL.revokeObjectURL(objectUrl);
        const next = { ...bannerObjectUrls.value };
        delete next[assetId];
        bannerObjectUrls.value = next;
      }
    }
  }

  function touchPage(page: WorkspacePage): void {
    page.updatedAt = Date.now();
    queueSave();
  }

  async function migrateLegacyBanners(): Promise<void> {
    for (const page of pages.value) {
      if (!page.banner?.startsWith('data:image/')) continue;
      try {
        const blob = await fetch(page.banner).then((response) => response.blob());
        const id = await saveBlockImage(blob);
        if (page.banner.startsWith('data:image/')) {
          page.banner = `knote-asset:${id}`;
          touchPage(page);
        }
      } catch { /* Keep legacy banner data if migration storage is unavailable. */ }
    }
  }

  function retryPendingOnline(): void {
    if (cloudActive.value && saveState.value === 'pending') persist();
  }

  if (options.persistCloud) window.addEventListener('online', retryPendingOnline);

  function dispose(): void {
    disposed = true;
    cancelCloudRetry();
    if (options.persistCloud) window.removeEventListener('online', retryPendingOnline);
    if (assetPruneTimer !== undefined) window.clearTimeout(assetPruneTimer);
    Object.values(bannerObjectUrls.value).forEach((url) => URL.revokeObjectURL(url));
  }

  async function saveSnapshot(serializedSnapshot: string): Promise<void> {
    await desktopSaveQueue.catch(() => undefined);
    await saveDesktopWorkspace(serializedSnapshot);
  }

  return {
    bannerFiles, bannerObjectUrls, saveState,
    persist, queueSave, queueDatabaseViewSave, flushPendingChanges,
    pruneUnusedBlockImages, hydratePageBanners, migrateLegacyBanners, touchPage,
    waitForPendingSaves: () => desktopSaveQueue, saveSnapshot,
    dispose,
  };
}
