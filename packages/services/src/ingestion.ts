import { WorldNode, WorldEdge, ConfidenceMatrix, WorldEdgeType } from '@pronoia/domain';
import { GraphRepository } from './storage.js';

export interface IngestedContent {
  id: string;
  source: string; // url, filepath, API-source
  sourceType: 'pdf' | 'youtube' | 'podcast' | 'webpage' | 'rss' | 'social' | 'github' | 'notion' | 'obsidian' | 'gdocs' | 'kindle' | 'browser_highlight' | 'newsletter' | 'bookmark';
  title: string;
  rawText: string;
  metadata: Record<string, any>;
  ingestedAt: Date;
}

export class IngestionEngine {
  /**
   * Normalizes incoming data from any source into IngestedContent
   */
  static ingest(
    source: string,
    sourceType: IngestedContent['sourceType'],
    title: string,
    rawText: string,
    metadata: Record<string, any> = {}
  ): IngestedContent {
    return {
      id: `ingest-${sourceType}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      source,
      sourceType,
      title,
      rawText,
      metadata,
      ingestedAt: new Date()
    };
  }

  /**
   * Performs semantic chunking on the ingested text
   */
  static chunkContent(content: IngestedContent, maxChunkSize = 1000): string[] {
    const paragraphs = content.rawText.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += paragraph + '\n\n';
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Simulates NLP/LLM-based extraction of nodes and edges from a raw text.
   * In a production environment, this calls an LLM entity-parsing tool.
   */
  static extractKnowledge(
    content: IngestedContent,
    workspaceId: string
  ): { nodes: WorldNode[]; edges: WorldEdge[] } {
    const nodes: WorldNode[] = [];
    const edges: WorldEdge[] = [];
    const defaultConfidence: ConfidenceMatrix = {
      extractionConfidence: 0.85,
      reasoningConfidence: 0.80,
      relationshipConfidence: 0.75,
      verificationConfidence: 0.50
    };

    // Simulated Extraction Heuristic: Scan text for keywords to extract concepts
    const textLower = content.rawText.toLowerCase();

    // 1. Detect concepts/entities
    const conceptRules = [
      { trigger: 'ai agents', name: 'AI Agents', type: 'concept' as const, desc: 'Autonomous reasoning AI systems.' },
      { trigger: 'cognitive operating system', name: 'Cognitive Operating System', type: 'concept' as const, desc: 'A semantic, reasoning-first operating system overlay.' },
      { trigger: 'causal reasoning', name: 'Causal Reasoning', type: 'concept' as const, desc: 'Understanding cause-effect linkages in data.' },
      { trigger: 'notion', name: 'Notion', type: 'company' as const, desc: 'Workspace tool.' },
      { trigger: 'obsidian', name: 'Obsidian', type: 'company' as const, desc: 'Local markdown knowledge vault.' },
      { trigger: 'youtube', name: 'YouTube', type: 'company' as const, desc: 'Video hosting and sharing platform.' },
      { trigger: 'increase watchtime', name: 'Increase YouTube Watchtime', type: 'goal' as const, desc: 'Goal to boost video viewer retention.' },
      { trigger: '100k subscribers', name: '100k Subscribers', type: 'goal' as const, desc: 'Milestone goal for subscriber count.' },
      { trigger: 'newsletter', name: 'Newsletter', type: 'concept' as const, desc: 'Weekly curated newsletter mailing list.' },
      { trigger: 'time constraints', name: 'Time Resource Limit', type: 'constraint' as const, desc: 'Time limit constraint.' }
    ];

    const detectedNodesMap = new Map<string, WorldNode>();

    conceptRules.forEach((rule) => {
      if (textLower.includes(rule.trigger)) {
        const nodeId = `${rule.type}:${rule.name.toLowerCase().replace(/\s+/g, '-')}`;
        const node: WorldNode = {
          id: nodeId,
          workspaceId,
          name: rule.name,
          type: rule.type,
          description: rule.desc,
          metadata: {
            extractedFrom: content.id,
            sourceType: content.sourceType
          },
          confidence: defaultConfidence,
          sourceCount: 1,
          lastVerified: new Date(),
          derivedFrom: [content.id],
          lifecycleState: 'created',
          lastActivityAt: new Date(),
          velocityScore: 0.1,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        nodes.push(node);
        detectedNodesMap.set(rule.trigger, node);
      }
    });

    // 2. Detect relationships/edges between detected concepts
    const relationshipRules: Array<{ source: string; target: string; type: WorldEdgeType; weight: number }> = [
      { source: 'causal reasoning', target: 'cognitive operating system', type: 'supports' as const, weight: 0.9 },
      { source: 'cognitive operating system', target: '100k subscribers', type: 'supports' as const, weight: 0.8 },
      { source: 'increase watchtime', target: '100k subscribers', type: 'goal_supports' as const, weight: 0.95 },
      { source: 'newsletter', target: '100k subscribers', type: 'competes_with' as const, weight: 0.4 } // Competes for time
    ];

    relationshipRules.forEach((rule) => {
      const srcNode = detectedNodesMap.get(rule.source);
      const tgtNode = detectedNodesMap.get(rule.target);

      if (srcNode && tgtNode) {
        const edgeId = `edge-${srcNode.id}-${tgtNode.id}`;
        const edge: WorldEdge = {
          id: edgeId,
          workspaceId,
          sourceId: srcNode.id,
          targetId: tgtNode.id,
          weight: rule.weight,
          relationshipType: rule.type,
          confidence: defaultConfidence,
          createdAt: new Date()
        };

        // If it's a goal support, configure contribution weight
        if (rule.type === 'goal_supports') {
          edge.contributionWeight = rule.weight;
        }

        // If it's a causal relationship, configure causal metadata
        if (rule.type === 'causes') {
          edge.causalProbability = rule.weight;
          edge.causalMetadata = {
            confidence: rule.weight,
            timeDelayDays: 2,
            evidenceCount: 1,
            reversibility: 'reversible'
          };
        }

        edges.push(edge);
      }
    });

    return { nodes, edges };
  }

  /**
   * Processes the ingested content, chunks it, extracts knowledge, and persists to the repository
   */
  static async saveToGraph(
    workspaceId: string,
    content: IngestedContent,
    graphRepo: GraphRepository
  ): Promise<void> {
    const { nodes, edges } = this.extractKnowledge(content, workspaceId);

    const tx = await graphRepo.beginTransaction();
    try {
      // Save all extracted nodes
      for (const node of nodes) {
        const existingNode = await graphRepo.findNode(node.id);
        if (existingNode) {
          // Merge node sources and increment count
          const updatedNode = {
            ...existingNode,
            sourceCount: existingNode.sourceCount + 1,
            derivedFrom: [...new Set([...existingNode.derivedFrom, ...node.derivedFrom])],
            lastActivityAt: new Date(),
            updatedAt: new Date()
          };
          await graphRepo.saveNode(updatedNode, tx);
        } else {
          await graphRepo.saveNode(node, tx);
        }
      }

      // Save all extracted edges
      for (const edge of edges) {
        const existingEdge = await graphRepo.findEdge(edge.sourceId, edge.targetId);
        if (!existingEdge) {
          await graphRepo.saveEdge(edge, tx);
        }
      }

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}
