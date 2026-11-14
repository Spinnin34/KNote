import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeCloudWorkspace } from '@/lib/cloud-workspace-api';
import type { CloudSnapshot } from '@/lib/cloud-cache';

afterEach(() => vi.unstubAllGlobals());

describe('cloud workspace import batching', () => {
  it('splits large page collections and sends shared state once at the end', async () => {
    const requests: { body: string; url: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? '{}');
      requests.push({ url, body });
      const parsed = JSON.parse(body) as { snapshot: { pages: unknown[] }; includeState?: boolean };
      if (!parsed.includeState) {
        return new Response(JSON.stringify({ importSummary: { imported: parsed.snapshot.pages.length, unchanged: 0, conflicts: 0 } }));
      }
      return new Response(JSON.stringify({
        snapshot: { pages: [], todayTasks: [], preferences: {}, databaseViewStates: {} },
        revisions: {}, stateRevision: 1, conflicts: [],
      }));
    }));

    const snapshot: CloudSnapshot = {
      pages: [
        { id: 'page_one', content: 'a'.repeat(1_800_000) },
        { id: 'page_two', content: 'b'.repeat(1_800_000) },
      ],
      todayTasks: [],
      preferences: { glass: 'balanced', width: 'standard', density: 'comfortable' },
      databaseViewStates: {},
    };

    const result = await mergeCloudWorkspace(snapshot);

    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.url === '/api/workspace/import')).toBe(true);
    expect(requests.slice(0, 2).every((request) => new TextEncoder().encode(request.body).byteLength < 3_400_000)).toBe(true);
    expect(requests.slice(0, 2).map((request) => JSON.parse(request.body).snapshot.pages)).toEqual([
      [snapshot.pages[0]], [snapshot.pages[1]],
    ]);
    expect(JSON.parse(requests[2]!.body)).toMatchObject({ includeState: true, snapshot: { pages: [] } });
    expect(result.snapshot.pages).toEqual([]);
    expect(result.importSummary).toEqual({ imported: 2, unchanged: 0, conflicts: 0 });
  });

  it('rejects a single page larger than the server request budget before sending it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(mergeCloudWorkspace({
      pages: [{ id: 'too_large', content: 'x'.repeat(3_400_000) }],
      todayTasks: [], preferences: {}, databaseViewStates: {},
    })).rejects.toThrow('Una página supera el tamaño permitido');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
