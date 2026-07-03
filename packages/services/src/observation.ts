import { GraphRepository } from './storage.js';
import { IngestionEngine, IngestedContent } from './ingestion.js';

export interface ObservationFeed {
  id: string;
  name: string;
  url: string;
  sourceType: IngestedContent['sourceType'];
  lastChecked: Date;
}

export class ObservationLayer {
  private static feeds: ObservationFeed[] = [
    {
      id: 'feed-ali-abdaal',
      name: 'Ali Abdaal YouTube Channel',
      url: 'https://youtube.com/c/aliabdaal/videos',
      sourceType: 'youtube',
      lastChecked: new Date(Date.now() - 24 * 60 * 60 * 1000)
    },
    {
      id: 'feed-openai-blog',
      name: 'OpenAI Blog RSS',
      url: 'https://openai.com/blog/rss.xml',
      sourceType: 'rss',
      lastChecked: new Date(Date.now() - 24 * 60 * 60 * 1000)
    },
    {
      id: 'feed-github-trending',
      name: 'GitHub Trending Repositories',
      url: 'https://github.com/trending',
      sourceType: 'github',
      lastChecked: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }
  ];

  /**
   * Registers a new feed to watch
   */
  static registerFeed(feed: Omit<ObservationFeed, 'lastChecked'>): void {
    if (this.feeds.some(f => f.id === feed.id)) return;
    this.feeds.push({ ...feed, lastChecked: new Date() });
  }

  /**
   * Lists all registered feeds
   */
  static getFeeds(): ObservationFeed[] {
    return [...this.feeds];
  }

  /**
   * Simulates checking external feeds and ingesting new data
   */
  static async checkFeeds(
    workspaceId: string,
    graphRepo: GraphRepository
  ): Promise<string[]> {
    const ingestedTitles: string[] = [];

    for (const feed of this.feeds) {
      // Mock: 50% chance of new update per feed
      if (Math.random() > 0.5) {
        let title = '';
        let text = '';
        let source = feed.url;

        if (feed.id === 'feed-ali-abdaal') {
          title = 'Ali Abdaal: My productivity system with AI Agents in 2026';
          text = 'In this video, we explore how to build a cognitive operating system using AI Agents to automate research and 100k subscribers growth tactics. We talk about causal reasoning and reducing time constraints.';
          source = 'https://youtube.com/watch?v=mock-ali-abdaal';
        } else if (feed.id === 'feed-openai-blog') {
          title = 'OpenAI: Launching Advanced Agentic Workflows';
          text = 'Today we announce native supports for agentic systems and multi-agent execution loops with built-in causal reasoning matrices and self-reflection updates.';
          source = 'https://openai.com/blog/advanced-agentic-workflows';
        } else if (feed.id === 'feed-github-trending') {
          title = 'GitHub Trending: Pronoia OS project';
          text = 'A semantic, reasoning-first cognitive operating system. A key repository that supports cognitive pipelines and counterfactual learning.';
          source = 'https://github.com/pronoia/creator-os';
        }

        if (title && text) {
          const content = IngestionEngine.ingest(source, feed.sourceType, title, text, {
            feedId: feed.id,
            feedName: feed.name
          });
          await IngestionEngine.saveToGraph(workspaceId, content, graphRepo);
          feed.lastChecked = new Date();
          ingestedTitles.push(title);
        }
      }
    }

    return ingestedTitles;
  }
}
