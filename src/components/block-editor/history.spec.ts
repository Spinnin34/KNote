import { describe, expect, it } from 'vitest';
import { createDocumentHistory } from './history';

describe('document history', () => {
  it('groups continuous typing and keeps structural changes separate', () => {
    const history = createDocumentHistory('Inicial');
    const selection = { anchor: { path: [0], offset: 7 }, focus: { path: [0], offset: 7 } };
    history.remember(selection);
    history.record('Inicial a', null, 'insertText');
    history.record('Inicial ab', null, 'insertText');
    history.record('Inicial ab + tabla', null);

    expect(history.step('undo')?.value).toBe('Inicial ab');
    expect(history.step('undo')).toEqual({ value: 'Inicial', selection });
    expect(history.step('redo')?.value).toBe('Inicial ab');
    history.record('Inicial ab + lista', null);
    expect(history.canRedo()).toBe(false);
  });

  it('starts a new typing group after the caret moves', () => {
    const history = createDocumentHistory('Inicial');
    history.record('Inicial a', null, 'insertText');
    const caret = { path: [1], offset: 0 };
    history.remember({ anchor: caret, focus: caret });
    history.record('Inicial a\nb', null, 'insertText');
    expect(history.step('undo')?.value).toBe('Inicial a');
    expect(history.step('undo')?.value).toBe('Inicial');
  });
});
