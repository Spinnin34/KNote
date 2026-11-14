export interface CloudSnapshot {
  pages: unknown[];
  todayTasks: unknown[];
  preferences: unknown;
  databaseViewStates: Record<string, unknown>;
}

export interface CloudLocalState {
  owner: string;
  snapshot: CloudSnapshot;
  baseSnapshot: CloudSnapshot | null;
  revisions: Record<string, number>;
  stateRevision: number;
  pending: boolean;
  lastGuestSnapshot: string | null;
  updatedAt: number;
}

const DATABASE_NAME = 'knote-cloud-sync';
const STORE_NAME = 'workspaces';
let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la copia local de sincronización.'));
  });
  return database;
}

export async function readCloudLocalState(owner: string): Promise<CloudLocalState | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(owner);
    request.onsuccess = () => resolve((request.result as CloudLocalState | undefined) ?? null);
    request.onerror = () => reject(request.error || new Error('No se pudo leer la copia local.'));
  });
}

export async function listCloudLocalStates(): Promise<CloudLocalState[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as CloudLocalState[]);
    request.onerror = () => reject(request.error || new Error('No se pudieron leer las copias locales de sincronización.'));
  });
}

export async function writeCloudLocalState(value: CloudLocalState): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ ...value, updatedAt: Date.now() }, value.owner);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar la copia local.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se canceló el guardado local.'));
  });
}
