export interface ChunkOptions {
  maxWords: number;
  overlapWords: number;
}

export class TextChunker {
  // Segment document content into overlapping word blocks
  static chunk(text: string, options: ChunkOptions = { maxWords: 150, overlapWords: 30 }): string[] {
    const words = text.trim().split(/\s+/);
    if (words.length <= options.maxWords) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + options.maxWords, words.length);
      const chunkWords = words.slice(start, end);
      chunks.push(chunkWords.join(' '));
      
      // Move window forward by step
      start += (options.maxWords - options.overlapWords);
    }

    return chunks;
  }
}
