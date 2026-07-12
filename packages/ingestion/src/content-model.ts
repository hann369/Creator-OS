// ─────────────────────────────────────────────────────────────────────────────
// Canonical Content Model (Phase 3).
//
// A ContentEntry is the platform-agnostic, normalized shape every provider must
// produce. The full content lives here (its own store); only the *extracted*
// knowledge (VideoAnalysis) is projected into the cognitive World Model. This
// keeps content storage decoupled from the reasoning graph.
// ─────────────────────────────────────────────────────────────────────────────

export type Platform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'twitter'
  | 'reddit'
  | 'linkedin'
  | 'rss'
  | 'pdf'
  | 'markdown'
  | 'folder'
  | 'github'
  | 'arxiv'
  | 'pubmed'
  | 'telegram'
  | 'url';

export type MediaType = 'short' | 'longform' | 'image' | 'article' | 'thread' | 'audio' | 'document';

// Where a ContentEntry is in the async ingestion pipeline (Phase 12).
export type IngestionStatus =
  | 'queued'
  | 'resolving'
  | 'fetching'
  | 'transcribing'
  | 'reasoning'
  | 'graph_linking'
  | 'completed'
  | 'failed';

export const INGESTION_STAGES: IngestionStatus[] = [
  'queued',
  'resolving',
  'fetching',
  'transcribing',
  'reasoning',
  'graph_linking',
  'completed',
];

export interface Statistics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followersAtPublish?: number;
}

export interface ContentMetadataBlock {
  hashtags: string[];
  mentions: string[];
  music?: string;
  location?: string;
  [key: string]: unknown;
}

export interface ContentComment {
  author?: string;
  text: string;
  likes?: number;
}

// The structured reasoning output (Phase 4). NEVER free text — always this shape.
export interface VideoAnalysis {
  topic: string;
  subTopics: string[];
  seed: string;             // the one-line premise/headline of the video
  format: string;           // classified into FORMATS (the Format Lego Brick)
  seedPattern: string;      // @deprecated mirror of `format`, kept for back-compat
  substance?: string;       // extracted substance of the video
  hook: string;
  hookPattern: string;      // classified into HOOK_PATTERNS
  mechanism: string;        // classified into MECHANISMS
  audience: string;
  problem: string;
  promise: string;
  cta: string;
  storyStructure: string;   // classified into STORY_STRUCTURES
  editingStyle: string;
  visualStyle: string;
  retentionTechniques: string[];
  emotion: string;
  novelty: string;
  actionableTakeaways: string[];
  claims: string[];
  scientificReferences: string[];
  confidence: number;       // 0..1 — model's self-reported certainty
}

export type OutlierLabel = 'Normal' | 'High Performer' | 'Extreme Outlier';

export interface OutlierScore {
  outlierScore: number;     // views / medianViews
  engagementScore: number;  // (likes+comments+shares) / views
  velocityScore: number;    // views / hours-since-publish (proxy)
  retentionProxy: number;   // best-effort retention signal (0..1)
  label: OutlierLabel;
}

export interface ContentEntry {
  id: string;
  platform: Platform;
  creator: string;
  creatorId: string;
  url: string;
  canonicalUrl: string;
  mediaType: MediaType;
  publishedAt?: Date;
  duration?: number;        // seconds
  language?: string;
  title: string;
  description: string;
  thumbnail?: string;
  transcript: string;
  comments: ContentComment[];
  statistics: Statistics;
  metadata: ContentMetadataBlock;
  analysis?: VideoAnalysis;
  outlier?: OutlierScore;
  embedding?: number[];
  status: IngestionStatus;
  error?: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Per-creator baseline for outlier detection (Phase 6).
export interface CreatorProfile {
  creatorId: string;
  platform: Platform;
  creator: string;
  averageViews: number;
  medianViews: number;
  averageLikes: number;
  postingFrequencyPerWeek: number;
  topicDistribution: Record<string, number>;
  sampleSize: number;
  workspaceId: string;
  updatedAt: Date;
}
