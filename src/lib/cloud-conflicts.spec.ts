import { beforeEach, expect, it, vi } from 'vitest';
import { resolveConflict, saveWorkspaceState } from '../../server/cloud-workspace';

const mongo = vi.hoisted(() => ({
  conflict: vi.fn(),
  page: vi.fn(),
  state: vi.fn(),
  updateConflict: vi.fn(),
  updatePage: vi.fn(),
  updateState: vi.fn(),
}));

vi.mock('../../server/mongodb.js', () => ({
  getDatabase: async () => ({
    collection(name: string) {
      const cursor = { sort: () => cursor, limit: () => cursor, toArray: async () => [] };
      if (name === 'pages') return { findOne: mongo.page, updateOne: mongo.updatePage, find: () => cursor };
      if (name === 'conflicts') return { findOne: mongo.conflict, updateOne: mongo.updateConflict, find: () => cursor };
      if (name === 'user_state') return { findOne: mongo.state, updateOne: mongo.updateState };
      throw new Error(`Unexpected collection: ${name}`);
    },
  }),
}));

vi.mock('../../server/cloud-http.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../server/cloud-http')>(),
  authenticatedProfile: () => ({ subject: 'account' }),
}));

const origin = 'https://knote.test';
const page = { id: 'page', title: 'Documento', type: 'doc', parentId: null, content: 'Original', createdAt: 1, updatedAt: 1, entries: [] };
const sharedState = {
  todayTasks: [],
  preferences: { glass: 'balanced', width: 'standard', density: 'comfortable' },
  databaseViewStates: {},
};

function request(path: string, method: 'POST' | 'PUT', body: object) {
  return {
    url: origin + path, method, headers: new Headers({ origin, 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
  } as Request;
}

beforeEach(() => {
  mongo.conflict.mockReset().mockResolvedValue({
    _id: 'conflict', owner: 'account', kind: 'page', pageId: 'page', cloudRevision: 4,
    localVersion: { ...page, content: 'Borrador anterior' },
  });
  mongo.page.mockReset().mockResolvedValue({ owner: 'account', pageId: 'page', page, revision: 4 });
  mongo.state.mockReset().mockResolvedValue({ ...sharedState, owner: 'account', revision: 2 });
  mongo.updatePage.mockReset().mockResolvedValue({ matchedCount: 1 });
  mongo.updateState.mockReset().mockResolvedValue({ matchedCount: 1 });
  mongo.updateConflict.mockReset().mockResolvedValue({ matchedCount: 1 });
});

it('uses the explicitly submitted draft against the conflict’s remote revision', async () => {
  const latest = { ...page, content: 'Última edición' };
  const response = await resolveConflict(request('/api/conflicts/conflict', 'POST', { choice: 'local', localVersion: latest }), 'conflict');

  expect(response.status).toBe(200);
  expect(mongo.updatePage).toHaveBeenCalledWith(
    { owner: 'account', pageId: 'page', revision: 4 },
    { $set: { page: latest, revision: 5, updatedAt: expect.any(Number) } },
  );
});

it('rejects a draft for a different page before performing any write', async () => {
  const response = await resolveConflict(request('/api/conflicts/conflict', 'POST', {
    choice: 'local', localVersion: { ...page, id: 'another-page' },
  }), 'conflict');

  expect(response.status).toBe(400);
  expect(mongo.updatePage).not.toHaveBeenCalled();
  expect(mongo.updateConflict).not.toHaveBeenCalled();
});

it('writes only workspace settings during a save and during conflict resolution', async () => {
  const submitted = { ...sharedState, preferences: { ...sharedState.preferences, width: 'wide' } };
  const saved = await saveWorkspaceState(request('/api/workspace/state', 'PUT', {
    revision: 2, state: { ...submitted, owner: 'unexpected', extra: 'ignored' },
  }));
  expect(saved.status).toBe(200);
  expect(mongo.updateState).toHaveBeenLastCalledWith(
    { owner: 'account', revision: 2 }, { $set: { ...submitted, revision: 3, updatedAt: expect.any(Number) } },
  );

  mongo.conflict.mockResolvedValueOnce({
    _id: 'conflict', owner: 'account', kind: 'state', pageId: null, cloudRevision: 2, localVersion: sharedState,
  });
  const resolved = await resolveConflict(request('/api/conflicts/conflict', 'POST', {
    choice: 'local', localVersion: { ...submitted, owner: 'unexpected', extra: 'ignored' },
  }), 'conflict');
  expect(resolved.status).toBe(200);
  expect(mongo.updateState).toHaveBeenLastCalledWith(
    { owner: 'account', revision: 2 }, { $set: { ...submitted, revision: 3, updatedAt: expect.any(Number) } },
  );
});
