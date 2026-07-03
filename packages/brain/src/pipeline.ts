import { globalEventBus } from '@pronoia/shared';
import { 
  WorldNode, 
  WorldEdge, 
  WorldEdgeType, 
  EmbeddingMetadata, 
  ConfidenceMatrix 
} from '@pronoia/domain';
import { TextChunker } from './chunker.js';
import { Embedder } from './embedder.js';
import { EntityExtractor } from './extraction.js';
import { SemanticGraphBuilder } from './graph.js';

// Configuration policies for similarity checks
export interface SimilarityPolicy {
  minimumSimilarity: number;
  entityTypeWeights: Record<string, number>;
}

export class BrainIngestionPipeline {
  private embeddingConfig: EmbeddingMetadata;
  private similarityPolicy: SimilarityPolicy;

  constructor(
    embeddingConfig: EmbeddingMetadata = {
      provider: 'pomelli',
      model: 'pomelli-embed-v1',
      dimension: 1536,
      version: 'v1.0'
    },
    similarityPolicy: SimilarityPolicy = {
      minimumSimilarity: 0.78,
      entityTypeWeights: {
        concept: 1.0,
        goal: 1.2,
        risk: 0.8
      }
    }
  ) {
    this.embeddingConfig = embeddingConfig;
    this.similarityPolicy = similarityPolicy;
    this.registerStages();
  }

  private registerStages(): void {
    // 1. Chunker Stage: listens to DocumentCreated, emits DocumentChunked
    globalEventBus.subscribe('DocumentCreated', async (event) => {
      const { documentId, title, workspaceId, content } = event.payload;
      console.log(`[Pipeline] ChunkerStage: Processing document ${title}`);
      
      const chunks = TextChunker.chunk(content || '');

      globalEventBus.publish({
        id: crypto.randomUUID(),
        workspaceId,
        eventType: 'DocumentChunked' as any,
        payload: { documentId, chunks },
        createdAt: new Date()
      } as any);
    });

    // 2. Embedder Stage: listens to DocumentChunked, emits ChunksEmbedded
    globalEventBus.subscribe('DocumentChunked' as any, async (event: any) => {
      const { documentId, chunks } = event.payload;
      console.log(`[Pipeline] EmbedderStage: Calculating embeddings for document ${documentId}`);

      const embeddedChunks = await Promise.all(
        chunks.map(async (text: string) => {
          const vector = await Embedder.generateEmbedding(text);
          return { content: text, embedding: vector };
        })
      );

      globalEventBus.publish({
        id: crypto.randomUUID(),
        workspaceId: event.workspaceId,
        eventType: 'ChunksEmbedded' as any,
        payload: {
          documentId,
          embeddedChunks,
          metadata: this.embeddingConfig
        },
        createdAt: new Date()
      } as any);
    });

    // 3. Extractor Stage: listens to ChunksEmbedded, emits EntitiesExtracted
    globalEventBus.subscribe('ChunksEmbedded' as any, async (event: any) => {
      const { documentId, embeddedChunks } = event.payload;
      console.log(`[Pipeline] ExtractorStage: Extracting World Model entities from document ${documentId}`);

      const combinedText = embeddedChunks.map((c: any) => c.content).join(' ');
      const rawNodes = EntityExtractor.extractNodes(event.workspaceId, documentId, combinedText);

      // Map raw nodes into structured entities with split confidence scores
      const nodes: WorldNode[] = rawNodes.map((n) => ({
        ...n,
        confidence: {
          extractionConfidence: 0.92,
          reasoningConfidence: 0.85,
          relationshipConfidence: 0.0, // Calculated in LinkerStage
          verificationConfidence: 0.0
        },
        sourceCount: 1,
        lastVerified: new Date(),
        derivedFrom: [documentId]
      }));

      globalEventBus.publish({
        id: crypto.randomUUID(),
        workspaceId: event.workspaceId,
        eventType: 'EntitiesExtracted' as any,
        payload: { documentId, nodes },
        createdAt: new Date()
      } as any);
    });

    // 4. Linker Stage: listens to EntitiesExtracted, emits WorldModelUpdated
    globalEventBus.subscribe('EntitiesExtracted' as any, async (event: any) => {
      const { documentId, nodes, sourceType } = event.payload;
      console.log(`[Pipeline] LinkerStage: Discovered relationships for document ${documentId}`);

      // Calculate weight modification factor based on source weight mappings (Eigene Notizen / Youtube / URLs)
      const sourceWeightMap: Record<string, number> = {
        notes: 5.0,
        project: 5.0,
        analytics: 4.0,
        youtube: 3.0,
        pdf: 2.0,
        url: 2.0,
        social: 1.0
      };
      
      const sourceWeight = sourceWeightMap[sourceType || 'notes'] || 2.0;

      const edges: WorldEdge[] = [];
      
      if (nodes.length >= 2) {
        for (let i = 0; i < nodes.length - 1; i++) {
          const weightMod = this.similarityPolicy.entityTypeWeights[nodes[i].type] || 1.0;
          edges.push({
            id: crypto.randomUUID(),
            workspaceId: event.workspaceId,
            sourceId: nodes[i].id,
            targetId: nodes[i + 1].id,
            weight: parseFloat((0.85 * weightMod).toFixed(2)),
            relationshipType: 'related_to' as WorldEdgeType,
            confidence: {
              extractionConfidence: 0.90,
              reasoningConfidence: 0.80,
              relationshipConfidence: parseFloat((0.85 * (sourceWeight / 5.0)).toFixed(2)),
              verificationConfidence: 0.0
            },
            createdAt: new Date()
          });
        }
      }

      globalEventBus.publish({
        id: crypto.randomUUID(),
        workspaceId: event.workspaceId,
        eventType: 'WorldNodeCreated' as any,
        payload: { nodes, edges },
        createdAt: new Date()
      } as any);
    });
  }
}
