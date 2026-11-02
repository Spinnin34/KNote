import { describe, expect, it } from 'vitest';
import { pythonGuideTopics } from './python-guide';

describe('catálogo de la guía de Python', () => {
  it('mantiene referencias completas, buscables y con identificadores únicos', () => {
    const ids = new Set(pythonGuideTopics.map((topic) => topic.id));

    expect(pythonGuideTopics.length).toBeGreaterThan(40);
    expect(ids.size).toBe(pythonGuideTopics.length);

    for (const topic of pythonGuideTopics) {
      expect(topic.title.trim()).not.toBe('');
      expect(topic.summary.trim()).not.toBe('');
      expect(topic.when.trim()).not.toBe('');
      expect(topic.tip.trim()).not.toBe('');
      expect(topic.keywords.length).toBeGreaterThan(0);
      expect(topic.code.trim()).not.toBe('');
      expect(topic.source).toMatch(/^https:\/\/docs\.python\.org\/es\/3\//);
    }
  });
});
