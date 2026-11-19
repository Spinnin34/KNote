import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import PublicPage from './PublicPage.vue';

afterEach(() => vi.unstubAllGlobals());

it('lets readers retry a temporary failure and renders the document when the service recovers', async () => {
  const fetchDocument = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ title: 'Notas compartidas', content: 'Punto de partida', banner: null }));
  vi.stubGlobal('fetch', fetchDocument);
  const page = mount(PublicPage);
  try {
    await flushPromises();
    expect(page.get('[role="alert"]').text()).toContain('No se pudo cargar el documento');

    await page.get('button').trigger('click');
    await flushPromises();
    expect(page.get('article h1').text()).toBe('Notas compartidas');
    expect(page.get('article p').text()).toBe('Punto de partida');
    expect(fetchDocument).toHaveBeenCalledTimes(2);
  } finally {
    page.unmount();
  }
});

it('shows the unavailable-link state for a missing document', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
  const page = mount(PublicPage);
  try {
    await flushPromises();
    expect(page.get('[role="alert"] h1').text()).toBe('Documento no disponible');
    expect(page.get('button').text()).toBe('Abrir KNote');
  } finally {
    page.unmount();
  }
});
