import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Moodboard } from '@pronoia/domain';
import { synthesizeIdentity } from '../src/synthesis.ts';

function board(id: string, palette: string[], fonts: { title: string; subheading: string; caption: string }): Moodboard {
  const now = new Date();
  return {
    id, workspaceId: 'ws', type: 'moodboard', boardType: 'custom', client: id, subtitle: '', note: '',
    description: '', tags: [], palette: palette.map(hex => ({ hex })), fonts, status: 'active',
    sections: [], notes: '', metadata: {}, title: id, createdAt: now, updatedAt: now,
  };
}

test('colors are merged across boards and ranked by frequency', async () => {
  const boards = [
    board('a', ['#111111', '#222222'], { title: 'Anton', subheading: 'Archivo', caption: 'Inter' }),
    board('b', ['#111111', '#333333'], { title: 'Anton', subheading: 'Archivo', caption: 'Inter' }),
  ];
  const out = await synthesizeIdentity(boards);
  // #111111 appears twice → must rank first.
  assert.equal(out.colors?.[0].hex, '#111111');
  assert.equal(out.colors?.length, 3);
});

test('typography picks the dominant fonts (title→heading, caption→body, subheading→accent)', async () => {
  const boards = [board('a', [], { title: 'Anton', subheading: 'Archivo', caption: 'Inter' })];
  const out = await synthesizeIdentity(boards);
  assert.equal(out.typography?.heading, 'Anton');
  assert.equal(out.typography?.body, 'Inter');
  assert.equal(out.typography?.accent, 'Archivo');
});

test('moodboardIds records the source boards; no AI provider ⇒ empty voice/hooks', async () => {
  const boards = [board('a', ['#000'], { title: 'X', subheading: 'Y', caption: 'Z' })];
  const out = await synthesizeIdentity(boards);
  assert.deepEqual(out.moodboardIds, ['a']);
  assert.deepEqual(out.hooks, []);
  assert.deepEqual(out.voice, { doList: [], dontList: [] });
});

test('AI enrichment maps a ReasoningResult onto voice + hooks', async () => {
  const boards = [board('a', ['#000'], { title: 'X', subheading: 'Y', caption: 'Z' })];
  const out = await synthesizeIdentity(boards, {
    reasoning: {
      async generateReasoning() {
        return {
          observation: 'calm, precise', hypotheses: ['Hook A', 'Hook B'], evidence: ['no hype'],
          conclusion: '', recommendations: ['be concrete'], confidence: 0.8,
        };
      },
    },
  });
  assert.equal(out.voice?.tone, 'calm, precise');
  assert.deepEqual(out.voice?.doList, ['be concrete']);
  assert.deepEqual(out.voice?.dontList, ['no hype']);
  assert.deepEqual(out.hooks, ['Hook A', 'Hook B']);
});

test('a throwing AI provider must not break deterministic synthesis', async () => {
  const boards = [board('a', ['#abc'], { title: 'X', subheading: 'Y', caption: 'Z' })];
  const out = await synthesizeIdentity(boards, {
    reasoning: { async generateReasoning() { throw new Error('provider down'); } },
  });
  assert.equal(out.colors?.[0].hex, '#abc', 'deterministic colors survive an AI failure');
  assert.deepEqual(out.hooks, []);
});
