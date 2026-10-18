export function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? 'page-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
