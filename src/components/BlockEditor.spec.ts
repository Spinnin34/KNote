import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import BlockEditor from './BlockEditor.vue';

it('converts a selected list item into a table and preserves both list segments on save', async () => {
  const wrapper = mount(BlockEditor, {
    attachTo: document.body,
    props: {
      pageId: 'list-conversion',
      modelValue: 'knote-rich-v1:<ol start="5"><li>Antes</li><li>Fila</li><li>Después</li></ol>',
    },
  });
  try {
    const editor = wrapper.get<HTMLElement>('.knote-block-editor');
    editor.element.focus();
    const range = document.createRange();
    range.selectNodeContents(editor.get('li:nth-child(2)').element);
    vi.spyOn(range, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 180, 50, 20));
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    const formatTrigger = 'button[aria-label="Más formatos de texto"]';
    await vi.waitFor(() => expect(wrapper.find(formatTrigger).exists()).toBe(true));
    await wrapper.get(formatTrigger).trigger('click');
    const tableOption = wrapper.findAll('[role="option"]').find((option) => option.text() === 'Tabla');
    expect(tableOption).toBeDefined();
    await tableOption?.trigger('click');

    expect(editor.findAll(':scope > ol').map((list) => [list.attributes('start'), list.text()]))
      .toEqual([['5', 'Antes'], ['7', 'Después']]);
    expect(editor.get(':scope > .knote-table-block [data-table-row="0"][data-table-column="0"]').text()).toBe('Fila');
    const saved = wrapper.emitted<[string]>('update:modelValue')?.at(-1)?.[0];
    expect(saved).toMatch(/<ol start="5"><li>Antes<\/li><\/ol><div class="knote-table-block"/);
    expect(saved).toMatch(/<\/div><ol start="7"><li>Después<\/li><\/ol>$/);
  } finally {
    wrapper.unmount();
  }
});
