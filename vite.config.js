import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

const localAuthVariables = [
  'KARMANCOSID_ISSUER',
  'KARMANCOSID_CLIENT_ID',
  'KARMANCOSID_CLIENT_SECRET',
  'KARMANCOSID_REDIRECT_URI',
  'KNOTE_SESSION_SECRET',
];

function localKarmancosAuth() {
  let handlerModule;

  return {
    name: 'knote-karmancos-auth-local',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const method = request.method ?? 'GET';
        const host = request.headers.host ?? 'localhost:5173';
        const protocol = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const requestUrl = new URL(request.url ?? '/', `${protocol}://${host}`);
        if (!['/auth/login', '/auth/callback', '/auth/session', '/auth/logout'].includes(requestUrl.pathname)) {
          return next();
        }

        try {
          const headers = new Headers();
          for (const headerName of ['cookie', 'origin', 'sec-fetch-site']) {
            const headerValue = request.headers[headerName];
            if (typeof headerValue === 'string') headers.set(headerName, headerValue);
          }

          let body;
          if (method !== 'GET' && method !== 'HEAD') {
            const chunks = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            body = Buffer.concat(chunks);
          }

          const init = { method, headers };
          if (body?.length) {
            init.body = body;
            init.duplex = 'half';
          }
          const webRequest = new Request(requestUrl, init);
          handlerModule ??= await server.ssrLoadModule('/server/karmancos-auth.ts');
          const authResponse = await handlerModule.handleAuthRequest(webRequest, requestUrl.pathname);
          response.statusCode = authResponse.status;
          authResponse.headers.forEach((value, name) => {
            if (name.toLowerCase() !== 'set-cookie') response.setHeader(name, value);
          });
          const cookies = authResponse.headers.getSetCookie?.() ?? [];
          if (cookies.length) response.setHeader('Set-Cookie', cookies);
          else if (authResponse.headers.has('set-cookie')) response.setHeader('Set-Cookie', authResponse.headers.get('set-cookie'));
          response.end(Buffer.from(await authResponse.arrayBuffer()));
        } catch {
          response.statusCode = 500;
          response.setHeader('Cache-Control', 'no-store');
          response.end('No se pudo procesar la solicitud de Karmancos ID.');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const name of localAuthVariables) {
    if (process.env[name] === undefined && env[name] !== undefined) process.env[name] = env[name];
  }

  return {
    plugins: [vue(), tailwindcss(), localKarmancosAuth()],
    server: {
      strictPort: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
