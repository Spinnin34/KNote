import type { EditorState } from '@codemirror/state';
import type { SearchQuery } from '@codemirror/search';

export function countSearchMatches(query: SearchQuery, state: EditorState, maximum = 10_000): number {
  if (!query.valid || !query.search || maximum <= 0) return 0;

  const cursor = query.getCursor(state);
  let count = 0;
  while (!cursor.next().done) {
    count += 1;
    if (count >= maximum) return count;
  }
  return count;
}
