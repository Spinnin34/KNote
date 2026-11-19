import { expect, it, vi } from 'vitest';
import { getShare } from '../../server/cloud-sharing';

const findOne = vi.hoisted(() => vi.fn());

vi.mock('../../server/mongodb.js', () => ({
  getDatabase: async () => ({ collection: () => ({ findOne }) }),
}));

vi.mock('../../server/cloud-http.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../server/cloud-http')>(),
  authenticatedProfile: () => ({ subject: 'owner' }),
}));

it('reports an active share even when its encrypted link cannot be recovered', async () => {
  findOne.mockResolvedValueOnce({ encryptedToken: 'invalid' });
  const response = await getShare(new Request('https://knote.test/api/shares/doc'), 'doc');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ published: true, url: null });
  expect(findOne).toHaveBeenCalledWith({ owner: 'owner', pageId: 'doc', revokedAt: { $exists: false } });
});
