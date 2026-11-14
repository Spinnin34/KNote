import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { listCloudLocalStates, readCloudLocalState, writeCloudLocalState, type CloudLocalState } from '@/lib/cloud-cache';

describe('account-scoped offline cloud cache', () => {
  it('keeps pending account snapshots isolated and durable in IndexedDB', async () => {
    const suffix = crypto.randomUUID();
    const first: CloudLocalState = {
      owner: `account-a-${suffix}`,
      snapshot: { pages: [{ id: 'page_a' }], todayTasks: [], preferences: {}, databaseViewStates: {} },
      baseSnapshot: { pages: [], todayTasks: [], preferences: {}, databaseViewStates: {} },
      revisions: { page_a: 0 }, stateRevision: 0, pending: true, lastGuestSnapshot: null, updatedAt: 1,
    };
    const second: CloudLocalState = {
      ...first,
      owner: `account-b-${suffix}`,
      snapshot: { ...first.snapshot, pages: [{ id: 'page_b' }] },
    };

    await writeCloudLocalState(first);
    await writeCloudLocalState(second);

    expect(await readCloudLocalState(first.owner)).toMatchObject({ owner: first.owner, pending: true, snapshot: { pages: [{ id: 'page_a' }] } });
    expect(await readCloudLocalState(second.owner)).toMatchObject({ owner: second.owner, pending: true, snapshot: { pages: [{ id: 'page_b' }] } });
    expect((await listCloudLocalStates()).map((state) => state.owner)).toEqual(expect.arrayContaining([first.owner, second.owner]));
  });
});
