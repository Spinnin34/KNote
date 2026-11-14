import { getAuthenticatedProfile, type KarmancosProfile } from './karmancos-auth.js';

export const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;

export function cloudResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Content-Type': 'application/json; charset=utf-8',
  });
  new Headers(extraHeaders).forEach((value, name) => headers.set(name, value));
  return new Response(JSON.stringify(body), { status, headers });
}

export function cloudError(message: string, status: number): Response {
  return cloudResponse({ error: message }, status);
}

export function authenticatedProfile(request: Request): KarmancosProfile | Response {
  const profile = getAuthenticatedProfile(request);
  return profile ?? cloudError('Inicia sesión para continuar.', 401);
}

export function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return cloudError('Origen no permitido.', 403);
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return cloudError('Origen no permitido.', 403);
  return null;
}

export async function readJson(request: Request): Promise<unknown | Response> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_JSON_BODY_BYTES) return cloudError('La petición supera el tamaño permitido.', 413);
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) return cloudError('La petición supera el tamaño permitido.', 413);
    return text ? JSON.parse(text) as unknown : {};
  } catch {
    return cloudError('La petición no contiene JSON válido.', 400);
  }
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function safeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[\da-z_-]+$/i.test(value);
}

export function safePage(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const allowedTypes = new Set(['doc', 'folder', 'code', 'board', 'database', 'calendar', 'tasks']);
  return safeId(value.id)
    && typeof value.title === 'string' && value.title.length <= 500
    && typeof value.content === 'string' && value.content.length <= 2_000_000
    && allowedTypes.has(String(value.type))
    && (value.parentId === null || safeId(value.parentId))
    && Array.isArray(value.entries) && value.entries.length <= 10_000
    && typeof value.createdAt === 'number' && Number.isSafeInteger(value.createdAt)
    && typeof value.updatedAt === 'number' && Number.isSafeInteger(value.updatedAt);
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function subjectKey(subject: string): string {
  return subject;
}
