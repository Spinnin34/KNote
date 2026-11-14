import { handleAuthRequest } from './karmancos-auth.js';
import { handleCloudRequest } from './cloud-router.js';

function supportedMethods(path: string): readonly string[] | null {
  switch (path) {
    case '/api/workspace': return ['GET'];
    case '/api/workspace/state': return ['PUT'];
    case '/api/workspace/import': return ['POST'];
    case '/api/assets/check':
    case '/api/assets/register':
    case '/api/assets/upload': return ['POST'];
  }

  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'api') return null;
  if (parts.length === 4 && parts[1] === 'workspace' && parts[2] === 'pages') return ['PUT', 'DELETE'];
  if (parts.length === 3 && parts[1] === 'conflicts') return ['POST'];
  if (parts.length === 3 && parts[1] === 'shares') return ['GET', 'POST', 'DELETE'];
  if (parts.length === 3 && parts[1] === 'public') return ['GET'];
  if (parts.length === 5 && parts[1] === 'public' && parts[3] === 'assets') return ['GET'];
  if (parts.length === 3 && parts[1] === 'assets') return ['GET', 'HEAD'];
  return null;
}

function methodNotAllowed(methods: readonly string[]): Response {
  return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
    status: 405,
    headers: {
      Allow: methods.join(', '),
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function dispatchApiRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/auth/') || path.startsWith('/auth/')) return handleAuthRequest(request, path);

  const methods = supportedMethods(path);
  if (methods && !methods.includes(request.method)) return methodNotAllowed(methods);
  return handleCloudRequest(request, path);
}

export const GET = dispatchApiRequest;
export const HEAD = dispatchApiRequest;
export const POST = dispatchApiRequest;
export const PUT = dispatchApiRequest;
export const DELETE = dispatchApiRequest;
