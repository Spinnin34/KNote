import { EditorState } from '@codemirror/state';
import { SearchQuery } from '@codemirror/search';
import { describe, expect, it } from 'vitest';
import { countSearchMatches } from '@/components/workspace/code-search';

describe('countSearchMatches', () => {
  it('counts matches by advancing the CodeMirror search cursor', () => {
    const state = EditorState.create({ doc: 'note, note, notebook' });
    const query = new SearchQuery({ search: 'note' });

    expect(countSearchMatches(query, state)).toBe(3);
  });

  it('respects invalid, empty, and capped queries', () => {
    const state = EditorState.create({ doc: 'a a a a' });

    expect(countSearchMatches(new SearchQuery({ search: '' }), state)).toBe(0);
    expect(countSearchMatches(new SearchQuery({ search: '[' , regexp: true }), state)).toBe(0);
    expect(countSearchMatches(new SearchQuery({ search: 'a' }), state, 2)).toBe(2);
  });
});
