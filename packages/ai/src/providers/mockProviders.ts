import { 
  AIProvider, 
  AIStreamChunk, 
  ChatProvider, 
  EmbeddingProvider, 
  ReasoningProvider, 
  VisionProvider,
  ChatMessage,
  ReasoningResult
} from '../types.js';

export class BaseMockProvider implements AIProvider, ChatProvider {
  id: string;
  name: string;
  private responseTemplates: string[] = [
    "Here is a connection found between your documents.",
    "This concept directly causes the goal to succeed.",
    "Based on YouTube statistics, you should focus on AI Agents.",
    "Your writing style matches an editorial serif presentation."
  ];

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  initialize(config: Record<string, any>): void {
    // Initializer mock setup
  }

  async generateChat(messages: ChatMessage[], options?: Record<string, any>): Promise<string> {
    const template = this.responseTemplates[Math.floor(Math.random() * this.responseTemplates.length)];
    const lastContent = messages[messages.length - 1]?.content || '';
    return `[Mock ${this.name}] Chat Response to: "${lastContent.substring(0, 30)}...". Result: ${template}`;
  }

  async *generateChatStream(messages: ChatMessage[], options?: Record<string, any>): AsyncGenerator<AIStreamChunk> {
    const fullText = await this.generateChat(messages, options);
    const words = fullText.split(' ');
    
    for (let i = 0; i < words.length; i++) {
      yield {
        text: words[i] + (i === words.length - 1 ? '' : ' '),
        done: i === words.length - 1
      };
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
}

export class MistralProvider extends BaseMockProvider implements ReasoningProvider {
  constructor() {
    super('mistral', 'Mistral Large');
  }

  async generateReasoning(prompt: string, options?: Record<string, any>): Promise<ReasoningResult> {
    return {
      observation: `Mistral analyzed context for prompt: "${prompt}".`,
      hypotheses: [`User wants logical consistency check.`],
      evidence: [`Matched 0 contradicting nodes in local graph.`],
      conclusion: `No active blocker projects detected.`,
      recommendations: [`Proceed to Focus mode.`],
      confidence: 0.88
    };
  }
}

export class HermesProvider extends BaseMockProvider {
  constructor() {
    super('hermes', 'Nous Hermes 2');
  }
}

export class PomelliProvider extends BaseMockProvider implements EmbeddingProvider, ReasoningProvider, VisionProvider {
  constructor() {
    super('pomelli', 'Google Pomelli');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const vector = new Array(1536).fill(0).map(() => Math.random());
    return vector;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.generateEmbedding(t)));
  }

  async generateReasoning(prompt: string, options?: Record<string, any>): Promise<ReasoningResult> {
    return {
      observation: `Pomelli reasoning engine checked prompt: "${prompt}".`,
      hypotheses: [`Identified potential Obsidian vault WikiLinks.`],
      evidence: [`3 linked nodes share high cosine similarity.`],
      conclusion: `This thought integrates with the current campaign.`,
      recommendations: [`Recommend creating an evergreen product link.`],
      confidence: 0.95
    };
  }

  async analyzeImage(imageBuffer: Buffer, prompt: string, options?: Record<string, any>): Promise<string> {
    return `[Pomelli Vision] Analyzed image of size ${imageBuffer.length} bytes. Identified high-end workspace photography layout.`;
  }
}
