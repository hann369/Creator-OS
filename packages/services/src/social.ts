export interface SocialPostMetric {
  id: string;
  title?: string;
  likes: number;
  comments: number;
  shares?: number;
  views?: number;
  publishedAt: Date;
}

export interface SocialProfileMetric {
  followerCount: number;
  totalViews: number;
  averageEngagementRate: number;
}

export interface YouTubeClient {
  getChannelStats(channelId: string): Promise<SocialProfileMetric>;
  getRecentVideos(channelId: string, limit?: number): Promise<SocialPostMetric[]>;
}

export interface XClient {
  getProfileStats(username: string): Promise<SocialProfileMetric>;
  getRecentTweets(username: string, limit?: number): Promise<SocialPostMetric[]>;
}

export interface InstagramClient {
  getProfileStats(accountId: string): Promise<SocialProfileMetric>;
  getRecentMedia(accountId: string, limit?: number): Promise<SocialPostMetric[]>;
}

// Concrete mock implementation classes wrapped in clean abstractions
export class MockYouTubeClient implements YouTubeClient {
  async getChannelStats(channelId: string): Promise<SocialProfileMetric> {
    return {
      followerCount: 142000,
      totalViews: 8400000,
      averageEngagementRate: 0.054
    };
  }

  async getRecentVideos(channelId: string, limit = 5): Promise<SocialPostMetric[]> {
    return Array.from({ length: limit }, (_, i) => ({
      id: `yt-vid-${i}`,
      title: `How AI Agents are changing Creator Economy - Part ${i + 1}`,
      likes: 1200 + i * 250,
      comments: 340 + i * 40,
      views: 24000 + i * 5000,
      publishedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    }));
  }
}

export class MockXClient implements XClient {
  async getProfileStats(username: string): Promise<SocialProfileMetric> {
    return {
      followerCount: 28500,
      totalViews: 450000,
      averageEngagementRate: 0.082
    };
  }

  async getRecentTweets(username: string, limit = 5): Promise<SocialPostMetric[]> {
    return Array.from({ length: limit }, (_, i) => ({
      id: `tweet-${i}`,
      likes: 120 + i * 15,
      comments: 24 + i * 5,
      shares: 45 + i * 8,
      publishedAt: new Date(Date.now() - i * 12 * 60 * 60 * 1000)
    }));
  }
}

export class MockInstagramClient implements InstagramClient {
  async getProfileStats(accountId: string): Promise<SocialProfileMetric> {
    return {
      followerCount: 19800,
      totalViews: 120000,
      averageEngagementRate: 0.038
    };
  }

  async getRecentMedia(accountId: string, limit = 5): Promise<SocialPostMetric[]> {
    return Array.from({ length: limit }, (_, i) => ({
      id: `ig-media-${i}`,
      likes: 450 + i * 90,
      comments: 80 + i * 12,
      publishedAt: new Date(Date.now() - i * 2 * 24 * 60 * 60 * 1000)
    }));
  }
}
