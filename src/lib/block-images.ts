const DATABASE_NAME = 'knote-block-assets';
const STORE_NAME = 'images';
let database: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento de imágenes.'));
  });
  return database;
}

export async function saveBlockImage(file: Blob): Promise<string> {
  const db = await openDatabase();
  const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar la imagen.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se canceló el guardado de la imagen.'));
  });
  return id;
}

export async function deleteBlockImage(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo eliminar la imagen.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se canceló la eliminación de la imagen.'));
  });
}

export async function listBlockImageIds(): Promise<string[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys();
    request.onsuccess = () => resolve(request.result.filter((key): key is string => typeof key === 'string'));
    request.onerror = () => reject(request.error || new Error('No se pudieron revisar las imágenes.'));
  });
}

export async function getBlockImage(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error || new Error('No se pudo leer la imagen.'));
  });
}
