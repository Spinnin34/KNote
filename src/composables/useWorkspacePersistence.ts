import { ref, type ComputedRef, type Ref } from 'vue';
import type { ToastItem } from '@/components/ui/ToastViewport.vue';
import type { DatabaseViewState, TodayTask, WorkspacePage, WorkspacePreferences } from '@/domain/workspace/types';
import {
  DATABASE_VIEWS_STORAGE_KEY, PAGE_STORAGE_KEY, TASK_STORAGE_KEY,
} from '@/domain/workspace/constants';
import { deleteBlockImage, getBlockImage, listBlockImageIds, saveBlockImage } from '@/lib/block-images';
import type { WorkspaceSnapshot } from '@/lib/desktop-vault';
import { isDesktopRuntime, isDesktopVaultReady, saveDesktopWorkspace } from '@/lib/desktop-vault';

interface WorkspacePersistenceOptions {
  pages: Ref<WorkspacePage[]>;
  todayTasks: Ref<TodayTask[]>;
  preferences: Ref<WorkspacePreferences>;
  databaseViewStates: Ref<Record<string, DatabaseViewState>>;
  snapshot: ComputedRef<WorkspaceSnapshot>;
  notify: (title: string, description: string, color?: ToastItem['color']) => void;
}

export function useWorkspacePersistence(options: WorkspacePersistenceOptions) {
  const { pages, todayTasks, preferences, databaseViewStates, snapshot, notify } = options;
  const bannerFiles = ref<readonly File[]>([]);
  const bannerObjectUrls = ref<Record<string, string>>({});
  const saveState = ref<'saved' | 'saving' | 'error'>(isDesktopRuntime() && !isDesktopVaultReady() ? 'error' : 'saved');
  let saveTimer: number | undefined;
  let databaseViewSaveTimer: number | undefined;
  let assetPruneTimer: number | undefined;
  let desktopSaveQueue: Promise<void> = Promise.resolve();

  async function pruneUnusedBlockImages(): Promise<void> {
    try {
      const referenced = new Set<string>();
      const collect = (value: string | undefined) => {
        if (!value) return;
        for (const match of value.matchAll(/knote-asset:([\da-f-]{20,})/gi)) referenced.add(match[1]);
      };
      pages.value.forEach((page) => {
        collect(page.banner);
        collect(page.content);
        page.entries.forEach((entry) => collect(entry.content));
      });
      const stored = await listBlockImageIds();
      await Promise.all(stored.filter((id) => !referenced.has(id)).map(deleteBlockImage));
    } catch { /* Keep existing images if the browser cannot inspect IndexedDB. */ }
  }

  function persist(): void {
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
        saveState.value = 'saved';
        if (assetPruneTimer !== undefined) window.clearTimeout(assetPruneTimer);
        assetPruneTimer = window.setTimeout(() => { void pruneUnusedBlockImages(); }, 250);
      }).catch(() => {
        saveState.value = 'error';
        if (previousState !== 'error') notify('No se pudo guardar', 'Revisa el archivo local de KNote y el acceso a Documentos.', 'destructive');
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
    if (isDesktopRuntime() && !isDesktopVaultReady()) { saveState.value = 'error'; return; }
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveState.value = 'saving';
    saveTimer = window.setTimeout(persist, 320);
  }

  function queueDatabaseViewSave(): void {
    if (isDesktopRuntime() && !isDesktopVaultReady()) { saveState.value = 'error'; return; }
    if (databaseViewSaveTimer !== undefined) window.clearTimeout(databaseViewSaveTimer);
    databaseViewSaveTimer = window.setTimeout(() => {
      databaseViewSaveTimer = undefined;
      if (isDesktopRuntime()) { persist(); return; }
      try { localStorage.setItem(DATABASE_VIEWS_STORAGE_KEY, JSON.stringify(databaseViewStates.value)); }
      catch { notify('No se guardaron las vistas', 'El navegador no permitió guardar las preferencias de esta tabla.', 'warning'); }
    }, 180);
  }

  function flushPendingChanges(): void {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
      persist();
    }
    if (databaseViewSaveTimer !== undefined) {
      window.clearTimeout(databaseViewSaveTimer);
      databaseViewSaveTimer = undefined;
      if (isDesktopRuntime()) persist();
      else {
        try { localStorage.setItem(DATABASE_VIEWS_STORAGE_KEY, JSON.stringify(databaseViewStates.value)); }
        catch { /* Keep the rest of the workspace available if view preferences cannot be stored. */ }
      }
    }
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

  function dispose(): void {
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
