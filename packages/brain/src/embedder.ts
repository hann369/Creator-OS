export class Embedder {
  // Generate random 1536-dimensional mock embedding for demonstration
  static async generateEmbedding(text: string): Promise<number[]> {
    const vectorLength = 1536;
    const vector = Array.from({ length: vectorLength }, () => Math.random() * 2 - 1);
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / magnitude);
  }

  // Calculate cosine similarity between two vectors (-1 to 1)
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector sizes must match for cosine similarity calculation');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
