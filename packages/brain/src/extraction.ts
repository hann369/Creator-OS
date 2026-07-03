import { WorldNode, WorldEdge, WorldNodeType, WorldEdgeType } from '@pronoia/domain';

export class EntityExtractor {
  // Extract key terms or entities from document contents to build World Model nodes
  static extractNodes(
    workspaceId: string,
    sourceId: string,
    content: string
  ): WorldNode[] {
    const nodes: WorldNode[] = [];
    
    // Heuristic: search for capitalized words or key patterns
    const regexMap: { type: WorldNodeType; pattern: RegExp }[] = [
      { type: 'concept', pattern: /concept:\s*([a-zA-Z0-9\s-]+)/gi },
      { type: 'goal', pattern: /goal:\s*([a-zA-Z0-9\s-]+)/gi },
      { type: 'decision', pattern: /decision:\s*([a-zA-Z0-9\s-]+)/gi },
      { type: 'insight', pattern: /insight:\s*([a-zA-Z0-9\s-]+)/gi }
    ];

    const defaultConfidence = {
      extractionConfidence: 0.90,
      reasoningConfidence: 0.80,
      relationshipConfidence: 0.0,
      verificationConfidence: 0.0
    };

    for (const entry of regexMap) {
      let match;
      const regex = new RegExp(entry.pattern);
      while ((match = regex.exec(content)) !== null) {
        if (match[1]) {
          const name = match[1].trim();
          const id = `${entry.type}:${name.toLowerCase().replace(/\s+/g, '-')}`;
          nodes.push({
            id,
            workspaceId,
            name,
            type: entry.type,
            metadata: { sourceId },
            confidence: defaultConfidence,
            sourceCount: 1,
            lastVerified: new Date(),
            derivedFrom: [sourceId],
            lifecycleState: 'created',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    // Default concept extraction fallback based on keywords
    if (nodes.length === 0) {
      const keywords = ['AI Agents', 'Automation', 'Marketing', 'Startups', 'Framer'];
      for (const kw of keywords) {
        if (content.toLowerCase().includes(kw.toLowerCase())) {
          nodes.push({
            id: `concept:${kw.toLowerCase().replace(/\s+/g, '-')}`,
            workspaceId,
            name: kw,
            type: 'concept',
            metadata: { sourceId, autoExtracted: true },
            confidence: defaultConfidence,
            sourceCount: 1,
            lastVerified: new Date(),
            derivedFrom: [sourceId],
            lifecycleState: 'created',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    return nodes;
  }

  // Create semantic relationship edges between nodes
  static generateEdges(
    workspaceId: string,
    nodes: WorldNode[]
  ): WorldEdge[] {
    const edges: WorldEdge[] = [];
    if (nodes.length < 2) {
      return edges;
    }

    const defaultConfidence = {
      extractionConfidence: 0.90,
      reasoningConfidence: 0.80,
      relationshipConfidence: 0.85,
      verificationConfidence: 0.0
    };

    // Connect sequential nodes semantically
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: crypto.randomUUID(),
        workspaceId,
        sourceId: nodes[i].id,
        targetId: nodes[i + 1].id,
        weight: 0.85,
        relationshipType: 'related_to' as WorldEdgeType,
        confidence: defaultConfidence,
        createdAt: new Date()
      });
    }

    return edges;
  }
}
