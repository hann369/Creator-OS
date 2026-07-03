import { TextChunker, Embedder } from '@pronoia/brain';

export interface IngestionJob {
  documentId: string;
  content: string;
}

export class EmbeddingWorker {
  // Process incoming document chunking and embedding generation in a background worker thread
  static async processJob(job: IngestionJob): Promise<{ success: boolean; chunksCount: number }> {
    console.log(`[Queue Worker] Processing embeddings calculation for document: ${job.documentId}`);

    // 1. Chunker splits text
    const chunks = TextChunker.chunk(job.content);
    console.log(`[Queue Worker] Split document into ${chunks.length} segments`);

    // 2. Generate embedding for each segment
    for (let i = 0; i < chunks.length; i++) {
      const vector = await Embedder.generateEmbedding(chunks[i]);
      console.log(`[Queue Worker] Generated vector embedding for segment ${i + 1}/${chunks.length} (Dimensions: ${vector.length})`);
    }

    return {
      success: true,
      chunksCount: chunks.length
    };
  }
}
