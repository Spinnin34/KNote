import { createHash, randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDatabase } from './mongodb.js';
import { authenticatedProfile, cloudError, cloudResponse, isRecord, isResponse, readJson, requireSameOrigin, safeId, safePage, sameJson } from './cloud-http.js';

type StoredPage = { owner: string; pageId: string; page: Record<string, unknown>; revision: number; updatedAt: number };
type WorkspaceStateInput = { todayTasks: unknown[]; preferences: Record<string, unknown>; databaseViewStates: Record<string, unknown> };
type WorkspaceState = WorkspaceStateInput & { owner: string; revision: number; updatedAt: number };
type ConflictDocument = {
  _id: string; owner: string; kind: 'page' | 'state'; pageId: string | null;
  localVersion: unknown; cloudVersion: unknown; cloudRevision: number; fingerprint?: string; createdAt: number; resolvedAt: number | null;
};

function defaultState(owner: string): WorkspaceState {
  return { owner, todayTasks: [], preferences: { glass: 'balanced', width: 'standard', density: 'comfortable' }, databaseViewStates: {}, revision: 0, updatedAt: 0 };
}

function validateState(value: unknown): value is WorkspaceStateInput {
  if (!isRecord(value) || !Array.isArray(value.todayTasks) || value.todayTasks.length > 500
    || !isRecord(value.preferences) || !isRecord(value.databaseViewStates)) return false;
  const validTasks = value.todayTasks.every((task) => isRecord(task)
    && safeId(task.id) && typeof task.title === 'string' && task.title.length <= 500
    && typeof task.group === 'string' && task.group.length <= 180 && typeof task.done === 'boolean');
  const preferences = value.preferences;
  return validTasks
    && ['soft', 'balanced', 'deep'].includes(String(preferences.glass))
    && ['compact', 'standard', 'wide'].includes(String(preferences.width))
    && ['comfortable', 'compact'].includes(String(preferences.density));
}

function stateFields({ todayTasks, preferences, databaseViewStates }: WorkspaceStateInput): WorkspaceStateInput {
  return { todayTasks, preferences, databaseViewStates };
}

async function writeConflict(
  conflicts: Collection<ConflictDocument>,
  input: Omit<ConflictDocument, '_id' | 'createdAt' | 'resolvedAt'>,
): Promise<string> {
  const fingerprint = createHash('sha256').update(JSON.stringify([
    input.owner, input.kind, input.pageId, input.cloudRevision, input.localVersion, input.cloudVersion,
  ])).digest('hex');
  const conflictId = randomUUID();
  try {
    await conflicts.updateOne(
      { fingerprint },
      { $setOnInsert: { ...input, _id: conflictId, fingerprint, createdAt: Date.now(), resolvedAt: null } },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  return (await conflicts.findOne({ fingerprint }))?._id ?? conflictId;
}

async function pageConflictResponse(
  conflicts: Collection<ConflictDocument>,
  owner: string,
  pageId: string,
  localVersion: unknown,
  current: StoredPage | null,
): Promise<Response> {
  const conflictId = await writeConflict(conflicts, {
    owner, kind: 'page', pageId, localVersion,
    cloudVersion: current?.page ?? null, cloudRevision: current?.revision ?? 0,
  });
  return cloudResponse({
    error: 'La página cambió en otro dispositivo.', conflictId,
    cloudVersion: current?.page ?? null, cloudRevision: current?.revision ?? 0,
  }, 409);
}

async function stateConflictResponse(
  conflicts: Collection<ConflictDocument>,
  owner: string,
  localVersion: unknown,
  current: WorkspaceState | null,
): Promise<Response> {
  const conflictId = await writeConflict(conflicts, {
    owner, kind: 'state', pageId: null, localVersion,
    cloudVersion: current ? { todayTasks: current.todayTasks, preferences: current.preferences, databaseViewStates: current.databaseViewStates } : null,
    cloudRevision: current?.revision ?? 0,
  });
  return cloudResponse({ error: 'El espacio cambió en otro dispositivo.', conflictId, cloudRevision: current?.revision ?? 0 }, 409);
}

async function workspacePayload(owner: string) {
  const db = await getDatabase();
  const [storedPages, state, conflicts] = await Promise.all([
    db.collection<StoredPage>('pages').find({ owner }).sort({ updatedAt: -1 }).toArray(),
    db.collection<WorkspaceState>('user_state').findOne({ owner }),
    db.collection<ConflictDocument>('conflicts').find({ owner, resolvedAt: null }).sort({ createdAt: -1 }).limit(50).toArray(),
  ]);
  const currentState = state ?? defaultState(owner);
  return {
    snapshot: {
      pages: storedPages.map((document) => document.page),
      todayTasks: currentState.todayTasks,
      preferences: currentState.preferences,
      databaseViewStates: currentState.databaseViewStates,
    },
    revisions: Object.fromEntries(storedPages.map((document) => [document.pageId, document.revision])),
    stateRevision: currentState.revision,
    conflicts: conflicts.map(({ _id, kind, pageId, localVersion, cloudVersion, createdAt }) => ({
      id: _id, kind, pageId, localVersion, cloudVersion, createdAt,
    })),
  };
}

export async function getWorkspace(request: Request): Promise<Response> {
  if (request.method !== 'GET') return cloudError('Método no permitido.', 405);
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  try { return cloudResponse(await workspacePayload(profile.subject)); }
  catch (error) {
    console.error('[KNote cloud] Workspace read failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return cloudError('No se pudo cargar el espacio en la nube.', 503);
  }
}

export async function savePage(request: Request, pageId: string): Promise<Response> {
  if (request.method !== 'PUT') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!isRecord(body) || !safePage(body.page) || body.page.id !== pageId
    || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) return cloudError('La página o su revisión no son válidas.', 400);

  const db = await getDatabase();
  const pages = db.collection<StoredPage>('pages');
  const conflicts = db.collection<ConflictDocument>('conflicts');
  const current = await pages.findOne({ owner: profile.subject, pageId });
  const expectedRevision = Number(body.revision);
  if ((current?.revision ?? 0) !== expectedRevision) {
    if (current && sameJson(current.page, body.page)) return cloudResponse({ revision: current.revision, unchanged: true });
    return pageConflictResponse(conflicts, profile.subject, pageId, body.page, current);
  }

  const now = Date.now();
  try {
    if (!current) await pages.insertOne({ owner: profile.subject, pageId, page: body.page, revision: 1, updatedAt: now });
    else {
      const result = await pages.updateOne({ owner: profile.subject, pageId, revision: expectedRevision }, { $set: { page: body.page, revision: expectedRevision + 1, updatedAt: now } });
      if (result.matchedCount === 0) {
        const latest = await pages.findOne({ owner: profile.subject, pageId });
        if (latest && sameJson(latest.page, body.page)) return cloudResponse({ revision: latest.revision, unchanged: true });
        return pageConflictResponse(conflicts, profile.subject, pageId, body.page, latest);
      }
    }
    return cloudResponse({ revision: current ? expectedRevision + 1 : 1 });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const latest = await pages.findOne({ owner: profile.subject, pageId });
    if (latest && sameJson(latest.page, body.page)) return cloudResponse({ revision: latest.revision, unchanged: true });
    return pageConflictResponse(conflicts, profile.subject, pageId, body.page, latest);
  }
}

export async function deletePage(request: Request, pageId: string): Promise<Response> {
  if (request.method !== 'DELETE') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!isRecord(body) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) return cloudError('La revisión no es válida.', 400);
  const db = await getDatabase();
  const pages = db.collection<StoredPage>('pages');
  const current = await pages.findOne({ owner: profile.subject, pageId });
  if (!current) {
    await db.collection('shares').updateOne({ owner: profile.subject, pageId, revokedAt: { $exists: false } }, { $set: { revokedAt: Date.now() } });
    return cloudResponse({ deleted: true });
  }
  if (current.revision !== Number(body.revision)) {
    const conflictId = await writeConflict(db.collection<ConflictDocument>('conflicts'), {
      owner: profile.subject, kind: 'page', pageId, localVersion: null,
      cloudVersion: current.page, cloudRevision: current.revision,
    });
    return cloudResponse({ error: 'La página cambió en otro dispositivo.', conflictId, cloudVersion: current.page, cloudRevision: current.revision }, 409);
  }
  const result = await pages.deleteOne({ owner: profile.subject, pageId, revision: current.revision });
  if (result.deletedCount === 0) {
    const latest = await pages.findOne({ owner: profile.subject, pageId });
    if (!latest) {
      await db.collection('shares').updateOne({ owner: profile.subject, pageId, revokedAt: { $exists: false } }, { $set: { revokedAt: Date.now() } });
      return cloudResponse({ deleted: true });
    }
    return pageConflictResponse(db.collection<ConflictDocument>('conflicts'), profile.subject, pageId, null, latest);
  }
  await db.collection('shares').updateOne({ owner: profile.subject, pageId, revokedAt: { $exists: false } }, { $set: { revokedAt: Date.now() } });
  return cloudResponse({ deleted: true });
}

export async function saveWorkspaceState(request: Request): Promise<Response> {
  if (request.method !== 'PUT') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!isRecord(body) || !validateState(body.state) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) return cloudError('El estado del espacio o su revisión no son válidos.', 400);
  const submittedState = stateFields(body.state);
  const db = await getDatabase();
  const states = db.collection<WorkspaceState>('user_state');
  const current = await states.findOne({ owner: profile.subject });
  const expectedRevision = Number(body.revision);
  if ((current?.revision ?? 0) !== expectedRevision) {
    if (current && sameJson(stateFields(current), submittedState)) {
      return cloudResponse({ revision: current.revision, unchanged: true });
    }
    return stateConflictResponse(db.collection<ConflictDocument>('conflicts'), profile.subject, submittedState, current);
  }
  const now = Date.now();
  try {
    if (!current) await states.insertOne({ owner: profile.subject, ...submittedState, revision: 1, updatedAt: now });
    else {
      const result = await states.updateOne({ owner: profile.subject, revision: expectedRevision }, { $set: { ...submittedState, revision: expectedRevision + 1, updatedAt: now } });
      if (result.matchedCount === 0) {
        const latest = await states.findOne({ owner: profile.subject });
        if (latest && sameJson(stateFields(latest), submittedState)) return cloudResponse({ revision: latest.revision, unchanged: true });
        return stateConflictResponse(db.collection<ConflictDocument>('conflicts'), profile.subject, submittedState, latest);
      }
    }
    return cloudResponse({ revision: current ? expectedRevision + 1 : 1 });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const latest = await states.findOne({ owner: profile.subject });
    if (latest && sameJson(stateFields(latest), submittedState)) return cloudResponse({ revision: latest.revision, unchanged: true });
    return stateConflictResponse(db.collection<ConflictDocument>('conflicts'), profile.subject, submittedState, latest);
  }
}

export async function mergeLocalWorkspace(request: Request): Promise<Response> {
  if (request.method !== 'POST') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!isRecord(body) || !isRecord(body.snapshot) || !Array.isArray(body.snapshot.pages)
    || body.snapshot.pages.length > 20_000 || !body.snapshot.pages.every(safePage)) return cloudError('La copia local no tiene un formato válido.', 400);
  const stateInput = {
    todayTasks: body.snapshot.todayTasks,
    preferences: body.snapshot.preferences,
    databaseViewStates: body.snapshot.databaseViewStates,
  } as WorkspaceStateInput;
  const includeState = body.includeState !== false;
  if (includeState && !validateState(stateInput)) return cloudError('El estado local no tiene un formato válido.', 400);
  const db = await getDatabase();
  const pages = db.collection<StoredPage>('pages');
  const conflicts = db.collection<ConflictDocument>('conflicts');
  const importedPages = body.snapshot.pages as Record<string, unknown>[];
  const cloudPages = importedPages.length
    ? await pages.find({ owner: profile.subject, pageId: { $in: importedPages.map((page) => page.id as string) } }).toArray()
    : [];
  const cloudById = new Map(cloudPages.map((document) => [document.pageId, document]));
  let imported = 0;
  let unchanged = 0;
  let conflictCount = 0;
  for (const page of importedPages) {
    const current = cloudById.get(page.id as string);
    if (!current) {
      try {
        await pages.insertOne({ owner: profile.subject, pageId: page.id as string, page, revision: 1, updatedAt: Date.now() });
        imported += 1;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const latest = await pages.findOne({ owner: profile.subject, pageId: page.id as string });
        if (latest && sameJson(latest.page, page)) unchanged += 1;
        else {
          await pageConflictResponse(conflicts, profile.subject, page.id as string, page, latest);
          conflictCount += 1;
        }
      }
    } else if (sameJson(current.page, page)) unchanged += 1;
    else {
      await writeConflict(conflicts, { owner: profile.subject, kind: 'page', pageId: page.id as string, localVersion: page, cloudVersion: current.page, cloudRevision: current.revision });
      conflictCount += 1;
    }
  }
  if (!includeState) return cloudResponse({ importSummary: { imported, unchanged, conflicts: conflictCount } });
  const states = db.collection<WorkspaceState>('user_state');
  let currentState = await states.findOne({ owner: profile.subject });
  let mergedState = false;
  for (let attempt = 0; attempt < 5 && !mergedState; attempt += 1) {
    if (!currentState) {
      try {
        await states.insertOne({ owner: profile.subject, ...stateInput, revision: 1, updatedAt: Date.now() });
        mergedState = true;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        currentState = await states.findOne({ owner: profile.subject });
      }
      continue;
    }
    const tasks = new Map(currentState.todayTasks.filter(isRecord).map((task) => [String(task.id), task]));
    let stateConflict = !sameJson(stateInput.preferences, currentState.preferences);
    for (const task of stateInput.todayTasks) {
      if (!isRecord(task)) continue;
      const previous = tasks.get(String(task.id));
      if (!previous) tasks.set(String(task.id), task);
      else if (!sameJson(previous, task)) stateConflict = true;
    }
    const views = { ...stateInput.databaseViewStates, ...currentState.databaseViewStates };
    const mergedValues: WorkspaceStateInput = { todayTasks: [...tasks.values()], preferences: currentState.preferences, databaseViewStates: views };
    for (const [viewId, localView] of Object.entries(stateInput.databaseViewStates)) {
      if (Object.hasOwn(currentState.databaseViewStates, viewId) && !sameJson(currentState.databaseViewStates[viewId], localView)) stateConflict = true;
    }
    const result = await states.updateOne({ owner: profile.subject, revision: currentState.revision }, { $set: { ...mergedValues, revision: currentState.revision + 1, updatedAt: Date.now() } });
    if (result.matchedCount) {
      mergedState = true;
      if (stateConflict) {
        await writeConflict(conflicts, { owner: profile.subject, kind: 'state', pageId: null, localVersion: stateInput, cloudVersion: { todayTasks: currentState.todayTasks, preferences: currentState.preferences, databaseViewStates: currentState.databaseViewStates }, cloudRevision: currentState.revision });
        conflictCount += 1;
      }
    } else currentState = await states.findOne({ owner: profile.subject });
  }
  if (!mergedState) return cloudError('El espacio cambió durante la importación. Vuelve a intentar la fusión.', 409);
  return cloudResponse({ ...(await workspacePayload(profile.subject)), importSummary: { imported, unchanged, conflicts: conflictCount } });
}

export async function resolveConflict(request: Request, conflictId: string): Promise<Response> {
  if (request.method !== 'POST') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!isRecord(body) || !['cloud', 'local', 'both'].includes(String(body.choice))) return cloudError('Elige qué versión conservar.', 400);
  const db = await getDatabase();
  const conflicts = db.collection<ConflictDocument>('conflicts');
  const conflict = await conflicts.findOne({ _id: conflictId, owner: profile.subject, resolvedAt: null });
  if (!conflict) return cloudError('El conflicto ya no está disponible.', 404);
  const choice = body.choice as 'cloud' | 'local' | 'both';
  let localVersion = conflict.localVersion;
  if (choice !== 'cloud' && Object.hasOwn(body, 'localVersion')) {
    const submitted = body.localVersion;
    const valid = conflict.kind === 'page'
      ? submitted === null || (safePage(submitted) && submitted.id === conflict.pageId)
      : validateState(submitted);
    if (!valid) return cloudError('La versión local no corresponde al conflicto.', 400);
    localVersion = submitted;
  }

  if (conflict.kind === 'page' && conflict.pageId) {
    const pages = db.collection<StoredPage>('pages');
    const current = await pages.findOne({ owner: profile.subject, pageId: conflict.pageId });
    if (choice === 'local' && (current?.revision ?? 0) !== conflict.cloudRevision
      && !sameJson(current?.page ?? null, localVersion)) {
      return pageConflictResponse(conflicts, profile.subject, conflict.pageId, localVersion, current);
    }
    if (choice !== 'cloud') {
      const localPage = localVersion;
      if (localPage === null && choice === 'local') {
        if (current) {
          const deleted = await pages.deleteOne({ owner: profile.subject, pageId: conflict.pageId, revision: current.revision });
          if (!deleted.deletedCount) {
            const latest = await pages.findOne({ owner: profile.subject, pageId: conflict.pageId });
            if (latest) return pageConflictResponse(conflicts, profile.subject, conflict.pageId, null, latest);
          }
        }
        await db.collection('shares').updateOne({ owner: profile.subject, pageId: conflict.pageId, revokedAt: { $exists: false } }, { $set: { revokedAt: Date.now() } });
      } else if (safePage(localPage)) {
        const selectedPage = choice === 'both' ? { ...localPage, id: `c-${conflict._id}` } : localPage;
        const pageId = String(selectedPage.id);
        const target = choice === 'both' ? await pages.findOne({ owner: profile.subject, pageId }) : current;
        if (!target || !sameJson(target.page, selectedPage)) {
          if (target) {
            const result = await pages.updateOne({ owner: profile.subject, pageId, revision: target.revision }, {
              $set: { page: selectedPage, revision: target.revision + 1, updatedAt: Date.now() },
            });
            if (!result.matchedCount) {
              const latest = await pages.findOne({ owner: profile.subject, pageId });
              if (latest && sameJson(latest.page, selectedPage)) { /* A retried resolution already applied. */ }
              else return pageConflictResponse(conflicts, profile.subject, pageId, selectedPage, latest);
            }
          } else {
            try {
              await pages.insertOne({ owner: profile.subject, pageId, page: selectedPage, revision: 1, updatedAt: Date.now() });
            } catch (error) {
              if ((error as { code?: number }).code !== 11000) throw error;
              const latest = await pages.findOne({ owner: profile.subject, pageId });
              if (!latest || !sameJson(latest.page, selectedPage)) return pageConflictResponse(conflicts, profile.subject, pageId, selectedPage, latest);
            }
          }
        }
      }
    }
  } else if (conflict.kind === 'state' && choice !== 'cloud') {
    const states = db.collection<WorkspaceState>('user_state');
    const stored = await states.findOne({ owner: profile.subject });
    const current = stored ?? defaultState(profile.subject);
    const local = validateState(localVersion) ? stateFields(localVersion) : null;
    if (local) {
      const currentData = { todayTasks: current.todayTasks, preferences: current.preferences, databaseViewStates: current.databaseViewStates };
      if (choice === 'local' && current.revision !== conflict.cloudRevision && !sameJson(currentData, local)) {
        return stateConflictResponse(conflicts, profile.subject, local, stored);
      }
      let selected = local;
      if (choice === 'both') {
        const cloud = currentData;
        const tasks = new Map<unknown, unknown>();
        for (const task of Array.isArray(cloud.todayTasks) ? cloud.todayTasks : []) if (isRecord(task)) tasks.set(task.id, task);
        for (const task of Array.isArray(local.todayTasks) ? local.todayTasks : []) if (isRecord(task)) {
          if (!tasks.has(task.id)) tasks.set(task.id, task);
          else if (!sameJson(tasks.get(task.id), task)) {
            const duplicateId = `c-${createHash('sha256').update(`${conflict._id}:${String(task.id)}`).digest('hex').slice(0, 24)}`;
            tasks.set(duplicateId, { ...task, id: duplicateId });
          }
        }
        selected = {
          todayTasks: [...tasks.values()],
          preferences: cloud.preferences,
          databaseViewStates: { ...(isRecord(local.databaseViewStates) ? local.databaseViewStates : {}), ...(isRecord(cloud.databaseViewStates) ? cloud.databaseViewStates : {}) },
        };
      }
      if (!sameJson(currentData, selected)) {
        if (!stored) {
          try { await states.insertOne({ owner: profile.subject, ...selected, revision: 1, updatedAt: Date.now() }); }
          catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
            const latest = await states.findOne({ owner: profile.subject });
            if (!latest || !sameJson({ todayTasks: latest.todayTasks, preferences: latest.preferences, databaseViewStates: latest.databaseViewStates }, selected)) {
              return stateConflictResponse(conflicts, profile.subject, selected, latest);
            }
          }
        } else {
          const result = await states.updateOne({ owner: profile.subject, revision: current.revision }, { $set: { ...selected, revision: current.revision + 1, updatedAt: Date.now() } });
          if (!result.matchedCount) {
            const latest = await states.findOne({ owner: profile.subject });
            if (!latest || !sameJson({ todayTasks: latest.todayTasks, preferences: latest.preferences, databaseViewStates: latest.databaseViewStates }, selected)) {
              return stateConflictResponse(conflicts, profile.subject, selected, latest);
            }
          }
        }
      }
    }
  }
  await conflicts.updateOne({ _id: conflictId, owner: profile.subject }, { $set: { resolvedAt: Date.now() }, $unset: { fingerprint: '' } });
  return cloudResponse(await workspacePayload(profile.subject));
}

export async function handleWorkspaceRoute(request: Request, path: string): Promise<Response | null> {
  const parts = path.split('/').filter(Boolean);
  if (path === '/api/workspace' && request.method === 'GET') return getWorkspace(request);
  if (path === '/api/workspace/state' && request.method === 'PUT') return saveWorkspaceState(request);
  if (path === '/api/workspace/import' && request.method === 'POST') return mergeLocalWorkspace(request);
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'workspace' && parts[2] === 'pages') {
    const pageId = decodeURIComponent(parts[3]);
    if (!safeId(pageId)) return cloudError('Identificador de página no válido.', 400);
    if (request.method === 'PUT') return savePage(request, pageId);
    if (request.method === 'DELETE') return deletePage(request, pageId);
  }
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'conflicts' && parts[2]) return resolveConflict(request, parts[2]);
  return null;
}
