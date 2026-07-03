import { Router } from 'express';
import { ingestSocialMetrics, SocialCredentialsMissingError, type SocialPlatform } from '@pronoia/services';

// Social-analytics ingest endpoint. Credential-free scaffold: keys are read from
// the server env (YOUTUBE_API_KEY / INSTAGRAM_ACCESS_TOKEN). Without them the
// service throws SocialCredentialsMissingError → 501 with a clear message, so the
// UI can show "connect your account" instead of failing hard.

export const socialRouter = Router();

const config = () => ({
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
});

socialRouter.post('/ingest', async (req, res) => {
  const { platform, postId } = req.body ?? {};
  if (!platform || !postId) {
    return res.status(400).json({ error: 'platform and postId are required' });
  }
  if (platform !== 'youtube' && platform !== 'instagram') {
    return res.status(400).json({ error: `Unsupported platform: ${platform}` });
  }

  try {
    const result = await ingestSocialMetrics(platform as SocialPlatform, String(postId), config());
    return res.json(result);
  } catch (error: any) {
    if (error instanceof SocialCredentialsMissingError) {
      return res.status(501).json({ error: error.message, needsCredentials: true, platform: error.platform });
    }
    return res.status(502).json({ error: error?.message ?? 'Social ingest failed' });
  }
});
