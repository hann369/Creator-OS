import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BrandIdentity, ContentPipeline, ContentMetrics, Relationship } from '@pronoia/domain';
import { learnIdentity } from '../src/learning.ts';

// Fixtures ────────────────────────────────────────────────────────────────────
const now = new Date();

function identity(overrides: Partial<BrandIdentity> = {}): BrandIdentity {
  return {
    id: 'identity-1', workspaceId: 'ws', type: 'identity', title: 'Brand',
    metadata: {}, createdAt: now, updatedAt: now,
    colors: [], typography: {}, voice: { doList: [], dontList: [] },
    hooks: ['baseline hook'], moodboardIds: ['mb-1'],
    ...overrides,
  };
}

function metrics(overrides: Partial<ContentMetrics> = {}): ContentMetrics {
  return {
    views: 1000, watchTimeMinutes: 0, avgViewDurationSeconds: 0, clickThroughRate: 0,
    likes: 0, comments: 0, shares: 0, subscriberGain: 0, viralScore: 0, ...overrides,
  };
}

function card(id: string, hook: string, m?: ContentMetrics): ContentPipeline {
  return {
    id, workspaceId: 'ws', title: id, hook, format: 'longform', status: 'published',
    platforms: ['youtube'], metrics: m, createdAt: now, updatedAt: now,
  };
}

function styledBy(sourceId: string, targetId: string): Relationship {
  return { id: `rel-${sourceId}-${targetId}`, workspaceId: 'ws', sourceId, targetId, type: 'styled_by', createdAt: now };
}

// Tests ─────────────────────────────────────────────────────────────────────--
test('cold-start: no attributed metrics leaves the identity unchanged', () => {
  const id = identity();
  const out = learnIdentity({ identity: id, cards: [card('c1', 'unmeasured hook')], relationships: [] });
  assert.deepEqual(out.hooks, id.hooks, 'hooks must not change without metrics');
});

test('re-ranks hooks by performance of the attributed pieces (best first)', () => {
  // Two cards styled by moodboard mb-1 (which feeds identity-1). The high-viral
  // hook must be ranked above the low-viral one.
  const id = identity({ hooks: [] });
  const cards = [
    card('c-low', 'low performer', metrics({ viralScore: 1 })),
    card('c-high', 'high performer', metrics({ viralScore: 9 })),
  ];
  const rels = [styledBy('mb-1', 'c-low'), styledBy('mb-1', 'c-high')];
  const out = learnIdentity({ identity: id, cards, relationships: rels });
  assert.deepEqual(out.hooks, ['high performer', 'low performer']);
});

test('learned hooks are merged ahead of existing ones and de-duplicated', () => {
  const id = identity({ hooks: ['existing hook', 'high performer'] });
  const cards = [card('c-high', 'high performer', metrics({ viralScore: 9 }))];
  const rels = [styledBy('mb-1', 'c-high')];
  const out = learnIdentity({ identity: id, cards, relationships: rels });
  assert.equal(out.hooks[0], 'high performer', 'learned/best hook floats to the top');
  assert.equal(new Set(out.hooks).size, out.hooks.length, 'no duplicate hooks');
});

test('attribution via a direct card->identity styled_by edge also works', () => {
  const id = identity({ hooks: [] });
  const cards = [card('c1', 'direct hook', metrics({ viralScore: 5 }))];
  const rels = [styledBy('c1', 'identity-1')]; // card styled_by identity directly
  const out = learnIdentity({ identity: id, cards, relationships: rels });
  assert.deepEqual(out.hooks, ['direct hook']);
});
