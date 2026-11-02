import { computed, readonly, ref, shallowRef } from 'vue';
import { isDesktopRuntime } from '@/lib/desktop-vault';

export interface KarmancosProfile {
  subject: string;
  username: string | null;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
  picture: string | null;
}

type AuthStatus = 'loading' | 'ready' | 'signing-in' | 'signed-in' | 'signed-out' | 'unconfigured';

interface SessionResponse {
  configured?: boolean;
  profile?: unknown;
}

const configured = ref(false);
const status = ref<AuthStatus>('loading');
const profile = shallowRef<KarmancosProfile | null>(null);
const errorMessage = ref('');
const isBusy = computed(() => status.value === 'loading' || status.value === 'signing-in');

let initialization: Promise<void> | null = null;

function textClaim(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : null;
}

function profileFromResponse(value: unknown): KarmancosProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const claims = value as Record<string, unknown>;
  const subject = textClaim(claims.subject);
  if (!subject) return null;

  let picture: string | null = null;
  const candidate = textClaim(claims.picture);
  if (candidate) {
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:') picture = url.href;
    } catch {
      // An invalid image URL does not prevent the account profile from loading.
    }
  }

  return {
    subject,
    username: textClaim(claims.username),
    givenName: textClaim(claims.givenName),
    familyName: textClaim(claims.familyName),
    fullName: textClaim(claims.fullName),
    picture,
  };
}

function consumeAuthError(): void {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('authError');
  if (!code) return;

  const messages: Record<string, string> = {
    configuration: 'El inicio de sesión todavía no está configurado en el servidor.',
    provider: 'Karmancos ID rechazó el inicio de sesión. Comprueba que la URL de retorno esté registrada exactamente para este cliente.',
    state: 'No se pudo validar el retorno de Karmancos ID. Vuelve a iniciar sesión.',
    callback: 'No se pudo validar tu cuenta con Karmancos ID. Vuelve a iniciar sesión.',
  };
  errorMessage.value = messages[code] ?? messages.provider;
  url.searchParams.delete('authError');
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}

async function initialize(): Promise<void> {
  if (isDesktopRuntime()) {
    configured.value = false;
    status.value = 'unconfigured';
    return;
  }
  if (initialization) return initialization;

  initialization = (async () => {
    consumeAuthError();
    try {
      const response = await fetch('/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('No se pudo consultar la sesión.');
      const session = await response.json() as SessionResponse;
      configured.value = session.configured === true;
      profile.value = profileFromResponse(session.profile);
      status.value = profile.value ? 'signed-in' : configured.value ? 'ready' : 'unconfigured';
    } catch {
      profile.value = null;
      configured.value = false;
      status.value = 'signed-out';
      errorMessage.value = 'No se pudo comprobar la sesión de Karmancos ID. Vuelve a intentarlo.';
    }
  })();
  return initialization;
}

function signIn(): void {
  errorMessage.value = '';
  if (!configured.value) {
    status.value = 'unconfigured';
    errorMessage.value = 'El inicio de sesión todavía no está configurado en el servidor.';
    return;
  }

  status.value = 'signing-in';
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`/auth/login?returnTo=${encodeURIComponent(returnTo || '/')}`);
}

async function signOut(): Promise<void> {
  if (isDesktopRuntime()) return;
  errorMessage.value = '';
  try {
    const response = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) throw new Error('No se pudo cerrar la sesión.');
    profile.value = null;
    status.value = configured.value ? 'signed-out' : 'unconfigured';
  } catch {
    errorMessage.value = 'No se pudo cerrar la sesión de KNote. Inténtalo de nuevo.';
  }
}

export function useKarmancosAuth() {
  return {
    configured: readonly(configured),
    status: readonly(status),
    isBusy: readonly(isBusy),
    profile: readonly(profile),
    errorMessage: readonly(errorMessage),
    initialize,
    signIn,
    signOut,
  };
}
