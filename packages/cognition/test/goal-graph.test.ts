import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldNode, WorldEdge } from '@pronoia/domain';
import { GoalGraph } from '../src/goal-graph.ts';

// Minimal fixtures — the engine only reads id/name/type and edge fields.
const conf = { extractionConfidence: 1, reasoningConfidence: 1, relationshipConfidence: 1, verificationConfidence: 1 };
function node(id: string, type: string, name = id): WorldNode {
  return {
    id, workspaceId: 'ws', name, type: type as WorldNode['type'], metadata: {}, confidence: conf,
    sourceCount: 1, lastVerified: new Date(), derivedFrom: [], lifecycleState: 'created',
    createdAt: new Date(), updatedAt: new Date(),
  };
}
function edge(sourceId: string, targetId: string, relationshipType: string, extra: Partial<WorldEdge> = {}): WorldEdge {
  return { id: `${sourceId}->${targetId}`, workspaceId: 'ws', sourceId, targetId, weight: 0.5, relationshipType: relationshipType as WorldEdge['relationshipType'], confidence: conf, createdAt: new Date(), ...extra };
}

test('build wires parent/child goal hierarchy and computes depth via BFS', () => {
  const nodes = [node('root', 'goal', 'Root'), node('sub', 'goal', 'Sub')];
  const edges = [edge('sub', 'root', 'goal_supports', { contributionWeight: 0.8 })];
  const map = GoalGraph.build(nodes, edges);

  assert.equal(map.get('root')!.depth, 0);
  assert.equal(map.get('sub')!.depth, 1);
  assert.deepEqual(map.get('root')!.childGoalIds, ['sub']);
  assert.deepEqual(map.get('sub')!.parentGoalIds, ['root']);
  assert.equal(map.get('root')!.contributionWeights['sub'], 0.8);
  assert.equal(map.get('root')!.totalContribution, 0.8);
});

test('getContributionScore penalizes deeper goals (root goals score higher)', () => {
  const nodes = [node('opp', 'opportunity'), node('root', 'goal'), node('sub', 'goal')];
  const edges = [
    edge('sub', 'root', 'goal_supports', { contributionWeight: 1 }),
    edge('opp', 'sub', 'supports', { weight: 1 }),
    edge('opp', 'root', 'supports', { weight: 1 }),
  ];
  const map = GoalGraph.build(nodes, edges);
  const score = GoalGraph.getContributionScore('opp', nodes, edges, map);

  const root = score.directGoals.find(g => g.goalId === 'root')!;
  const sub = score.directGoals.find(g => g.goalId === 'sub')!;
  assert.ok(root.score > sub.score, 'shallower (root) goal must score higher than deeper sub-goal');
});

test('detectConflicts flags two goals competing for one shared resource', () => {
  const nodes = [node('gA', 'goal', 'A'), node('gB', 'goal', 'B'), node('res', 'resource', 'Time')];
  const edges = [edge('gA', 'res', 'requires'), edge('gB', 'res', 'requires')];
  const map = GoalGraph.build(nodes, edges);
  const conflicts = GoalGraph.detectConflicts(nodes, edges, map);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'resource_competition');
  assert.equal(conflicts[0].sharedResourceNodeId, 'res');
});

test('detectConflicts flags direct competes_with / blocks / duplicates edges', () => {
  const nodes = [node('gA', 'goal', 'A'), node('gB', 'goal', 'B')];
  const map = GoalGraph.build(nodes, []);
  const types = ['competes_with', 'blocks', 'duplicates'];
  const conflicts = GoalGraph.detectConflicts(nodes, types.map(t => edge('gA', 'gB', t)), map);

  assert.deepEqual(conflicts.map(c => c.type).sort(), ['direct_block', 'direct_competition', 'duplicate_goal']);
});
