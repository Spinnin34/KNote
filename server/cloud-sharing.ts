import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { get, head } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getDatabase } from './mongodb.js';
import { authenticatedProfile, cloudError, cloudResponse, isRecord, isResponse, readJson, requireSameOrigin, safeId } from './cloud-http.js';

type ShareDocument = {
  owner: string; pageId: string; tokenHash: string; encryptedToken: string;
  createdAt: number; updatedAt: number; revokedAt?: number;
};
type AssetDocument = { owner: string; assetId: string; pathname: string; contentType: string; size: number; createdAt: number };

function privateToken(): string {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? '';
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function shareKey(): Buffer {
  const secret = process.env.KNOTE_SESSION_SECRET?.trim() ?? '';
  if (secret.length < 32) throw new Error('KNOTE_SESSION_SECRET is not configured.');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.from('knote-share-v1'), Buffer.from('share-token'), 32));
}

function encryptShareToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', shareKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

function decryptShareToken(envelope: string): string | null {
  try {
    const payload = Buffer.from(envelope, 'base64url');
    if (payload.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', shareKey(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
  } catch { return null; }
}

function assetIdIsValid(value: unknown): value is string {
  return typeof value === 'string' && /^[\da-f-]{20,64}$/i.test(value);
}

function jsonBody(body: unknown): string {
  return JSON.stringify(body);
}

function jsonHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export async function getShare(request: Request, pageId: string): Promise<Response> {
  if (request.method !== 'GET') return cloudError('Método no permitido.', 405);
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  try {
    const shares = (await getDatabase()).collection<ShareDocument>('shares');
    const share = await shares.findOne({ owner: profile.subject, pageId, revokedAt: { $exists: false } });
    const token = share ? decryptShareToken(share.encryptedToken) : null;
    return cloudResponse({ published: Boolean(share), url: token ? `${new URL(request.url).origin}/p/${token}` : null });
  } catch (error) {
    console.error('[KNote cloud] Share read failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return cloudError('No se pudo consultar el estado de publicación.', 503);
  }
}

export async function publishPage(request: Request, pageId: string): Promise<Response> {
  if (request.method !== 'POST') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  try {
    const db = await getDatabase();
    const document = await db.collection<{ owner: string; pageId: string; page: Record<string, unknown> }>('pages').findOne({ owner: profile.subject, pageId });
    if (!document) return cloudError('La página ya no existe en la nube.', 404);
    if (document.page.type !== 'doc') return cloudError('Solo se pueden publicar documentos.', 400);
    const shares = db.collection<ShareDocument>('shares');
    const existing = await shares.findOne({ owner: profile.subject, pageId, revokedAt: { $exists: false } });
    let token = existing ? decryptShareToken(existing.encryptedToken) : null;
    if (!token) token = randomBytes(32).toString('base64url');
    const now = Date.now();
    await shares.updateOne({ owner: profile.subject, pageId }, {
      $set: { tokenHash: tokenHash(token), encryptedToken: encryptShareToken(token), updatedAt: now },
      $setOnInsert: { owner: profile.subject, pageId, createdAt: now },
      $unset: { revokedAt: '' },
    }, { upsert: true });
    return cloudResponse({ published: true, url: `${new URL(request.url).origin}/p/${token}` });
  } catch (error) {
    console.error('[KNote cloud] Publish failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return cloudError('No se pudo publicar el documento.', 503);
  }
}

export async function unpublishPage(request: Request, pageId: string): Promise<Response> {
  if (request.method !== 'DELETE') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  try {
    await (await getDatabase()).collection<ShareDocument>('shares').updateOne(
      { owner: profile.subject, pageId, revokedAt: { $exists: false } },
      { $set: { revokedAt: Date.now() } },
    );
    return cloudResponse({ published: false });
  } catch (error) {
    console.error('[KNote cloud] Unpublish failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return cloudError('No se pudo poner el documento en privado.', 503);
  }
}

export async function getPublicPage(_request: Request, token: string): Promise<Response> {
  if (!/^[\da-zA-Z_-]{40,64}$/.test(token)) return cloudError('Documento no disponible.', 404);
  try {
    const db = await getDatabase();
    const share = await db.collection<ShareDocument>('shares').findOne({ tokenHash: tokenHash(token), revokedAt: { $exists: false } });
    if (!share) return cloudError('Documento no disponible.', 404);
    const document = await db.collection<{ owner: string; pageId: string; page: Record<string, unknown> }>('pages').findOne({ owner: share.owner, pageId: share.pageId });
    if (!document || document.page.type !== 'doc') return cloudError('Documento no disponible.', 404);
    return new Response(jsonBody({ title: document.page.title, content: document.page.content, banner: document.page.banner ?? null }), { headers: jsonHeaders() });
  } catch (error) {
    console.error('[KNote cloud] Public page read failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return cloudError('No se pudo cargar el documento publicado.', 503);
  }
}

async function streamPrivateAsset(request: Request, asset: AssetDocument, headersExtra?: HeadersInit): Promise<Response> {
  if (!privateToken()) return cloudError('El almacenamiento de imágenes no está configurado.', 503);
  try {
    const result = await get(asset.pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) return cloudError('Imagen no disponible.', 404);
    const headers = new Headers({
      'Content-Type': asset.contentType,
      'Content-Length': String(asset.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Referrer-Policy': 'no-referrer',
    });
    new Headers(headersExtra).forEach((value, name) => headers.set(name, value));
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    return new Response(result.stream, { status: 200, headers });
  } catch {
    return cloudError('Imagen no disponible.', 404);
  }
}

export async function getPrivateAsset(request: Request, assetId: string): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return cloudError('Método no permitido.', 405);
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  if (!assetIdIsValid(assetId)) return cloudError('Imagen no disponible.', 404);
  try {
    const asset = await (await getDatabase()).collection<AssetDocument>('assets').findOne({ owner: profile.subject, assetId });
    if (!asset) return cloudError('Imagen no disponible.', 404);
    return streamPrivateAsset(request, asset);
  } catch (error) {
    console.error('[KNote cloud] Asset read failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return cloudError('No se pudo cargar la imagen.', 503);
  }
}

export async function getPublicAsset(_request: Request, token: string, assetId: string): Promise<Response> {
  if (!/^[\da-zA-Z_-]{40,64}$/.test(token) || !assetIdIsValid(assetId)) return cloudError('Imagen no disponible.', 404);
  try {
    const db = await getDatabase();
    const share = await db.collection<ShareDocument>('shares').findOne({ tokenHash: tokenHash(token), revokedAt: { $exists: false } });
    if (!share) return cloudError('Imagen no disponible.', 404);
    const [asset, page] = await Promise.all([
      db.collection<AssetDocument>('assets').findOne({ owner: share.owner, assetId }),
      db.collection<{ owner: string; pageId: string; page: Record<string, unknown> }>('pages').findOne({ owner: share.owner, pageId: share.pageId }),
    ]);
    if (!asset || !page || page.page.type !== 'doc') return cloudError('Imagen no disponible.', 404);
    const referenced = page.page.banner === `knote-asset:${assetId}`
      || typeof page.page.content === 'string' && page.page.content.includes(`data-asset-id="${assetId}"`);
    if (!referenced) return cloudError('Imagen no disponible.', 404);
    return streamPrivateAsset(_request, asset, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  } catch (error) {
    console.error('[KNote cloud] Public asset read failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return cloudError('No se pudo cargar la imagen.', 503);
  }
}

export async function checkAssets(request: Request): Promise<Response> {
  if (request.method !== 'POST') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!isRecord(body) || !Array.isArray(body.ids) || body.ids.length > 500 || !body.ids.every(assetIdIsValid)) return cloudError('La lista de imágenes no es válida.', 400);
  const assets = await (await getDatabase()).collection<AssetDocument>('assets').find({ owner: profile.subject, assetId: { $in: body.ids as string[] } }, { projection: { assetId: 1 } }).toArray();
  return cloudResponse({ existing: assets.map((asset) => asset.assetId) });
}

export async function registerAsset(request: Request): Promise<Response> {
  if (request.method !== 'POST') return cloudError('Método no permitido.', 405);
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const profile = authenticatedProfile(request);
  if (isResponse(profile)) return profile;
  if (!privateToken()) return cloudError('El almacenamiento de imágenes no está configurado.', 503);
  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!isRecord(body) || !assetIdIsValid(body.assetId) || typeof body.pathname !== 'string') return cloudError('La imagen no es válida.', 400);
  if (!new RegExp(`^knote/${body.assetId}\\.(?:png|jpe?g|webp|gif)$`, 'i').test(body.pathname) || body.pathname.includes('..')) return cloudError('La ruta de imagen no está permitida.', 403);
  try {
    const metadata = await head(body.pathname);
    if (metadata.size <= 0 || metadata.size > 12 * 1024 * 1024 || !/^image\/(?:png|jpeg|webp|gif)$/.test(metadata.contentType)) return cloudError('La imagen no cumple los límites permitidos.', 400);
    const asset = await (await getDatabase()).collection<AssetDocument>('assets').findOne({ owner: profile.subject, assetId: body.assetId });
    if (!asset || asset.pathname !== body.pathname) return cloudError('No puedes vincular una imagen que no hayas subido con esta cuenta.', 403);
    const updated = await (await getDatabase()).collection<AssetDocument>('assets').updateOne(
      { owner: profile.subject, assetId: body.assetId, pathname: body.pathname },
      { $set: { contentType: metadata.contentType, size: metadata.size } },
    );
    if (!updated.matchedCount) return cloudError('La imagen cambió durante la verificación. Vuelve a intentarlo.', 409);
    return cloudResponse({ registered: true });
  } catch {
    return cloudError('No se encontró la imagen subida. Vuelve a intentarlo.', 404);
  }
}

export async function handleAssetUpload(request: Request): Promise<Response> {
  if (request.method !== 'POST') return cloudError('Método no permitido.', 405);
  if (!privateToken()) return cloudError('El almacenamiento de imágenes no está configurado.', 503);
  let body: HandleUploadBody;
  try { body = await request.json() as HandleUploadBody; }
  catch { return cloudError('La petición no contiene JSON válido.', 400); }

  let profile: ReturnType<typeof authenticatedProfile> | null = null;
  if (body.type === 'blob.generate-client-token') {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    profile = authenticatedProfile(request);
    if (isResponse(profile)) return profile;
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (!profile || isResponse(profile)) throw new Error('Inicia sesión para subir imágenes.');
        let payload: unknown;
        try { payload = clientPayload ? JSON.parse(clientPayload) as unknown : null; }
        catch { throw new Error('La carga de imagen no es válida.'); }
        if (!isRecord(payload) || !assetIdIsValid(payload.assetId)) throw new Error('La carga de imagen no es válida.');
        const id = payload.assetId;
        const foreignAsset = await (await getDatabase()).collection<AssetDocument>('assets').findOne({ assetId: id, owner: { $ne: profile.subject } });
        if (foreignAsset) throw new Error('El identificador de imagen ya pertenece a otra cuenta.');
        if (!new RegExp(`^knote/${id}\\.(?:png|jpe?g|webp|gif)$`, 'i').test(pathname)) throw new Error('La ruta de imagen no está permitida.');
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 12 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: jsonBody({ owner: profile.subject, assetId: id }),
          cacheControlMaxAge: 0,
          ...(multipart ? {} : {}),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: unknown;
        try { payload = tokenPayload ? JSON.parse(tokenPayload) as unknown : null; }
        catch { throw new Error('La carga terminada no tiene una identidad válida.'); }
        if (!isRecord(payload) || typeof payload.owner !== 'string' || !assetIdIsValid(payload.assetId)) throw new Error('La carga terminada no tiene una identidad válida.');
        const expectedPrefix = `knote/${payload.assetId}.`;
        if (!blob.pathname.startsWith(expectedPrefix) || !/^image\/(?:png|jpeg|webp|gif)$/.test(blob.contentType)) throw new Error('La imagen terminada no cumple los requisitos.');
        const metadata = await head(blob.pathname);
        if (metadata.size > 12 * 1024 * 1024) throw new Error('La imagen supera el límite de 12 MB.');
        await (await getDatabase()).collection<AssetDocument>('assets').updateOne(
          { owner: payload.owner, assetId: payload.assetId },
          { $set: { pathname: blob.pathname, contentType: blob.contentType, size: metadata.size }, $setOnInsert: { owner: payload.owner, assetId: payload.assetId, createdAt: Date.now() } },
          { upsert: true },
        );
      },
    });
    return new Response(JSON.stringify(result), { headers: jsonHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo preparar la imagen.';
    return cloudError(message, 400);
  }
}

export async function handleSharingRoute(request: Request, path: string): Promise<Response | null> {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'shares' && parts.length === 3 && safeId(parts[2])) {
    if (request.method === 'GET') return getShare(request, parts[2]);
    if (request.method === 'POST') return publishPage(request, parts[2]);
    if (request.method === 'DELETE') return unpublishPage(request, parts[2]);
  }
  if (parts[0] === 'api' && parts[1] === 'public' && parts.length === 3) return getPublicPage(request, parts[2]);
  if (parts[0] === 'api' && parts[1] === 'public' && parts.length === 5 && parts[3] === 'assets') return getPublicAsset(request, parts[2], parts[4]);
  if (path === '/api/assets/upload') return handleAssetUpload(request);
  if (path === '/api/assets/check') return checkAssets(request);
  if (path === '/api/assets/register') return registerAsset(request);
  if (parts[0] === 'api' && parts[1] === 'assets' && parts.length === 3) return getPrivateAsset(request, parts[2]);
  return null;
}
