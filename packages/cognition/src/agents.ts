import type { WorldNode, WorldEdge } from '@pronoia/domain';
import { GoalGraph } from './goal-graph.js';
import { CausalReasoner } from './causal.js';
import { ObservationLayer, GraphRepository } from '@pronoia/services';

export interface MorningBriefing {
  timestamp: Date;
  ingestedItemsCount: number;
  trendingTopics: string[];
  goalConflictsCount: number;
  conflictDetails: string[];
  topRecommendations: string[];
}

/**
 * ConnectionSynthesizer: Runs graph analysis to find semantic similarity 
 * and automatically proposes support connections.
 */
export class ConnectionSynthesizer {
  static async synthesizeConnections(
    workspaceId: string,
    nodes: WorldNode[],
    edges: WorldEdge[],
    graphRepo: GraphRepository
  ): Promise<number> {
    let createdEdges = 0;
    const defaultConfidence = {
      extractionConfidence: 0.8,
      reasoningConfidence: 0.8,
      relationshipConfidence: 0.8,
      verificationConfidence: 0.5
    };

    // Simple heuristic similarity connection: link concepts that share descriptive words
    const concepts = nodes.filter(n => n.type === 'concept' || n.type === 'insight');

    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const nodeA = concepts[i];
        const nodeB = concepts[j];

        // Check if already linked
        const alreadyLinked = edges.some(
          e => (e.sourceId === nodeA.id && e.targetId === nodeB.id) ||
               (e.sourceId === nodeB.id && e.targetId === nodeA.id)
        );
        if (alreadyLinked) continue;

        // Find shared words in description or name
        const wordsA = new Set(nodeA.name.toLowerCase().split(/\s+/).filter(w => w.length > 4));
        const wordsB = nodeB.name.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        const hasOverlap = wordsB.some(w => wordsA.has(w));

        if (hasOverlap) {
          const edgeId = `edge-synth-${nodeA.id}-${nodeB.id}-${Date.now()}`;
          const newEdge: WorldEdge = {
            id: edgeId,
            workspaceId,
            sourceId: nodeA.id,
            targetId: nodeB.id,
            weight: 0.65,
            relationshipType: 'supports',
            confidence: defaultConfidence,
            createdAt: new Date()
          };

          const tx = await graphRepo.beginTransaction();
          try {
            await graphRepo.saveEdge(newEdge, tx);
            await tx.commit();
            createdEdges++;
          } catch (e) {
            await tx.rollback();
          }
        }
      }
    }

    return createdEdges;
  }
}

/**
 * MorningPrepAgent: Runs before the user opens Pronoia.
 * Automatically checks feeds, identifies trends, scans for conflicts, and compiles a daily briefing.
 */
export class MorningPrepAgent {
  static async prepareBriefing(
    workspaceId: string,
    graphRepo: GraphRepository
  ): Promise<MorningBriefing> {
    console.log('[MorningPrepAgent] Initiating morning prep sequence...');

    // 1. Trigger Observation Layer to poll and ingest updates
    const ingestedItems = await ObservationLayer.checkFeeds(workspaceId, graphRepo);

    // Refresh graph snapshots
    const nodes = await graphRepo.listNodes(workspaceId);
    const edges = await graphRepo.listEdges(workspaceId);

    // 2. Synthesize new connections between nodes
    const synthesizedCount = await ConnectionSynthesizer.synthesizeConnections(
      workspaceId, nodes, edges, graphRepo
    );
    console.log(`[MorningPrepAgent] Auto-synthesized ${synthesizedCount} new connections.`);

    // Re-list to include synthesized edges
    const updatedEdges = await graphRepo.listEdges(workspaceId);

    // 3. Scan Goal Graph for conflicts
    const goalMap = GoalGraph.build(nodes, updatedEdges);
    const conflicts = GoalGraph.detectConflicts(nodes, updatedEdges, goalMap);

    // 4. Generate recommendations
    const activeIntents = nodes.filter(n => n.type === 'intent' && n.metadata?.active === true);
    const topRecommendations: string[] = [];

    if (activeIntents.length > 0) {
      topRecommendations.push(`Nutze Fokus-Intent "${activeIntents[0].name}" zur Steuerung der heutigen Tagespriorität.`);
    } else {
      topRecommendations.push('Kompakte Ziele definiert — wähle heute ein übergeordnetes Ziel-Intent.');
    }

    if (conflicts.length > 0) {
      topRecommendations.push(`Konfliktlösung empfohlen für: "${conflicts[0].goalAName}" ↔ "${conflicts[0].goalBName}".`);
    }

    return {
      timestamp: new Date(),
      ingestedItemsCount: ingestedItems.length,
      trendingTopics: ingestedItems.map(title => title.replace(/Ali Abdaal:|OpenAI:/, '').trim()),
      goalConflictsCount: conflicts.length,
      conflictDetails: conflicts.map(c => c.description),
      topRecommendations
    };
  }
}
