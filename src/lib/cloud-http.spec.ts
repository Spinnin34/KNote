import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticatedProfile, cloudResponse, requireSameOrigin, safePage } from '../../server/cloud-http.js';

afterEach(() => vi.unstubAllEnvs());

function mutationRequest(headers: Record<string, string> = {}): Request {
  return { url: 'https://knote.test/api/workspace/state', headers: new Headers(headers) } as Request;
}

describe('cloud API security helpers', () => {
  it('rejects missing, foreign, and cross-site mutation origins', () => {
    expect(requireSameOrigin(mutationRequest())).toMatchObject({ status: 403 });
    expect(requireSameOrigin(mutationRequest({ origin: 'https://attacker.test' }))).toMatchObject({ status: 403 });
    expect(requireSameOrigin(mutationRequest({ origin: 'https://knote.test', 'sec-fetch-site': 'cross-site' }))).toMatchObject({ status: 403 });
    expect(requireSameOrigin(mutationRequest({ origin: 'https://knote.test', 'sec-fetch-site': 'same-origin' }))).toBeNull();
  });

  it('requires an authenticated server session and marks cloud responses private', () => {
    vi.stubEnv('KNOTE_SESSION_SECRET', '');
    expect(authenticatedProfile(new Request('https://knote.test/api/workspace'))).toMatchObject({ status: 401 });

    const response = cloudResponse({ ok: true });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('accepts only complete, bounded page records for cloud persistence', () => {
    const page = {
      id: 'page_1', title: 'Nota privada', type: 'doc', parentId: null, content: '<p>Hola</p>',
      entries: [], createdAt: 1, updatedAt: 2,
    };
    expect(safePage(page)).toBe(true);
    expect(safePage({ ...page, type: 'account' })).toBe(false);
    expect(safePage({ ...page, content: 'x'.repeat(2_000_001) })).toBe(false);
  });
});
