import { onBeforeUnmount, ref, type Ref } from 'vue';
import type { ToastItem } from '@/components/ui/ToastViewport.vue';
import type { DatabaseViewState, TodayTask, WorkspacePage, WorkspacePreferences } from '@/domain/workspace/types';
import { getBlockImage } from '@/lib/block-images';
import { readCloudLocalState, writeCloudLocalState, type CloudLocalState, type CloudSnapshot } from '@/lib/cloud-cache';
import {
  checkCloudAssets, CloudConflictError, deleteCloudPage, fetchCloudWorkspace, mergeCloudWorkspace,
  putCloudPage, putCloudState, resolveCloudConflict, uploadCloudAsset,
  type CloudConflict, type CloudWorkspaceResponse,
} from '@/lib/cloud-workspace-api';
import { isDesktopRuntime } from '@/lib/desktop-vault';

type ImportChoice = 'merge' | 'cloud';
type CloudStatus = 'local' | 'loading' | 'synced' | 'syncing' | 'pending' | 'conflict' | 'error';

interface CloudWorkspaceOptions {
  pages: Ref<WorkspacePage[]>;
  todayTasks: Ref<TodayTask[]>;
  preferences: Ref<WorkspacePreferences>;
  databaseViewStates: Ref<Record<string, DatabaseViewState>>;
  applySnapshot: (snapshot: CloudSnapshot) => void;
  notify: (title: string, description: string, color?: ToastItem['color']) => void;
}

interface ImportPreview {
  localPages: number;
  cloudPages: number;
  localTasks: number;
  cloudTasks: number;
}

function cloneSnapshot(snapshot: CloudSnapshot): CloudSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as CloudSnapshot;
}

function snapshotSignature(snapshot: CloudSnapshot): string {
  return JSON.stringify(snapshot);
}

function pageMap(snapshot: CloudSnapshot): Map<string, WorkspacePage> {
  return new Map((snapshot.pages as WorkspacePage[]).map((page) => [page.id, page]));
}

function cloudHasData(snapshot: CloudSnapshot): boolean {
  return snapshot.pages.length > 0 || snapshot.todayTasks.length > 0;
}

function assetIds(snapshot: CloudSnapshot): string[] {
  const ids = new Set<string>();
  const collectContent = (value: unknown) => {
    if (typeof value !== 'string') return;
    for (const match of value.matchAll(/data-asset-id=["']([\da-f-]{20,64})["']/gi)) ids.add(match[1]);
  };
  for (const item of snapshot.pages) {
    if (!item || typeof item !== 'object') continue;
    const page = item as WorkspacePage;
    const banner = page.banner?.match(/^knote-asset:([\da-f-]{20,64})$/i);
    if (banner) ids.add(banner[1]);
    collectContent(page.content);
    page.entries?.forEach((entry) => collectContent(entry.content));
  }
  return [...ids];
}

export function useCloudWorkspace(options: CloudWorkspaceOptions) {
  const { pages, todayTasks, preferences, databaseViewStates, applySnapshot, notify } = options;
  const status = ref<CloudStatus>(isDesktopRuntime() ? 'local' : 'loading');
  const active = ref(false);
  const ready = ref(isDesktopRuntime());
  const owner = ref<string | null>(null);
  const conflicts = ref<CloudConflict[]>([]);
  const importPreview = ref<ImportPreview | null>(null);
  const isResolving = ref(false);
  let state: CloudLocalState | null = null;
  let pendingImport: { owner: string; snapshot: CloudSnapshot; signature: string; response: CloudWorkspaceResponse } | null = null;
  let syncQueue: Promise<void> = Promise.resolve();
  let workspaceGeneration = 0;
  let debounceTimer: number | undefined;
  let blockedPages = new Set<string>();
  let stateBlocked = false;

  function currentSnapshot(): CloudSnapshot {
    return {
      pages: pages.value,
      todayTasks: todayTasks.value,
      preferences: preferences.value,
      databaseViewStates: databaseViewStates.value,
    };
  }

  function saveStateLocally(pending: boolean): Promise<void> {
    if (!owner.value || !state) return Promise.resolve();
    state = { ...state, snapshot: cloneSnapshot(currentSnapshot()), pending, updatedAt: Date.now() };
    return writeCloudLocalState(state);
  }

  async function ensureAssets(snapshot: CloudSnapshot): Promise<void> {
    const ids = assetIds(snapshot);
    for (let offset = 0; offset < ids.length; offset += 500) {
      const group = ids.slice(offset, offset + 500);
      const existing = await checkCloudAssets(group);
      for (const id of group) {
        if (existing.has(id)) continue;
        const local = await getBlockImage(id);
        if (!local) throw new Error('Falta una imagen local. No se han sincronizado las páginas que la usan.');
        await uploadCloudAsset(id, local);
      }
    }
  }

  async function queueSync(serializedSnapshot: string): Promise<'synced' | 'pending' | 'conflict'> {
    if (!owner.value || !state) return 'synced';
    const generation = workspaceGeneration;
    const snapshot = JSON.parse(serializedSnapshot) as CloudSnapshot;
    const localSave = saveStateLocally(true).then(
      () => ({ saved: true } as const),
      (error: unknown) => ({ saved: false, error } as const),
    );
    const operation = async (): Promise<'synced' | 'pending' | 'conflict'> => {
      const local = await localSave;
      if (!local.saved) throw local.error;
      if (generation !== workspaceGeneration || !state) return 'pending';
      if (!navigator.onLine) {
        status.value = 'pending';
        return 'pending';
      }
      status.value = 'syncing';
      try {
        await ensureAssets(snapshot);
        if (generation !== workspaceGeneration || !state) return 'pending';
        if (!state.baseSnapshot) {
          const initial = await fetchCloudWorkspace();
          if (generation !== workspaceGeneration || !state) return 'pending';
          state = {
            ...state, baseSnapshot: cloneSnapshot(initial.snapshot),
            revisions: initial.revisions, stateRevision: initial.stateRevision, pending: true,
          };
          conflicts.value = initial.conflicts;
          blockedPages = new Set(initial.conflicts.filter((item) => item.kind === 'page' && item.pageId).map((item) => item.pageId!));
          stateBlocked = initial.conflicts.some((item) => item.kind === 'state');
        }

        const base = state.baseSnapshot;
        if (!base) throw new Error('No hay una revisión base para sincronizar.');
        const previousPages = pageMap(base);
        const nextPages = pageMap(snapshot);
        for (const [pageId, page] of nextPages) {
          if (generation !== workspaceGeneration) return 'pending';
          const previous = previousPages.get(pageId);
          if (JSON.stringify(previous) === JSON.stringify(page) || blockedPages.has(pageId)) continue;
          try {
            const result = await putCloudPage(page, state.revisions[pageId] ?? 0);
            if (generation !== workspaceGeneration) return 'pending';
            state.revisions[pageId] = result.revision;
            previousPages.set(pageId, JSON.parse(JSON.stringify(page)) as WorkspacePage);
            state.baseSnapshot = { ...state.baseSnapshot!, pages: [...previousPages.values()] };
            await writeCloudLocalState(state);
          } catch (error) {
            if (error instanceof CloudConflictError) blockedPages.add(pageId);
            else throw error;
          }
        }
        for (const [pageId] of previousPages) {
          if (generation !== workspaceGeneration) return 'pending';
          if (nextPages.has(pageId) || blockedPages.has(pageId)) continue;
          try {
            await deleteCloudPage(pageId, state.revisions[pageId] ?? 0);
            if (generation !== workspaceGeneration) return 'pending';
            previousPages.delete(pageId);
            delete state.revisions[pageId];
            state.baseSnapshot = { ...state.baseSnapshot!, pages: [...previousPages.values()] };
            await writeCloudLocalState(state);
          } catch (error) {
            if (error instanceof CloudConflictError) blockedPages.add(pageId);
            else throw error;
          }
        }

        const previousState = {
          todayTasks: base.todayTasks,
          preferences: base.preferences,
          databaseViewStates: base.databaseViewStates,
        };
        if (generation !== workspaceGeneration) return 'pending';
        const nextState = {
          todayTasks: snapshot.todayTasks,
          preferences: snapshot.preferences,
          databaseViewStates: snapshot.databaseViewStates,
        };
        if (!stateBlocked && JSON.stringify(previousState) !== JSON.stringify(nextState)) {
          try {
            const result = await putCloudState(nextState, state.stateRevision);
            if (generation !== workspaceGeneration) return 'pending';
            state.stateRevision = result.revision;
            state.baseSnapshot = { ...state.baseSnapshot!, ...nextState };
            await writeCloudLocalState(state);
          } catch (error) {
            if (error instanceof CloudConflictError) stateBlocked = true;
            else throw error;
          }
        }

        if (generation !== workspaceGeneration) return 'pending';
        previousPages.clear();
        nextPages.forEach((page, id) => previousPages.set(id, JSON.parse(JSON.stringify(page)) as WorkspacePage));
        state.baseSnapshot = {
          pages: [...previousPages.values()],
          todayTasks: stateBlocked ? base.todayTasks : snapshot.todayTasks,
          preferences: stateBlocked ? base.preferences : snapshot.preferences,
          databaseViewStates: stateBlocked ? base.databaseViewStates : snapshot.databaseViewStates,
        };
        const hadConflict = blockedPages.size > 0 || stateBlocked;
        if (hadConflict) {
          const remote = await fetchCloudWorkspace();
          if (generation !== workspaceGeneration) return 'pending';
          conflicts.value = remote.conflicts;
          blockedPages = new Set(remote.conflicts.filter((item) => item.kind === 'page' && item.pageId).map((item) => item.pageId!));
          stateBlocked = remote.conflicts.some((item) => item.kind === 'state');
          state.baseSnapshot = cloneSnapshot(remote.snapshot);
          state.revisions = remote.revisions;
          state.stateRevision = remote.stateRevision;
          status.value = 'conflict';
          await saveStateLocally(true);
          return 'conflict';
        }
        const pending = JSON.stringify(currentSnapshot()) !== serializedSnapshot;
        status.value = pending ? 'syncing' : 'synced';
        await saveStateLocally(pending);
        return pending ? 'pending' : 'synced';
      } catch (error) {
        if (generation !== workspaceGeneration) return 'pending';
        status.value = 'pending';
        await saveStateLocally(true);
        if (!navigator.onLine) return 'pending';
        notify('Sincronización pendiente', error instanceof Error ? error.message : 'KNote guardó una copia local y reintentará la sincronización.', 'warning');
        return 'pending';
      }
    };

    let result: 'synced' | 'pending' | 'conflict' = 'pending';
    const next = syncQueue.catch(() => undefined).then(async () => { result = await operation(); });
    syncQueue = next;
    await next;
    return result;
  }

  function scheduleSync(serializedSnapshot: string): void {
    if (!active.value) return;
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      void queueSync(serializedSnapshot);
    }, 360);
  }

  function acceptResponse(response: CloudWorkspaceResponse, accountOwner: string, lastGuestSnapshot: string | null, pending = false): void {
    workspaceGeneration += 1;
    owner.value = accountOwner;
    active.value = true;
    conflicts.value = response.conflicts;
    blockedPages = new Set(response.conflicts.filter((item) => item.kind === 'page' && item.pageId).map((item) => item.pageId!));
    stateBlocked = response.conflicts.some((item) => item.kind === 'state');
    const current = pending && state ? cloneSnapshot(state.snapshot) : cloneSnapshot(response.snapshot);
    state = {
      owner: accountOwner,
      snapshot: current,
      baseSnapshot: pending && state?.baseSnapshot ? cloneSnapshot(state.baseSnapshot) : cloneSnapshot(response.snapshot),
      revisions: pending && state ? { ...state.revisions } : { ...response.revisions },
      stateRevision: pending && state ? state.stateRevision : response.stateRevision,
      pending: pending || response.conflicts.length > 0,
      lastGuestSnapshot,
      updatedAt: Date.now(),
    };
    applySnapshot(current);
    ready.value = true;
    status.value = response.conflicts.length ? 'conflict' : pending ? 'pending' : 'synced';
    void writeCloudLocalState(state);
    if (pending) void queueSync(JSON.stringify(current));
  }

  async function connect(accountOwner: string, localSnapshot: CloudSnapshot, localStorageExists: boolean): Promise<void> {
    workspaceGeneration += 1;
    status.value = 'loading';
    ready.value = false;
    pendingImport = null;
    const guestSignature = localStorageExists ? snapshotSignature(localSnapshot) : null;
    const [cached] = await Promise.all([readCloudLocalState(accountOwner).catch(() => null)]);
    state = cached;
    let remote: CloudWorkspaceResponse;
    try { remote = await fetchCloudWorkspace(); }
    catch (error) {
      if (cached) {
        owner.value = accountOwner;
        active.value = true;
        applySnapshot(cached.snapshot);
        ready.value = true;
        status.value = 'pending';
        if (cached.pending) void queueSync(JSON.stringify(cached.snapshot));
        return;
      }
      owner.value = accountOwner;
      active.value = false;
      status.value = 'error';
      ready.value = true;
      notify('No se pudo abrir la nube', error instanceof Error ? error.message : 'KNote conservará el espacio local.', 'warning');
      return;
    }

    if (cached?.pending && cached.baseSnapshot) {
      acceptResponse(remote, accountOwner, cached.lastGuestSnapshot, true);
      return;
    }

    const localUnreviewed = Boolean(localStorageExists && guestSignature && guestSignature !== cached?.lastGuestSnapshot);
    if (localUnreviewed && cloudHasData(remote.snapshot)) {
      pendingImport = { owner: accountOwner, snapshot: cloneSnapshot(localSnapshot), signature: guestSignature!, response: remote };
      importPreview.value = {
        localPages: localSnapshot.pages.length,
        cloudPages: remote.snapshot.pages.length,
        localTasks: localSnapshot.todayTasks.length,
        cloudTasks: remote.snapshot.todayTasks.length,
      };
      owner.value = accountOwner;
      active.value = false;
      ready.value = false;
      status.value = 'synced';
      return;
    }

    if (localUnreviewed && !cloudHasData(localSnapshot)) {
      // No content to import; the existing local seed/demo data should not shadow the account.
      acceptResponse(remote, accountOwner, guestSignature);
      return;
    }

    if (localUnreviewed && !cloudHasData(remote.snapshot)) {
      try {
        await ensureAssets(localSnapshot);
        const merged = await mergeCloudWorkspace(localSnapshot);
        acceptResponse(merged, accountOwner, guestSignature);
      } catch (error) {
        owner.value = accountOwner;
        active.value = false;
        applySnapshot(localSnapshot);
        ready.value = true;
        status.value = 'error';
        notify('No se pudo importar el espacio', error instanceof Error ? error.message : 'Los datos locales siguen intactos.', 'warning');
      }
      return;
    }

    acceptResponse(remote, accountOwner, cached?.lastGuestSnapshot ?? guestSignature);
  }

  async function chooseImport(choice: ImportChoice): Promise<void> {
    if (!pendingImport) return;
    const pending = pendingImport;
    status.value = 'loading';
    try {
      const response = choice === 'merge'
        ? (await ensureAssets(pending.snapshot), await mergeCloudWorkspace(pending.snapshot))
        : pending.response;
      importPreview.value = null;
      pendingImport = null;
      acceptResponse(response, pending.owner, pending.signature);
      if (response.importSummary?.conflicts) notify('Importación con conflictos', `${response.importSummary.conflicts} elemento(s) requieren revisión.`, 'warning');
    } catch (error) {
      status.value = 'error';
      notify('No se pudo importar el espacio', error instanceof Error ? error.message : 'La copia local sigue intacta.', 'warning');
    }
  }

  function activateGuest(snapshot: CloudSnapshot): void {
    workspaceGeneration += 1;
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = undefined;
    owner.value = null;
    active.value = false;
    state = null;
    conflicts.value = [];
    importPreview.value = null;
    pendingImport = null;
    blockedPages.clear();
    stateBlocked = false;
    applySnapshot(snapshot);
    ready.value = true;
    status.value = 'local';
  }

  async function resolveConflict(id: string, choice: 'cloud' | 'local' | 'both'): Promise<void> {
    if (isResolving.value) return;
    isResolving.value = true;
    try {
      const response = await resolveCloudConflict(id, choice);
      const lastGuestSnapshot = state?.lastGuestSnapshot ?? null;
      acceptResponse(response, owner.value!, lastGuestSnapshot);
      notify('Conflicto resuelto', choice === 'both' ? 'Se conservaron las dos versiones.' : 'Se actualizó la versión sincronizada.');
    } catch (error) {
      notify('No se pudo resolver el conflicto', error instanceof Error ? error.message : 'Inténtalo de nuevo.', 'destructive');
    } finally { isResolving.value = false; }
  }

  function retryPending(): void {
    if (active.value && state?.pending) void queueSync(JSON.stringify(currentSnapshot()));
  }

  if (typeof window !== 'undefined') window.addEventListener('online', retryPending);
  onBeforeUnmount(() => {
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    if (typeof window !== 'undefined') window.removeEventListener('online', retryPending);
  });

  return {
    status, active, ready, owner, conflicts, importPreview, isResolving,
    connect, chooseImport, activateGuest, scheduleSync, resolveConflict,
    flush: () => queueSync(JSON.stringify(currentSnapshot())),
  };
}
