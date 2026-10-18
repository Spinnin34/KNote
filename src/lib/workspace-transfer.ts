import type { WorkspaceSnapshot } from '@/lib/desktop-vault';

const TRANSFER_FORMAT = 'knote-encrypted-transfer';
const TRANSFER_VERSION = 1;
const KDF_ITERATIONS = 600_000;
export const MAX_TRANSFER_FILE_BYTES = 64 * 1024 * 1024;

export interface TransferAssetInput {
  id: string;
  blob: Blob;
}

export interface PreparedWorkspaceTransfer {
  snapshot: WorkspaceSnapshot;
  assets: Array<{ id: string; blob: Blob }>;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(value: unknown, maximumBytes: number): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(maximumBytes * 4 / 3) + 8) {
    throw new Error('El archivo de transferencia contiene datos demasiado grandes.');
  }
  let binary: string;
  try { binary = atob(value); }
  catch { throw new Error('El archivo de transferencia está dañado.'); }
  if (binary.length > maximumBytes) throw new Error('El archivo de transferencia contiene datos demasiado grandes.');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveTransferKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function transferAad(): Uint8Array {
  return new TextEncoder().encode(`${TRANSFER_FORMAT}:${TRANSFER_VERSION}`);
}

export async function createEncryptedTransfer(
  snapshot: WorkspaceSnapshot,
  assets: readonly TransferAssetInput[],
  password: string,
): Promise<Blob> {
  const estimatedBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength
    + assets.reduce((total, asset) => total + asset.blob.size, 0);
  if (estimatedBytes > 32 * 1024 * 1024) {
    throw new Error('El espacio de trabajo es demasiado grande para una transferencia de 64 MB.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveTransferKey(password, salt);
  const payload = {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    snapshot,
    assets: [],
  };
  for (const { id, blob } of assets) {
    payload.assets.push({ id, type: blob.type || 'application/octet-stream', data: toBase64(new Uint8Array(await blob.arrayBuffer())) });
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: transferAad() }, key, plaintext);
  const envelope = {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  return new Blob([JSON.stringify(envelope)], { type: 'application/vnd.knote.transfer+json' });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function readEncryptedTransfer(file: File, password: string): Promise<PreparedWorkspaceTransfer> {
  if (file.size <= 0 || file.size > MAX_TRANSFER_FILE_BYTES) {
    throw new Error('El archivo debe ocupar menos de 64 MB.');
  }
  let envelope: unknown;
  try { envelope = JSON.parse(await file.text()); }
  catch { throw new Error('No se pudo leer el archivo. Elige una transferencia de KNote.'); }
  if (!isRecord(envelope)
    || envelope.format !== TRANSFER_FORMAT
    || envelope.version !== TRANSFER_VERSION
    || envelope.kdf !== 'PBKDF2-SHA256'
    || envelope.iterations !== KDF_ITERATIONS) {
    throw new Error('El formato del archivo no es compatible.');
  }

  const salt = fromBase64(envelope.salt, 16);
  const iv = fromBase64(envelope.iv, 12);
  const ciphertext = fromBase64(envelope.ciphertext, MAX_TRANSFER_FILE_BYTES);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('El archivo de transferencia está dañado.');
  let plaintext: ArrayBuffer;
  try {
    const key = await deriveTransferKey(password, salt);
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: transferAad() }, key, ciphertext);
  } catch { throw new Error('La contraseña no es correcta o el archivo está dañado.'); }

  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(plaintext)); }
  catch { throw new Error('El contenido descifrado no es válido.'); }
  if (!isRecord(payload) || payload.format !== TRANSFER_FORMAT || payload.version !== TRANSFER_VERSION
    || !isRecord(payload.snapshot) || !Array.isArray(payload.snapshot.pages)
    || !Array.isArray(payload.snapshot.todayTasks) || !isRecord(payload.snapshot.preferences)
    || !isRecord(payload.snapshot.databaseViewStates) || !Array.isArray(payload.assets)) {
    throw new Error('La transferencia no contiene un espacio de trabajo de KNote válido.');
  }

  const assets: PreparedWorkspaceTransfer['assets'] = [];
  let totalAssetBytes = 0;
  for (const item of payload.assets) {
    if (!isRecord(item) || typeof item.id !== 'string' || !/^[\da-f-]{20,}$/i.test(item.id)
      || typeof item.type !== 'string' || !/^image\/(?:png|jpeg|webp|gif|avif)$/i.test(item.type)) {
      throw new Error('La transferencia contiene una imagen no válida.');
    }
    const bytes = fromBase64(item.data, MAX_TRANSFER_FILE_BYTES);
    totalAssetBytes += bytes.length;
    if (totalAssetBytes > MAX_TRANSFER_FILE_BYTES) throw new Error('La transferencia de imágenes supera el límite permitido.');
    assets.push({ id: item.id, blob: new Blob([bytes.buffer as ArrayBuffer], { type: item.type }) });
  }

  return { snapshot: payload.snapshot as WorkspaceSnapshot, assets };
}
