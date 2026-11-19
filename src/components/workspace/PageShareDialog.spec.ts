import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import type { WorkspacePage } from '@/domain/workspace/types';
import { fetchCloudShare } from '@/lib/cloud-workspace-api';
import PageShareDialog from './PageShareDialog.vue';

vi.mock('@/lib/cloud-workspace-api', () => ({
  fetchCloudShare: vi.fn(),
  publishCloudPage: vi.fn(),
  unpublishCloudPage: vi.fn(),
}));

const documentPage: WorkspacePage = {
  id: 'doc-a', title: 'Documento A', type: 'doc', parentId: null, content: '',
  favorite: false, updatedAt: 1, createdAt: 1, entries: [],
};

function openShareDialog() {
  return mount(PageShareDialog, {
    props: { modelValue: true, page: documentPage, signedIn: true, cloudActive: true, saveState: 'saved' },
    global: { stubs: { Modal: { template: '<div><slot /><slot name="footer" /></div>' } } },
  });
}

it('keeps a late response from exposing another document’s link', async () => {
  let resolveFirst!: (share: { published: boolean; url: string | null }) => void;
  vi.mocked(fetchCloudShare)
    .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
    .mockResolvedValueOnce({ published: false, url: null });
  const dialog = openShareDialog();
  try {
    await dialog.setProps({ page: { ...documentPage, id: 'doc-b', title: 'Documento B' } });
    resolveFirst({ published: true, url: 'https://example.test/p/old-link' });
    await flushPromises();

    expect(dialog.text()).toContain('Privado');
    expect(dialog.text()).toContain('Documento B');
    expect(dialog.find('a').exists()).toBe(false);
  } finally { dialog.unmount(); }
});

it('does not label a document private when its sharing status is unavailable', async () => {
  vi.mocked(fetchCloudShare)
    .mockRejectedValueOnce(new Error('Servicio no disponible'))
    .mockResolvedValueOnce({ published: true, url: 'https://example.test/p/current-link' });
  const dialog = openShareDialog();
  try {
    await flushPromises();
    expect(dialog.text()).toContain('Sin comprobar');
    expect(dialog.get('[role="alert"]').text()).toContain('Servicio no disponible');
    expect(dialog.get('button').text()).toContain('Volver a comprobar');

    await dialog.get('button').trigger('click');
    await flushPromises();
    expect(dialog.get('a').attributes('href')).toBe('https://example.test/p/current-link');
  } finally { dialog.unmount(); }
});

it('allows revoking an active share whose link cannot be recovered', async () => {
  vi.mocked(fetchCloudShare).mockResolvedValueOnce({ published: true, url: null });
  const dialog = openShareDialog();
  try {
    await flushPromises();
    expect(dialog.text()).toContain('Publicado');
    expect(dialog.get('button').text()).toBe('Poner en privado');
    expect(dialog.find('a').exists()).toBe(false);
  } finally { dialog.unmount(); }
});
