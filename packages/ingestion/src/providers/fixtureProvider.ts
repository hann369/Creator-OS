import type { ResolvedSource } from '../resolver.js';
import type { Statistics, ContentComment } from '../content-model.js';
import type { ContentProvider, ProviderMetadata, FetchedContent } from './types.js';

// FixtureProvider — a ContentProvider backed entirely by data already in hand.
//
// Two roles:
//  1. Tests: deterministic provider with no network.
//  2. Slice-1 validation: real short-form video data captured via the vidiq MCP
//     tools (vidiq_video_transcript / _stats / _comments, vidiq_ig_reel_watch)
//     is passed in here, so the WHOLE pipeline runs end-to-end today without a
//     live third-party transcript key. Swapping to a live provider later changes
//     nothing downstream.
export interface FixtureData extends FetchedContent {}

export class FixtureProvider implements ContentProvider {
  constructor(private data: FixtureData) {}

  canHandle(): boolean {
    return true;
  }
  async fetchMetadata(_s: ResolvedSource): Promise<ProviderMetadata> {
    return this.data.metadata;
  }
  async fetchTranscript(): Promise<string> {
    return this.data.transcript;
  }
  async fetchComments(): Promise<ContentComment[]> {
    return this.data.comments;
  }
  async fetchThumbnail(): Promise<string | undefined> {
    return this.data.thumbnail;
  }
  async fetchStatistics(): Promise<Statistics> {
    return this.data.statistics;
  }
}
