import { onBeforeUnmount, ref, type Ref } from 'vue';
import type { ToastItem } from '@/components/ui/ToastViewport.vue';
import type { DatabaseViewState, TodayTask, WorkspacePage, WorkspacePreferences } from '@/domain/workspace/types';
import { getBlockImage } from '@/lib/block-images';
import { readCloudLocalState, writeCloudLocalState, type CloudLocalState, type CloudSnapshot } from '@/lib/cloud-cache';
import {
  checkCloudAssets, CloudConflictError, CloudRequestError, deleteCloudPage, fetchCloudWorkspace, mergeCloudWorkspace,
  putCloudPage, putCloudState, resolveCloudConflict, uploadCloudAsset,
  type CloudConflict, type CloudWorkspaceResponse,
} from '@/lib/cloud-workspace-api';
import { isDesktopRuntime } from '@/lib/desktop-vault';

type ImportChoice = 'merge' | 'cloud';
type CloudStatus = 'local' | 'loading' | 'synced' | 'syncing' | 'pending' | 'conflict' | 'error';
export type CloudSaveResult = 'synced' | 'pending' | 'retry' | 'conflict';

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

function workspaceFields({ todayTasks, preferences, databaseViewStates }: CloudSnapshot) {
  return { todayTasks, preferences, databaseViewStates };
}

function preservePendingChanges(
  previous: CloudLocalState, submitted: CloudSnapshot, local: CloudSnapshot,
  response: CloudWorkspaceResponse, resolved: CloudConflict,
): CloudLocalState {
  const remote = response.snapshot;
  const previousBase = previous.baseSnapshot ?? remote;
  const basePages = pageMap(previousBase);
  const localPages = pageMap(local);
  const resolvedPageId = resolved.kind === 'page' ? resolved.pageId : null;
  const submittedPage = resolvedPageId ? pageMap(submitted).get(resolvedPageId) : undefined;
  const remotePages = pageMap(remote);
  const snapshotPages = new Map(remotePages);
  const comparisonPages = new Map(remotePages);
  const revisions = { ...response.revisions };
  let pendingPages = false;

  const pageIds = new Set([...basePages.keys(), ...localPages.keys()]);
  if (resolvedPageId) pageIds.add(resolvedPageId);
  for (const id of pageIds) {
    // The choice applies to the version at submission. An edit made afterwards is still pending.
    const basePage = id === resolvedPageId ? submittedPage : basePages.get(id);
    const localPage = localPages.get(id);
    if (JSON.stringify(localPage) === JSON.stringify(basePage)
      || JSON.stringify(localPage) === JSON.stringify(remotePages.get(id))) continue;

    pendingPages = true;
    if (localPage) snapshotPages.set(id, localPage);
    else snapshotPages.delete(id);
    // Keep the revision the edit was made against. A remote edit must still produce a conflict.
    if (basePage) comparisonPages.set(id, basePage);
    else comparisonPages.delete(id);
    if (previous.revisions[id] !== undefined) revisions[id] = previous.revisions[id];
    else delete revisions[id];
  }

  const localFields = workspaceFields(local);
  const remoteFields = workspaceFields(remote);
  const baseFields = workspaceFields(resolved.kind === 'state' ? submitted : previousBase);
  const pendingState = JSON.stringify(localFields) !== JSON.stringify(baseFields)
    && JSON.stringify(localFields) !== JSON.stringify(remoteFields);

  return {
    ...previous,
    snapshot: { pages: [...snapshotPages.values()], ...(pendingState ? localFields : remoteFields) },
    baseSnapshot: { pages: [...comparisonPages.values()], ...(pendingState ? baseFields : remoteFields) },
    revisions,
    stateRevision: pendingState ? previous.stateRevision : response.stateRevision,
    pending: pendingPages || pendingState || response.conflicts.length > 0,
    updatedAt: Date.now(),
  };
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
  let blockedPages = new Set<string>();
  let stateBlocked = false;

  function updateConflicts(items: CloudConflict[]): void {
    conflicts.value = items;
    blockedPages = new Set(items.flatMap((item) => item.kind === 'page' && item.pageId ? [item.pageId] : []));
    stateBlocked = items.some((item) => item.kind === 'state');
  }

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

  async function queueSync(serializedSnapshot: string): Promise<CloudSaveResult> {
    if (!owner.value || !state) return 'synced';
    const generation = workspaceGeneration;
    const snapshot = JSON.parse(serializedSnapshot) as CloudSnapshot;
    const localSave = saveStateLocally(true).then(
      () => ({ saved: true } as const),
      (error: unknown) => ({ saved: false, error } as const),
    );
    const operation = async (): Promise<CloudSaveResult> => {
      const local = await localSave;
      if (generation !== workspaceGeneration || !state) return 'pending';
      if (!local.saved) {
        status.value = 'error';
        throw local.error;
      }
      if (!navigator.onLine) {
        status.value = 'pending';
        return 'pending';
      }
      const alreadyPending = status.value === 'pending';
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
          updateConflicts(initial.conflicts);
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
            if (generation !== workspaceGeneration) return 'pending';
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
            if (generation !== workspaceGeneration) return 'pending';
            if (error instanceof CloudConflictError) blockedPages.add(pageId);
            else throw error;
          }
        }

        const previousState = workspaceFields(base);
        if (generation !== workspaceGeneration) return 'pending';
        const nextState = workspaceFields(snapshot);
        if (!stateBlocked && JSON.stringify(previousState) !== JSON.stringify(nextState)) {
          try {
            const result = await putCloudState(nextState, state.stateRevision);
            if (generation !== workspaceGeneration) return 'pending';
            state.stateRevision = result.revision;
            state.baseSnapshot = { ...state.baseSnapshot!, ...nextState };
            await writeCloudLocalState(state);
          } catch (error) {
            if (generation !== workspaceGeneration) return 'pending';
            if (error instanceof CloudConflictError) stateBlocked = true;
            else throw error;
          }
        }

        if (generation !== workspaceGeneration) return 'pending';
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
          // Refresh the work list without rebasing unacknowledged local edits onto unrelated remote changes.
          updateConflicts(remote.conflicts);
          const stillBlocked = blockedPages.size > 0 || stateBlocked;
          status.value = stillBlocked ? 'conflict' : 'pending';
          await saveStateLocally(true);
          return stillBlocked ? 'conflict' : 'retry';
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
        if (!alreadyPending) notify(
          'Sincronización pendiente',
          error instanceof Error ? error.message : 'Los cambios están en este dispositivo.',
          'warning',
        );
        return error instanceof CloudRequestError && error.retryable ? 'retry' : 'pending';
      }
    };

    let result: CloudSaveResult = 'pending';
    const next = syncQueue.catch(() => undefined).then(async () => { result = await operation(); });
    syncQueue = next;
    await next;
    return result;
  }

  function acceptResponse(response: CloudWorkspaceResponse, accountOwner: string, lastGuestSnapshot: string | null, pending = false): void {
    workspaceGeneration += 1;
    owner.value = accountOwner;
    active.value = true;
    updateConflicts(response.conflicts);
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
    owner.value = null;
    active.value = false;
    state = null;
    updateConflicts([]);
    importPreview.value = null;
    pendingImport = null;
    applySnapshot(snapshot);
    ready.value = true;
    status.value = 'local';
  }

  async function resolveConflict(id: string, choice: 'cloud' | 'local' | 'both'): Promise<boolean> {
    if (isResolving.value || !active.value || !owner.value) return false;
    const generation = workspaceGeneration;
    isResolving.value = true;

    const resolution = syncQueue.catch(() => undefined).then(async () => {
      const conflict = conflicts.value.find((item) => item.id === id);
      if (!conflict || !state || generation !== workspaceGeneration) return false;
      await saveStateLocally(true);
      if (generation !== workspaceGeneration || !state) return false;
      const previous = state;
      const local = cloneSnapshot(currentSnapshot());
      let localVersion: unknown;
      if (choice !== 'cloud' && previous.baseSnapshot) {
        if (conflict.kind === 'page' && conflict.pageId) {
          const currentPage = pageMap(local).get(conflict.pageId);
          const basePage = pageMap(previous.baseSnapshot).get(conflict.pageId);
          if (JSON.stringify(currentPage) !== JSON.stringify(basePage)) {
            if (currentPage) await ensureAssets({ ...local, pages: [currentPage] });
            localVersion = currentPage ?? null;
          }
        } else if (conflict.kind === 'state') {
          const currentFields = workspaceFields(local);
          if (JSON.stringify(currentFields) !== JSON.stringify(workspaceFields(previous.baseSnapshot))) {
            localVersion = currentFields;
          }
        }
      }
      if (generation !== workspaceGeneration) return false;
      const response = await resolveCloudConflict(id, choice, localVersion);
      if (generation !== workspaceGeneration) return false;

      const next = preservePendingChanges(previous, local, cloneSnapshot(currentSnapshot()), response, conflict);
      const resolvedGeneration = ++workspaceGeneration;
      state = next;
      updateConflicts(response.conflicts);
      applySnapshot(cloneSnapshot(next.snapshot));
      status.value = response.conflicts.length ? 'conflict' : next.pending ? 'pending' : 'synced';
      await writeCloudLocalState(next).catch(() => {
        if (resolvedGeneration === workspaceGeneration) {
          notify('No se guardó la copia local', 'Mantén abierta esta pestaña y reintenta el guardado.', 'warning');
        }
      });
      if (resolvedGeneration !== workspaceGeneration) return false;
      notify('Conflicto resuelto', choice === 'both' ? 'Se conservaron las dos versiones.' : 'Se aplicó la versión elegida.');
      return true;
    });
    syncQueue = resolution.then(() => undefined, () => undefined);

    try {
      return await resolution;
    } catch (error) {
      if (generation === workspaceGeneration) {
        notify('No se pudo resolver el conflicto', error instanceof Error ? error.message : 'Inténtalo de nuevo.', 'destructive');
      }
      return false;
    } finally { isResolving.value = false; }
  }

  onBeforeUnmount(() => { workspaceGeneration += 1; });

  return {
    status, active, ready, owner, conflicts, importPreview, isResolving,
    connect, chooseImport, activateGuest, resolveConflict,
    flush: (serializedSnapshot = JSON.stringify(currentSnapshot())) => queueSync(serializedSnapshot),
  };
}
