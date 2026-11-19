import { upload } from '@vercel/blob/client';
import type { WorkspacePage } from '@/domain/workspace/types';
import type { CloudSnapshot } from '@/lib/cloud-cache';

export interface CloudConflict {
  id: string;
  kind: 'page' | 'state';
  pageId: string | null;
  localVersion: unknown;
  cloudVersion: unknown;
  createdAt: number;
}

export interface CloudWorkspaceResponse {
  snapshot: CloudSnapshot;
  revisions: Record<string, number>;
  stateRevision: number;
  conflicts: CloudConflict[];
  importSummary?: { imported: number; unchanged: number; conflicts: number };
}

export class CloudConflictError extends Error {
  conflictId: string;

  constructor(message: string, conflictId: string) {
    super(message);
    this.name = 'CloudConflictError';
    this.conflictId = conflictId;
  }
}

export class CloudRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CloudRequestError';
  }

  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  }).catch(() => { throw new CloudRequestError('No se pudo conectar con KNote.', 0); });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status === 409 && typeof payload.conflictId === 'string') {
    throw new CloudConflictError(typeof payload.error === 'string' ? payload.error : 'Se detectó un conflicto.', payload.conflictId);
  }
  if (!response.ok) throw new CloudRequestError(
    typeof payload.error === 'string' ? payload.error : 'No se pudo sincronizar con la nube.',
    response.status,
  );
  return payload as T;
}

export function fetchCloudWorkspace(): Promise<CloudWorkspaceResponse> {
  return requestJson('/api/workspace');
}

export function mergeCloudWorkspace(snapshot: CloudSnapshot): Promise<CloudWorkspaceResponse> {
  return mergeLargeCloudWorkspace(snapshot);
}

const IMPORT_BATCH_LIMIT = 3_400_000;

async function mergeLargeCloudWorkspace(snapshot: CloudSnapshot): Promise<CloudWorkspaceResponse> {
  const batches: unknown[][] = [];
  let batch: unknown[] = [];
  let batchBytes = 2;
  for (const page of snapshot.pages) {
    const pageBytes = new TextEncoder().encode(JSON.stringify(page)).byteLength;
    if (pageBytes + 96 > IMPORT_BATCH_LIMIT) throw new Error('Una página supera el tamaño permitido para importarla de forma segura.');
    if (batch.length && batchBytes + pageBytes + 1 > IMPORT_BATCH_LIMIT - 96) {
      batches.push(batch);
      batch = [];
      batchBytes = 2;
    }
    batchBytes += pageBytes + (batch.length ? 1 : 0);
    batch.push(page);
  }
  if (batch.length) batches.push(batch);

  let imported = 0;
  let unchanged = 0;
  let conflicts = 0;
  for (const pages of batches) {
    const body = JSON.stringify({ snapshot: { pages }, includeState: false });
    if (new TextEncoder().encode(body).byteLength > IMPORT_BATCH_LIMIT) throw new Error('El lote de páginas supera el tamaño permitido.');
    const result = await requestJson<{ importSummary: { imported: number; unchanged: number; conflicts: number } }>(
      '/api/workspace/import', { method: 'POST', body },
    );
    imported += result.importSummary.imported;
    unchanged += result.importSummary.unchanged;
    conflicts += result.importSummary.conflicts;
  }

  const body = JSON.stringify({
    snapshot: {
      pages: [], todayTasks: snapshot.todayTasks, preferences: snapshot.preferences,
      databaseViewStates: snapshot.databaseViewStates,
    },
    includeState: true,
  });
  if (new TextEncoder().encode(body).byteLength > IMPORT_BATCH_LIMIT) throw new Error('El estado del espacio supera el tamaño permitido para importarlo.');
  const result = await requestJson<CloudWorkspaceResponse>('/api/workspace/import', { method: 'POST', body });
  const stateSummary = result.importSummary ?? { imported: 0, unchanged: 0, conflicts: 0 };
  return {
    ...result,
    importSummary: {
      imported: imported + stateSummary.imported,
      unchanged: unchanged + stateSummary.unchanged,
      conflicts: conflicts + stateSummary.conflicts,
    },
  };
}

export function putCloudPage(page: WorkspacePage, revision: number): Promise<{ revision: number }> {
  return requestJson(`/api/workspace/pages/${encodeURIComponent(page.id)}`, {
    method: 'PUT', body: JSON.stringify({ page, revision }),
  });
}

export function deleteCloudPage(pageId: string, revision: number): Promise<{ deleted: true }> {
  return requestJson(`/api/workspace/pages/${encodeURIComponent(pageId)}`, {
    method: 'DELETE', body: JSON.stringify({ revision }),
  });
}

export function putCloudState(state: Pick<CloudSnapshot, 'todayTasks' | 'preferences' | 'databaseViewStates'>, revision: number): Promise<{ revision: number }> {
  return requestJson('/api/workspace/state', { method: 'PUT', body: JSON.stringify({ state, revision }) });
}

export function resolveCloudConflict(id: string, choice: 'cloud' | 'local' | 'both', localVersion?: unknown): Promise<CloudWorkspaceResponse> {
  return requestJson(`/api/conflicts/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ choice, localVersion }),
  });
}

export function publishCloudPage(pageId: string): Promise<{ published: true; url: string }> {
  return requestJson(`/api/shares/${encodeURIComponent(pageId)}`, { method: 'POST', body: '{}' });
}

export function fetchCloudShare(pageId: string): Promise<{ published: boolean; url: string | null }> {
  return requestJson(`/api/shares/${encodeURIComponent(pageId)}`);
}

export function unpublishCloudPage(pageId: string): Promise<{ published: false }> {
  return requestJson(`/api/shares/${encodeURIComponent(pageId)}`, { method: 'DELETE', body: '{}' });
}

function imageExtension(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/gif') return 'gif';
  return 'webp';
}

export async function checkCloudAssets(ids: string[]): Promise<Set<string>> {
  const payload = await requestJson<{ existing: string[] }>('/api/assets/check', {
    method: 'POST', body: JSON.stringify({ ids }),
  });
  return new Set(payload.existing);
}

export async function uploadCloudAsset(assetId: string, blob: Blob): Promise<void> {
  const pathname = `knote/${assetId}.${imageExtension(blob.type)}`;
  const result = await upload(pathname, blob, {
    access: 'private',
    handleUploadUrl: '/api/assets/upload',
    clientPayload: JSON.stringify({ assetId }),
    contentType: blob.type,
    multipart: blob.size > 4 * 1024 * 1024,
  });
  await requestJson('/api/assets/register', {
    method: 'POST', body: JSON.stringify({ assetId, pathname: result.pathname }),
  });
}
