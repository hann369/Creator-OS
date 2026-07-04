import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldNode, WorldEdge } from '@pronoia/domain';
import { CausalReasoner } from '../src/causal.ts';

const conf = { extractionConfidence: 1, reasoningConfidence: 1, relationshipConfidence: 1, verificationConfidence: 1 };
function node(id: string, type = 'concept', name = id): WorldNode {
  return {
    id, workspaceId: 'ws', name, type: type as WorldNode['type'], metadata: {}, confidence: conf,
    sourceCount: 1, lastVerified: new Date(), derivedFrom: [], lifecycleState: 'created',
    createdAt: new Date(), updatedAt: new Date(),
  };
}
function causes(sourceId: string, targetId: string, confidence: number, extra: Partial<WorldEdge['causalMetadata']> = {}): WorldEdge {
  return {
    id: `${sourceId}=>${targetId}`, workspaceId: 'ws', sourceId, targetId, weight: confidence,
    relationshipType: 'causes', confidence: conf, createdAt: new Date(),
    causalMetadata: { confidence, timeDelayDays: 7, evidenceCount: 2, reversibility: 'reversible', ...extra },
  };
}

test('trace multiplies step probabilities along the chain', () => {
  const nodes = [node('a'), node('b'), node('c')];
  const edges = [causes('a', 'b', 0.5), causes('b', 'c', 0.4)];
  const chain = CausalReasoner.trace('a', 'c', nodes, edges);

  assert.equal(chain.found, true);
  assert.equal(chain.steps.length, 2);
  assert.equal(chain.overallProbability, 0.2, '0.5 * 0.4 = 0.2');
  assert.equal(chain.overallTimeDelayDays, 14, 'delays sum: 7 + 7');
});

test('trace marks the chain irreversible if any step is irreversible', () => {
  const nodes = [node('a'), node('b')];
  const edges = [causes('a', 'b', 0.9, { reversibility: 'irreversible' })];
  const chain = CausalReasoner.trace('a', 'b', nodes, edges);
  assert.equal(chain.isReversible, false);
});

test('trace returns found=false when no causal path exists', () => {
  const nodes = [node('a'), node('b')];
  const chain = CausalReasoner.trace('a', 'b', nodes, []);
  assert.equal(chain.found, false);
  assert.equal(chain.overallProbability, 0);
});

test('simulateImpact ranks reachable goals by probability', () => {
  const nodes = [node('action'), node('near', 'goal', 'Near'), node('far', 'goal', 'Far'), node('mid')];
  const edges = [
    causes('action', 'near', 0.9),   // direct, high prob
    causes('action', 'mid', 0.5),
    causes('mid', 'far', 0.5),        // 2-hop, lower prob (0.25)
  ];
  const sim = CausalReasoner.simulateImpact('action', nodes, edges);

  assert.equal(sim.reachableGoals.length, 2);
  assert.equal(sim.reachableGoals[0].goalName, 'Near', 'highest-probability goal first');
  assert.ok(sim.reachableGoals[0].probability > sim.reachableGoals[1].probability);
});
