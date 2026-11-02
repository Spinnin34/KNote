import { describe, expect, it } from 'vitest';
import { createEncryptedTransfer, readEncryptedTransfer } from '@/lib/workspace-transfer';
import type { WorkspaceSnapshot } from '@/lib/desktop-vault';

const snapshot: WorkspaceSnapshot = {
  pages: [],
  todayTasks: [],
  preferences: { glass: 'balanced', width: 'standard', density: 'comfortable' },
  databaseViewStates: {},
};

describe('encrypted workspace transfers', () => {
  it('round trips a workspace and its image attachments', async () => {
    const image = new Blob(['image bytes'], { type: 'image/png' });
    const transfer = await createEncryptedTransfer(snapshot, [
      { id: '00000000-0000-0000-0000-000000000001', blob: image },
    ], 'correct horse battery staple');
    const file = new File([transfer], 'workspace.kntx', { type: transfer.type });

    const restored = await readEncryptedTransfer(file, 'correct horse battery staple');

    expect(restored.snapshot).toEqual(snapshot);
    expect(restored.assets).toHaveLength(1);
    expect(restored.assets[0]?.blob.type).toBe('image/png');
    expect(await restored.assets[0]?.blob.text()).toBe('image bytes');
  });

  it('rejects a transfer opened with the wrong password', async () => {
    const transfer = await createEncryptedTransfer(snapshot, [], 'correct horse battery staple');
    const file = new File([transfer], 'workspace.kntx', { type: transfer.type });

    await expect(readEncryptedTransfer(file, 'incorrect password'))
      .rejects.toThrow('La contraseña no es correcta o el archivo está dañado.');
  });
});
